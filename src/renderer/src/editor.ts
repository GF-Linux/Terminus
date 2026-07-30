import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { bracketMatching, foldGutter, indentUnit } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { realceCursor, temaCursor } from "./tema.js";

/** Compartimento para trocar de linguagem sem recriar o editor. */
const linguagem = new Compartment();

export interface Posicao {
  linha: number;
  coluna: number;
}

export interface OpcoesEditor {
  host: HTMLElement;
  aoMudar: (sujo: boolean) => void;
  aoMoverCursor: (p: Posicao) => void;
  aoSalvar: () => void;
  aoRodar: () => void;
}

/**
 * O editor. CodeMirror 6 conforme a ADR 0003 — a alternativa era escrever camada
 * de edição, o que a própria 0003 declarou fora de escopo.
 */
export class Editor {
  private readonly view: EditorView;
  private limpo = "";

  constructor(private readonly op: OpcoesEditor) {
    this.view = new EditorView({
      parent: op.host,
      state: this.novoEstado(""),
    });
  }

  private novoEstado(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        foldGutter(),
        history(),
        bracketMatching(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        // 4 espaços: é o que o catálogo do Biopython gera nos trechos e o que
        // a barra de estado anuncia.
        indentUnit.of("    "),
        EditorState.tabSize.of(4),
        linguagem.of(python()),
        temaCursor,
        realceCursor,
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              this.op.aoSalvar();
              return true;
            },
          },
          {
            key: "Mod-Enter",
            preventDefault: true,
            run: () => {
              this.op.aoRodar();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) this.op.aoMudar(this.sujo());
          if (u.selectionSet || u.docChanged) {
            const p = u.state.selection.main.head;
            const linha = u.state.doc.lineAt(p);
            this.op.aoMoverCursor({ linha: linha.number, coluna: p - linha.from + 1 });
          }
        }),
      ],
    });
  }

  /**
   * Abre um documento, descartando o histórico de desfazer do anterior.
   *
   * `gravado` é o texto que está no disco. Ao voltar para uma aba com alterações
   * pendentes, `conteudo` é o que estava sendo editado e `gravado` é o do disco —
   * são diferentes, e o marcador de "não gravado" tem de continuar aceso. Assumir
   * que abrir significa limpo apagaria essa diferença.
   */
  abrir(conteudo: string, gravado: string = conteudo): void {
    this.limpo = gravado;
    this.view.setState(this.novoEstado(conteudo));
    this.op.aoMudar(this.sujo());
    this.op.aoMoverCursor({ linha: 1, coluna: 1 });
  }

  conteudo(): string {
    return this.view.state.doc.toString();
  }

  sujo(): boolean {
    return this.conteudo() !== this.limpo;
  }

  /** Marca o conteúdo atual como gravado. */
  marcarGravado(): void {
    this.limpo = this.conteudo();
    this.op.aoMudar(false);
  }

  /**
   * Leva o cursor até uma linha (1-based) e centraliza a tela nela.
   *
   * Usada pelo clique no traceback. Uma linha além do fim do documento não é
   * erro: o arquivo pode ter encolhido desde a execução que gerou o traceback,
   * e nesse caso vai-se ao fim em vez de estourar.
   */
  irParaLinha(numero: number): void {
    const doc = this.view.state.doc;
    const linha = doc.line(Math.min(Math.max(1, numero), doc.lines));
    this.view.dispatch({
      selection: { anchor: linha.from },
      effects: EditorView.scrollIntoView(linha.from, { y: "center" }),
    });
    this.view.focus();
  }

  /** Insere um trecho do catálogo na posição do cursor. */
  inserir(trecho: string): void {
    const sel = this.view.state.selection.main;
    this.view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: trecho },
      selection: { anchor: sel.from + trecho.length },
      scrollIntoView: true,
    });
    this.view.focus();
  }

  focar(): void {
    this.view.focus();
  }
}
