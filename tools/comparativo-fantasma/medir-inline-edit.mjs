#!/usr/bin/env node
/**
 * Mede o `textDocument/copilotInlineEdit` — o "Next Edit Suggestions" — contra o
 * caso que o autor reproduziu em 08/08.
 *
 * **O caso.** Ele escreveu `dicionario(i, 0)` onde queria `dicionario.get(i, 0)`
 * e colou o mesmo arquivo nos dois editores. O VS Code apontou a falta do `.get`
 * e **trocou o texto já escrito**; a Bancada não fez nada — e não faria, porque
 * completar só sabe inserir no cursor. Repare que o `pyright` também não acusa:
 * `dicionario` é parâmetro sem anotação, então chamá-lo é legítimo para ele.
 * Nenhuma superfície que a Bancada tem hoje alcança este erro.
 *
 * **O protocolo, extraído do pacote** (`dist/main.js`, servidor 1.527.1), porque
 * ele não está documentado no pacote:
 *
 *     → textDocument/copilotInlineEdit
 *       { textDocument: { uri, version }, position, diagnostics? }
 *     ← { edits: [ { textDocument, range, text, command } ] }
 *
 * Duas coisas que o código do servidor deixa claras e mudam o desenho:
 *
 *  - **`version` é obrigatório.** O handler começa com
 *    `if (r.textDocument.version === void 0) throw` — não é opcional como no
 *    `inlineCompletion`, e esquecer disso dá erro, não resposta vazia;
 *  - **a resposta traz `range`**, ou seja, ela **substitui** um trecho. É a
 *    diferença inteira em relação ao fantasma, que só sabe inserir;
 *  - o pedido aceita **`diagnostics`**. A Bancada já tem os do pyright, então há
 *    como alimentar o modelo com eles — de graça, do que já existe.
 *
 * **Um caso por processo, e isto não é zelo.** O servidor guarda resposta por
 * conteúdo + posição: perguntar de novo no mesmo processo devolve em
 * milissegundos o que a primeira vez levou segundos. A sessão de 04/08 já tinha
 * registrado isso e eu caí assim mesmo — um caso deu 204 ms e eu quase o li como
 * sucesso, quando era o cache do caso anterior. Latência de milissegundos aqui é
 * sinal de cache, não de servidor rápido.
 *
 * Uso:  node medir-inline-edit.mjs <A|B|C|D|E>
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

/* ------------------------- cliente LSP mínimo ------------------------- */

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

