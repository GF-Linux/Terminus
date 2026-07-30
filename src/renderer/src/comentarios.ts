import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

/**
 * Comentários marcados por prefixo — o comportamento do Better Comments, que o
 * autor usa no VS Code.
 *
 * O comentário inteiro muda de cor conforme o primeiro caractere depois do `#`:
 *
 *     # ! isto quebra a análise
 *     # ? por que 20 e não 25?
 *     # TODO trocar por gc_fraction
 *     # * o resultado que interessa
 *     # // versão antiga, não apagar ainda
 *
 * **As cores não são as do Better Comments, e isso é de propósito.** Os padrões
 * dele são verde `#98C379` e azul `#3498DB`, perto demais das bases A `#3fc46b`
 * e C `#4d96ff`. A ADR 0005 diz que as quatro bases têm de ser as cores mais
 * fortes da tela; um comentário competindo com o cromatograma quebraria isso.
 * Então cada marca reusa uma cor que **já existe** no realce do Cursor Dark —
 * nenhuma cor nova entra na tela.
 */

interface Marca {
  /** O que vem logo depois do `#`, em minúsculas. */
  prefixo: string;
  classe: string;
}

/**
 * Ordem importa: `//` tem de ser testado antes de qualquer prefixo de um
 * caractere que pudesse casar antes dele.
 */
const MARCAS: Marca[] = [
  { prefixo: "//", classe: "cm-com-riscado" },
  { prefixo: "!", classe: "cm-com-alerta" },
  { prefixo: "?", classe: "cm-com-duvida" },
  { prefixo: "*", classe: "cm-com-destaque" },
  { prefixo: "todo", classe: "cm-com-todo" },
];

const DECORACOES = new Map(
  MARCAS.map((m) => [m.classe, Decoration.mark({ class: m.classe })]),
);

/** Devolve a classe da marca deste comentário, ou `null` se for comum. */
function classificar(texto: string): string | null {
  // Tira o `#` e os espaços; `#!urgente` e `# ! urgente` são o mesmo gesto.
  const corpo = texto.replace(/^#+/, "").trimStart().toLowerCase();
  if (!corpo) return null;

  for (const m of MARCAS) {
    if (!corpo.startsWith(m.prefixo)) continue;
    // Marca de palavra (`todo`) precisa terminar ali: `todos os arquivos` não é
    // um TODO. Marca de símbolo não tem esse problema.
    if (/^[a-z]/.test(m.prefixo)) {
      const seguinte = corpo[m.prefixo.length];
      if (seguinte !== undefined && /[a-z0-9_]/.test(seguinte)) continue;
    }
    return m.classe;
  }
  return null;
}

function construir(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (no) => {
        if (no.name !== "Comment") return;
        const texto = view.state.doc.sliceString(no.from, no.to);
        const classe = classificar(texto);
        if (classe) builder.add(no.from, no.to, DECORACOES.get(classe)!);
      },
    });
  }
  return builder.finish();
}

export const comentariosMarcados: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = construir(view);
    }

    update(u: ViewUpdate): void {
      // Só reconstrói quando algo que afeta o que está à vista mudou. Refazer a
      // cada movimento de cursor custaria uma varredura da árvore por tecla.
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = construir(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
