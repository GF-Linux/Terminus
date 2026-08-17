import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import type { EventoExecucao } from "../compartilhado/tipos.js";
import { acharPython } from "./localizador-do-python.js";

//? EXECUTOR DE COMANDO — Decisão sobre rodar sem PTY 29/07/2026
//!
//! 1. A saída vem de canos comuns, não de PTY. node-pty exige compilador
//!    nativo, e a máquina onde isto nasceu (SteamOS) não tinha.
//! 2. O que se perde: programa que checa `isatty` não colore a saída, e não há
//!    entrada interativa — `input()` trava.
//! 3. `-u` e `PYTHONUNBUFFERED=1` porque sem tty o Python segura o `print` até
//!    encher o balde, e um `print` antes de um `sleep` longo não aparecia.
//! 4. UM processo por vez, de propósito: o quadrado de parar sempre sabe quem
//!    matar, e a saída nunca é a mistura de dois programas.
//! 5. ⚠️ O motor de edição É outro caminho — esse tem PTY, e mora em
//!    `motor-neovim-pty.ts`. Aqui é só a linha de comando da casca.
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

/* Era um mapa de dois lugares — o do editor e o do chat da Fern —, porque os
   dois podiam ter processo próprio ao mesmo tempo. Com a Fern fora, sobrou um;
   o mapa fica porque a linha de comando ainda pergunta por nome. */
const LUGAR: Record<"editor", Lugar> = {
  /** A linha de comando do terminal. */
  editor: { filho: null },
};

export type Painel = keyof typeof LUGAR;

//* Diz se há um programa em execução agora.
export function estaRodando(painel: Painel = "editor"): boolean {
  return LUGAR[painel].filho !== null;
}

//* Roda um script Python e transmite a saída, linha a linha, para a tela.
//! `-u` e `PYTHONUNBUFFERED=1`: sem tty o Python segura o `print` até encher o
//!   balde, e um `print` antes de um `sleep` longo não aparecia.
export function rodarScript(
  arquivo: string,
  emitir: (evento: EventoExecucao) => void,
  /** Argumentos extras, passados ao interpretador depois do arquivo. O
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

//* Roda o que a pessoa digitou na linha de comando, com o PATH da sessão.
//! `shell: false`: o programa recebe argumentos separados, e nada de texto é
//!   reinterpretado por um shell.
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

//* Mata o que está rodando neste lugar de processo.
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

//* Mata tudo o que estiver rodando. Usado quando a janela fecha.
export function pararTudo(): void {
  for (const painel of Object.keys(LUGAR) as Painel[]) pararScript(painel);
}
