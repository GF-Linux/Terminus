//* Decide qual linguagem o editor usa para um caminho — sem tocar o disco.

//! POR QUE ISTO É DOMÍNIO, E NÃO UMA LINHA DENTRO DO EDITOR: o Monaco colore,
//!   indenta, dobra e completa a partir de um `id de linguagem`, e essa escolha
//!   é a primeira coisa que acontece ao abrir um arquivo. Decidida aqui, ela é
//!   testável em milissegundos, sem subir navegador e sem importar o Monaco —
//!   que é exatamente o que `dominio/` existe para permitir (§1.3).
//! A função devolve **string**, não o tipo do Monaco: se importasse o tipo, o
//!   domínio passaria a depender do pacote do editor e deixaria de ser puro.

//? O ID É O DO MONACO, e ele nem sempre é o nome que a pessoa usaria: C++ é
//?   `cpp`, C# é `csharp`, shell é `shell`. A lista abaixo é a tradução, e é
//?   por isso que ela é dado e não `switch`: acrescentar linguagem é uma linha.

//* Quando o NOME INTEIRO decide. Vem primeiro que a extensão de propósito:
//* `.gitignore` é um arquivo cujo nome começa com ponto, não um arquivo com
//* extensão "gitignore", e `Dockerfile` não tem extensão nenhuma.
const PORNOME: Record<string, string> = {
  "dockerfile": "dockerfile",
  "containerfile": "dockerfile",
  "makefile": "makefile",
  "gnumakefile": "makefile",
  ".gitignore": "ignore",
  ".dockerignore": "ignore",
  ".npmignore": "ignore",
  ".gitattributes": "ini",
  ".editorconfig": "ini",
  ".bashrc": "shell",
  ".zshrc": "shell",
  ".profile": "shell",
};

//* Quando a EXTENSÃO decide.
const PORExtensao: Record<string, string> = {
  // os três fluxos que o Terminus molda e roda
  py: "python", pyi: "python", pyw: "python",
  cs: "csharp", csproj: "xml", slnx: "xml", props: "xml",
  cpp: "cpp", cxx: "cpp", cc: "cpp", hpp: "cpp", hxx: "cpp", h: "cpp", c: "c",
  // a casa
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "json",
  html: "html", htm: "html", css: "css", scss: "scss", less: "less",
  md: "markdown", markdown: "markdown",
  lua: "lua", sh: "shell", bash: "shell", zsh: "shell", fish: "shell",
  yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", cfg: "ini", conf: "ini",
  xml: "xml", svg: "xml", sql: "sql", rs: "rust", go: "go", rb: "ruby",
  java: "java", kt: "kotlin", swift: "swift", php: "php", pl: "perl", r: "r",
  vim: "vim", dart: "dart", scala: "scala", ex: "elixir", exs: "elixir",
};

//* O que o editor usa quando ninguém sabe. **Nunca `undefined`:** modelo sem
//* linguagem é modelo sem tokenizador, e o Monaco desenha texto cru sem avisar.
const PADRAO = "plaintext";

//* Devolve o id de linguagem do Monaco para este caminho.
//! A entrada é `string` no tipo e `unknown` na prática — ela vem do IPC e do
//!   clique na árvore, e nenhum dos dois garante o que promete. Por isso a
//!   primeira linha checa em vez de confiar: `.split` em `undefined` estoura
//!   dentro do renderer, onde não há quem pegue.
export function linguagemDoArquivo(caminho: string): string {
  if (typeof caminho !== "string" || caminho === "") return PADRAO;

  //! Os DOIS separadores, e não `path.sep`: o domínio é puro e não pergunta ao
  //!   sistema em que máquina está. Um caminho do Windows tem último segmento
  //!   igual a qualquer outro.
  const nome = caminho.split(/[\\/]/).pop() ?? "";
  const minusculo = nome.toLowerCase();

  const porNome = PORNOME[minusculo];
  if (porNome !== undefined) return porNome;

  //! `lastIndexOf` e não `split(".").pop()`: `arquivo.tar.gz` tem extensão
  //!   `gz`, e `.env` tem o ponto na POSIÇÃO 0 — que não é extensão, é nome.
  const ponto = minusculo.lastIndexOf(".");
  if (ponto <= 0) return PADRAO;

  return PORExtensao[minusculo.slice(ponto + 1)] ?? PADRAO;
}
