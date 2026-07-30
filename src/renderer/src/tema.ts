import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/**
 * Tema do editor, com os mesmos valores que a casca.
 *
 * Os hex estão repetidos aqui em vez de lidos das variáveis CSS porque o
 * CodeMirror injeta suas regras em folha própria, e `var(--x)` dentro dela
 * resolve contra o host — funciona, mas quebra silenciosamente se a folha
 * carregar fora de ordem. Preferi a duplicação explícita: se um valor mudar em
 * casca.css, tem de mudar aqui, e o comentário abaixo é o lembrete.
 *
 * Fonte da verdade: src/renderer/src/casca.css (paleta Cursor Dark, 252 cores).
 */
const CHROME = "#141414";
const BG = "#181818";
const LINHA_ATUAL = "#262626";
const FG = "#f0f0f0";
const FG36 = "#f0f0f05c";
const FG74 = "#f0f0f0bd";
const SEL = "#f0f0f01e";
const LINE = "#f0f0f013";

export const temaCursor: Extension = EditorView.theme(
  {
    "&": { color: FG74, backgroundColor: BG },
    ".cm-content": { caretColor: FG, padding: "6px 0 14px" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: FG, borderLeftWidth: "2px" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: SEL,
    },
    ".cm-activeLine": { backgroundColor: LINHA_ATUAL },
    ".cm-gutters": {
      backgroundColor: BG,
      color: FG36,
      border: "none",
      minWidth: "52px",
    },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 18px 0 8px" },
    ".cm-activeLineGutter": { backgroundColor: LINHA_ATUAL, color: FG },
    ".cm-foldPlaceholder": { backgroundColor: "transparent", border: "none", color: FG36 },
    ".cm-panels": { backgroundColor: CHROME, color: FG74, borderTop: `1px solid ${LINE}` },
    ".cm-searchMatch": { backgroundColor: SEL, outline: `1px solid ${LINE}` },
    ".cm-tooltip": {
      backgroundColor: CHROME,
      border: `1px solid ${LINE}`,
      borderRadius: "5px",
      color: FG74,
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: SEL, color: FG },
    ".cm-scroller::-webkit-scrollbar": { width: "10px", height: "10px" },
    ".cm-scroller::-webkit-scrollbar-thumb": { backgroundColor: "#f0f0f026", borderRadius: "5px" },
    ".cm-scroller::-webkit-scrollbar-track": { backgroundColor: "transparent" },
  },
  { dark: true },
);

/** Cores de sintaxe do Cursor Dark, aplicadas às tags do Lezer. */
const realce = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#f0f0f099", fontStyle: "italic" },
  { tag: [t.string, t.special(t.string)], color: "#e394dc" },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: "#82d2ce" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#efb080" },
  { tag: [t.number, t.bool, t.null], color: "#ebc88d" },
  { tag: [t.variableName, t.propertyName], color: "#d6d6dd" },
  { tag: [t.typeName, t.className, t.definition(t.className)], color: "#efb080" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "#f0f0f0bd" },
  { tag: t.self, color: "#82d2ce", fontStyle: "italic" },
  { tag: t.invalid, color: "#f0574f" },
]);

export const realceCursor: Extension = syntaxHighlighting(realce);
