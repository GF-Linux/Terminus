#!/usr/bin/env node
/**
 * Verificação da correção de código (ADR 0025) contra o **módulo de verdade**.
 *
 * O `medir-inline-edit.mjs` fala o protocolo na mão, para descobrir como ele
 * funciona. Este aqui empacota o `src/main/copilot.ts` que o aplicativo carrega
 * e encena o caminho do usuário: abre a aba, digita, para — e confere que o que
 * volta, **aplicado nos deslocamentos que ele devolveu**, produz o arquivo
 * consertado. É o pedaço que uma medição de protocolo não cobre: a conversão de
 * linha/coluna do LSP para deslocamento absoluto do documento, que é onde um
 * erro reescreveria o lugar errado.
 *
 * O caso é o do autor, de 08/08: `dicionario(i, 0)` deveria ser
 * `dicionario.get(i, 0)`.
 */

import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../..");

const PACOTE = path.join(AQUI, ".copilot.correcao.mjs");
execFileSync(
  path.join(RAIZ, "node_modules/.bin/esbuild"),
  [
    path.join(RAIZ, "src/main/copilot.ts"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--external:node:*",
    "--log-level=warning",
    `--outfile=${PACOTE}`,
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
);

const {
  iniciarCopilot,
  estadoCopilot,
  sincronizarDocumento,
  focarDocumento,
  fecharDocumento,
  sugerirEdicaoComCopilot,
  pararCopilot,
} = await import(PACOTE);

const QUEBRADO = `def lista(dicionario):


    dict = {}

    for i in dicionario:

        dict[i] = dicionario(i, 0) + 1

    return dict


print(lista({"a": 1, "b": 2, "c": 3, "d": 4, "e": 5}))
`;

const arquivo = path.join(AQUI, "ws", "lista.py");
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

await iniciarCopilot(RAIZ, true);
const estado = await estadoCopilot();
if (!estado.entrou) {
  console.error("Copilot não autenticado nesta máquina.");
  process.exit(2);
}

// O caminho do usuário: a aba abre vazia e o texto chega escrito/colado. É o que
// dá ao servidor a história de edição sem a qual ele não corrige nada.
sincronizarDocumento(arquivo, "");
focarDocumento(arquivo);
await espera(300);
sincronizarDocumento(arquivo, QUEBRADO);
await espera(300);

console.log(`\n  autenticado como ${estado.usuario}`);

// **Uma tentativa só, e isso é de propósito.** Repetir não serviria de nada: o
// servidor guarda resposta por conteúdo + posição, então a segunda pergunta
// idêntica devolve em 3 ms o vazio da primeira. Um retentar aqui só produziria
// a ilusão de ter insistido.
const t = Date.now();
const edicoes = await sugerirEdicaoComCopilot(arquivo, QUEBRADO, QUEBRADO.length - 1);
console.log(`  ${Date.now() - t} ms · ${edicoes.length} edição(ões)`);

let ok = false;
for (const e of edicoes) {
  const antes = QUEBRADO.slice(e.de, e.ate);
  const depois = QUEBRADO.slice(0, e.de) + e.texto + QUEBRADO.slice(e.ate);
  console.log(`\n  antes:  ${JSON.stringify(antes)}`);
  console.log(`  depois: ${JSON.stringify(e.texto)}`);
  // O teste que importa: aplicar nos deslocamentos devolvidos tem de produzir o
  // arquivo consertado — e não mexer em mais nada.
  const so = depois.replace("dicionario.get(i, 0)", "dicionario(i, 0)") === QUEBRADO;
  const corrigiu = /dicionario\.get\(i, 0\)/.test(depois);
  console.log(`  aplicou o .get: ${corrigiu} · não mexeu em mais nada: ${so}`);
  if (corrigiu && so) ok = true;
}
if (!edicoes.length) console.log("\n  nenhuma edição — o servidor não propôs nada.");

console.log(`\n  ${ok ? "OK — a correção do caso de 08/08 chega inteira" : "FALHOU"}\n`);

fecharDocumento(arquivo);
pararCopilot();
process.exit(ok ? 0 : 1);
