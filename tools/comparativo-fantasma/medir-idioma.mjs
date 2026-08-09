#!/usr/bin/env node
/**
 * O `locale` do `initialize` muda o idioma do que o Copilot escreve?
 *
 * Relatado em 08/08: escrever `def lista(dicionario):` na Bancada devolveu uma
 * docstring inteira **em espanhol**. A hipótese é que a Bancada nunca disse ao
 * servidor em que idioma se fala aqui, e ele adivinhou pelo nome do parâmetro.
 *
 * Um caso por processo, e sem exceção: o servidor guarda resposta por conteúdo
 * + posição, então os dois perfis no mesmo processo dariam a mesma resposta e a
 * conclusão seria "o locale não muda nada" — que é justamente o que se quer
 * testar.
 *
 *   node medir-idioma.mjs           # sem locale (como era)
 *   node medir-idioma.mjs pt-BR     # com locale
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../..");
const SERVIDOR = path.join(
  RAIZ,
  "node_modules/@github/copilot-language-server/dist/language-server.js",
);
const LOCALE = process.argv[2] ?? null;

let proc = null;
let buf = Buffer.alloc(0);
let proximoId = 0;
const pendentes = new Map();

function escrever(m) {
  const corpo = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...m }), "utf8");
  proc.stdin.write(`Content-Length: ${corpo.length}\r\n\r\n`);
  proc.stdin.write(corpo);
}
const notificar = (method, params) => escrever({ method, params });
const pedir = (method, params, ms = 25_000) =>
  new Promise((resolver) => {
    const id = ++proximoId;
    const relogio = setTimeout(() => (pendentes.delete(id), resolver(null)), ms);
    pendentes.set(id, (msg) => (clearTimeout(relogio), resolver(msg.result ?? null)));
    escrever({ id, method, params });
  });

function receber(pedaco) {
  buf = Buffer.concat([buf, pedaco]);
  for (;;) {
    const corte = buf.indexOf("\r\n\r\n");
    if (corte < 0) return;
    const m = /Content-Length:\s*(\d+)/i.exec(buf.subarray(0, corte).toString());
    if (!m) return;
    const inicio = corte + 4;
    const tam = Number(m[1]);
    if (buf.length < inicio + tam) return;
    const msg = JSON.parse(buf.subarray(inicio, inicio + tam).toString());
    buf = buf.subarray(inicio + tam);
    if (msg.id !== undefined && pendentes.has(msg.id)) {
      pendentes.get(msg.id)(msg);
      pendentes.delete(msg.id);
    }
  }
}

proc = spawn(process.execPath, [SERVIDOR, "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
proc.stdout.on("data", receber);
proc.stderr.on("data", () => {});

await pedir("initialize", {
  processId: process.pid,
  ...(LOCALE ? { locale: LOCALE } : {}),
  clientInfo: { name: "Bancada", version: "0.1.0" },
  capabilities: { workspace: { workspaceFolders: true }, textDocument: { inlineCompletion: {} } },
  initializationOptions: {
    editorInfo: { name: "Bancada", version: "0.1.0" },
    editorPluginInfo: { name: "Bancada", version: "0.1.0" },
  },
  rootUri: null,
  workspaceFolders: [],
});
notificar("initialized", {});

const estado = await pedir("checkStatus", {});
if (estado?.status !== "OK") {
  console.error("Copilot não autenticado.");
  process.exit(2);
}

// Exatamente o que o autor digitou quando saiu espanhol.
const TEXTO = "def lista(dicionario):\n    ";
const arquivo = path.join(AQUI, "ws", "idioma.py");
const uri = pathToFileURL(arquivo).href;

notificar("textDocument/didOpen", {
  textDocument: { uri, languageId: "python", version: 1, text: "" },
});
notificar("textDocument/didFocus", { textDocument: { uri } });
await new Promise((r) => setTimeout(r, 300));
notificar("textDocument/didChange", {
  textDocument: { uri, version: 2 },
  contentChanges: [{ text: TEXTO }],
});
await new Promise((r) => setTimeout(r, 400));

const r = await pedir("textDocument/inlineCompletion", {
  textDocument: { uri },
  position: { line: 1, character: 4 },
  context: { triggerKind: 2 },
  formattingOptions: { tabSize: 4, insertSpaces: true },
});

const texto = r?.items?.[0]?.insertText ?? "";
console.log(`\n  locale enviado: ${LOCALE ?? "(nenhum)"}`);
console.log(`  ─────────────────────────────────────────────`);
console.log(texto || "  (sem sugestão)");
console.log(`  ─────────────────────────────────────────────`);

// Palavras que só existem em cada idioma, para não depender de leitura humana.
const marca = (re) => (re.test(texto) ? "sim" : "não");
console.log(`  espanhol (función/diccionario/devuelve/valores del): ${
  marca(/funci[oó]n|diccionario|devuelve|los valores|del diccionario/i)
}`);
console.log(`  português (função/dicionário/retorna/valores do):    ${
  marca(/fun[cç][aã]o|dicion[aá]rio|retorna|os valores|do dicion/i)
}`);
console.log(`  inglês (function/dictionary/returns):                ${
  marca(/\bfunction\b|\bdictionary\b|\breturns\b|\bthe values\b/i)
}\n`);

proc.kill();
