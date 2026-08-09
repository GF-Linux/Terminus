#!/usr/bin/env node
/**
 * A fronteira entre o fantasma e a correção (ADR 0025, segunda versão).
 *
 * Nasceu de um teste do autor em 08/08 que ficou **pior que antes**: numa tela
 * só, o fantasma oferecia `return list(dicionario.values())` e a caixa de
 * correção, logo abaixo, `return list(dicionario.keys())`. Duas propostas em
 * cinza, contrárias. Noutra, a "correção" reescrevia a linha que estava sendo
 * digitada.
 *
 * Aqui se verifica que isso não pode mais acontecer, contra os **módulos de
 * verdade** — mesma receita do `verificar-reancoragem.mjs`, inclusive o
 * `--external:@codemirror/*` (embutido, dois exemplares do `state` fazem o
 * `EditorState.create` recusar os campos).
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const saida = path.join(AQUI, ".fronteira-empacotada.mjs");
process.on("exit", () => fs.rmSync(saida, { force: true }));

// Uma entrada que reexporta os dois módulos, para os dois campos virem do mesmo
// pacote — e portanto serem as mesmas referências que o editor usa.
const entrada = path.join(AQUI, ".fronteira-entrada.ts");
fs.writeFileSync(
  entrada,
  `export { textoFantasma, campoDoFantasma, aceitarFantasma } from "../../src/renderer/src/fantasma.js";
export { correcaoDoCodigo, aceitarCorrecao, aceitarCorrecaoSeSozinha, dispensarCorrecao, tocaALinhaDoCursor } from "../../src/renderer/src/correcao.js";
`,
);
process.on("exit", () => fs.rmSync(entrada, { force: true }));

execFileSync(
  path.join(RAIZ, "node_modules", ".bin", "esbuild"),
  [entrada, "--bundle", "--format=esm", "--platform=neutral", "--external:@codemirror/*",
   "--log-level=warning", `--outfile=${saida}`],
  { stdio: ["ignore", "ignore", "inherit"] },
);

globalThis.window = {
  bancada: {
    fantasma: {
      cancelar() {},
      sugerir: async () => ({ ok: false, valor: null }),
      corrigir: async () => ({ ok: false, valor: [] }),
      edicaoAceita() {},
      edicaoRecusada() {},
    },
  },
  clearTimeout: () => {},
  setTimeout: () => 0,
};

const { EditorState } = await import("@codemirror/state");
const { EditorView } = await import("@codemirror/view");
const {
  textoFantasma,
  campoDoFantasma,
  correcaoDoCodigo,
  aceitarCorrecao,
  aceitarCorrecaoSeSozinha,
  tocaALinhaDoCursor,
} = await import(pathToFileURL(saida).href);
const campoDaCorrecao = correcaoDoCodigo[0];

/* --------------------------------- cenário -------------------------------- */

/** O arquivo do print de 08/08. O erro está na linha do `for`, não onde o cursor está. */
const DOC = [
  "def lista(dicionario):",
  "    dict = {}",
  "    for i in dicionario:",
  "        dict[i] = dicionario(i, 0) + 1",
  "    return dict",
  "",
].join("\n");

const LINHA_ERRO = DOC.indexOf("        dict[i]");
const FIM_ERRO = DOC.indexOf("\n", LINHA_ERRO);
const CORRECAO = { de: LINHA_ERRO, ate: FIM_ERRO, texto: "        dict[i] = dicionario.get(i, 0) + 1" };

function estado({ comFantasma = false, comCorrecao = true, cursor = DOC.length } = {}) {
  const extras = [];
  if (comCorrecao) extras.push(campoDaCorrecao.init(() => CORRECAO));
  if (comFantasma) extras.push(campoDoFantasma.init(() => ({ texto: "print(x)", em: cursor })));
  return EditorState.create({
    doc: DOC,
    selection: { anchor: cursor },
    extensions: [textoFantasma, correcaoDoCodigo, ...extras],
  });
}

/**
 * Quantas decorações este estado manda para a tela.
 *
 * Conta o facet inteiro, sem tentar separar de quem é cada uma — a pergunta se
 * responde por **diferença**: quanto a correção acrescenta com e sem fantasma.
 * Assim o teste não depende de nome de classe CSS, que é acabamento.
 */
function decoracoes(opcoes) {
  return estado(opcoes)
    .facet(EditorView.decorations)
    .reduce((soma, d) => soma + (typeof d === "function" ? 0 : d.size), 0);
}

/* --------------------------------- casos --------------------------------- */

const casos = [];
const caso = (nome, fn) => casos.push({ nome, fn });

caso("sem fantasma: o Alt+Enter aceita a correção", () => {
  const e = estado();
  let aplicou = null;
  const falsaView = { state: e, dispatch: (tr) => (aplicou = tr) };
  const ok = aceitarCorrecaoSeSozinha(falsaView);
  const trocaCerta =
    aplicou?.changes?.from === CORRECAO.de && aplicou?.changes?.insert === CORRECAO.texto;
  return [ok && trocaCerta, ok ? `troca de ${aplicou?.changes?.from} a ${aplicou?.changes?.to}` : "recusou"];
});

caso("COM fantasma: o Alt+Enter cede a vez ao fantasma", () => {
  const e = estado({ comFantasma: true });
  const ok = aceitarCorrecaoSeSozinha({ state: e, dispatch: () => {} });
  return [ok === false, ok ? "roubou a tecla do fantasma" : "cedeu, certo"];
});

caso("COM fantasma: o Ctrl+. ainda alcança a correção", () => {
  const e = estado({ comFantasma: true });
  let aplicou = null;
  const ok = aceitarCorrecao({ state: e, dispatch: (tr) => (aplicou = tr) });
  return [
    ok && aplicou?.changes?.insert === CORRECAO.texto,
    ok ? "aceitou, certo" : "inalcançável — a correção ficaria presa na tela",
  ];
});

/** A regra que foi longe demais e saiu: coexistir é o comportamento desejado. */
caso("COM fantasma: a correção CONTINUA na tela (era o defeito que matou o recurso)", () => {
  const com = decoracoes({ comFantasma: true, comCorrecao: true });
  const sem = decoracoes({ comFantasma: true, comCorrecao: false });
  return [com > sem, `${sem} sem a correção, ${com} com ela`];
});

caso("sem fantasma: a correção desenha (linha marcada + caixa)", () => {
  const com = decoracoes({ comFantasma: false, comCorrecao: true });
  const sem = decoracoes({ comFantasma: false, comCorrecao: false });
  return [com > sem, `${sem} sem a correção, ${com} com ela`];
});

caso("regra 2: correção longe do cursor passa (o caso que originou tudo)", () => {
  const e = estado({ cursor: DOC.length });
  const toca = tocaALinhaDoCursor(e, CORRECAO);
  return [toca === false, toca ? "descartaria" : "passa, certo"];
});

caso("regra 2: correção NA linha do cursor é descartada", () => {
  const e = estado({ cursor: LINHA_ERRO + 12 });
  const toca = tocaALinhaDoCursor(e, CORRECAO);
  return [toca === true, toca ? "descarta, certo" : "deixaria passar — era o defeito do print 2"];
});

/* --------------------------------- corrida -------------------------------- */

let falhas = 0;
console.log(`\n  cursor padrão no fim do arquivo; erro na linha do \`for\`\n`);
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
