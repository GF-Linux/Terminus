import { StateEffect, StateField, type Extension, type Transaction } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type ViewUpdate } from "@codemirror/view";

/**
 * Texto fantasma: a sugestão da IA aparece em cinza à frente do cursor e só
 * vira código no `Tab`.
 *
 * O gesto é o do Copilot/Twinny. As regras aqui são todas sobre **não
 * atrapalhar**: a sugestão sai de cena a qualquer tecla que a contrarie e o
 * pedido em voo é cancelado assim que se digita.
 *
 * **Contrariar não é digitar (mudou em 08/08).** Escrever exatamente o próximo
 * caractere da sugestão é concordar com ela, e nesse caso ela é **recortada
 * pela frente** em vez de apagada — é o que o VS Code faz, e é por isso que o
 * `range` que o Copilot manda começa antes do cursor. Ver `reancorar`.
 *
 * **Ela PODE aparecer junto da caixa do catálogo (mudou em 03/08).** A regra
 * anterior a escondia sempre que a caixa estivesse aberta, e a razão escrita era
 * uma só: "duas sugestões disputariam o Tab". Essa disputa acabou na ADR 0018 —
 * o fantasma saiu do Tab e ganhou `Alt-Enter`. A trava virou herança, e cobrava
 * caro: com `activateOnTyping` ligado, a caixa abre a cada identificador
 * digitado, ou seja, na maior parte das vezes em que alguém para de digitar e
 * espera. O sintoma relatado era "às vezes sugere, às vezes não". Não era o
 * modelo; era esta linha. As duas superfícies não se atropelam: a caixa é um
 * balão flutuante, o fantasma é texto na linha, e cada um tem tecla própria.
 */

const api = window.bancada;

/**
 * Quanto tempo de silêncio antes de perguntar ao modelo.
 *
 * 450 ms era tempo suficiente para a pessoa concluir que "não veio nada" antes
 * de vir. Como o motor pode ser o Copilot (assinatura, sem custo por chamada),
 * o que se paga aqui é latência, não dinheiro.
 */
const ESPERA = 300;

interface Sugestao {
  texto: string;
  /** Onde ela vale. Cursor em outro lugar significa sugestão morta. */
  em: number;
}

const mostrar = StateEffect.define<Sugestao | null>();

/**
 * Você digitou; a sugestão ainda serve?
 *
 * Serve quando a tecla foi **exatamente o próximo caractere dela**. Aí a
 * sugestão não morre: ela encolhe pela frente e a âncora anda junto com o
 * cursor. Escrever o que já estava sendo oferecido é concordar com a oferta,
 * não recusá-la.
 *
 * As recusas são todas conservadoras, porque o preço de errar aqui é encaixar
 * texto no lugar errado — pior do que não sugerir nada:
 *
 *  - **mais de uma mudança na mesma transação** (fechamento automático de
 *    parênteses, recuo automático, colar): não dá para dizer qual delas é a
 *    digitação, então nenhuma vale;
 *  - **apagou alguma coisa** (`de !== ate`): backspace é sinal de arrependimento,
 *    e a sugestão foi calculada para o texto que estava lá;
 *  - **digitou fora da âncora**: a sugestão vale para uma posição só;
 *  - **acabou a sugestão**: sobrou string vazia, não há mais o que oferecer.
 */
function reancorar(s: Sugestao, tr: Transaction): Sugestao | null {
  const mudancas: { de: number; ate: number; ins: string }[] = [];
  tr.changes.iterChanges((de, ate, _deB, _ateB, inserido) => {
    mudancas.push({ de, ate, ins: inserido.toString() });
  });
  if (mudancas.length !== 1) return null;

  const m = mudancas[0]!;
  if (m.de !== m.ate) return null;
  if (m.de !== s.em) return null;
  if (!s.texto.startsWith(m.ins)) return null;

  const resto = s.texto.slice(m.ins.length);
  if (!resto) return null;
  return { texto: resto, em: s.em + m.ins.length };
}

/**
 * Exportado para a correção do código poder se calar quando o fantasma está na
 * tela (ADR 0025).
 *
 * **As duas superfícies não podem coexistir**, e isso foi aprendido caro: na
 * primeira versão da correção, o fantasma oferecia
 * `return list(dicionario.values())` e a caixa de correção, dois centímetros
 * abaixo, oferecia `return list(dicionario.keys())` — duas propostas em cinza
 * itálico, contrárias, sem dizer qual era qual. É a mesma armadilha da ADR 0018,
 * de novo, com atores diferentes.
 */
