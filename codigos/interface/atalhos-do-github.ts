//! Atalhos Git escritos no terminal da casca.
//!
//! O renderer só monta uma linha segura; quem a executa é o shell PTY, como se
//! a pessoa a tivesse digitado. Assim a linha fica visível e entra no histórico.

export type AtalhoGitHub = "clone" | "status" | "add" | "commit" | "push" | "pull";

export const itensGitHub: ReadonlyArray<{ acao: AtalhoGitHub; rotulo: string }> = [
  { acao: "clone", rotulo: "Clonar repositório" },
  { acao: "status", rotulo: "Ver status" },
  { acao: "add", rotulo: "Adicionar alterações" },
  { acao: "commit", rotulo: "Criar commit" },
  { acao: "push", rotulo: "Enviar alterações" },
  { acao: "pull", rotulo: "Baixar alterações" },
];

function argumentoObrigatorio(nome: string, valor: string | undefined): string {
  const texto = valor?.trim();
  if (!texto) throw new Error(`${nome} é obrigatório.`);
  if (/[\n\r\0]/.test(texto)) throw new Error(`${nome} não pode conter quebra de linha.`);
  return `'${texto.replace(/'/g, "'\\''")}'`;
}

/** Monta uma única linha Git sem permitir que a entrada vire sintaxe do shell. */
export function comandoGit(atalho: AtalhoGitHub, argumento?: string): string {
  switch (atalho) {
    case "clone":
      return `git clone -- ${argumentoObrigatorio("A URL do repositório", argumento)}`;
    case "status":
      return "git status";
    case "add":
      return "git add .";
    case "commit":
      return `git commit -m ${argumentoObrigatorio("A mensagem do commit", argumento)}`;
    case "push":
      return "git push";
    case "pull":
      return "git pull";
  }
}
