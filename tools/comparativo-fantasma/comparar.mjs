/**
 * Comparativo: o mesmo GitHub Copilot, pedido do jeito da Bancada e do jeito do
 * VS Code.
 *
 * O motor é o mesmo binário (@github/copilot-language-server) e a mesma conta.
 * O que muda entre os dois perfis é só o que o cliente conta ao servidor e o que
 * o cliente faz com a resposta. Por isso qualquer diferença medida aqui é
 * diferença do cliente, não do modelo.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const SERVIDOR = "/home/deck/projetos/bancada/node_modules/@github/copilot-language-server/dist/language-server.js";
const WS = process.argv[2] || "/tmp/ws";
const CASOS = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const PERFIL = process.argv[4]; // "bancada" | "vscode"

/* --------------------------- canos do LSP --------------------------- */

let proc = null;
let buf = Buffer.alloc(0);
let proximoId = 0;
const pendentes = new Map();
const notificacoesRecebidas = [];

function escrever(msg) {
  const corpo = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...msg }), "utf8");
  proc.stdin.write(`Content-Length: ${corpo.length}\r\n\r\n`);
  proc.stdin.write(corpo);
}
function notificar(method, params) {
  escrever({ method, params });
}
function pedir(method, params, ms = 25000) {
  return new Promise((resolver) => {
    const id = ++proximoId;
    const relogio = setTimeout(() => {
      pendentes.delete(id);
      resolver({ __timeout: true });
    }, ms);
    pendentes.set(id, (msg) => {
      clearTimeout(relogio);
      resolver(msg.result ?? null);
    });
    escrever({ id, method, params });
  });
}
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
    } else if (msg.id !== undefined && msg.method) {
      // pedido do servidor para o cliente: responder algo inócuo
      escrever({ id: msg.id, result: null });
      notificacoesRecebidas.push(msg.method);
    } else if (msg.method) {
      notificacoesRecebidas.push(msg.method);
    }
  }
}

/* ------------------------------ perfis ------------------------------ */

