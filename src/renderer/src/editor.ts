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
import { guiasDeIndentacao } from "./guias.js";
import {
  aceitarCorrecao,
  aceitarCorrecaoSeSozinha,
  correcaoDoCodigo,
  dispensarCorrecao,
} from "./correcao.js";
import { aceitarFantasma, dispensarFantasma, textoFantasma } from "./fantasma.js";
import { recadosNaLinha } from "./recados.js";
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
/**
 * A coluna que o Python espera para a linha `numero`.
 *
 * Duas fontes, e fica a maior. O `getIndentation` do CodeMirror sabe o bloco,
 * mas numa linha ainda vazia ele devolve o nível do bloco que ABRE, não o do
 * corpo: depois de `if False:` indentado em 4, ele responde 4, e o certo é 8.
 * Os dois pontos no fim da linha anterior são o sinal mais forte que o Python
 * tem, e resolvem esse caso em um toque só.
 *
 * As palavras que encerram o fluxo — `return`, `pass`, `raise`, `break`,
 * `continue` — puxam um nível **para trás**: depois delas o bloco acabou, e
 * quem escreve quase nunca quer continuar dentro dele. É o que o VS Code faz, e
 * é o tipo de coisa que quem não é da área não deveria precisar saber.
 */
const ENCERRA = /^\s*(return\b|pass\b|raise\b|break\b|continue\b)/;

function nivelQueOPythonPede(state: EditorState, numero: number, largura: number): number {
  const linha = state.doc.line(numero);
  const doBloco = getIndentation(state, linha.from) ?? 0;
  let doDoisPontos = 0;
  for (let n = numero - 1; n >= 1; n--) {
    const anterior = state.doc.line(n);
    if (!anterior.text.trim()) continue;
    const recuo = (/^[ \t]*/.exec(anterior.text)?.[0] ?? "").length;
    if (anterior.text.trimEnd().endsWith(":")) doDoisPontos = recuo + largura;
    else if (ENCERRA.test(anterior.text)) doDoisPontos = Math.max(0, recuo - largura);
    else doDoisPontos = recuo;
    break;
  }
  return Math.max(doBloco, doDoisPontos);
}

/**
 * `Enter` que já entrega a linha nova no lugar certo.
 *
 * Sem isto, escrever `def f():` e apertar Enter deixa o cursor na coluna 1 e a
 * pessoa tem de saber que agora precisa indentar. Esse é exatamente o
 * conhecimento que a ferramenta existe para não exigir.
 *
 * Fica **fora** da caixa de sugestões de propósito: Enter aqui é sempre quebrar
 * linha, nunca aceitar (quem aceita é o Tab).
 */
