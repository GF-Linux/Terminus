import { readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { acharPython } from "./localizador-do-python.js";

//? TRIAGEM DE COMANDO — Decisão sobre a linha de comando 03/08/2026
//!
//! 1. O terminal era só tela. O autor foi instalar o pandas e não havia onde
//!    digitar. A porta abriu.
//! 2. NÃO há shell: o `spawn` roda com `shell: false` e o programa recebe uma
//!    lista de argumentos, não uma linha de texto para reinterpretar.
//! 3. Por isso `|`, `>`, `&&` e `;` são RECUSADOS com explicação, em vez de
//!    virarem argumento literal e darem um erro sem sentido.
//! 4. Quem precisa de pipe pede shell por escrito: `bash -c "ls | grep .py"`.
//! 5. NÃO há PTY nesta tela: programa interativo (`sudo`, `htop`, `python`
//!    pelado) trava a si mesmo esperando um stdin que nunca vem, então é
//!    recusado na entrada.
//! 6. `pip` é reescrito para `python3 -m pip` — o pip do PATH pode instalar num
//!    Python e o `import` procurar em outro.
/* ------------------------------ separar argv ------------------------------ */

/**
 * Quebra a linha em argumentos como um shell faria — e só isso.
 *
 * Aspas simples e duplas agrupam (dentro das simples nada é especial, como no
 * POSIX), e a contrabarra escapa o caractere seguinte fora das aspas simples.
 * Aspas abertas e não fechadas são erro: sem shell não existe continuação de
 * linha, então o silêncio viraria um argumento colado no seguinte.
 */
export function dividir(linha: string): string[] {
  const args: string[] = [];
  let atual = "";
  let temAlgo = false;
  let aspa: '"' | "'" | null = null;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]!;

    if (aspa === "'") {
      if (c === "'") aspa = null;
      else atual += c;
      continue;
    }
    if (aspa === '"') {
      if (c === '"') aspa = null;
      else if (c === "\\" && (linha[i + 1] === '"' || linha[i + 1] === "\\")) atual += linha[++i];
      else atual += c;
      continue;
    }

    if (c === "'" || c === '"') {
      aspa = c;
      // Marca presença: `cd ""` é um argumento vazio, não a ausência dele.
      temAlgo = true;
      continue;
    }
    if (c === "\\" && i + 1 < linha.length) {
      atual += linha[++i];
      temAlgo = true;
      continue;
    }
    if (c === " " || c === "\t") {
      if (temAlgo) args.push(atual);
      atual = "";
      temAlgo = false;
      continue;
    }
    atual += c;
    temAlgo = true;
  }

  if (aspa) throw new Error(`Faltou fechar a aspa ${aspa === "'" ? "simples" : "dupla"}.`);
  if (temAlgo) args.push(atual);
  return args;
}

/* -------------------------------- recusas --------------------------------- */

/**
 * Sinais de shell na linha, procurados **fora** de aspas.
 *
 * A varredura repete a lógica do `dividir` em vez de olhar a linha crua porque
 * `grep "a|b" arquivo` é um comando legítimo: o `|` ali é dado, não operador.
 */
function metacaractereSolto(linha: string): string | null {
  let aspa: '"' | "'" | null = null;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]!;
    if (aspa) {
      if (c === aspa) aspa = null;
      else if (aspa === '"' && c === "\\") i++;
      continue;
    }
    if (c === "'" || c === '"') {
      aspa = c;
      continue;
    }
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "|" || c === ";" || c === "&" || c === "`") return c;
    if (c === ">" || c === "<") return c;
    if (c === "$" && linha[i + 1] === "(") return "$(";
  }
  return null;
}

/**
 * Programas que só fazem sentido com terminal de verdade.
 *
 * A lista **não é uma permissão** — qualquer outro programa roda. Ela existe
 * para converter um travamento silencioso numa frase. `bash`, `sh` e o `python`
 * pelado entram aqui só quando vêm sem argumento: `bash -c "…"` e
 * `python script.py` terminam sozinhos e passam.
 */
