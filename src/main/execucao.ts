import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
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
 */

let emAndamento: ChildProcessWithoutNullStreams | null = null;

export function estaRodando(): boolean {
  return emAndamento !== null;
}

export function rodarScript(
  arquivo: string,
  emitir: (evento: EventoExecucao) => void,
  /** Argumentos extras. Usado pela trilha, que roda o verificador passando o
   *  teste e o arquivo do aluno — e não pelo usuário, que não digita comando
   *  aqui: continua não existindo caminho para executar linha arbitrária. */
  extras: string[] = [],
): void {
  if (emAndamento) {
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

  emAndamento = filho;

  filho.stdout.setEncoding("utf8");
  filho.stderr.setEncoding("utf8");
  filho.stdout.on("data", (texto: string) => emitir({ tipo: "saida", texto }));
  filho.stderr.on("data", (texto: string) => emitir({ tipo: "erro", texto }));

  filho.on("error", (err) => {
    emAndamento = null;
    emitir({ tipo: "falha", mensagem: `${python}: ${err.message}` });
  });

  filho.on("close", (codigo, sinal) => {
    emAndamento = null;
    emitir({ tipo: "fim", codigo, sinal });
  });
}

export function pararScript(): void {
  if (!emAndamento) return;
  emAndamento.kill("SIGTERM");
  // Se ignorar o SIGTERM, encerra à força. Um script preso num laço fechado não
  // pode deixar o botão "parar" mentindo.
  const alvo = emAndamento;
  setTimeout(() => {
    if (alvo === emAndamento && !alvo.killed) alvo.kill("SIGKILL");
  }, 3000);
}
