/**
 * Verificação da correção de 04/08, contra o **módulo de verdade**.
 *
 * Não é uma cópia do `copilot.ts` como o `comparar.mjs`: aqui o
 * `src/main/copilot.ts` é empacotado e dirigido diretamente, para que o que for
 * medido seja o que o aplicativo faz.
 *
 * Encena a dança de abas que era o defeito: abre `analise.py`, abre
 * `laboratorio.py`, **volta para o primeiro** e pede sugestão. O vizinho tem uma
 * assinatura inadivinhável (`corte_phred`, `margem_bases`, valores 17 e 8), de
 * modo que acertar só é possível lendo o arquivo do lado.
 *
 *   node verificar-abas.mjs           # com a correção
 *   node verificar-abas.mjs --sozinho # sem abrir a aba vizinha, para comparar
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../..");
const WS = path.join(AQUI, "ws");
const SOZINHO = process.argv.includes("--sozinho");

// Empacota o módulo a cada corrida, para nunca medir uma cópia velha.
const PACOTE = path.join(AQUI, ".copilot.build.mjs");
execFileSync(
  path.join(RAIZ, "node_modules/.bin/esbuild"),
  [
    path.join(RAIZ, "src/main/copilot.ts"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--external:node:*",
    `--outfile=${PACOTE}`,
  ],
  { stdio: "ignore" },
);

const {
  iniciarCopilot,
  sincronizarDocumento,
  focarDocumento,
  fecharDocumento,
  sugerirComCopilot,
  estadoCopilot,
  pararCopilot,
} = await import(path.join(AQUI, ".copilot.build.mjs"));

const ALVO = `from laboratorio import aparar_pontas
from Bio import SeqIO

registro = SeqIO.read("amostra28_F_BTF2.ab1", "abi")
aparado = aparar_pontas(registro, `;

const analise = path.join(WS, "analise.py");
const laboratorio = path.join(WS, "laboratorio.py");
fs.writeFileSync(analise, ALVO);

await iniciarCopilot(RAIZ, true);
const estado = await estadoCopilot();
if (!estado.entrou) {
  console.error("Copilot não autenticado nesta máquina.");
  process.exit(2);
}

// A dança de abas, na ordem em que a interface a produz.
sincronizarDocumento(analise, ALVO); // abriu a primeira aba
focarDocumento(analise);
if (!SOZINHO) {
  sincronizarDocumento(laboratorio, fs.readFileSync(laboratorio, "utf8")); // abriu a segunda
  focarDocumento(laboratorio);
  focarDocumento(analise); // voltou para a primeira
}
await new Promise((r) => setTimeout(r, 500));

const t = Date.now();
const sugestao = await sugerirComCopilot(analise, ALVO, ALVO.length);
const ms = Date.now() - t;

const acertou = !!sugestao && /corte_phred/.test(sugestao);
console.log(
  JSON.stringify({
    abaVizinhaAberta: !SOZINHO,
    ms,
    sugestao,
    acertaAssinatura: acertou,
  }),
);

fecharDocumento(analise);
if (!SOZINHO) fecharDocumento(laboratorio);
pararCopilot();
process.exit(acertou === !SOZINHO ? 0 : 1);
