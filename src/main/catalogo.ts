import * as fs from "node:fs";
import * as path from "node:path";
import type { Catalogo } from "../shared/tipos.js";

export class ErroCatalogo extends Error {}

/**
 * Lê data/biopython-catalog.json da raiz do aplicativo.
 *
 * O arquivo é gerado por tools/build_catalog.py contra o Biopython instalado.
 * Se estiver ausente ou malformado, falha explicitamente: é melhor a Bancada
 * dizer "rode o gerador" do que exibir um catálogo vazio como se estivesse certo.
 */
export function carregarCatalogo(raizApp: string): Catalogo {
  const arquivo = path.join(raizApp, "data", "biopython-catalog.json");

  let bruto: string;
  try {
    bruto = fs.readFileSync(arquivo, "utf8");
  } catch {
    throw new ErroCatalogo(
      `Catálogo não encontrado em ${arquivo}. Gere com: python3 tools/build_catalog.py`,
    );
  }

  let analisado: unknown;
  try {
    analisado = JSON.parse(bruto);
  } catch (err) {
    throw new ErroCatalogo(`Catálogo em ${arquivo} não é JSON válido: ${String(err)}`);
  }

  const catalogo = analisado as Catalogo;
  if (!catalogo || !Array.isArray(catalogo.tasks)) {
    throw new ErroCatalogo(`Catálogo em ${arquivo} não tem a chave "tasks".`);
  }
  return catalogo;
}
