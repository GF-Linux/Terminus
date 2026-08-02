import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * GitHub Copilot como motor do texto fantasma.
 *
 * **Por que ele cabe aqui e a Pylance não coubera.** O
 * `@github/copilot-language-server` é MIT, roda como servidor LSP em Node e não
 * compila nada — as três coisas que decidiram a escolha do pyright valem
 * igualmente. Nenhuma parede de licença desta vez. O que ele **não** dispensa é
 * assinatura própria do Copilot: o pacote é o cliente, o serviço é pago, e cada
 * pessoa entra com a conta dela.
 *
 * **O que ele substitui.** O Copilot faz *inline completion*, então troca o
 * fantasma (hoje DeepSeek via FIM) — e **não** a caixa do catálogo nem a do
 * pyright, que continuam iguais. A regra da ADR do fantasma continua de pé: é o
 * único recurso que manda código para fora, e continua sendo dito na cara.
 *
 * Duas diferenças de formato em relação ao FIM, que este módulo esconde do resto
 * da Bancada:
 *  - a resposta traz um **`range`**: a sugestão *substitui* um trecho em vez de
 *    ser enfiada no cursor. Aqui isso é convertido para "o que inserir no
 *    cursor", que é o contrato que o fantasma já tem;
 *  - vem um **comando de telemetria** para avisar que a sugestão foi aceita.
 */

let proc: ChildProcessWithoutNullStreams | null = null;
let buf = Buffer.alloc(0);
let proximoId = 0;
const pendentes = new Map<number, (m: Record<string, unknown>) => void>();
let pronto = false;
const versoes = new Map<string, number>();

function caminhoDoServidor(raizApp: string): string {
  const alvo = path.join(
    raizApp,
    "node_modules",
    "@github",
    "copilot-language-server",
    "dist",
    "language-server.js",
  );
  if (!fs.existsSync(alvo)) {
    throw new Error("O servidor do Copilot não está instalado (@github/copilot-language-server).");
  }
  return alvo;
}

function escrever(msg: Record<string, unknown>): void {
  if (!proc) return;
  const corpo = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...msg }), "utf8");
  proc.stdin.write(`Content-Length: ${corpo.length}\r\n\r\n`);
  proc.stdin.write(corpo);
}

function notificar(method: string, params: unknown): void {
  escrever({ method, params });
}

function pedir(method: string, params: unknown, ms = 20_000): Promise<Record<string, unknown> | null> {
  return new Promise((resolver) => {
    const id = ++proximoId;
    const relogio = setTimeout(() => {
      pendentes.delete(id);
      resolver(null);
    }, ms);
    pendentes.set(id, (msg) => {
      clearTimeout(relogio);
      resolver((msg["result"] as Record<string, unknown>) ?? null);
    });
    escrever({ id, method, params });
  });
}

function receber(pedaco: Buffer): void {
  buf = Buffer.concat([buf, pedaco]);
  for (;;) {
    const corte = buf.indexOf("\r\n\r\n");
    if (corte < 0) return;
    const m = /Content-Length:\s*(\d+)/i.exec(buf.subarray(0, corte).toString());
    if (!m) return;
    const inicio = corte + 4;
    const tam = Number(m[1]);
    if (buf.length < inicio + tam) return;
    const msg = JSON.parse(buf.subarray(inicio, inicio + tam).toString()) as Record<string, unknown>;
    buf = buf.subarray(inicio + tam);
    const id = msg["id"] as number | undefined;
    if (id !== undefined && pendentes.has(id)) {
      pendentes.get(id)!(msg);
      pendentes.delete(id);
    }
  }
}

