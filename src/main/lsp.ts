import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { Diagnostico, EdicaoExtra, LugarNoCodigo, SugestaoLsp } from "../shared/tipos.js";
import { acharPython } from "./ambiente.js";

/**
 * Cliente de language server, falando com o **pyright**.
 *
 * Por que pyright e não jedi-language-server: medido em 29/07 contra este
 * ambiente, o pyright resolveu o Biopython do miniforge e apontou
 * `"GC: " + gc_fraction(s)` como erro de tipo **antes de rodar** — que é
 * exatamente a classe de engano que este ambiente existe para evitar. Além
 * disso é um pacote npm com typeshed embutido: viaja com o aplicativo, em vez
 * de exigir que cada laboratório instale um servidor no próprio env.
 *
 * A Pylance faria o mesmo e melhor, e está **juridicamente fora**: a licença
 * dela permite uso "only with Visual Studio Products and Services".
 *
 * Implementação própria do protocolo, sem biblioteca cliente: o que se usa aqui
 * é um punhado de mensagens (initialize, didOpen/didChange/didClose,
 * publishDiagnostics, completion, hover, definition), e o enquadramento é só
 * `Content-Length`. Uma dependência a mais custaria mais do que estas ~100
 * linhas.
 */

type Manipulador = (msg: Record<string, unknown>) => void;

export interface OpcoesServidor {
  raiz: string;
  /** Chamado sempre que o servidor reavalia um arquivo. */
  aoDiagnosticar: (uri: string, diagnosticos: Diagnostico[]) => void;
}

export class ServidorPython {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buf = Buffer.alloc(0);
  private proximoId = 0;
  private readonly pendentes = new Map<number, Manipulador>();
  private pronto = false;
  /** A última lista devolvida, guardada inteira para o `completionItem/resolve`. */
  private ultimaLista: RespostaItem[] = [];

  constructor(private readonly op: OpcoesServidor) {}

  /** Caminho do servidor empacotado. Falha explícita se sumiu do node_modules. */
  private static caminhoDoServidor(raizApp: string): string {
    const alvo = path.join(raizApp, "node_modules", "pyright", "dist", "pyright-langserver.js");
    if (!fs.existsSync(alvo)) {
      throw new Error(`pyright não encontrado em ${alvo}. Rode: npm install`);
    }
    return alvo;
  }

