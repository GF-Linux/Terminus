#!/usr/bin/env node
/**
 * O `copilotInlineEdit` corrige **bloco** e **indentação**, ou só troca de linha?
 *
 * Relatado em 08/08: *"muitas vezes o VS Code sugere um bloco com correção de
 * sintaxe + indentação correta, e é retroativo"*. O caso do `.get` que já está
 * verificado troca uma linha só — não prova nada sobre bloco.
 *
 * Aqui vão dois arquivos com defeitos de natureza diferente, pelo módulo de
 * verdade (`src/main/copilot.ts`), e o roteiro imprime **quantas edições** vêm,
 * **quantas linhas** cada uma abrange e se a indentação muda. Um servidor por
 * corrida, um arquivo por vez: o servidor guarda resposta por conteúdo +
 * posição.
 *
 *   node medir-bloco.mjs indentacao
 *   node medir-bloco.mjs logica
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../..");
const PACOTE = path.join(AQUI, ".copilot.bloco.mjs");
process.on("exit", () => fs.rmSync(PACOTE, { force: true }));

execFileSync(
  path.join(RAIZ, "node_modules/.bin/esbuild"),
  [path.join(RAIZ, "src/main/copilot.ts"), "--bundle", "--platform=node", "--format=esm",
   "--external:node:*", "--log-level=warning", `--outfile=${PACOTE}`],
  { stdio: ["ignore", "ignore", "inherit"] },
);

const {
  iniciarCopilot, estadoCopilot, sincronizarDocumento,
  focarDocumento, fecharDocumento, sugerirEdicaoComCopilot, pararCopilot,
} = await import(PACOTE);

/** Bloco mal indentado: o corpo do `for` está no nível do `for`. IndentationError. */
const INDENTACAO = `def contar(itens):
    total = {}
    for i in itens:
    total[i] = total.get(i, 0) + 1
    return total

print(contar(["a", "b", "a"]))
`;

/** Erro de lógica que só se vê lendo o bloco: acumula na chave errada. */
const LOGICA = `def contar(itens):
    total = {}
    for i in itens:
        total[itens] = total.get(i, 0) + 1
    return total

print(contar(["a", "b", "a"]))
`;

const CASOS = { indentacao: INDENTACAO, logica: LOGICA };
const nome = process.argv[2] ?? "indentacao";
const TEXTO = CASOS[nome];
if (!TEXTO) {
  console.error(`caso desconhecido: ${nome} (use indentacao ou logica)`);
  process.exit(2);
}

const arquivo = path.join(AQUI, "ws", `bloco-${nome}.py`);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

await iniciarCopilot(RAIZ, true);
if (!(await estadoCopilot()).entrou) {
  console.error("Copilot não autenticado.");
  process.exit(2);
}

// O caminho do usuário: a aba nasce vazia e o texto é escrito/colado.
sincronizarDocumento(arquivo, "");
focarDocumento(arquivo);
await espera(300);
sincronizarDocumento(arquivo, TEXTO);
await espera(300);

// Cursor no fim, como quem parou de digitar — é a situação do relato.
/** O que o pyright diria. `COM_DIAGNOSTICO=1` liga. */
const DIAGNOSTICOS = {
  indentacao: [{
    range: { start: { line: 3, character: 4 }, end: { line: 3, character: 33 } },
    message: "Unindent not expected",
    severity: "error",
    source: "pyright",
  }],
  logica: [],
};
const diags = process.env.COM_DIAGNOSTICO ? DIAGNOSTICOS[nome] : [];

const t = Date.now();
const edicoes = await sugerirEdicaoComCopilot(arquivo, TEXTO, TEXTO.length, diags);
const ms = Date.now() - t;

const recuo = (s) => (/^[ \t]*/.exec(s)?.[0] ?? "").length;

console.log(`\n  caso: ${nome} · diagnósticos: ${diags.length} · ${ms} ms · ${edicoes.length} edição(ões)\n`);
console.log("  ── arquivo");
TEXTO.split("\n").forEach((l, n) => console.log(`  ${String(n).padStart(2)} │${l}`));

for (const [n, e] of edicoes.entries()) {
  const antes = TEXTO.slice(e.de, e.ate);
  const linhasAntes = antes.split("\n");
  const linhasDepois = e.texto.split("\n");
  console.log(`\n  ── edição ${n + 1}: ${linhasAntes.length} linha(s) → ${linhasDepois.length}`);
  for (const l of linhasAntes) console.log(`     - │${l}`);
  for (const l of linhasDepois) console.log(`     + │${l}`);
  const mexeuNoRecuo = linhasAntes.some((l, i) => linhasDepois[i] !== undefined && recuo(l) !== recuo(linhasDepois[i]));
  console.log(`     bloco (>1 linha): ${linhasAntes.length > 1 || linhasDepois.length > 1}`);
  console.log(`     mexeu na indentação: ${mexeuNoRecuo}`);
}
if (!edicoes.length) console.log("\n  nenhuma edição proposta.");

fecharDocumento(arquivo);
pararCopilot();
console.log();
