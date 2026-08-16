import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import type { EventoExecucao } from "../shared/tipos.js";
import { acharPython } from "./ambiente.js";

/**
 * Executa o script aberto e transmite a saída real.
 *
 * **Sem PTY, e isso é uma escolha forçada.** node-pty é módulo nativo e exige
 * compilar contra o ABI do Electron; a máquina de desenvolvimento (SteamOS) não
 * tem gcc nem make e tem a raiz somente-leitura. Então a saída vem de canos
 * comuns, com `-u` para o Python não bufferizar.
 *
 * O que se perde: programas que checam `isatty` se comportam como se estivessem
 * redirecionados (sem cor, sem barra de progresso reescrevendo a linha), e não há
 * entrada interativa — `input()` trava. Para o caso de uso real, que é rodar um
 * script de análise e ver o stdout, isso basta. Se um dia entrada interativa for
 * necessária, é aqui que node-pty entra, e o requisito passa a ser toolchain nativo.
 *
 * Desde a ADR 0020 este módulo também roda a **linha de comando** digitada no
 * terminal (`rodarComando`). O ▶ e essa linha dividem o mesmo lugar de processo
 * de propósito: um processo por vez significa que o quadrado de parar sempre
 * sabe quem matar, e que a saída no terminal nunca é a mistura de dois programas.
 *
 * ## Dois lugares, desde a ADR 0022
 *
 * O terminal do chat é o **segundo** lugar, e separado por necessidade: quem
 * chama `verboo -p` espera um minuto por uma resposta, e com um lugar só isso
 * deixaria o ▶ desabilitado esse tempo todo — rodar o script enquanto se espera
 * a opinião do modelo é justamente o que se quer poder fazer. Cada lugar tem o
 * seu botão de parar, então a regra "o parar sabe quem matar" continua de pé.
 */

/**
 * As pastas de binário do usuário que a sessão gráfica **não** tem no PATH.
 *
 * Medido no Deck: o PATH que o Plasma entrega a um aplicativo aberto pelo menu é
 * `/usr/local/sbin:/usr/local/bin:/usr/bin:…flatpak…:/opt/tailscale`. Não tem
 * `~/.local/bin` e, principalmente, **não tem o nvm** — onde mora o `verboo`.
 * Aberta pelo menu, o Terminus respondia "comando não encontrado" a um programa
 * que existe e funciona no Konsole, o que é o tipo de coisa que faz a pessoa
 * achar que a IDE está quebrada.
 *
 * O nvm guarda uma pasta por versão de Node; a escolhida é a maior, comparada
 * como número e não como texto (senão `v9` ganharia de `v26`).
 */
function binsDoUsuario(): string[] {
  const casa = homedir();
  const pastas = [path.join(casa, ".local", "bin")];

  const versoes = path.join(casa, ".nvm", "versions", "node");
  try {
    const maior = readdirSync(versoes)
      .filter((v) => /^v\d/.test(v))
      .sort((a, b) => {
        const na = a.slice(1).split(".").map(Number);
        const nb = b.slice(1).split(".").map(Number);
        for (let i = 0; i < 3; i++) if ((na[i] ?? 0) !== (nb[i] ?? 0)) return (nb[i] ?? 0) - (na[i] ?? 0);
        return 0;
      })[0];
    if (maior) pastas.push(path.join(versoes, maior, "bin"));
  } catch {
    /* sem nvm nesta máquina; segue */
  }

  return pastas.filter((p) => existsSync(p));
}

/** Um lugar de processo: no máximo um filho vivo por vez. */
interface Lugar {
  filho: ChildProcessWithoutNullStreams | null;
}

const LUGAR: Record<"editor" | "chat", Lugar> = {
  /** O ▶ e a linha de comando do terminal. */
  editor: { filho: null },
  /** O terminal do chat (ADR 0022). */
  chat: { filho: null },
};

export type Painel = keyof typeof LUGAR;

export function estaRodando(painel: Painel = "editor"): boolean {
  return LUGAR[painel].filho !== null;
}

