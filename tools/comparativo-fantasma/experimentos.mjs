/**
 * Três experimentos dirigidos, cada um com processo novo do servidor (o servidor
 * guarda resposta por posição: repetir no mesmo processo mede o cache, não o
 * modelo).
 *
 *   A  contexto de vizinho — o cliente conta ou não conta as outras abas?
 *   B  arquivo errado      — o que sai quando a URI não é a do texto enviado
 *   C  tempestade de teclas — pedido sem cancelamento
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const SERVIDOR =
  "/home/deck/projetos/bancada/node_modules/@github/copilot-language-server/dist/language-server.js";
const WS = process.argv[2];
const EXP = process.argv[3];
const PERFIL = process.argv[4] ?? "bancada";

let proc, buf = Buffer.alloc(0), proximoId = 0;
const pendentes = new Map();

function escrever(m) {
  const c = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...m }), "utf8");
  proc.stdin.write(`Content-Length: ${c.length}\r\n\r\n`);
  proc.stdin.write(c);
}
const notificar = (method, params) => escrever({ method, params });
function pedir(method, params, ms = 25000) {
  return new Promise((res) => {
    const id = ++proximoId;
    const t = setTimeout(() => (pendentes.delete(id), res({ __timeout: true })), ms);
    pendentes.set(id, (m) => (clearTimeout(t), res(m.result ?? null)));
    escrever({ id, method, params });
    return id;
  });
}
/** Igual a `pedir`, mas devolve também o id, para poder cancelar. */
function pedirComId(method, params, ms = 25000) {
  const id = ++proximoId;
  const p = new Promise((res) => {
    const t = setTimeout(() => (pendentes.delete(id), res({ __timeout: true })), ms);
    pendentes.set(id, (m) => (clearTimeout(t), res(m.result ?? null)));
    escrever({ id, method, params });
  });
  return { id, p };
}
function receber(pedaco) {
  buf = Buffer.concat([buf, pedaco]);
  for (;;) {
    const corte = buf.indexOf("\r\n\r\n");
    if (corte < 0) return;
    const m = /Content-Length:\s*(\d+)/i.exec(buf.subarray(0, corte).toString());
    if (!m) return;
    const ini = corte + 4, tam = Number(m[1]);
    if (buf.length < ini + tam) return;
    const msg = JSON.parse(buf.subarray(ini, ini + tam).toString());
    buf = buf.subarray(ini + tam);
    if (msg.id !== undefined && pendentes.has(msg.id)) {
      pendentes.get(msg.id)(msg);
      pendentes.delete(msg.id);
    } else if (msg.id !== undefined && msg.method) escrever({ id: msg.id, result: null });
  }
}

