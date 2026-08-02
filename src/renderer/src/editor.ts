import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  moveCompletionSelection,
  startCompletion,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import {
  bracketMatching,
  foldGutter,
  getIndentation,
  indentString,
  indentUnit,
} from "@codemirror/language";
import { lintGutter, linter } from "@codemirror/lint";
import { searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  hoverTooltip,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { comentariosMarcados } from "./comentarios.js";
import { fonteDoCatalogo } from "./completar.js";
import { aceitarFantasma, dispensarFantasma, textoFantasma } from "./fantasma.js";
import {
  diagnosticosDoArquivo,
  efeitoDiagnostico,
  fonteDoServidor,
  hoverDoServidor,
  precisaRelintar,
} from "./servidor.js";
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
  /** Avisa que o autocomplete acrescentou linhas de `import` no topo. */
  aoImportar: (linhas: string[]) => void;
}

/**
 * O editor. CodeMirror 6 conforme a ADR 0003 — a alternativa era escrever camada
 * de edição, o que a própria 0003 declarou fora de escopo.
 */
/**
 * Tab com sentido: leva a linha para a indentação que a linguagem pede.
 *
 * Pedido do autor: *"identação é algo que faz o código quebrar, então o certo
 * seria: escreveu uma def, apertou tab, a indentação correta acontece"*.
 *
 * O comportamento padrão do editor é somar quatro espaços a cada Tab, o que
 * transfere para a pessoa a conta de quantos níveis ela está. Aqui o CodeMirror
 * é perguntado: `getIndentation` devolve a coluna que o Python espera naquele
 * ponto — depois de `def …:` são quatro; dentro de um `if` aninhado, oito.
 *
 * Só age quando o cursor está **no branco do começo da linha**, que é quando
 * indentar é inequivocamente a intenção. Fora dali, devolve false e o próximo
 * da cascata assume. Tab apertado de novo numa linha já correta soma um nível,
 * para continuar sendo possível aninhar de propósito.
 */
function indentarComoOPythonPede(view: EditorView): boolean {
  const { state } = view;
  const cursor = state.selection.main;
  if (!cursor.empty) return false;

  const linha = state.doc.lineAt(cursor.head);
  const branco = /^[ \t]*/.exec(linha.text)?.[0] ?? "";
  // Cursor depois do primeiro caractere de código: não é indentação, é texto.
  if (cursor.head > linha.from + branco.length) return false;

  const largura = state.facet(indentUnit).length || 4;

  // Duas fontes, e fica a maior. O `getIndentation` do CodeMirror sabe o bloco,
  // mas numa linha ainda vazia ele devolve o nível do bloco que ABRE, não o do
  // corpo: depois de `if False:` indentado em 4, ele responde 4, e o certo é 8.
  // Os dois pontos no fim da linha anterior são o sinal mais forte que o Python
  // tem, e resolvem esse caso em um toque só.
  const doBloco = getIndentation(state, linha.from) ?? 0;
  let doDoisPontos = 0;
  for (let n = linha.number - 1; n >= 1; n--) {
    const anterior = state.doc.line(n);
    if (!anterior.text.trim()) continue;
    const recuo = (/^[ \t]*/.exec(anterior.text)?.[0] ?? "").length;
    doDoisPontos = anterior.text.trimEnd().endsWith(":") ? recuo + largura : recuo;
    break;
  }

  const certo = Math.max(doBloco, doDoisPontos);
  // Já está no nível certo? Então o Tab é para aninhar de propósito.
  const alvo = certo > branco.length ? certo : branco.length + largura;
  const texto = indentString(state, alvo);

  view.dispatch({
    changes: { from: linha.from, to: linha.from + branco.length, insert: texto },
    selection: { anchor: linha.from + texto.length },
    userEvent: "input.indent",
  });
  return true;
}

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
        // Depois do realce: a marca de comentário sobrepõe a cor de comentário.
        comentariosMarcados,
        // Sublinha os avisos do pyright. `needsRefresh` deixa o CodeMirror
        // pedir de novo quando o servidor empurra diagnóstico novo — sem isso
        // o sublinhado só apareceria na próxima tecla.
        linter(diagnosticosDoArquivo, { delay: 150, needsRefresh: precisaRelintar }),
        lintGutter(),
        hoverTooltip((view, pos) => hoverDoServidor(view, pos), { hideOnChange: true }),
        autocompletion({
          override: [fonteDoCatalogo(this.op.aoImportar), fonteDoServidor()],
          activateOnTyping: true,
          icons: false,
          // Sem o keymap padrão: nele o Enter aceita a sugestão. O público
          // deste ambiente não é quem digita rápido, e um Enter para quebrar
          // linha não pode trocar o que a pessoa acabou de escrever. Aqui
          // Enter é sempre Enter; quem aceita é o Tab.
          defaultKeymap: false,
        }),
        textoFantasma,
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
          // Tab em cascata, do mais específico ao mais genérico: cada um
          // devolve false quando não se aplica, e o seguinte assume.
          //
          // A ordem é deliberada e mudou depois do uso real (ADR 0018):
          //  1. caixa do catálogo aberta — a pessoa escolheu de uma lista;
          //  2. cursor na indentação — aí Tab é indentação, e ponto;
          //  3. texto fantasma na tela — sugestão adivinhada, aceita por Tab;
          //  4. o resto: indentar/desindentar como em qualquer editor.
          //
          // A regra 2 nasceu de um relato: com o fantasma na tela, apertar Tab
          // para indentar inseria a sugestão do modelo. Indentação quebra
          // Python; sugestão errada só atrapalha. Quem está no branco do começo
          // da linha está indentando.
          { key: "Tab", run: acceptCompletion },
          { key: "Tab", run: indentarComoOPythonPede },
          { key: "Tab", run: aceitarFantasma },
          { key: "Escape", run: dispensarFantasma },
          { key: "ArrowDown", run: moveCompletionSelection(true) },
          { key: "ArrowUp", run: moveCompletionSelection(false) },
          { key: "Escape", run: closeCompletion },
          { key: "Mod-Space", run: startCompletion },
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

  /** Diz ao `linter` que o servidor mandou diagnóstico novo. */
  avisarDiagnosticos(): void {
    this.view.dispatch({ effects: efeitoDiagnostico.of(null) });
  }

  /** Deslocamento do cursor, para consultas ao servidor. */
  posicaoDoCursor(): number {
    return this.view.state.selection.main.head;
  }

  vista(): EditorView {
    return this.view;
  }
}