function quebrarLinhaIndentando(view: EditorView): boolean {
  const { state } = view;
  const cursor = state.selection.main;
  if (!cursor.empty) return false;

  const linha = state.doc.lineAt(cursor.head);
  // No meio do texto o Enter parte a linha; recuar o pedaço da direita seria
  // reescrever o que a pessoa não mandou mexer.
  if (cursor.head < linha.to) return false;

  const largura = state.facet(indentUnit).length || 4;
  const atual = (/^[ \t]*/.exec(linha.text)?.[0] ?? "").length;
  const texto = linha.text.trimEnd();

  let alvo = atual;
  if (texto.endsWith(":")) alvo = atual + largura;
  else if (ENCERRA.test(linha.text)) alvo = Math.max(0, atual - largura);

  const recuo = indentString(state, alvo);
  view.dispatch({
    changes: { from: cursor.head, to: cursor.head, insert: `\n${recuo}` },
    selection: { anchor: cursor.head + 1 + recuo.length },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

function indentarComoOPythonPede(view: EditorView): boolean {
  const { state } = view;
  const cursor = state.selection.main;
  if (!cursor.empty) return false;

  const linha = state.doc.lineAt(cursor.head);
  const branco = /^[ \t]*/.exec(linha.text)?.[0] ?? "";
  // Cursor depois do primeiro caractere de código: não é indentação, é texto.
  if (cursor.head > linha.from + branco.length) return false;

  const largura = state.facet(indentUnit).length || 4;
  const certo = nivelQueOPythonPede(state, linha.number, largura);
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
        // No Python a indentação é sintaxe, não estilo — e espaço não se vê.
        guiasDeIndentacao(),
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
        // A mensagem do pyright escrita na linha, e não só atrás do mouse.
        // Vem depois do `linter` porque lê o que ele lê (ADR 0026).
        recadosNaLinha,
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
        correcaoDoCodigo,
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
          // A regra 1 nasceu de um relato: com o fantasma na tela, apertar Tab
          // para indentar inseria a sugestão do modelo. Indentação quebra
          // Python; sugestão errada só atrapalha. Quem está no branco do começo
          // da linha está indentando.
          //
          // **A indentação vem primeiro de tudo, e isso é correção de 02/08.**
          // A ADR 0018 escreveu essa regra mas só a aplicou ao fantasma: a caixa
          // do catálogo continuava na frente, então com ela aberta o Tab no
          // começo da linha aceitava a sugestão em vez de indentar. Quem usou
          // relatou como "o Tab parou de funcionar e voltou o problema antigo",
          // e reiniciar "consertava" — porque fechava a caixa. Indentar no
          // branco do começo da linha não tem ambiguidade nenhuma: ganha sempre.
          { key: "Tab", run: indentarComoOPythonPede },
          { key: "Tab", run: acceptCompletion },
          // **O fantasma saiu do Tab (02/08).** Ele ficava por último na
          // cascata, o que na teoria era inofensivo. Na prática, sempre que a
          // caixa não estava aberta — que é a maioria do tempo — o Tab caía
          // nele. Visto acontecendo: num arquivo `.py`, com `get_cache_to`
          // escrito, um Tab inseriu uma função inteira em **bash**, e noutra
          // tentativa uma em **R**.
          //
          // O catálogo é verificado e a pessoa escolheu de uma lista; o
          // fantasma é adivinhado e ninguém pediu. Aceitar coisa adivinhada não
          // pode morar na mesma tecla que indentar, que é o gesto mais repetido
          // de quem escreve Python. Agora ele tem tecla própria.
          // **A correção divide o `Alt+Enter` com o fantasma, e pode (ADR
          // 0025).** A primeira versão deu tecla própria a ela, `Ctrl+.`, e foi
          // errado duas vezes: a tecla não funcionou no teclado do autor e, pior,
          // ela nem precisava existir. Depois que a correção passou a se calar
          // enquanto há fantasma na tela, as duas são **mutuamente exclusivas
          // por construção** — e a cascata resolve sozinha: a correção devolve
          // `false` quando não está visível, e o fantasma assume.
          //
          // Isto não contradiz a ADR 0018. Lá, catálogo e fantasma disputavam o
          // `Tab` porque os dois se aplicavam ao mesmo tempo. Aqui, nunca.
          // `Ctrl+.` é a tecla **própria** da correção, e a que a caixa mostra:
          // ela alcança a proposta mesmo com fantasma na tela, que é o caso
          // normal desde que a correção voltou a ser retroativa.
          { key: "Mod-.", run: aceitarCorrecao },
          // E o `Alt+Enter` continua servindo aos dois, com desempate pelo
          // cursor: havendo fantasma, é dele; não havendo, aceita a correção
          // sem exigir tecla nova de quem só quer aceitar o que está na tela.
          { key: "Alt-Enter", run: aceitarCorrecaoSeSozinha },
          { key: "Alt-Enter", run: aceitarFantasma },
          { key: "Mod-ArrowRight", run: aceitarFantasma },
          // Antes do defaultKeymap, que traz o Enter comum.
          { key: "Enter", run: quebrarLinhaIndentando },
          // Esc em cascata: primeiro a proposta de correção, que é a que ocupa
          // espaço na tela; depois o fantasma; depois a caixa.
          { key: "Escape", run: dispensarCorrecao },
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