export function rodarScript(
  arquivo: string,
  emitir: (evento: EventoExecucao) => void,
  /** Argumentos extras. Usado pela trilha, que roda o verificador passando o
   *  teste e o arquivo do aluno — e não pelo usuário, que não digita comando
   *  aqui: continua não existindo caminho para executar linha arbitrária. */
  extras: string[] = [],
): void {
  if (LUGAR.editor.filho) {
    emitir({ tipo: "falha", mensagem: "Já há um script em execução. Pare antes de rodar outro." });
    return;
  }

  const python = acharPython();
  let filho: ChildProcessWithoutNullStreams;
  try {
    // O `--` fecha a lista de opções do interpretador: o que vier depois é
    // caminho de script, nunca opção. Sem ele, um `arquivo` valendo `-c` faria
    // `python -u -c <extras[0]>` executar a linha recebida. O chamador já
    // confina e recusa traço (`confinado`, em index.ts); isto é a segunda
    // tranca, na porta onde o processo é de fato criado.
    filho = spawn(python, ["-u", "--", arquivo, ...extras], {
      cwd: path.dirname(arquivo),
      // Sem shell: o caminho do arquivo vai como argumento, não interpolado em
      // linha de comando. Nome de arquivo com espaço ou aspas não vira comando.
      shell: false,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
  } catch (err) {
    emitir({ tipo: "falha", mensagem: `Não consegui iniciar ${python}: ${String(err)}` });
    return;
  }

  LUGAR.editor.filho = filho;

  filho.stdout.setEncoding("utf8");
  filho.stderr.setEncoding("utf8");
  filho.stdout.on("data", (texto: string) => emitir({ tipo: "saida", texto }));
  filho.stderr.on("data", (texto: string) => emitir({ tipo: "erro", texto }));

  filho.on("error", (err) => {
    LUGAR.editor.filho = null;
    emitir({ tipo: "falha", mensagem: `${python}: ${err.message}` });
  });

  filho.on("close", (codigo, sinal) => {
    LUGAR.editor.filho = null;
    emitir({ tipo: "fim", codigo, sinal });
  });
}

/**
 * Roda a linha digitada no terminal (ADR 0020).
 *
 * Diferenças em relação a `rodarScript`, todas deliberadas:
 *
 * - `cwd` é a pasta atual do terminal, que o `cd` move — não a pasta do arquivo
 *   aberto. `pip install` não tem arquivo aberto nenhum.
 * - o `PATH` recebe na frente a pasta do interpretador do laboratório, para que
 *   `blastn`, `tracy` e o `pip` do env sejam **os do ambiente que a barra de
 *   estado anuncia**, e não homônimos do sistema.
 * - `shell: false` continua valendo. `programa` e `args` já vieram separados por
 *   `comando.ts`; nada aqui é reinterpretado como linha de texto.
 */
export function rodarComando(
  programa: string,
  args: string[],
  cwd: string,
  emitir: (evento: EventoExecucao) => void,
  /** Em qual lugar de processo. O chat tem o seu (ADR 0022). */
  painel: Painel = "editor",
): void {
  const lugar = LUGAR[painel];
  if (lugar.filho) {
    emitir({ tipo: "falha", mensagem: "Já há algo em execução. Pare antes de rodar outro." });
    return;
  }

  const binPython = path.dirname(acharPython());
  let filho: ChildProcessWithoutNullStreams;
  try {
    filho = spawn(programa, args, {
      cwd,
      shell: false,
      env: {
        ...process.env,
        PATH: [binPython, ...binsDoUsuario(), process.env["PATH"] ?? ""].join(path.delimiter),
        PYTHONIOENCODING: "utf-8",
        // O equivalente do `-u` que o ▶ passa, só que por variável — aqui o
        // argv é da pessoa e não pode ser mexido. Sem isto o Python, vendo que
        // não fala com um terminal, guarda a saída num balde e só despeja no
        // fim: um laço lento parece travado, e um interrompido não mostra nada
        // do que já tinha feito. Medido: `print` seguido de `sleep(20)` não
        // aparecia até o processo morrer.
        PYTHONUNBUFFERED: "1",
        // Sem tty o pip esconde a barra de progresso sozinho; isto tira o aviso
        // de "nova versão disponível", que só polui a saída de quem está estudando.
        PIP_DISABLE_PIP_VERSION_CHECK: "1",
      },
    });
  } catch (err) {
    emitir({ tipo: "falha", mensagem: `Não consegui iniciar ${programa}: ${String(err)}` });
    return;
  }

  lugar.filho = filho;

  /**
   * Fecha a entrada na hora.
   *
   * Sem PTY não existe caminho para digitar, então deixar o cano aberto só
   * promete uma entrada que nunca vem. Medido: `verboo -p` esperava 3 s por
   * stdin antes de começar, e avisava isso na saída — puro tempo perdido a cada
   * pergunta. Com a entrada fechada, quem lê stdin recebe fim-de-arquivo e
   * segue (ou falha dizendo o que é), em vez de pendurar até alguém desistir.
   */
  filho.stdin.end();

  filho.stdout.setEncoding("utf8");
  filho.stderr.setEncoding("utf8");
  filho.stdout.on("data", (texto: string) => emitir({ tipo: "saida", texto }));
  filho.stderr.on("data", (texto: string) => emitir({ tipo: "erro", texto }));

  filho.on("error", (err: NodeJS.ErrnoException) => {
    lugar.filho = null;
    // ENOENT aqui quer dizer "esse programa não existe nesta máquina", que é o
    // erro mais comum de quem digita comando — merece a frase, não o objeto.
    emitir({
      tipo: "falha",
      mensagem:
        err.code === "ENOENT"
          ? `${programa}: comando não encontrado.`
          : `${programa}: ${err.message}`,
    });
  });

  filho.on("close", (codigo, sinal) => {
    lugar.filho = null;
    emitir({ tipo: "fim", codigo, sinal });
  });
}

export function pararScript(painel: Painel = "editor"): void {
  const lugar = LUGAR[painel];
  const alvo = lugar.filho;
  if (!alvo) return;
  alvo.kill("SIGTERM");
  // Se ignorar o SIGTERM, encerra à força. Um script preso num laço fechado não
  // pode deixar o botão "parar" mentindo.
  setTimeout(() => {
    if (alvo === lugar.filho && !alvo.killed) alvo.kill("SIGKILL");
  }, 3000);
}

/** Mata tudo o que estiver vivo — o encerramento do aplicativo. */
export function pararTudo(): void {
  for (const painel of Object.keys(LUGAR) as Painel[]) pararScript(painel);
}
