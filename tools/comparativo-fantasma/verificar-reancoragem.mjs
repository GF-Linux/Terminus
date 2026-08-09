#!/usr/bin/env node
/**
 * Verifica o item 3 do laudo: a sugestão para de ser jogada fora a cada tecla.
 *
 * Empacota o **`src/renderer/src/fantasma.ts` de verdade** a cada corrida (não
 * uma cópia), pelo mesmo motivo do `verificar-abas.mjs`: teste que roda numa
 * réplica passa a valer só para a réplica no dia em que alguém mexe no
 * original.
 *
 * Dois enganos que este roteiro precisa contornar, e valem para quem for
 * escrever o próximo:
 *
 *  - o módulo lê `window.bancada` **na hora do import**, então o `window` de
 *    mentirinha tem que existir antes do `import()` — daí ser dinâmico;
 *  - `campo` e `mostrar` não são exportados, e não devem ser. Para pôr uma
 *    sugestão na tela sem eles, usa-se o `campo.init()` do CodeMirror, chegando
 *    ao campo por `textoFantasma[0]`, que é a mesma referência que o editor usa.
 *    Nada de produção muda por causa do teste.
 *
 * E uma armadilha que custou a primeira corrida: **o `@codemirror/state` tem que
 * ficar de fora do pacote**. Embutido, passam a existir duas cópias dele — a do
 * pacote e a que este roteiro importa — e o `EditorState.create` recusa o campo
 * com "Unrecognized extension value", porque os `instanceof` de um não valem no
 * outro. Por isso o `--external` e por isso o arquivo empacotado nasce **dentro
 * do projeto**: em `/tmp` o `import "@codemirror/state"` não teria de onde
 * resolver.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");

/* ------------------------ empacotar o módulo real ------------------------ */

const saida = path.join(AQUI, ".fantasma-empacotado.mjs");
process.on("exit", () => fs.rmSync(saida, { force: true }));