const PRECISAM_DE_TTY: Record<string, string> = {
  sudo: "não há como digitar a senha aqui",
  su: "não há como digitar a senha aqui",
  ssh: "pede senha ou confirmação de chave",
  nano: "é editor de tela cheia — edite na próprio Terminus",
  vim: "é editor de tela cheia — edite na próprio Terminus",
  vi: "é editor de tela cheia — edite na próprio Terminus",
  emacs: "é editor de tela cheia — edite na próprio Terminus",
  less: "espera teclas para rolar",
  more: "espera teclas para rolar",
  man: "abre no paginador, que espera teclas",
  top: "redesenha a tela continuamente",
  htop: "redesenha a tela continuamente",
  ipython: "é um interpretador interativo",
  bpython: "é um interpretador interativo",
  psql: "é um console interativo",
  mysql: "é um console interativo",
  sqlite3: "vira console interativo sem um comando junto",
  gdb: "é um depurador interativo",
  ftp: "é um cliente interativo",
  telnet: "é um cliente interativo",
};

/** Interpretadores que só travam quando vêm sem nada para executar. */
const SO_TRAVA_PELADO = new Set([
  "python",
  "python3",
  "bash",
  "sh",
  "zsh",
  "fish",
  "node",
  "R",
  "irb",
]);

/**
 * Agentes de linha de comando que **abrem sessão interativa por padrão**
 * (ADR 0022). O `verboo` é o caso que interessa: sem `-p`/`--print` ele fica
 * esperando o teclado, e aqui não há teclado — o processo pendura até alguém
 * apertar o quadrado.
 *
 * Recusar com a frase certa vale mais que a lista: quem escreveu `verboo` sem
 * `-p` acabou de aprender a opção que precisava.
 */
const AGENTES = new Set(["verboo", "claude", "codex", "gemini", "aider"]);
const IMPRIME = /^(-p|--print)$/;
/**
 * Opções que respondem e saem — não abrem sessão nenhuma.
 *
 * Sem isto, `verboo --version` era recusado com uma frase pedindo `-p`, o que é
 * absurdo: ninguém escreve `verboo -p --version`. Achado testando.
 */
const SO_RESPONDE = /^(-v|--version|-h|--help|--list-models|--doctor)$/;

/* --------------------------------- globs ---------------------------------- */

/**
 * Expande `*` e `?` contra o disco.
 *
 * Sem shell isto não vem de graça, e sem isto `ls *.py` numa pasta
 * — dos mais prováveis do dia — devolveria "arquivo não encontrado: *.py".
 * Segue o padrão do bash sem `nullglob`: **padrão que não casa nada fica como
 * está**, para o programa reclamar do que a pessoa realmente digitou. Casa um
 * segmento de caminho por vez e não atravessa `.` inicial, também como o bash.
 */
function expandir(arg: string, cwd: string): string[] {
  if (!/[*?]/.test(arg)) return [arg];

  const absoluto = path.isAbsolute(arg);
  const partes = arg.split("/").filter((p, i) => p !== "" || i === 0);
  let bases = [absoluto ? "/" : "."];

  for (const parte of partes) {
    if (parte === "" || parte === "." || parte === "..") {
      bases = bases.map((b) => path.join(b, parte));
      continue;
    }
    if (!/[*?]/.test(parte)) {
      bases = bases.map((b) => path.join(b, parte));
      continue;
    }
    const re = new RegExp(
      "^" + parte.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, ".") + "$",
    );
    const achados: string[] = [];
    for (const b of bases) {
      let nomes: string[];
      try {
        nomes = readdirSync(path.resolve(cwd, b));
      } catch {
        continue;
      }
      for (const nome of nomes.sort()) {
        if (nome.startsWith(".") && !parte.startsWith(".")) continue;
        if (re.test(nome)) achados.push(path.join(b, nome));
      }
    }
    bases = achados;
    if (bases.length === 0) return [arg];
  }

  // `path.join("./x")` devolve "x"; o resultado sai relativo como entrou.
  return bases.length > 0 ? bases : [arg];
}

/* ------------------------------- tradução --------------------------------- */

export interface ComandoPronto {
  /** `cd`: o Terminus muda de pasta sozinha, não há processo para criar. */
  tipo: "cd" | "processo";
  programa: string;
  args: string[];
  /** O que dizer no terminal quando o Terminus reescreveu o comando. */
  nota?: string;
}