export async function iniciarCopilot(raizApp: string): Promise<void> {
  if (proc) return;
  const servidor = caminhoDoServidor(raizApp);

  // Mesmo mecanismo do pyright: o binário do Electron faz de node, então não se
  // exige node instalado na máquina de quem usa.
  proc = spawn(process.execPath, [servidor, "--stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  proc.stdout.on("data", (d: Buffer) => receber(d));
  proc.stderr.on("data", () => {
    /* o servidor fala bastante; nada disso é erro nosso */
  });
  proc.on("exit", () => {
    pronto = false;
    proc = null;
    versoes.clear();
  });

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
  pronto = true;
}

export function pararCopilot(): void {
  proc?.kill();
  proc = null;
  pronto = false;
}

export async function estadoCopilot(): Promise<{ entrou: boolean; usuario: string | null }> {
  if (!pronto) return { entrou: false, usuario: null };
  const r = await pedir("checkStatus", {});
  const usuario = (r?.["user"] as string) ?? null;
  return { entrou: r?.["status"] === "OK", usuario };
}

/**
 * Começa o fluxo de dispositivo e devolve o código para a pessoa digitar.
 *
 * Quem autoriza é ela, no navegador dela, com a conta dela — a Bancada nunca vê
 * senha nem token. O `workspace/executeCommand` fica esperando a confirmação, e
 * por isso a espera aqui é longa de propósito.
 */
export async function entrarNoCopilot(): Promise<{
  codigo: string | null;
  endereco: string | null;
  concluir: Promise<boolean>;
}> {
  const r = await pedir("signIn", {}, 30_000);
  const codigo = (r?.["userCode"] as string) ?? null;
  const endereco = (r?.["verificationUri"] as string) ?? "https://github.com/login/device";
  const comando = r?.["command"] as { command: string; arguments: unknown[] } | undefined;

  const concluir = comando
    ? pedir(
        "workspace/executeCommand",
        { command: comando.command, arguments: comando.arguments },
        600_000,
      ).then((f) => f?.["status"] === "OK")
    : Promise.resolve(false);

  return { codigo, endereco, concluir };
}

function sincronizar(arquivo: string, texto: string): string {
  const uri = pathToFileURL(arquivo).href;
  const versao = (versoes.get(uri) ?? 0) + 1;
  versoes.set(uri, versao);
  if (versao === 1) {
    notificar("textDocument/didOpen", {
      textDocument: { uri, languageId: "python", version: versao, text: texto },
    });
    notificar("textDocument/didFocus", { textDocument: { uri } });
  } else {
    notificar("textDocument/didChange", {
      textDocument: { uri, version: versao },
      contentChanges: [{ text: texto }],
    });
  }
  return uri;
}

/** Deslocamento absoluto -> linha/coluna 0-based. */
function emLinhaColuna(texto: string, pos: number): { line: number; character: number } {
  const antes = texto.slice(0, pos);
  const line = (antes.match(/\n/g) ?? []).length;
  const character = pos - (antes.lastIndexOf("\n") + 1);
  return { line, character };
}

/** linha/coluna 0-based -> deslocamento absoluto. */
function emDeslocamento(texto: string, line: number, character: number): number {
  let at = 0;
  for (let n = 0; n < line; n++) {
    const q = texto.indexOf("\n", at);
    if (q < 0) return texto.length;
    at = q + 1;
  }
  return Math.min(at + character, texto.length);
}

interface ItemInline {
  insertText: string;
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
  command?: { command: string; arguments: unknown[] };
}

/**
 * Uma sugestão para o cursor, no mesmo contrato do fantasma FIM: o texto a
 * **inserir no cursor**, ou null.
 *
 * O Copilot responde com um `range` que costuma começar antes do cursor — em
 * geral no começo da linha, englobando a indentação já digitada. Enfiar o
 * `insertText` inteiro no cursor duplicaria esse pedaço. Aqui o trecho do
 * documento que vai de `range.start` até o cursor é descontado da frente da
 * sugestão, e o que sobra é o que de fato falta escrever.
 */
export async function sugerirComCopilot(
  arquivo: string,
  texto: string,
  cursor: number,
): Promise<string | null> {
  if (!pronto) return null;
  const uri = sincronizar(arquivo, texto);
  const posicao = emLinhaColuna(texto, cursor);

  const r = await pedir("textDocument/inlineCompletion", {
    textDocument: { uri },
    position: posicao,
    context: { triggerKind: 2 },
    formattingOptions: { tabSize: 4, insertSpaces: true },
  });

  const itens = (r?.["items"] as ItemInline[]) ?? [];
  const item = itens[0];
  if (!item?.insertText) return null;

  let sugestao = item.insertText;
  if (item.range) {
    const de = emDeslocamento(texto, item.range.start.line, item.range.start.character);
    if (de < cursor) {
      const jaEscrito = texto.slice(de, cursor);
      if (sugestao.startsWith(jaEscrito)) sugestao = sugestao.slice(jaEscrito.length);
      else return null; // o range não bate com o documento: melhor não sugerir nada
    }
  }

  if (!sugestao.trim()) return null;

  // Telemetria de aceite: o Copilot pede para ser avisado. Não é obrigatório
  // para funcionar, e por isso vai sem esperar resposta.
  if (item.command) {
    notificar("workspace/executeCommand", {
      command: item.command.command,
      arguments: item.command.arguments,
    });
  }
  return sugestao;
}