function pedir(method, params, ms = 25_000) {
  return new Promise((resolver) => {
    const id = ++proximoId;
    const relogio = setTimeout(() => {
      pendentes.delete(id);
      resolver({ erro: "tempo esgotado" });
    }, ms);
    pendentes.set(id, (msg) => {
      clearTimeout(relogio);
      resolver(msg.error ? { erro: msg.error } : (msg.result ?? null));
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
    }
  }
}

async function iniciar() {
  proc = spawn(process.execPath, [SERVIDOR, "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
  proc.stdout.on("data", receber);
  proc.stderr.on("data", () => {});
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

/* ------------------------------- o caso ------------------------------- */

/** O arquivo do autor, com o defeito de propósito: `dicionario(i, 0)`. */
const QUEBRADO = `def lista(dicionario):


    dict = {}

    for i in dicionario:

        dict[i] = dicionario(i, 0) + 1

    return dict


print(lista({"a": 1, "b": 2, "c": 3, "d": 4, "e": 5}))
`;

/** A linha do erro, 0-based, e a coluna no fim dela. */
const LINHA_ERRO = 7;
const COL_ERRO = QUEBRADO.split("\n")[LINHA_ERRO].length;

const arquivo = path.join(AQUI, "ws", "lista.py");
const uri = pathToFileURL(arquivo).href;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedirEdicao(versao, position, rotulo) {
  const t = Date.now();
  const r = await pedir("textDocument/copilotInlineEdit", {
    textDocument: { uri, version: versao },
    position,
    diagnostics: [],
  });
  const ms = Date.now() - t;
  const edits = r?.edits ?? [];
  console.log(`\n  ── ${rotulo}`);
  console.log(`     posição L${position.line}:C${position.character} · ${ms} ms`);
  if (r?.erro) {
    console.log(`     ERRO: ${JSON.stringify(r.erro)}`);
    return false;
  }
  if (!edits.length) {
    console.log("     sem edição");
    return false;
  }
  for (const e of edits) {
    const { start, end } = e.range;
    console.log(`     troca L${start.line}:C${start.character}–L${end.line}:C${end.character}`);
    console.log(`     por:  ${JSON.stringify(e.text)}`);
  }
  return edits.some((e) => /\.get\(/.test(e.text));
}

/* ------------------------------- corrida ------------------------------- */

await iniciar();
const estado = await pedir("checkStatus", {});
if (estado?.status !== "OK") {
  console.error("Copilot não autenticado nesta máquina.");
  process.exit(2);
}
console.log(`\n  servidor autenticado como ${estado.user}`);
console.log(`  linha do erro (L${LINHA_ERRO}): ${JSON.stringify(QUEBRADO.split("\n")[LINHA_ERRO])}`);
const cota = await pedir("checkQuota", {});
console.log(`  cota: ${JSON.stringify(cota)?.slice(0, 220)}`);

const CASO = (process.argv[2] ?? "B").toUpperCase();
const LINHAS = QUEBRADO.split("\n");
const FIM = { line: LINHAS.length - 1, character: 0 };
const NO_ERRO = { line: LINHA_ERRO, character: COL_ERRO };
/** Onde o módulo real pergunta quando o cursor está no fim do texto. */
const FIM_DO_TEXTO = { line: LINHAS.length - 2, character: LINHAS[LINHAS.length - 2].length };

const abrir = (texto, versao) =>
  notificar("textDocument/didOpen", {
    textDocument: { uri, languageId: "python", version: versao, text: texto },
  });
const mudar = (texto, versao) =>
  notificar("textDocument/didChange", {
    textDocument: { uri, version: versao },
    contentChanges: [{ text: texto }],
  });
const focar = () => notificar("textDocument/didFocus", { textDocument: { uri } });

/**
 * A: sem história de edição — o arquivo chega pronto.
 * B: colado, cursor na linha do erro.
 * C: colado, cursor no fim do arquivo.
 * D: a sequência que o módulo real produz (o `focarDocumento` reenvia o
 *    documento antes do `didFocus`, então há um `didChange` vazio no meio).
 * E: igual ao D, mas na posição que o módulo calcula de fato — fim da última
 *    linha com texto, e não a linha vazia depois dela.
 */
const CASOS = {
  A: { rotulo: "arquivo aberto pronto, sem história", posicao: NO_ERRO, versao: 1,
       preparar: () => { abrir(QUEBRADO, 1); focar(); }, editar: () => {} },
  B: { rotulo: "colado, cursor na linha do erro", posicao: NO_ERRO, versao: 2,
       preparar: () => { abrir("", 1); focar(); }, editar: () => mudar(QUEBRADO, 2) },
  C: { rotulo: "colado, cursor no fim do arquivo", posicao: FIM, versao: 2,
       preparar: () => { abrir("", 1); focar(); }, editar: () => mudar(QUEBRADO, 2) },
  D: { rotulo: "sequência do módulo real, cursor no fim do arquivo", posicao: FIM, versao: 3,
       preparar: () => { abrir("", 1); mudar("", 2); focar(); },
       editar: () => mudar(QUEBRADO, 3) },
  E: { rotulo: "sequência do módulo real, posição que o módulo calcula",
       posicao: FIM_DO_TEXTO, versao: 3,
       preparar: () => { abrir("", 1); mudar("", 2); focar(); },
       editar: () => mudar(QUEBRADO, 3) },
};

const alvo = CASOS[CASO];
if (!alvo) {
  console.error(`caso desconhecido: ${CASO} (use A, B, C, D ou E)`);
  process.exit(2);
}

/* **O intervalo entre abrir e editar importa.** Disparar abertura e colagem no
   mesmo instante fez casos que já tinham funcionado voltarem vazios: para o
   servidor, "o que mudou" precisa de um antes. No aplicativo isso é grátis — a
   pessoa abre o arquivo e digita segundos depois. */
/* **Aquecimento.** Na primeira corrida deste medidor os casos rodavam em
   sequência num processo só, e o primeiro pedido — que voltava vazio — parecia
   inofensivo. Com um caso por processo, todos passaram a voltar vazios em ~30 ms.
   A hipótese é que o primeiro `copilotInlineEdit` de um servidor recém-subido
   acorda o subsistema, e só o segundo em diante responde de verdade.
   AQUECER=1 reproduz aquele primeiro pedido descartado. */
if (process.env.AQUECER) {
  const falso = process.env.AQUECER === "falso";
  const u = falso ? pathToFileURL(path.join(AQUI, "ws", "aquecimento.py")).href : uri;
  const antes = { line: LINHA_ERRO, character: COL_ERRO };
  if (falso) {
    notificar("textDocument/didOpen", {
      textDocument: { uri: u, languageId: "python", version: 1, text: "a = 1\n" },
    });
    notificar("textDocument/didChange", {
      textDocument: { uri: u, version: 2 },
      contentChanges: [{ text: "a = 1\nb = 2\n" }],
    });
  } else {
    abrir(QUEBRADO, 1);
    focar();
  }
  await espera(600);
  const t = Date.now();
  const r = await pedir("textDocument/copilotInlineEdit", {
    textDocument: { uri: u, version: falso ? 2 : 1 },
    position: falso ? { line: 1, character: 5 } : antes,
    diagnostics: [],
  });
  console.log(`\n  ── aquecimento (${falso ? "documento de mentira" : "mesmo arquivo"}) · ${Date.now() - t} ms · ${(r?.edits ?? []).length} edição(ões)`);
  notificar("textDocument/didClose", { textDocument: { uri: u } });
  await espera(Number(process.env.POS_AQUECIMENTO ?? 300));
}

alvo.preparar();
await espera(Number(process.argv[3] ?? 700));
alvo.editar();
await espera(700);
const achou = await pedirEdicao(alvo.versao, alvo.posicao, `${CASO} · ${alvo.rotulo}`);
console.log(`\n  achou o .get? ${achou}\n`);
proc.kill();
process.exit(achou ? 0 : 1);