async function iniciar(perfil) {
  proc = spawn(process.execPath, [SERVIDOR, "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
  proc.stdout.on("data", receber);
  proc.stderr.on("data", () => {});
  const raiz = pathToFileURL(WS).href;
  const comum = {
    processId: process.pid,
    capabilities: {
      workspace: { workspaceFolders: true },
      textDocument: { inlineCompletion: {} },
    },
  };
  if (perfil === "vscode") {
    await pedir("initialize", {
      ...comum,
      clientInfo: { name: "Visual Studio Code", version: "1.130.0" },
      initializationOptions: {
        editorInfo: { name: "vscode", version: "1.130.0" },
        editorPluginInfo: { name: "copilot", version: "1.400.0" },
      },
      rootUri: raiz,
      workspaceFolders: [{ uri: raiz, name: path.basename(WS) }],
    });
    notificar("initialized", {});
    notificar("workspace/didChangeConfiguration", { settings: { http: {}, github: { copilot: {} } } });
  } else {
    await pedir("initialize", {
      ...comum,
      clientInfo: { name: "Bancada", version: "0.1.0" },
      initializationOptions: {
        editorInfo: { name: "Bancada", version: "0.1.0" },
        editorPluginInfo: { name: "Bancada", version: "0.1.0" },
      },
      rootUri: null,
      workspaceFolders: [],
    });
    notificar("initialized", {});
  }
  const s = await pedir("checkStatus", {});
  if (s?.status !== "OK") {
    console.error("não autenticado");
    process.exit(2);
  }
}

const versoes = new Map();
function abrir(arquivo, texto) {
  const uri = pathToFileURL(arquivo).href;
  versoes.set(uri, 1);
  notificar("textDocument/didOpen", {
    textDocument: { uri, languageId: "python", version: 1, text: texto },
  });
  notificar("textDocument/didFocus", { textDocument: { uri } });
  return uri;
}
function mudar(uri, texto) {
  const v = (versoes.get(uri) ?? 1) + 1;
  versoes.set(uri, v);
  notificar("textDocument/didChange", {
    textDocument: { uri, version: v },
    contentChanges: [{ text: texto }],
  });
}
const lc = (t, p) => {
  const a = t.slice(0, p);
  return { line: (a.match(/\n/g) ?? []).length, character: p - (a.lastIndexOf("\n") + 1) };
};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const sugerir = (uri, texto, cursor) =>
  pedir("textDocument/inlineCompletion", {
    textDocument: { uri },
    position: lc(texto, cursor),
    context: { triggerKind: 2 },
    formattingOptions: { tabSize: 4, insertSpaces: true },
  });

const ALVO = `from laboratorio import aparar_pontas
from Bio import SeqIO

registro = SeqIO.read("amostra28_F_BTF2.ab1", "abi")
aparado = aparar_pontas(registro, `;

/* ----------------------------- experimento A ----------------------------- */
async function expA() {
  const vizinho = path.join(WS, "laboratorio.py");
  const alvo = path.join(WS, "analise.py");
  fs.writeFileSync(alvo, ALVO);

  // Quem abre a aba vizinha: o perfil completo e o perfil "só-vizinho".
  if (PERFIL === "vscode" || PERFIL === "so-vizinho") {
    abrir(vizinho, fs.readFileSync(vizinho, "utf8"));
  }
  const uri = abrir(alvo, ALVO);
  await espera(400);
  const t0 = Date.now();
  const r = await sugerir(uri, ALVO, ALVO.length);
  const texto = r?.items?.[0]?.insertText ?? null;
  console.log(
    JSON.stringify({
      exp: "A",
      perfil: PERFIL,
      ms: Date.now() - t0,
      sugestao: texto,
      citaConstante: !!texto && /PHRED_MINIMO_LHV|MARGEM_BASES_LHV/.test(texto),
    }),
  );
}

/* ----------------------------- experimento B ----------------------------- */
/**
 * A dança de abas que a Bancada faz hoje: abre A, abre B, volta para A e digita.
 * `arquivoAtual` continua sendo B, então o texto de A viaja com a URI de B.
 */
async function expB() {
  // Um processo por cenário: o servidor guarda resposta por conteúdo+posição, e
  // rodar os dois juntos mediria o cache em vez do contexto.
  const cenario = process.argv[5]; // "certo" | "bancada"
  const a = path.join(WS, "analise.py");
  const b = path.join(WS, "laboratorio.py");
  fs.writeFileSync(a, ALVO);

  const uriA = abrir(a, ALVO);
  await espera(200);
  const uriB = abrir(b, fs.readFileSync(b, "utf8"));
  await espera(200);

  let uri;
  if (cenario === "certo") {
    uri = uriA;
  } else {
    // A dança de abas: `arquivoAtual` ficou em B, então o texto de A viaja com a
    // URI de B — e a cópia que o Copilot tinha de B é sobrescrita por A.
    mudar(uriB, ALVO);
    await espera(200);
    uri = uriB;
  }

  const t = Date.now();
  const r = await sugerir(uri, ALVO, ALVO.length);
  const texto = r?.items?.[0]?.insertText ?? null;
  console.log(
    JSON.stringify({
      exp: "B",
      cenario,
      ms: Date.now() - t,
      sugestao: texto,
      acertaAssinatura: !!texto && /corte_phred/.test(texto),
    }),
  );
}

/* ----------------------------- experimento C ----------------------------- */
/**
 * Seis teclas em 150 ms, do jeito da Bancada (sem cancelar nada) e do jeito
 * certo (cancelando o pedido anterior). Mede quanto tempo a ÚLTIMA leva.
 */
async function expC() {
  const alvo = path.join(WS, "analise.py");
  const base = ALVO;
  fs.writeFileSync(alvo, base);
  const uri = abrir(alvo, base);
  await espera(400);

  const digitado = "corte_phred=";
  const emVoo = [];
  const marcas = [];
  const cancelando = PERFIL === "cancelando";

  for (let i = 1; i <= 6; i++) {
    const texto = base + digitado.slice(0, i * 2);
    mudar(uri, texto);
    if (cancelando) {
      for (const id of emVoo) notificar("$/cancelRequest", { id });
      emVoo.length = 0;
    }
    const t = Date.now();
    const { id, p } = pedirComId("textDocument/inlineCompletion", {
      textDocument: { uri },
      position: lc(texto, texto.length),
      context: { triggerKind: 2 },
      formattingOptions: { tabSize: 4, insertSpaces: true },
    });
    emVoo.push(id);
    marcas.push(p.then((r) => ({ i, ms: Date.now() - t, itens: r?.items?.length ?? 0 })));
    await espera(150);
  }
  const todos = await Promise.all(marcas);
  console.log(JSON.stringify({ exp: "C", modo: cancelando ? "cancelando" : "bancada", todos }));
}

// "so-raiz" e "vscode" mandam a pasta no initialize; os outros mandam rootUri null.
await iniciar(PERFIL === "vscode" || PERFIL === "so-raiz" ? "vscode" : "bancada");
if (EXP === "A") await expA();
else if (EXP === "B") await expB();
else await expC();
proc.kill();
process.exit(0);