/** Cópia fiel do que src/main/copilot.ts manda hoje. */
async function iniciarComoBancada() {
  await pedir("initialize", {
    processId: process.pid,
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
}

/** O que um cliente completo conta: pasta, configuração e as abas abertas. */
async function iniciarComoVSCode() {
  const raiz = pathToFileURL(WS).href;
  await pedir("initialize", {
    processId: process.pid,
    clientInfo: { name: "Visual Studio Code", version: "1.130.0" },
    capabilities: {
      workspace: {
        workspaceFolders: true,
        configuration: true,
        didChangeConfiguration: { dynamicRegistration: true },
      },
      textDocument: {
        inlineCompletion: { dynamicRegistration: true },
        synchronization: { dynamicRegistration: true, didSave: true },
      },
    },
    initializationOptions: {
      editorInfo: { name: "vscode", version: "1.130.0" },
      editorPluginInfo: { name: "copilot", version: "1.400.0" },
    },
    rootUri: raiz,
    workspaceFolders: [{ uri: raiz, name: path.basename(WS) }],
  });
  notificar("initialized", {});
  notificar("workspace/didChangeConfiguration", {
    settings: {
      http: {},
      telemetry: { telemetryLevel: "all" },
      github: { copilot: { nextEditSuggestions: { enabled: true } } },
    },
  });
}

/* --------------------------- documentos --------------------------- */

const versoes = new Map();
function abrir(arquivo, texto) {
  const uri = pathToFileURL(arquivo).href;
  versoes.set(uri, 1);
  notificar("textDocument/didOpen", {
    textDocument: { uri, languageId: "python", version: 1, text: texto },
  });
  return uri;
}
function focar(uri) {
  notificar("textDocument/didFocus", { textDocument: { uri } });
}

function emLinhaColuna(texto, pos) {
  const antes = texto.slice(0, pos);
  return { line: (antes.match(/\n/g) ?? []).length, character: pos - (antes.lastIndexOf("\n") + 1) };
}
function emDeslocamento(texto, line, character) {
  let at = 0;
  for (let n = 0; n < line; n++) {
    const q = texto.indexOf("\n", at);
    if (q < 0) return texto.length;
    at = q + 1;
  }
  return Math.min(at + character, texto.length);
}

/** O pós-processamento da Bancada, copiado de copilot.ts. */
function comoABancadaTrata(item, texto, cursor) {
  if (!item?.insertText) return { saida: null, motivo: "servidor não devolveu item" };
  let sugestao = item.insertText;
  if (item.range) {
    const de = emDeslocamento(texto, item.range.start.line, item.range.start.character);
    if (de < cursor) {
      const jaEscrito = texto.slice(de, cursor);
      if (sugestao.startsWith(jaEscrito)) sugestao = sugestao.slice(jaEscrito.length);
      else return { saida: null, motivo: "range não bate com o documento -> descartada" };
    }
  }
  if (!sugestao.trim()) return { saida: null, motivo: "só espaço em branco" };
  return { saida: sugestao, motivo: null };
}

/** O que um cliente que respeita o range faria: substituir o trecho. */
function comoOVSCodeTrata(item, texto, cursor) {
  if (!item?.insertText) return { saida: null, motivo: "servidor não devolveu item" };
  if (!item.range) return { saida: item.insertText, motivo: null };
  const de = emDeslocamento(texto, item.range.start.line, item.range.start.character);
  const ate = emDeslocamento(texto, item.range.end.line, item.range.end.character);
  return {
    saida: item.insertText,
    substitui: [de, ate],
    // o que a pessoa vê como fantasma: o resto depois do que ela já escreveu
    fantasma: item.insertText.startsWith(texto.slice(de, cursor))
      ? item.insertText.slice(cursor - de)
      : item.insertText,
    motivo: null,
  };
}

/* ------------------------------ corrida ------------------------------ */

async function main() {
  proc = spawn(process.execPath, [SERVIDOR, "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
  proc.stdout.on("data", receber);
  proc.stderr.on("data", () => {});

  if (PERFIL === "vscode") await iniciarComoVSCode();
  else await iniciarComoBancada();

  const status = await pedir("checkStatus", {});
  if (status?.status !== "OK") {
    console.error(JSON.stringify({ erro: "não autenticado", status }));
    process.exit(2);
  }

  const saida = [];
  for (const caso of CASOS) {
    // vizinhos: só o perfil vscode abre as outras abas
    if (PERFIL === "vscode" && caso.vizinhos) {
      for (const v of caso.vizinhos) {
        const p = path.join(WS, v);
        abrir(p, fs.readFileSync(p, "utf8"));
      }
    }
    const alvo = path.join(WS, caso.arquivo);
    const texto = caso.texto;
    fs.writeFileSync(alvo, texto);
    const uri = abrir(alvo, texto);
    focar(uri);
    await new Promise((r) => setTimeout(r, 250));

    const cursor = texto.indexOf("⟦⟧") >= 0 ? texto.indexOf("⟦⟧") : caso.cursor;
    const limpo = texto.replace("⟦⟧", "");
    if (texto.indexOf("⟦⟧") >= 0) {
      fs.writeFileSync(alvo, limpo);
      versoes.set(uri, 2);
      notificar("textDocument/didChange", {
        textDocument: { uri, version: 2 },
        contentChanges: [{ text: limpo }],
      });
      await new Promise((r) => setTimeout(r, 120));
    }

    const REPETICOES = Number(process.env.REPETICOES || 1);
    const tentativas = [];
    for (let n = 0; n < REPETICOES; n++) {
      const t0 = Date.now();
      const r = await pedir("textDocument/inlineCompletion", {
        textDocument: { uri },
        position: emLinhaColuna(limpo, cursor),
        context: { triggerKind: 2 },
        formattingOptions: { tabSize: 4, insertSpaces: true },
      });
      const ms = Date.now() - t0;
      const itens = r?.items ?? [];
      const item = itens[0];
      const tratado =
        PERFIL === "vscode"
          ? comoOVSCodeTrata(item, limpo, cursor)
          : comoABancadaTrata(item, limpo, cursor);
      tentativas.push({
        ms,
        itens: itens.length,
        cru: item?.insertText ?? null,
        range: item?.range ?? null,
        resultado: tratado.saida,
        fantasma: tratado.fantasma ?? tratado.saida,
        motivo: tratado.motivo,
        timeout: r?.__timeout ?? false,
      });
      if (n + 1 < REPETICOES) await new Promise((r) => setTimeout(r, 400));
    }

    saida.push({ id: caso.id, descricao: caso.descricao, tentativas });
    notificar("textDocument/didClose", { textDocument: { uri } });
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(JSON.stringify({ perfil: PERFIL, casos: saida }, null, 2));
  proc.kill();
  process.exit(0);
}

main();