  async iniciar(raizApp: string): Promise<void> {
    const servidor = ServidorPython.caminhoDoServidor(raizApp);

    // ELECTRON_RUN_AS_NODE faz o próprio binário do Electron rodar como node,
    // então não há requisito de node instalado na máquina do usuário.
    this.proc = spawn(process.execPath, [servidor, "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });

    this.proc.stdout.on("data", (d: Buffer) => this.receber(d));
    this.proc.stderr.on("data", () => {
      /* o pyright fala bastante no stderr; nada disso é erro nosso */
    });
    this.proc.on("exit", () => {
      this.pronto = false;
      this.proc = null;
    });

    await this.pedir("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(this.op.raiz).href,
      workspaceFolders: [{ uri: pathToFileURL(this.op.raiz).href, name: path.basename(this.op.raiz) }],
      capabilities: {
        workspace: { configuration: true },
        textDocument: {
          synchronization: { didSave: false },
          publishDiagnostics: {},
          completion: { completionItem: { documentationFormat: ["markdown", "plaintext"] } },
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: {},
        },
      },
    });
    this.notificar("initialized", {});
    this.pronto = true;
  }

  estaPronto(): boolean {
    return this.pronto;
  }

  parar(): void {
    this.pronto = false;
    this.proc?.kill();
    this.proc = null;
  }

  /* --------------------------- protocolo cru --------------------------- */

  private escrever(msg: Record<string, unknown>): void {
    if (!this.proc) return;
    const corpo = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...msg }), "utf8");
    this.proc.stdin.write(`Content-Length: ${corpo.length}\r\n\r\n`);
    this.proc.stdin.write(corpo);
  }

  private notificar(method: string, params: unknown): void {
    this.escrever({ method, params });
  }

  private pedir(method: string, params: unknown): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
      const id = ++this.proximoId;
      this.pendentes.set(id, (msg) => resolve((msg["result"] as Record<string, unknown>) ?? null));
      this.escrever({ id, method, params });
    });
  }

  private receber(pedaco: Buffer): void {
    this.buf = Buffer.concat([this.buf, pedaco]);
    for (;;) {
      const fimCabecalho = this.buf.indexOf("\r\n\r\n");
      if (fimCabecalho < 0) return;
      const cab = this.buf.subarray(0, fimCabecalho).toString("utf8");
      const m = /content-length: (\d+)/i.exec(cab);
      if (!m) return;

      const inicio = fimCabecalho + 4;
      const tamanho = Number(m[1]);
      // Mensagem ainda incompleta: espera o próximo pedaço do cano.
      if (this.buf.length < inicio + tamanho) return;

      const bruto = this.buf.subarray(inicio, inicio + tamanho).toString("utf8");
      this.buf = this.buf.subarray(inicio + tamanho);
      try {
        this.tratar(JSON.parse(bruto) as Record<string, unknown>);
      } catch {
        /* mensagem malformada não pode derrubar o laço de leitura */
      }
    }
  }

  private tratar(msg: Record<string, unknown>): void {
    // O servidor pergunta a configuração; é aqui que o interpretador é dito.
    if (msg["method"] === "workspace/configuration") {
      const params = msg["params"] as { items: unknown[] };
      this.escrever({
        id: msg["id"],
        result: params.items.map(() => ({
          pythonPath: acharPython(),
          analysis: {
            // "basic", não "strict": código de análise científica é quase todo
            // sem anotação de tipo, e o modo estrito viraria ruído.
            typeCheckingMode: "basic",
            diagnosticMode: "openFilesOnly",
            useLibraryCodeForTypes: true,
          },
        })),
      });
      return;
    }

    // Pedidos do servidor que não tratamos ainda precisam de resposta mesmo
    // assim, senão ele fica esperando.
    if (msg["id"] !== undefined && msg["method"] !== undefined) {
      this.escrever({ id: msg["id"], result: null });
      return;
    }

    if (msg["method"] === "textDocument/publishDiagnostics") {
      const p = msg["params"] as { uri: string; diagnostics: RespostaDiagnostico[] };
      this.op.aoDiagnosticar(p.uri, p.diagnostics.map(converterDiagnostico));
      return;
    }

    const id = msg["id"] as number | undefined;
    if (id !== undefined) {
      const pendente = this.pendentes.get(id);
      this.pendentes.delete(id);
      pendente?.(msg);
    }
  }

  /* --------------------------- documentos --------------------------- */

  abrir(arquivo: string, texto: string): void {
    if (!this.pronto) return;
    this.notificar("textDocument/didOpen", {
      textDocument: { uri: pathToFileURL(arquivo).href, languageId: "python", version: 1, text: texto },
    });
  }

  mudar(arquivo: string, versao: number, texto: string): void {
    if (!this.pronto) return;
    // Sincronização por documento inteiro: um script de análise tem dezenas de
    // linhas, e o custo de mandar tudo é menor que o de manter o cálculo
    // incremental correto.
    this.notificar("textDocument/didChange", {
      textDocument: { uri: pathToFileURL(arquivo).href, version: versao },
      contentChanges: [{ text: texto }],
    });
  }

  fechar(arquivo: string): void {
    if (!this.pronto) return;
    this.notificar("textDocument/didClose", {
      textDocument: { uri: pathToFileURL(arquivo).href },
    });
  }

  /* --------------------------- consultas --------------------------- */

  async completar(arquivo: string, linha: number, coluna: number): Promise<SugestaoLsp[]> {
    if (!this.pronto) return [];
    const r = await this.pedir("textDocument/completion", {
      textDocument: { uri: pathToFileURL(arquivo).href },
      position: { line: linha, character: coluna },
    });
    if (!r) return [];
    const itens = (Array.isArray(r) ? r : ((r["items"] as unknown[]) ?? [])) as RespostaItem[];
    // Teto de 200: o pyright devolve o módulo inteiro em contextos amplos, e a
    // caixa de sugestão não é lugar para milhares de linhas.
    const recorte = itens.slice(0, 200);
    // Guardado para o `resolve`: o pyright só calcula o `additionalTextEdits`
    // quando perguntado, e perguntar por 200 itens de uma vez seria trabalho
    // jogado fora — quase todos nunca serão aceitos.
    this.ultimaLista = recorte;
    return recorte.map((i, indice) => ({
      rotulo: i.label,
      detalhe: i.detail ?? null,
      tipo: TIPOS[i.kind ?? 0] ?? "variable",
      documentacao:
        typeof i.documentation === "string" ? i.documentation : (i.documentation?.value ?? null),
      inserir: i.insertText ?? i.textEdit?.newText ?? i.label,
      edicoesExtras: converterEdicoes(i.additionalTextEdits),
      dados: i.data ?? null,
      indice,
    }));
  }

  /**
   * Pergunta ao pyright o que falta para esta sugestão específica.
   *
   * O protocolo permite devolver a lista sem `additionalTextEdits` e só
   * calculá-los no `resolve`. É o que o pyright faz com o import automático —
   * por isso a lista inicial quase sempre vem sem ele, e só perguntar de novo,
   * na hora de aceitar, traz a linha do `import`.
   */
  async resolverSugestao(indice: number): Promise<EdicaoExtra[]> {
    if (!this.pronto) return [];
    const original = this.ultimaLista[indice];
    if (!original) return [];
    const r = await this.pedir("completionItem/resolve", original);
    if (!r) return converterEdicoes(original.additionalTextEdits);
    const resolvido = r as unknown as RespostaItem;
    return converterEdicoes(resolvido.additionalTextEdits ?? original.additionalTextEdits);
  }

  async hover(arquivo: string, linha: number, coluna: number): Promise<string | null> {
    if (!this.pronto) return null;
    const r = await this.pedir("textDocument/hover", {
      textDocument: { uri: pathToFileURL(arquivo).href },
      position: { line: linha, character: coluna },
    });
    const c = r?.["contents"] as { value?: string } | string | undefined;
    if (!c) return null;
    return typeof c === "string" ? c : (c.value ?? null);
  }

  async definicao(arquivo: string, linha: number, coluna: number): Promise<LugarNoCodigo | null> {
    if (!this.pronto) return null;
    const r = await this.pedir("textDocument/definition", {
      textDocument: { uri: pathToFileURL(arquivo).href },
      position: { line: linha, character: coluna },
    });
    const lista = (Array.isArray(r) ? r : r ? [r] : []) as {
      uri?: string;
      targetUri?: string;
      range?: { start: { line: number; character: number } };
      targetSelectionRange?: { start: { line: number; character: number } };
    }[];
    const primeiro = lista[0];
    if (!primeiro) return null;

    const uri = primeiro.uri ?? primeiro.targetUri;
    const inicio = (primeiro.range ?? primeiro.targetSelectionRange)?.start;
    if (!uri || !inicio) return null;
    return {
      arquivo: decodeURIComponent(uri.replace(/^file:\/\//, "")),
      linha: inicio.line,
      coluna: inicio.character,
    };
  }
}

/* ------------------------------ conversões ------------------------------ */

interface RespostaDiagnostico {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity?: number;
  message: string;
  code?: string | number;
}

interface FaixaLsp {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

interface RespostaItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { value: string };
  insertText?: string;
  textEdit?: { newText: string };
  /** Onde o pyright põe o `import` que falta. */
  additionalTextEdits?: { range: FaixaLsp; newText: string }[];
  /** Opaco: volta inalterado no `completionItem/resolve`. */
  data?: unknown;
}

function converterEdicoes(
  edicoes: { range: FaixaLsp; newText: string }[] | undefined,
): EdicaoExtra[] {
  return (edicoes ?? []).map((e) => ({
    linhaInicio: e.range.start.line,
    colunaInicio: e.range.start.character,
    linhaFim: e.range.end.line,
    colunaFim: e.range.end.character,
    texto: e.newText,
  }));
}

const GRAVIDADE = ["error", "error", "warning", "info", "hint"] as const;

function converterDiagnostico(d: RespostaDiagnostico): Diagnostico {
  return {
    linhaInicio: d.range.start.line,
    colunaInicio: d.range.start.character,
    linhaFim: d.range.end.line,
    colunaFim: d.range.end.character,
    gravidade: GRAVIDADE[d.severity ?? 1] ?? "error",
    mensagem: d.message,
    codigo: d.code === undefined ? null : String(d.code),
  };
}

/** CompletionItemKind do LSP -> nome de tipo que o CodeMirror entende. */
const TIPOS: Record<number, string> = {
  2: "method",
  3: "function",
  4: "function",
  5: "property",
  6: "variable",
  7: "class",
  8: "interface",
  9: "namespace",
  10: "property",
  14: "keyword",
  21: "constant",
  22: "class",
  23: "variable",
  25: "type",
};
