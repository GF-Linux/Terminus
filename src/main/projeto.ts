import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { NoArquivo, ProjetoAberto } from "../shared/tipos.js";

/** Pastas que nunca interessam numa pasta de corrida e só poluem a árvore. */
const IGNORAR = new Set([".git", "__pycache__", ".venv", "node_modules", ".ipynb_checkpoints"]);

/** Um único nível da árvore. Pasta grande não trava a interface porque os
 *  filhos só são lidos quando alguém expande o nó. */
export async function listar(dir: string): Promise<NoArquivo[]> {
  const entradas = await fs.readdir(dir, { withFileTypes: true });
  const nos: NoArquivo[] = [];

  for (const e of entradas) {
    if (e.name.startsWith(".") || IGNORAR.has(e.name)) continue;
    const pasta = e.isDirectory();
    nos.push({
      nome: e.name,
      caminho: path.join(dir, e.name),
      tipo: pasta ? "pasta" : "arquivo",
      filhos: null,
    });
  }

  // Pastas antes de arquivos, cada grupo em ordem alfabética — a mesma ordem do
  // VSCodium, para a árvore não parecer aleatória a quem vem de lá.
  nos.sort((a, b) =>
    a.tipo === b.tipo
      ? a.nome.localeCompare(b.nome, "pt-BR")
      : a.tipo === "pasta"
        ? -1
        : 1,
  );
  return nos;
}

export async function abrirProjeto(raiz: string): Promise<ProjetoAberto> {
  return { raiz, nome: path.basename(raiz), filhos: await listar(raiz) };
}

/** Extensões que o editor abre como texto. O resto precisa de visualizador
 *  próprio — `.ab1` é o caso que importa, e ainda não existe. */
const TEXTO = new Set([".py", ".txt", ".md", ".fasta", ".fa", ".fastq", ".csv", ".tsv", ".json", ".xml", ".cfg", ".toml", ".yaml", ".yml"]);

export function ehTexto(arquivo: string): boolean {
  return TEXTO.has(path.extname(arquivo).toLowerCase());
}

export async function lerArquivo(arquivo: string): Promise<string> {
  return fs.readFile(arquivo, "utf8");
}

export async function gravarArquivo(arquivo: string, conteudo: string): Promise<void> {
  await fs.writeFile(arquivo, conteudo, "utf8");
}