execFileSync(
  path.join(RAIZ, "node_modules", ".bin", "esbuild"),
  [
    path.join(RAIZ, "src", "renderer", "src", "fantasma.ts"),
    "--bundle",
    "--format=esm",
    "--platform=neutral",
    "--external:@codemirror/*",
    "--log-level=warning",
    `--outfile=${saida}`,
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
);

globalThis.window = {
  bancada: { fantasma: { cancelar() {}, sugerir: async () => ({ ok: false, valor: null }) } },
  clearTimeout: () => {},
  setTimeout: () => 0,
};

const { EditorState } = await import("@codemirror/state");
const { textoFantasma } = await import(pathToFileURL(saida).href);
const campo = textoFantasma[0];

/* --------------------------------- cenário -------------------------------- */

/**
 * O caso que o autor reproduziu na tela em 08/08: `def somar(a, b):` com o
 * cursor na linha de baixo já indentada, e o Copilot oferecendo o corpo.
 */
const DOC = "def somar(a, b):\n    ";
const CURSOR = DOC.length;
const SUGESTAO = 'if not isinstance(a, (int, float)):\n        raise ValueError("x")\n    return a + b';

function comSugestao() {
  return EditorState.create({
    doc: DOC,
    selection: { anchor: CURSOR },
    extensions: [textoFantasma, campo.init(() => ({ texto: SUGESTAO, em: CURSOR }))],
  });
}

/** Digita `texto` caractere a caractere, como o teclado faria. */
function digitar(estado, texto) {
  for (const c of texto) {
    const em = estado.selection.main.head;
    estado = estado.update({
      changes: { from: em, insert: c },
      selection: { anchor: em + c.length },
      userEvent: "input.type",
    }).state;
  }
  return estado;
}

/* ---------------------------------- casos --------------------------------- */

const casos = [];
const caso = (nome, fn) => casos.push({ nome, fn });

caso("a sugestão nasce viva", () => {
  const s = comSugestao().field(campo);
  return [s?.texto === SUGESTAO, s ? `${s.texto.length} caracteres` : "nada"];
});

caso("digitar o começo dela NÃO a mata (era o defeito)", () => {
  const s = digitar(comSugestao(), "if ").field(campo);
  const esperado = SUGESTAO.slice(3);
  return [s?.texto === esperado, s ? `sobrou ${JSON.stringify(s.texto.slice(0, 24))}…` : "MORREU"];
});

caso("a âncora anda junto com o cursor", () => {
  const e = digitar(comSugestao(), "if not ");
  const s = e.field(campo);
  return [s?.em === e.selection.main.head, `em=${s?.em} cursor=${e.selection.main.head}`];
});

caso("sobrevive a uma linha inteira, com a quebra e o recuo", () => {
  const ate = SUGESTAO.indexOf("raise");
  const s = digitar(comSugestao(), SUGESTAO.slice(0, ate)).field(campo);
  return [s?.texto === SUGESTAO.slice(ate), s ? `sobrou ${JSON.stringify(s.texto)}` : "MORREU"];
});

/**
 * O `Enter` da Bancada não digita "\n" e depois espaços: o
 * `quebrarLinhaIndentando` (`editor.ts:140`) manda **uma mudança só**, com a
 * quebra e o recuo já calculado, e leva o cursor junto. É a forma que o
 * `reancorar` aceita — mas só sobrevive se o recuo que a Bancada calcula for o
 * mesmo que o Copilot sugeriu.
 */
function enter(estado, recuo) {
  const em = estado.selection.main.head;
  return estado.update({
    changes: { from: em, insert: `\n${recuo}` },
    selection: { anchor: em + 1 + recuo.length },
    userEvent: "input",
  }).state;
}

caso("o Enter do editor (uma mudança só) não mata, quando o recuo bate", () => {
  // Linha termina em ":" com recuo 4 → a Bancada abre a próxima em 8, que é o
  // que o Copilot sugeriu.
  const ate = SUGESTAO.indexOf("\n");
  const s = enter(digitar(comSugestao(), SUGESTAO.slice(0, ate)), " ".repeat(8)).field(campo);
  return [s?.texto === SUGESTAO.slice(ate + 9), s ? `sobrou ${JSON.stringify(s.texto)}` : "MORREU"];
});

/**
 * Recuo **menor** que o sugerido: eu esperava que matasse, e estava errado — o
 * `startsWith` casa, porque oito espaços começam com quatro. E o certo é
 * mesmo sobreviver: o fantasma fica segurando os quatro espaços que faltam, e
 * aceitar ainda entrega a linha no lugar. Ficou como caso justamente porque a
 * minha intuição errou aqui.
 */
caso("Enter com recuo menor que o sugerido sobrevive, segurando o que falta", () => {
  const ate = SUGESTAO.indexOf("\n");
  const s = enter(digitar(comSugestao(), SUGESTAO.slice(0, ate)), " ".repeat(4)).field(campo);
  return [s?.texto === SUGESTAO.slice(ate + 5), s ? `sobrou ${JSON.stringify(s.texto)}` : "MORREU"];
});

caso("Enter com recuo MAIOR que o sugerido mata (queda segura, não texto torto)", () => {
  const ate = SUGESTAO.indexOf("\n");
  const s = enter(digitar(comSugestao(), SUGESTAO.slice(0, ate)), " ".repeat(12)).field(campo);
  return [s === null, s ? "sobreviveu torto" : "morreu, certo"];
});

caso("digitar contra ela mata (letra que não é a próxima)", () => {
  const s = digitar(comSugestao(), "w").field(campo);
  return [s === null, s ? `sobreviveu: ${JSON.stringify(s.texto.slice(0, 16))}` : "morreu, certo"];
});

caso("apagar mata", () => {
  const e = comSugestao();
  const s = e.update({ changes: { from: CURSOR - 1, to: CURSOR }, selection: { anchor: CURSOR - 1 } })
    .state.field(campo);
  return [s === null, s ? "sobreviveu" : "morreu, certo"];
});

caso("mover o cursor sem digitar mata", () => {
  const s = comSugestao().update({ selection: { anchor: 4 } }).state.field(campo);
  return [s === null, s ? "sobreviveu" : "morreu, certo"];
});

caso("digitar fora da âncora mata", () => {
  const s = comSugestao().update({ changes: { from: 4, insert: "x" }, selection: { anchor: 5 } })
    .state.field(campo);
  return [s === null, s ? "sobreviveu" : "morreu, certo"];
});

caso("mudança dupla na mesma transação mata (fecha-parênteses, colar)", () => {
  const s = comSugestao().update({
    changes: [{ from: CURSOR, insert: "i" }, { from: 4, insert: "z" }],
    selection: { anchor: CURSOR + 1 },
  }).state.field(campo);
  return [s === null, s ? "sobreviveu" : "morreu, certo"];
});

caso("escrever a sugestão inteira a esvazia (não sobra fantasma vazio)", () => {
  const s = digitar(comSugestao(), SUGESTAO).field(campo);
  return [s === null, s ? `sobrou ${JSON.stringify(s.texto)}` : "acabou, certo"];
});

caso("mexer no documento sem levar o cursor junto mata", () => {
  const s = comSugestao().update({ changes: { from: CURSOR, insert: "i" } }).state.field(campo);
  return [s === null, s ? "sobreviveu" : "morreu, certo"];
});

/* --------------------------------- corrida -------------------------------- */

let falhas = 0;
console.log(`\n  documento:  ${JSON.stringify(DOC)}`);
console.log(`  sugestão:   ${JSON.stringify(SUGESTAO)}\n`);
for (const { nome, fn } of casos) {
  const [ok, detalhe] = fn();
  if (!ok) falhas++;
  console.log(`  ${ok ? "ok  " : "FALHA"}  ${nome}\n          ${detalhe}`);
}
console.log(`\n  ${casos.length - falhas}/${casos.length} passaram\n`);
process.exit(falhas ? 1 : 0);
