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
/**
 * Cor do texto **do código** sem token de sintaxe (ADR 0023, alto contraste).
 *
 * Constante própria, e não um `FG74` levantado, porque os valores acima espelham
 * `casca.css` por contrato — mexer neles aqui sem mexer lá quebra o combinado do
 * comentário no topo e vaza para a casca inteira. O alto contraste é decisão
 * sobre a **área de escrita**, então mora só nela. 8,95:1 → 13,71:1.
 */
const TEXTO_CODIGO = "#e2e2e2";

export const temaCursor: Extension = EditorView.theme(
  {
    "&": { color: TEXTO_CODIGO, backgroundColor: BG },
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
    // Sem barra desenhada, aqui como no resto da casca: o CodeMirror injeta o
    // estilo dele num `style` próprio, então a regra geral do casca.css não
    // bastava — a barra precisa sumir também por aqui.
    ".cm-scroller": { scrollbarWidth: "none" },
    ".cm-scroller::-webkit-scrollbar": { width: "0", height: "0", display: "none" },
  },
  { dark: true },
);

/**
 * Cores de sintaxe — Cursor Dark levantado para **alto contraste** (ADR 0023).
 *
 * Os matizes são os do Cursor Dark; o que mudou foi a luminosidade. Medido
 * contra o fundo `#181818` (WCAG 2.1), o pior token sai de 6,31:1 para
 * **10,18:1** — todos em AAA. A escolha é do autor, entre quatro paletas
 * medidas, e foi feita sabendo do custo abaixo.
 *
 * **A tensão com a ADR 0005, dita e aceita.** A casca é monocromática para o
 * cromatograma ser a cor mais forte da tela. Esta paleta é a que mais se
 * aproxima de disputar isso — é a de maior piso (10,18) e, de propósito, a de
 * **menor amplitude** (7,58 contra 13,39 da alternativa "hierarquia"): tudo
 * forte junto separa menos os tokens entre si. Foi o preço escolhido em troca
 * de legibilidade sob luz forte.
 */
const realce = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#c4c4c4", fontStyle: "italic" },
  { tag: [t.string, t.special(t.string)], color: "#ffb3f2" },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: "#9dfff8" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#ffcf9e" },
  { tag: [t.number, t.bool, t.null], color: "#ffe6ab" },
  { tag: [t.variableName, t.propertyName], color: "#ffffff" },
  { tag: [t.typeName, t.className, t.definition(t.className)], color: "#ffcf9e" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "#e2e2e2" },
  { tag: t.self, color: "#9dfff8", fontStyle: "italic" },
  { tag: t.invalid, color: "#ff7b73" },
]);

export const realceCursor: Extension = syntaxHighlighting(realce);