export const campoDoFantasma = StateField.define<Sugestao | null>({
  create: () => null,
  update(valor, tr) {
    for (const e of tr.effects) if (e.is(mostrar)) return e.value;
    if (!valor) return null;

    // **Digitar não apaga mais a sugestão — ela é recortada.** Antes, qualquer
    // `docChanged` ou `selection` zerava o campo, e o custo disso foi medido em
    // 04/08: a primeira resposta leva 886 ms na mediana e 1,8 s no p90, então
    // era preciso ficar parado de 1,2 s a 2,1 s para ver qualquer coisa, e as
    // sugestões longas — que demoram mais — quase nunca sobreviviam ao próprio
    // dedo de quem escreve. O sintoma relatado eram duas queixas que na verdade
    // são uma: "às vezes sugere, às vezes não" e "só sugere uma linha".
    if (tr.docChanged) {
      const encolhida = reancorar(valor, tr);
      if (!encolhida) return null;
      // A digitação tem que ter levado o cursor junto. Um `dispatch` que mude o
      // documento na âncora sem mover o cursor para lá não é alguém digitando,
      // e a sugestão não estaria mais à frente de quem escreve.
      const cursor = tr.newSelection.main;
      if (!cursor.empty || cursor.head !== encolhida.em) return null;
      return encolhida;
    }

    // Mover o cursor sem digitar continua invalidando: a sugestão foi calculada
    // para uma posição, e em outra ela encaixaria texto no lugar errado.
    if (tr.selection) return null;
    return valor;
  },
});

/** Apelido curto, para o resto deste módulo continuar legível. */
const campo = campoDoFantasma;

class Fantasma extends WidgetType {
  constructor(private readonly texto: string) {
    super();
  }

  override eq(outro: Fantasma): boolean {
    return outro.texto === this.texto;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-fantasma";
    el.textContent = this.texto;
    return el;
  }

  override get estimatedHeight(): number {
    return -1;
  }

  /** Não é conteúdo do documento: o cursor e a seleção passam por cima dele. */
  override ignoreEvent(): boolean {
    return false;
  }
}

const decoracao = EditorView.decorations.compute([campo], (estado) => {
  const s = estado.field(campo);
  if (!s) return Decoration.none;
  return Decoration.set([
    Decoration.widget({ widget: new Fantasma(s.texto), side: 1 }).range(s.em),
  ]);
}) as Extension;

/* ------------------------------- o pedido ------------------------------- */

const pedirAoModelo = ViewPlugin.fromClass(
  class {
    private temporizador: number | undefined;
    /** Cresce a cada pedido; resposta de id velho é descartada. */
    private geracao = 0;

    constructor(private readonly view: EditorView) {}

    update(u: ViewUpdate): void {
      if (!u.docChanged && !u.selectionSet) return;

      // **A sugestão sobreviveu à tecla** (foi recortada pelo `reancorar`). Não
      // há o que pedir — e pedir aqui seria pior que inútil: a resposta nova
      // chegaria por cima do resto da que já está na tela, e a sugestão longa
      // que a pessoa está justamente escrevendo seria trocada no meio.
      if (u.state.field(campo)) {
        window.clearTimeout(this.temporizador);
        return;
      }

      // Digitou: o que estava sendo calculado não serve mais.
      window.clearTimeout(this.temporizador);
      this.geracao += 1;
      api.fantasma.cancelar();

      // Mover o cursor também agenda. Antes, só `docChanged` agendava: quem
      // clicava no fim de uma linha e esperava não recebia nada, porque nada
      // tinha sido digitado — e "parar e esperar" é justamente o gesto com que
      // se espera uma sugestão. O contador de geração e o cancelamento acima
      // seguram a enxurrada de pedidos que isso poderia gerar.
      this.temporizador = window.setTimeout(() => void this.perguntar(), ESPERA);
    }

    private async perguntar(): Promise<void> {
      const minha = this.geracao;
      const estado = this.view.state;

      const cursor = estado.selection.main;
      if (!cursor.empty) return;

      const r = await api.fantasma.sugerir(estado.doc.toString(), cursor.head);
      // Entre o pedido e a resposta o usuário pode ter digitado.
      if (!r.ok || !r.valor || minha !== this.geracao) return;
      if (this.view.state.selection.main.head !== cursor.head) return;

      // **Só o efeito, nunca uma transação que mexa no documento.** A caixa do
      // pyright é assíncrona: um `dispatch` que altere doc ou seleção enquanto
      // ela consulta aborta a consulta, e o efeito era a caixa **nunca abrir**
      // para o que só o pyright conhece — parecia autocomplete incompleto, era
      // corrida. Um `StateEffect` puro não toca no documento e a deixa em paz,
      // que é o que permite as duas superfícies coexistirem.
      this.view.dispatch({ effects: mostrar.of({ texto: r.valor, em: cursor.head }) });
    }

    destroy(): void {
      window.clearTimeout(this.temporizador);
      api.fantasma.cancelar();
    }
  },
);

/* ------------------------------- comandos ------------------------------- */

export function aceitarFantasma(view: EditorView): boolean {
  const s = view.state.field(campo, false);
  if (!s) return false;
  view.dispatch({
    changes: { from: s.em, insert: s.texto },
    selection: { anchor: s.em + s.texto.length },
    effects: mostrar.of(null),
    userEvent: "input.complete",
  });
  return true;
}

export function dispensarFantasma(view: EditorView): boolean {
  if (!view.state.field(campo, false)) return false;
  view.dispatch({ effects: mostrar.of(null) });
  return true;
}

export const textoFantasma: Extension = [campo, decoracao, pedirAoModelo];
