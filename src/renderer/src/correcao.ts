import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type ViewUpdate } from "@codemirror/view";

import type { EdicaoSugerida } from "../../shared/tipos.js";
import { campoDoFantasma } from "./fantasma.js";

/**
 * A correção do que já está escrito — o "next edit" do Copilot (ADR 0025).
 *
 * **Por que ela não é o texto fantasma com outro nome.** O fantasma insere no
 * cursor: ele completa o que você ainda não escreveu. Isto aqui **substitui** um
 * trecho que já está no arquivo, possivelmente longe do cursor. O caso que a
 * pediu foi `dicionario(i, 0)` onde cabia `dicionario.get(i, 0)` — não falta
 * nada no cursor, sobra um erro três linhas acima, e nem o pyright o vê, porque
 * `dicionario` é parâmetro sem anotação e chamá-lo é legítimo para ele.
 *
 * **A tela mostra o antes e o depois, não só o depois.** Foi escolha do autor,
 * e a razão é o público: quem está aprendendo precisa ver *o que* mudou, não
 * receber o arquivo consertado por mágica. A linha original fica marcada, a
 * proposta aparece embaixo, e só o pedaço que muda vem destacado — no caso
 * acima, os quatro caracteres `.get`.
 *
 * **Nada é aplicado sozinho.** A proposta é desenho até alguém apertar a tecla,
 * que vai escrita na própria caixa justamente para não exigir memória.
 *
 * ## Duas regras que a primeira versão não tinha, e que custaram um teste
 *
 * Ela nasceu sem fronteira com o fantasma, e o resultado foi pior que não
 * existir. Numa tela só, ao escrever `def lista(dicionario):`, o fantasma
 * ofereceu `return list(dicionario.values())` e esta caixa, logo abaixo,
 * ofereceu `return list(dicionario.keys())` — **duas propostas em cinza,
 * contrárias, sem dizer qual era qual**. Noutra, a "correção" reescrevia a linha
 * que a pessoa estava digitando naquele instante.
 *
 * A regra que resolve isso é **espacial**, e é uma só:
 *
 * > **Correção que caia na linha do cursor é descartada.** Isso não é corrigir,
 * > é completar — trabalho do fantasma, e ele faz três vezes mais rápido. Esta
 * > caixa é para **o que você já deixou para trás**, que é exatamente o caso que
 * > a pediu: o `.get` faltando três linhas acima.
 *
 * Como o fantasma vive no cursor e a correção nunca encosta na linha dele, as
 * duas **não podem** se sobrepor na tela. Quem disputa a tecla é resolvido no
 * `aceitarCorrecaoSeSozinha`.
 *
 * **Houve uma segunda regra, e ela foi longe demais (retirada em 08/08).** Por
 * algumas horas a caixa se calava sempre que houvesse fantasma na tela. Parecia
 * prudente e matou o recurso: o fantasma responde em ~300 ms e esta caixa
 * pergunta aos 1500 ms, então quando a pessoa para de digitar o fantasma **já
 * está lá** — e a correção nunca chegava a perguntar. Justamente o
 * comportamento retroativo que se queria ("paro de digitar no fim e aparece uma
 * correção lá no início") era o que a regra apagava. Fica registrado para
 * ninguém reintroduzi-la achando que está organizando.
 */

const api = window.bancada;

/**
 * Quanto tempo parado antes de perguntar "tem algo errado aqui?".
 *
 * Cinco vezes a espera do fantasma, e de propósito. Medido em 08/08, a resposta
 * leva de 2,5 s a 4,5 s — pendurar isto nos 300 ms do fantasma encheria a fila
 * de pedidos que ninguém chegaria a ver. Aqui o gesto é outro: escrever um
 * trecho, parar, e então ser avisado.
 */
const ESPERA = 1500;

const mostrar = StateEffect.define<EdicaoSugerida | null>();

