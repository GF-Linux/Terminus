import { indentUnit } from "@codemirror/language";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

/**
 * Guias de indentação coloridas por nível — o "indent rainbow".
 *
 * **Por que isto existe.** No Python a indentação não é estilo: é sintaxe. Um
 * nível a mais ou a menos muda o que o programa faz, e o erro é *invisível*,
 * porque espaço não se vê. Quem programa há anos conta os espaços de cabeça;
 * quem está aprendendo, não — e a Bancada existe para quem está aprendendo.
 *
 * Pintar cada nível de uma cor resolve pelo olho o que hoje se resolve pela
 * conta: dois blocos no mesmo nível têm a mesma cor, e um `return` que caiu
 * dentro do `for` sem querer aparece na cor errada **antes de rodar**.
 *
 * **Por que é o segundo lugar colorido da casca.** A ADR 0005 manda a casca ser
 * monocromática, e o cromatograma era a única exceção. A exceção aqui se
 * justifica pela mesma razão: a cor não decora, ela *informa* — é a única forma
 * de tornar visível uma estrutura que o texto esconde. As cores são as do realce
 * do Cursor Dark, em opacidade baixa, para nunca competir com o código.
 */

/** Uma cor por nível, repetindo a partir do sétimo. Todas já existem no tema. */
const CORES = ["#4ec9b0", "#c586c0", "#dcdcaa", "#9cdcfe", "#ce9178", "#b5cea8"];

/**
 * Duas opacidades, porque a guia faz dois trabalhos.
 *
 * `BORDA` é o fio na coluna exata onde o nível começa — é ele que responde
 * "este `return` está no mesmo nível do `for`?". `FAIXA` é o preenchimento do
 * degrau inteiro: é o que se enxerga de longe e sem procurar, e é o que
 * transforma contar espaços em reconhecer uma cor.
 *
 * A faixa é fraca de propósito. Ela passa **atrás** do código, e o texto tem de
 * continuar sendo a coisa mais legível da tela.
 */
const BORDA = "8c";
const FAIXA = "16";

/**
 * A decoração de uma profundidade, montada uma vez e reusada.
 *
 * Uma camada de fundo por nível, cada uma um filete de 1px na coluna daquele
 * nível — em vez de um elemento por guia. Elemento por guia encheria o DOM numa
 * função bem aninhada e piscaria ao rolar; camada de fundo é pintada pelo
 * compositor e não custa nó nenhum.
 *
 * `background-origin: content-box` alinha a coluna 0 com o começo do texto, e
 * não com a borda da linha — sem isso todas as guias saem deslocadas pelo
 * `padding` que o CodeMirror põe em `.cm-line`.
 */
const cache = new Map<number, Decoration>();

function decoracaoDe(prof: number): Decoration {
  const pronta = cache.get(prof);
  if (pronta) return pronta;

  const imagens: string[] = [];
  const posicoes: string[] = [];
  for (let i = 0; i < prof; i++) {
    const base = CORES[i % CORES.length];
    // Uma camada por nível resolve as duas coisas: o primeiro pixel é o fio,
    // o resto do degrau é a faixa.
    imagens.push(
      `linear-gradient(to right, ${base}${BORDA} 0 1px, ${base}${FAIXA} 1px 100%)`,
    );
    posicoes.push(`calc(${i} * var(--bc-passo)) 0`);
  }

  const nova = Decoration.line({
    attributes: {
      style: [
        `background-image:${imagens.join(",")}`,
        `background-position:${posicoes.join(",")}`,
        `background-size:${imagens.map(() => "var(--bc-passo) 100%").join(",")}`,
        "background-repeat:no-repeat",
        "background-origin:content-box",
      ].join(";"),
    },
  });
  cache.set(prof, nova);
  return nova;
}

function construir(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const largura = view.state.facet(indentUnit).length || 4;
  const doc = view.state.doc;

  /** Profundidade de uma linha, ou null quando ela está em branco. */
  const profundidadeDe = (numero: number): number | null => {
    const texto = doc.line(numero).text;
    if (!texto.trim()) return null;
    const branco = /^[ \t]*/.exec(texto)?.[0] ?? "";
    return Math.floor(branco.length / largura);
  };

  for (const { from, to } of view.visibleRanges) {
    const ultima = doc.lineAt(to).number;
    for (let numero = doc.lineAt(from).number; numero <= ultima; numero++) {
      let prof = profundidadeDe(numero);

      // Linha em branco herda a vizinhança. Sem isto a guia se parte no meio do
      // bloco toda vez que alguém deixa uma linha vazia para respirar — que é
      // justamente onde ela precisa continuar, mostrando que o bloco não acabou.
      // Fica a **menor** das duas profundidades, e não a maior, para a guia não
      // avançar sobre o espaço depois que o bloco terminou de verdade.
      if (prof === null) {
        let acima = 0;
        for (let n = numero - 1; n >= 1; n--) {
          const p = profundidadeDe(n);
          if (p !== null) {
            acima = p;
            break;
          }
        }
        let abaixo = 0;
        for (let n = numero + 1; n <= doc.lines; n++) {
          const p = profundidadeDe(n);
          if (p !== null) {
            abaixo = p;
            break;
          }
        }
        prof = Math.min(acima, abaixo);
      }

      if (prof > 0) {
        const inicio = doc.line(numero).from;
        builder.add(inicio, inicio, decoracaoDe(prof));
      }
    }
  }
  return builder.finish();
}

const plugin = ViewPlugin.fromClass(
  class {
    decoracoes: DecorationSet;

    constructor(view: EditorView) {
      this.decoracoes = construir(view);
    }

    update(u: ViewUpdate): void {
      // Também no `viewportChanged`: sem isso, rolar mostra linha sem guia até a
      // próxima tecla — o mesmo defeito que o cromatograma teve por pintar só a
      // janela visível e não repintar ao rolar.
      if (u.docChanged || u.viewportChanged) this.decoracoes = construir(u.view);
    }
  },
  { decorations: (v) => v.decoracoes },
);

/** O passo do gradiente acompanha o `indentUnit` de verdade do documento. */
const passo = EditorView.contentAttributes.compute([indentUnit], (state) => ({
  style: `--bc-passo: ${state.facet(indentUnit).length || 4}ch`,
}));

export function guiasDeIndentacao(): Extension {
  return [plugin, passo];
}
