import type { Diagnostic } from "@codemirror/lint";
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { StateEffect, type EditorState } from "@codemirror/state";
import type { EditorView, Tooltip, ViewUpdate } from "@codemirror/view";
import { lugarDeSugerir } from "./completar.js";
import type { Diagnostico, SugestaoLsp } from "../../shared/tipos.js";

/**
 * O lado da interface do language server.
 *
 * Guarda o último diagnóstico de cada arquivo e traduz posições: o LSP fala em
 * linha/coluna começando em zero, o CodeMirror em deslocamento absoluto desde o
 * início do documento. Toda a conversão mora aqui, em duas funções, para não se
 * espalhar por cada consulta.
 */

const api = window.bancada;

/** Qual arquivo o editor está mostrando. Sem isso, uma resposta atrasada do
 *  servidor seria aplicada ao documento errado depois de trocar de aba. */
let arquivoAtual: string | null = null;
const porArquivo = new Map<string, Diagnostico[]>();
let aoChegarDiagnostico: (() => void) | null = null;

export function definirArquivoAtual(arquivo: string | null): void {
  arquivoAtual = arquivo;
}

export function iniciarServidor(aoAtualizar: () => void, aoFalhar: (m: string) => void): void {
  aoChegarDiagnostico = aoAtualizar;
  api.lsp.aoDiagnosticar(({ arquivo, diagnosticos }) => {
    porArquivo.set(arquivo, diagnosticos);
    if (arquivo === arquivoAtual) aoChegarDiagnostico?.();
  });
  api.lsp.aoFalhar(aoFalhar);
}

/* ----------------------------- posições ----------------------------- */

/** linha/coluna (0-based) -> deslocamento. Recorta ao documento: o servidor
 *  pode responder sobre uma versão que já mudou embaixo dele. */
function paraDeslocamento(estado: EditorState, linha: number, coluna: number): number {
  const n = Math.min(Math.max(1, linha + 1), estado.doc.lines);
  const l = estado.doc.line(n);
  return Math.min(l.from + coluna, l.to);
}

/** deslocamento -> linha/coluna (0-based). */
export function paraLinhaColuna(estado: EditorState, pos: number): { linha: number; coluna: number } {
  const l = estado.doc.lineAt(pos);
  return { linha: l.number - 1, coluna: pos - l.from };
}

/* ----------------------------- diagnósticos ----------------------------- */

const GRAVIDADE = {
  error: "error",
  warning: "warning",
  info: "info",
  hint: "info",
} as const;

/** Fonte para o `linter` do CodeMirror. Não consulta nada: só devolve o que o
 *  servidor já empurrou, porque diagnóstico no LSP é notificação, não pergunta. */
export function diagnosticosDoArquivo(view: EditorView): Diagnostic[] {
  if (!arquivoAtual) return [];
  const brutos = porArquivo.get(arquivoAtual) ?? [];

  return brutos.map((d) => {
    const from = paraDeslocamento(view.state, d.linhaInicio, d.colunaInicio);
    const to = paraDeslocamento(view.state, d.linhaFim, d.colunaFim);
    return {
      // Um diagnóstico de largura zero não desenha sublinhado nenhum; esticar
      // em um caractere é o que o torna visível.
      from,
      to: to > from ? to : Math.min(from + 1, view.state.doc.length),
      severity: GRAVIDADE[d.gravidade],
      message: d.codigo ? `${d.mensagem}\n(${d.codigo})` : d.mensagem,
      source: "pyright",
    };
  });
}

export function limparArquivo(arquivo: string): void {
  porArquivo.delete(arquivo);
}

/**
 * Aviso de que chegou diagnóstico novo.
 *
 * Diagnóstico no LSP é notificação: chega quando o servidor termina de pensar,
 * não quando se digita. Sem este efeito o `linter` só releria na tecla
 * seguinte, e um arquivo já correto continuaria sublinhado até alguém tocá-lo.
 */
export const efeitoDiagnostico = StateEffect.define<null>();

export function precisaRelintar(u: ViewUpdate): boolean {
  return u.transactions.some((tr) => tr.effects.some((e) => e.is(efeitoDiagnostico)));
}

/* ----------------------------- autocomplete ----------------------------- */

/**
 * Aceita a sugestão do pyright **e** acrescenta o `import` que falta.
 *
 * O catálogo já fazia isso; o pyright não fazia, e era a diferença que deixava a
 * sugestão do servidor "não conversando" com o código — aceitava-se `gc_fraction`
 * e o arquivo continuava quebrado, com o mesmo erro na tela.
 *
 * O `import` chega no `additionalTextEdits` do LSP, que o pyright só calcula
 * quando perguntado (`completionItem/resolve`). Perguntar na hora de aceitar, e
 * não ao listar, evita 200 perguntas para uma resposta usada.
 *
 * O texto é inserido primeiro e o import depois, num segundo `dispatch`: o
 * `resolve` é assíncrono, e prender a digitação esperando a rede faria a
 * aceitação engasgar. O import entra acima do cursor, então nada do que a pessoa
 * escreveu se desloca sob os dedos dela.
 */
