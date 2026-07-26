import * as fs from "fs";
import * as path from "path";

/** Uma função/classe do Biopython, já verificada contra a instalação real. */
export interface CatalogEntry {
  /** Caminho pontilhado, ex. "Bio.SeqIO.parse". */
  path: string;
  kind: "function" | "class" | "module" | string;
  /** Assinatura real lida por introspecção; null quando o Python não expõe uma. */
  signature: string | null;
  /** Primeira linha do docstring real. */
  doc: string;
  /** Texto do aviso de depreciação, ou null se não houver. */
  deprecated: string | null;
  /** Código para inserir no editor. */
  snippet: string;
  /** Observação de curadoria (armadilhas, equivalente atual, etc.). */
  note: string | null;
}

/** Um agrupamento por tarefa — o que se quer fazer, não em que módulo mora. */
export interface CatalogTask {
  id: string;
  title: string;
  why: string;
  entries: CatalogEntry[];
}

export interface Catalog {
  biopython_version: string;
  python_version: string;
  task_count: number;
  entry_count: number;
  generated_by: string;
  tasks: CatalogTask[];
}

export class CatalogLoadError extends Error {}

/**
 * Lê data/biopython-catalog.json do diretório da extensão.
 *
 * O arquivo é gerado por tools/build_catalog.py contra o Biopython instalado.
 * Se estiver ausente ou malformado, falha explicitamente: é melhor a extensão
 * dizer "rode o gerador" do que exibir um catálogo vazio como se estivesse certo.
 */
export function loadCatalog(extensionPath: string): Catalog {
  const file = path.join(extensionPath, "data", "biopython-catalog.json");

  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    throw new CatalogLoadError(
      `Catálogo não encontrado em ${file}. Gere com: python tools/build_catalog.py`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new CatalogLoadError(`Catálogo em ${file} não é JSON válido: ${err}`);
  }

  const catalog = parsed as Catalog;
  if (!catalog || !Array.isArray(catalog.tasks)) {
    throw new CatalogLoadError(`Catálogo em ${file} não tem a chave "tasks".`);
  }
  return catalog;
}
