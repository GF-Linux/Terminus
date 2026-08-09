#!/usr/bin/env node
/**
 * O erro escrito na linha (ADR 0026): a parte que dá para verificar sem tela.
 *
 * O desenho em si só se confere com os olhos, mas a decisão de **qual** mensagem
 * cada linha mostra não: agrupar por linha, deixar a mais grave falar, contar as
 * outras e cortar o que é longo demais é lógica pura, e é onde mora o erro
 * provável. Roda contra o `src/renderer/src/recados.ts` de verdade.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const saida = path.join(AQUI, ".recados-empacotado.mjs");
process.on("exit", () => fs.rmSync(saida, { force: true }));

execFileSync(
  path.join(RAIZ, "node_modules", ".bin", "esbuild"),
  [path.join(RAIZ, "src", "renderer", "src", "recados.ts"), "--bundle", "--format=esm",
   "--platform=neutral", "--external:@codemirror/*", "--log-level=warning", `--outfile=${saida}`],
  { stdio: ["ignore", "ignore", "inherit"] },
);

globalThis.window = { bancada: { lsp: { aoDiagnosticar() {}, aoFalhar() {} } } };
const { recadosDe } = await import(pathToFileURL(saida).href);

/** Um documento de mentira: só precisa saber em que linha cai cada posição. */
const DOC = `def lista(dicionario):
    dict = {}
    for i in dicionario:
    return dict
`;
const doc = {
  length: DOC.length,
  lineAt(pos) {
    return { number: DOC.slice(0, pos).split("\n").length };
  },
};
const naLinha = (n) => DOC.split("\n").slice(0, n - 1).join("\n").length + (n > 1 ? 1 : 0);

const casos = [];
const caso = (nome, fn) => casos.push({ nome, fn });

caso("um erro numa linha vira um recado na mesma linha", () => {
  const r = recadosDe(doc, [{ from: naLinha(4), message: "Expected indented block", severity: "error" }]);
  return [
    r.length === 1 && r[0].linha === 4 && r[0].texto === "Expected indented block",
    JSON.stringify(r),
  ];
});

caso("o código do hover não vaza para a linha", () => {
  // `diagnosticosDoArquivo` monta `mensagem\n(código)` para o balão do hover.
  const r = recadosDe(doc, [
    { from: naLinha(4), message: "Expected indented block\n(reportIndentation)", severity: "error" },
  ]);
  return [r[0]?.texto === "Expected indented block", JSON.stringify(r[0]?.texto)];
});

caso("dois na mesma linha: a mais grave fala, a outra vira +1", () => {
  const r = recadosDe(doc, [
    { from: naLinha(2), message: "só um aviso", severity: "warning" },
    { from: naLinha(2) + 2, message: "isto é um erro", severity: "error" },
  ]);
  return [
    r.length === 1 && r[0].gravidade === "error" && r[0].texto === "isto é um erro  +1",
    JSON.stringify(r[0]),
  ];
});

caso("a ordem de chegada não decide a gravidade", () => {
  const r = recadosDe(doc, [
    { from: naLinha(2), message: "isto é um erro", severity: "error" },
    { from: naLinha(2) + 2, message: "só um aviso", severity: "warning" },
  ]);
  return [r[0]?.gravidade === "error" && r[0]?.texto.startsWith("isto é um erro"), JSON.stringify(r[0])];
});

caso("mensagem comprida é cortada e marcada com reticência", () => {
  const longa = "x".repeat(200);
  const r = recadosDe(doc, [{ from: naLinha(4), message: longa, severity: "error" }]);
  return [r[0]?.texto.length === 90 && r[0].texto.endsWith("…"), `${r[0]?.texto.length} caracteres`];
});

caso("linhas diferentes viram recados diferentes, em ordem", () => {
  const r = recadosDe(doc, [
    { from: naLinha(4), message: "d", severity: "error" },
    { from: naLinha(2), message: "b", severity: "error" },
  ]);
  return [r.length === 2 && r[0].linha === 2 && r[1].linha === 4, JSON.stringify(r.map((x) => x.linha))];
});

caso("diagnóstico além do fim do documento é ignorado (não explode)", () => {
  const r = recadosDe(doc, [{ from: DOC.length + 50, message: "fantasma", severity: "error" }]);
  return [r.length === 0, `${r.length} recado(s)`];
});

caso("sem gravidade declarada, cai em info e não em erro", () => {
  const r = recadosDe(doc, [{ from: naLinha(2), message: "sem severity" }]);
  return [r[0]?.gravidade === "info", JSON.stringify(r[0]?.gravidade)];
});

let falhas = 0;
console.log();
for (const { nome, fn } of casos) {
  let ok, detalhe;
  try {
    [ok, detalhe] = fn();
  } catch (err) {
    ok = false;
    detalhe = `explodiu: ${err.message}`;
  }
  if (!ok) falhas++;
  console.log(`  ${ok ? "ok  " : "FALHA"}  ${nome}\n          ${detalhe}`);
}
console.log(`\n  ${casos.length - falhas}/${casos.length} passaram\n`);
process.exit(falhas ? 1 : 0);