const campo = StateField.define<EdicaoSugerida | null>({
  create: () => null,
  update(valor, tr) {
    for (const e of tr.effects) if (e.is(mostrar)) return e.value;
    if (!valor) return null;
    // Os deslocamentos são do documento que foi mandado. Qualquer edição os
    // torna mentira, e aplicar intervalo velho reescreveria o lugar errado —
    // que é o único estrago grave que esta tela pode causar.
    if (tr.docChanged) return null;
    // Mover o cursor **não** cancela: ler a proposta antes de aceitar é o uso
    // esperado, e é onde está o valor didático dela.
    return valor;
  },
});

/* ------------------------------ o desenho ------------------------------ */

/**
 * Onde os dois textos deixam de ser iguais, pelas pontas.
 *
 * Destaque de linha inteira não ensina nada — a pessoa fica procurando o que
 * mudou. Recortando prefixo e sufixo comuns sobra exatamente a diferença: em
 * `dicionario(i, 0)` → `dicionario.get(i, 0)`, sobra `.get`.
 */
function diferenca(antes: string, depois: string): [string, string, string] {
  let i = 0;
  while (i < antes.length && i < depois.length && antes[i] === depois[i]) i++;
  let j = 0;
  while (
    j < antes.length - i &&
    j < depois.length - i &&
    antes[antes.length - 1 - j] === depois[depois.length - 1 - j]
  ) {
    j++;
  }
  return [depois.slice(0, i), depois.slice(i, depois.length - j), depois.slice(depois.length - j)];
}

/**
 * A regra 2: a proposta cai na linha onde a pessoa está escrevendo?
 *
 * Se cai, não é correção — é completamento, e aí o fantasma já está no assunto,
 * é três vezes mais rápido e não precisa de caixa nenhuma. Relatado em 08/08:
 * a caixa reescrevendo `dict[i] = dicionario[i]` na linha que estava sendo
 * digitada naquele instante.
 *
 * Repare que o caso que originou tudo **passa** por esta regra: o `.get`
 * faltando estava na linha 7 e o cursor, no fim do arquivo.
 */
export function tocaALinhaDoCursor(estado: EditorState, edicao: EdicaoSugerida): boolean {
  const linha = estado.doc.lineAt(estado.selection.main.head);
  return edicao.de <= linha.to && edicao.ate >= linha.from;
}

class Proposta extends WidgetType {
  constructor(
    private readonly antes: string,
    private readonly depois: string,
  ) {
    super();
  }

  override eq(outra: Proposta): boolean {
    return outra.antes === this.antes && outra.depois === this.depois;
  }

  toDOM(): HTMLElement {
    const caixa = document.createElement("div");
    caixa.className = "cm-correcao";

    const linha = document.createElement("div");
    linha.className = "cm-correcao-texto";
    const [prefixo, meio, sufixo] = diferenca(this.antes, this.depois);
    for (const [texto, classe] of [
      [prefixo, ""],
      [meio, "cm-correcao-novo"],
      [sufixo, ""],
    ] as const) {
      if (!texto) continue;
      const span = document.createElement("span");
      if (classe) span.className = classe;
      span.textContent = texto;
      linha.appendChild(span);
    }
    caixa.appendChild(linha);

    // A tecla vai na tela, não num manual: este ambiente é de quem não é nem
    // quer ser desenvolvedor, e atalho que só existe na memória não existe.
    const teclas = document.createElement("div");
    teclas.className = "cm-correcao-teclas";
    teclas.textContent = "Ctrl+.  aceita   ·   Esc  dispensa";
    caixa.appendChild(teclas);
    return caixa;
  }

  /** O widget tem os próprios cliques; o editor não deve tratá-los como texto. */
  override ignoreEvent(): boolean {
    return true;
  }
}

