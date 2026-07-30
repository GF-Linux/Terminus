import { completionStatus } from "@codemirror/autocomplete";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type ViewUpdate } from "@codemirror/view";

/**
 * Texto fantasma: a sugestão da IA aparece em cinza à frente do cursor e só
 * vira código no `Tab`.
 *
 * O gesto é o do Copilot/Twinny. As regras aqui são todas sobre **não
 * atrapalhar**: a sugestão some a qualquer tecla, nunca aparece junto da caixa
 * do catálogo, e o pedido em voo é cancelado assim que se digita.
 */

const api = window.bancada;

/** Quanto tempo de silêncio antes de perguntar ao modelo. */
const ESPERA = 450;

interface Sugestao {
  texto: string;
  /** Onde ela vale. Cursor em outro lugar significa sugestão morta. */
  em: number;
}

const mostrar = StateEffect.define<Sugestao | null>();

const campo = StateField.define<Sugestao | null>({
  create: () => null,
  update(valor, tr) {
    for (const e of tr.effects) if (e.is(mostrar)) return e.value;
    // Qualquer edição ou movimento invalida: uma sugestão calculada para outra
    // posição encaixaria texto no lugar errado.
    if (tr.docChanged || tr.selection) return null;
    return valor;
  },
});

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

      // Digitou: o que estava sendo calculado não serve mais.
      window.clearTimeout(this.temporizador);
      this.geracao += 1;
      api.fantasma.cancelar();

      if (!u.docChanged) return;
      this.temporizador = window.setTimeout(() => void this.perguntar(), ESPERA);
    }

    private async perguntar(): Promise<void> {
      const minha = this.geracao;
      const estado = this.view.state;

      // Com a caixa do catálogo aberta, duas sugestões disputariam o Tab.
      // A do catálogo é verificada; a do modelo, adivinhada. O catálogo ganha.
      if (completionStatus(estado) !== null) return;

      const cursor = estado.selection.main;
      if (!cursor.empty) return;

      const r = await api.fantasma.sugerir(estado.doc.toString(), cursor.head);
      // Entre o pedido e a resposta o usuário pode ter digitado.
      if (!r.ok || !r.valor || minha !== this.geracao) return;
      if (this.view.state.selection.main.head !== cursor.head) return;

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