function aplicarDoServidor(s: SugestaoLsp) {
  return (view: EditorView, _c: Completion, from: number, to: number): void => {
    view.dispatch({
      changes: { from, to, insert: s.inserir },
      selection: { anchor: from + s.inserir.length },
      scrollIntoView: true,
      userEvent: "input.complete",
    });

    void (async () => {
      let edicoes = s.edicoesExtras;
      if (edicoes.length === 0) {
        const r = await api.lsp.resolver(s.indice);
        if (!r.ok) return;
        edicoes = r.valor;
      }
      if (edicoes.length === 0) return;

      const doc = view.state.doc;
      const mudancas = edicoes
        .filter((e) => e.linhaInicio < doc.lines && e.linhaFim < doc.lines)
        .map((e) => ({
          from: doc.line(e.linhaInicio + 1).from + e.colunaInicio,
          to: doc.line(e.linhaFim + 1).from + e.colunaFim,
          insert: e.texto,
        }))
        // Já existe no arquivo? Então não é falta, é repetição.
        .filter((m) => !doc.toString().includes(m.insert.trim()) || m.insert.trim() === "");
      if (mudancas.length === 0) return;

      view.dispatch({ changes: mudancas, userEvent: "input.complete" });
      avisarImport?.(mudancas.map((m) => m.insert.trim()).filter(Boolean));
    })();
  };
}

/** Quem conta na barra de estado que um import entrou sozinho. */
let avisarImport: ((linhas: string[]) => void) | null = null;

export function aoImportarDoServidor(f: (linhas: string[]) => void): void {
  avisarImport = f;
}

/**
 * Sugestões do pyright, para somar às do catálogo.
 *
 * Recebem `boost` negativo de propósito: quando as duas fontes conhecem
 * `gc_fraction`, a do catálogo tem de vir primeiro, porque é a única que traz a
 * armadilha junto. O pyright cobre o que o catálogo não cobre — pandas, a
 * biblioteca padrão e os nomes do próprio script.
 */
export function fonteDoServidor() {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    if (!arquivoAtual) return null;
    const antes = ctx.matchBefore(/[A-Za-z_]\w*$/);
    const de = antes?.from ?? ctx.pos;
    // O ponto é o gatilho mais importante que existe: `seq.` é justamente
    // quando não se sabe o que vem depois. `matchBefore` devolve **nulo** logo
    // após o ponto, porque não há palavra iniciada — e a regra antiga
    // (`if (!antes && !ctx.explicit) return null`) fazia a fonte desistir aí.
    // O efeito é que `os.`, `record.` e `seq.` nunca sugeriam nada ao digitar,
    // só com Ctrl+Espaço. É o buraco maior do autocomplete, e é anterior a
    // qualquer coisa desta rodada.
    const temPonto = ctx.state.doc.sliceString(Math.max(0, de - 1), de) === ".";
    if (!antes && !temPonto && !ctx.explicit) return null;
    // Mesma regra do catálogo: dentro de texto entre aspas, de comentário, ou
    // batizando um `def`, a caixa atrapalha. Calar uma fonte e deixar a outra
    // falar não resolveria nada.
    if (!ctx.explicit && !lugarDeSugerir(ctx)) return null;
    // Sem ponto, uma letra só devolve o módulo inteiro do pyright.
    if (!ctx.explicit && !temPonto && (antes?.text.length ?? 0) < 2) return null;

    const { linha, coluna } = paraLinhaColuna(ctx.state, ctx.pos);
    const r = await api.lsp.completar(arquivoAtual, linha, coluna);
    if (!r.ok || ctx.aborted) return null;

    const opcoes: Completion[] = r.valor
      // O pyright sugere `_privado` e dunder em contexto amplo; para este
      // público isso é ruído, não recurso.
      .filter((s) => !s.rotulo.startsWith("_"))
      .map((s) => ({
        label: s.rotulo,
        detail: s.detalhe ?? undefined,
        type: s.tipo,
        apply: aplicarDoServidor(s),
        boost: -20,
        ...(s.documentacao ? { info: () => painelSimples(s.documentacao!) } : {}),
      }));

    return opcoes.length > 0 ? { from: de, options: opcoes, validFor: /^\w*$/ } : null;
  };
}

function painelSimples(texto: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "cm-info-bancada";
  const doc = el.appendChild(document.createElement("div"));
  doc.className = "doc";
  // Markdown do LSP entra como texto: a caixa é pequena e renderizar markdown
  // completo aqui traria mais complicação do que leitura.
  doc.textContent = limparMarkdown(texto);
  return el;
}

function limparMarkdown(texto: string): string {
  return texto
    .replace(/```[a-z]*\n?/g, "")
    .replace(/\\_/g, "_")
    .trim();
}

/* -------------------------------- hover -------------------------------- */

export async function hoverDoServidor(view: EditorView, pos: number): Promise<Tooltip | null> {
  if (!arquivoAtual) return null;
  const { linha, coluna } = paraLinhaColuna(view.state, pos);
  const r = await api.lsp.hover(arquivoAtual, linha, coluna);
  if (!r.ok || !r.valor) return null;

  const texto = limparMarkdown(r.valor);
  if (!texto) return null;

  return {
    pos,
    above: true,
    create: () => {
      const dom = document.createElement("div");
      dom.className = "cm-info-bancada cm-hover-bancada";
      const corpo = dom.appendChild(document.createElement("div"));
      corpo.className = "doc";
      corpo.textContent = texto;
      return { dom };
    },
  };
}

/* ------------------------------ ir à definição --------------------------- */

export async function definicaoEm(
  view: EditorView,
  pos: number,
): Promise<{ arquivo: string; linha: number } | null> {
  if (!arquivoAtual) return null;
  const { linha, coluna } = paraLinhaColuna(view.state, pos);
  const r = await api.lsp.definicao(arquivoAtual, linha, coluna);
  if (!r.ok || !r.valor) return null;
  return { arquivo: r.valor.arquivo, linha: r.valor.linha + 1 };
}