const decoracao = EditorView.decorations.compute([campo, "doc"], (estado) => {
  const c = estado.field(campo);
  if (!c) return Decoration.none;
  if (c.ate > estado.doc.length) return Decoration.none;

  const primeira = estado.doc.lineAt(c.de);
  const ultima = estado.doc.lineAt(c.ate);
  const marcas = [];
  for (let n = primeira.number; n <= ultima.number; n++) {
    marcas.push(Decoration.line({ class: "cm-correcao-antes" }).range(estado.doc.line(n).from));
  }
  marcas.push(
    Decoration.widget({
      widget: new Proposta(estado.doc.sliceString(c.de, c.ate), c.texto),
      block: true,
      side: 1,
    }).range(ultima.to),
  );
  return Decoration.set(marcas, true);
}) as Extension;

/* ------------------------------- o pedido ------------------------------- */

const pedirCorrecao = ViewPlugin.fromClass(
  class {
    private temporizador: number | undefined;
    /** Cresce a cada edição; resposta de id velho é descartada. */
    private geracao = 0;

    constructor(private readonly view: EditorView) {}

    update(u: ViewUpdate): void {
      // **Só edição agenda, ao contrário do fantasma.** O Copilot corrige o que
      // mudou — medido: documento sem história de edição devolve zero em 260 ms,
      // sem nem consultar o modelo. Perguntar por mover o cursor seria pedido
      // certo de voltar vazio.
      if (!u.docChanged) return;
      window.clearTimeout(this.temporizador);
      this.geracao += 1;
      this.temporizador = window.setTimeout(() => void this.perguntar(), ESPERA);
    }

    private async perguntar(): Promise<void> {
      const minha = this.geracao;
      const estado = this.view.state;
      const r = await api.fantasma.corrigir(estado.doc.toString(), estado.selection.main.head);
      // Entre o pedido e a resposta — que leva segundos — a pessoa pode ter
      // digitado. Os deslocamentos seriam do texto de antes.
      if (!r.ok || minha !== this.geracao) return;

      const edicao = r.valor?.[0];
      if (!edicao) return;

      if (tocaALinhaDoCursor(estado, edicao)) return;

      this.view.dispatch({ effects: mostrar.of(edicao) });
    }

    destroy(): void {
      window.clearTimeout(this.temporizador);
    }
  },
);

/* ------------------------------- comandos ------------------------------- */

/**
 * Aceita a proposta. Tecla própria (`Ctrl+.`), que funciona mesmo com fantasma
 * na tela — é a única forma de alcançar a correção quando as duas coexistem.
 */
export function aceitarCorrecao(view: EditorView): boolean {
  const c = view.state.field(campo, false);
  if (!c || c.ate > view.state.doc.length) return false;
  view.dispatch({
    changes: { from: c.de, to: c.ate, insert: c.texto },
    selection: { anchor: c.de + c.texto.length },
    effects: mostrar.of(null),
    userEvent: "input.complete",
  });
  api.fantasma.edicaoAceita();
  return true;
}

/**
 * O mesmo, mas cedendo a vez ao fantasma — é o que fica no `Alt+Enter`.
 *
 * Com fantasma na tela, devolve `false` e a cascata entrega a tecla a ele: quem
 * está olhando o cursor quer o que está no cursor. Sem fantasma, o `Alt+Enter`
 * que a pessoa já tem no dedo aceita a correção, sem exigir tecla nova.
 *
 * Isto é o oposto da ADR 0018 e não a contradiz: lá, catálogo e fantasma se
 * aplicavam ao mesmo tempo **no mesmo lugar**, e por isso precisaram de teclas
 * separadas. Aqui a ambiguidade tem desempate óbvio — o cursor.
 */
export function aceitarCorrecaoSeSozinha(view: EditorView): boolean {
  if (view.state.field(campoDoFantasma, false)) return false;
  return aceitarCorrecao(view);
}

export function dispensarCorrecao(view: EditorView): boolean {
  if (!view.state.field(campo, false)) return false;
  view.dispatch({ effects: mostrar.of(null) });
  api.fantasma.edicaoRecusada();
  return true;
}

export const correcaoDoCodigo: Extension = [campo, decoracao, pedirCorrecao];
