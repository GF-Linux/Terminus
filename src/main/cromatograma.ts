import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import type { Cromatograma } from "../shared/tipos.js";
import { acharPython } from "./ambiente.js";

const executar = promisify(execFile);

/**
 * Ponte para `tools/ler_ab1.py`.
 *
 * A leitura do `.ab1` fica em Python de propósito (ADR 0003): quem entende de
 * dado biológico é o Biopython do laboratório, não a casca. Aqui só se chama o
 * script e se repassa o JSON.
 */

/**
 * Teto de pontos por canal enviados à interface.
 *
 * Um `.ab1` tem 10 a 15 mil amostras; quatro canais inteiros são centenas de
 * milhares de números atravessando o IPC a cada abertura. 6000 pontos ainda são
 * mais do que a largura de qualquer tela, então nada visível se perde — e a
 * redução é por **máximo** de cada balde, nunca por média, para não achatar
 * justamente os picos.
 */
const MAX_PONTOS = 6000;

/** Saída maior que isto é sintoma de arquivo estranho, não de leitura normal. */
const TETO_SAIDA = 64 * 1024 * 1024;

export async function lerCromatograma(raizApp: string, arquivo: string): Promise<Cromatograma> {
  const script = path.join(raizApp, "tools", "ler_ab1.py");
  if (!fs.existsSync(script)) {
    throw new Error(`Leitor não encontrado em ${script}.`);
  }

  const python = acharPython();
  try {
    const { stdout } = await executar(
      python,
      [script, arquivo, "--max-pontos", String(MAX_PONTOS)],
      { maxBuffer: TETO_SAIDA, timeout: 60_000 },
    );
    return JSON.parse(stdout) as Cromatograma;
  } catch (err) {
    // O script escreve o motivo real no stderr; é ele que interessa ao usuário,
    // não "Command failed with exit code 1".
    const e = err as { stderr?: string; message?: string };
    const motivo = (e.stderr ?? "").trim() || e.message || String(err);
    throw new Error(motivo);
  }
}