/**
 * Decide o que a linha vai virar de fato.
 *
 * A reescrita do `pip` é o coração disto e o motivo original do recurso: `pip`
 * solto no PATH é o pip de **algum** Python, quase nunca o que o Terminus usa
 * para rodar os scripts. Instalar com ele deixa o pandas num lugar e o
 * `import pandas` procurando em outro — o erro mais desmoralizante possível para
 * quem está estudando. `python -m pip` instala, por construção, no interpretador
 * que vai importar. O Terminus faz a troca e **diz que fez**, porque o objetivo
 * dela é didático: quem lê a nota aprende a regra, não fica dependente da mágica.
 */
export function traduzir(argv: string[], cwd: string): ComandoPronto {
  const [nome, ...resto] = argv;
  if (!nome) throw new Error("Linha vazia.");

  const motivo = PRECISAM_DE_TTY[nome];
  if (motivo) {
    throw new Error(
      `${nome} ${motivo}, e o terminal do Terminus não tem entrada de teclado ` +
        `(não há PTY). Para isto, use o terminal do sistema.`,
    );
  }
  if (SO_TRAVA_PELADO.has(nome) && resto.length === 0) {
    throw new Error(
      `${nome} sem argumento abre um interpretador interativo, e o terminal da ` +
        `Terminus não tem entrada de teclado (não há PTY). Passe um arquivo ou ` +
        `um ${nome === "bash" || nome === "sh" ? "-c \"comando\"" : "-c \"código\""}.`,
    );
  }

  if (
    AGENTES.has(nome) &&
    !resto.some((a) => IMPRIME.test(a) || SO_RESPONDE.test(a))
  ) {
    throw new Error(
      `${nome} sem -p abre uma sessão interativa, e aqui não há teclado para ela ` +
        `(não há PTY). Escreva ${nome} -p "sua pergunta" — a resposta sai de uma vez.`,
    );
  }

  const alvos = resto.flatMap((a) => expandir(a, cwd));

  if (nome === "cd") {
    return { tipo: "cd", programa: "cd", args: alvos };
  }

  const python = acharPython();

  if (nome === "pip" || nome === "pip3") {
    return {
      tipo: "processo",
      programa: python,
      args: ["-m", "pip", ...alvos],
      nota: `usando ${python} -m pip — assim o pacote cai no mesmo Python que roda os seus scripts`,
    };
  }
  if (nome === "python" || nome === "python3") {
    return { tipo: "processo", programa: python, args: alvos, nota: `usando ${python}` };
  }

  return { tipo: "processo", programa: nome, args: alvos };
}

//* Lê a linha digitada e decide: recusar, virar `cd`, ou rodar um programa.
//! Recusa metacaractere de shell (`|`, `>`, `&&`, `;`) com explicação, e
//!   recusa programa interativo, que sem PTY travaria a si mesmo.
export function analisar(linha: string, cwd: string): ComandoPronto | null {
  if (linha.trim() === "") return null;

  const meta = metacaractereSolto(linha);
  if (meta) {
    throw new Error(
      `"${meta}" é coisa de shell, e não há shell aqui — o Terminus entrega o ` +
        `comando direto ao programa. Se precisar mesmo, peça um shell por escrito: ` +
        `bash -c "…".`,
    );
  }

  const argv = dividir(linha);
  return argv.length === 0 ? null : traduzir(argv, cwd);
}

//* Calcula para onde o `cd` vai, incluindo `~`, `..` e caminho relativo.
export function destinoDoCd(args: string[], cwd: string, casa: string): string {
  if (args.length > 1) throw new Error("cd aceita uma pasta só.");
  const bruto = args[0] ?? casa;
  const alvo = path.resolve(cwd, bruto.startsWith("~") ? path.join(casa, bruto.slice(1)) : bruto);
  let info;
  try {
    info = statSync(alvo);
  } catch {
    throw new Error(`cd: ${bruto}: não existe.`);
  }
  if (!info.isDirectory()) throw new Error(`cd: ${bruto}: não é uma pasta.`);
  return alvo;
}
