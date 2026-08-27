import * as monaco from "monaco-editor";
import { paleta } from "./paleta-do-tema.js";
import { initialize as inicializarServicos } from "@codingame/monaco-vscode-api/services";
import TrabalhadorDoEditor from "@codingame/monaco-vscode-editor-api/esm/vs/editor/editor.worker.js?worker";
import getBaseServiceOverride from "@codingame/monaco-vscode-base-service-override";
import getConfigurationServiceOverride from "@codingame/monaco-vscode-configuration-service-override";
import getFilesServiceOverride from "@codingame/monaco-vscode-files-service-override";
import getLanguagesServiceOverride from "@codingame/monaco-vscode-languages-service-override";
import getLogServiceOverride from "@codingame/monaco-vscode-log-service-override";
import getExtensionsServiceOverride from "@codingame/monaco-vscode-extensions-service-override";
import getModelServiceOverride from "@codingame/monaco-vscode-model-service-override";
import getMonarchServiceOverride from "@codingame/monaco-vscode-monarch-service-override";

//? O EDITOR — o núcleo do VSCode, embutido (planta de 26/08/2026)
//!
//! 1. O `monaco-editor` NÃO é "um editor parecido com o VSCode": é o `vs/editor`
//!    do VSCode, publicado no npm. Medido: ele traz a mesma contribuição
//!    `editor.contrib.inlineCompletionsController` e o mesmo registro
//!    `languageFeaturesService.inlineCompletionsProvider` que o VSCode 1.134
//!    desta máquina carrega. Find, folding, multicursor, snippets, sticky
//!    scroll, rename, peek — 59 contribuições, todas nativas.
//! 2. O que ele NÃO traz é o *workbench*: abas, Explorer, depuração, mercado de
//!    extensões. Metade disso a casca do Terminus já tinha antes do Monaco
//!    (Explorer, terminal, Ctrl+P, barra de estado); a outra metade — as abas —
//!    é o `abas-do-editor.ts`.
//! 3. Este arquivo NÃO lê disco, NÃO abre processo e NÃO fala rede. Ele monta a
//!    tela e mais nada; quem toca o mundo é o `main`, pela porta.

//? A TRANSPARÊNCIA — medida antes de existir uma linha deste arquivo (26/08)
//!
//! O papel de parede atrás do editor é a identidade visual do produto, e ela
//! dependia de o xterm aceitar fundo `#00000000`. Sonda em Electron de verdade,
//! com o `fundo-jared-v2b.png` REAL, `capturePage()` e a imagem OLHADA:
//!   · com SÓ `editor.background` transparente, o texto e a margem passam a
//!     figura — e o **minimap fica um bloco opaco** cobrindo a melhor parte
//!     dela. "Sim, o Monaco é transparente" seria resposta verdadeira e inútil.
//!   · com os tokens abaixo, passa inteiro.
//! Por isso a lista é longa e cada linha está aqui por ter sido vista falhando.

//? OS TRABALHADORES — e a fiação que NÃO se escreve (ramo B2)
//!
//! 1. O Monaco faz a análise pesada fora da linha do tempo da tela, em Web
//!    Workers. A receita que se acha em todo lugar manda definir
//!    `self.MonacoEnvironment.getWorker` e importar cada worker com `?worker`.
//! 2. ⚠️ **NO 0.56 ESSA RECEITA ESTÁ ERRADA, E ELA QUEBRA O QUE PROMETE
//!    CONSERTAR.** Medido no pacote: `internal/common/workers.js:100-116`
//!    consulta `globalThis.MonacoEnvironment.getWorker` **ANTES** de qualquer
//!    outra coisa, e o chama como `getWorker("workerMain.js", label)`. Definir a
//!    função SOBRESCREVE a fiação que o próprio Monaco já traz — e a minha
//!    devolveria o worker errado, porque o primeiro argumento não é um id útil.
//! 3. A fiação certa já está nos módulos de linguagem: cada `workerManager.js`
//!    passa `createWorker: () => new Worker(new URL('x.worker.js',
//!    import.meta.url), { type: "module" })`, e o `getWorker` cai nele quando
//!    `MonacoEnvironment` **não existe**. O empacotador enxerga esse `new URL` e
//!    emite os arquivos sozinho.
//! 4. **Provado pelo pacote gerado:** com ZERO import de worker neste arquivo, a
//!    construção emitiu `json.worker`, `html.worker`, `css.worker` e
//!    `ts.worker`. A ausência de código aqui é a configuração.
//! 5. ISTO É O RAMO B2 DA PLANTA, e o limite é honesto: TypeScript, JSON, CSS e
//!    HTML ganham análise completa **sem servidor nenhum**; Python e C# ficam
//!    com coloração e dobra, e a inteligência deles é o B1 —
//!    `monaco-languageclient` com pyright e Roslyn, em fatia própria.

/** O tema da casca: transparente onde é tela, OPACO onde é interface que se lê. */
const TEMA = "terminus-vidro";

function definirTema(): void {
  monaco.editor.defineTheme(TEMA, {
    base: "vs-dark",
    inherit: true,
    //? AS REGRAS DE TOKEN — copiadas do `syntax.lua` do catppuccin, não inventadas
    //!
    //! ⚠️ A VERSÃO ANTERIOR DESTAS REGRAS ESTAVA ERRADA, e a cabeça viu antes de mim:
    //! *"tela inicial não pegou o tema"*. Eu tinha pegado os 17 tons do `tema.lua` — todos
    //! da família azul-lavanda — e distribuído à mão pelos tokens. Resultado: **tudo da
    //! mesma cor**, quando o Neovim dela mostra verde, pêssego, amarelo e rosa.
    //! A CAUSA: o kit sobrescreve 17 cores de um tema que tem 26; as nove que ele não toca
    //! são justamente as coloridas, e o catppuccin as usa para string, número e tipo.
    //! O MAPA ABAIXO é o do `catppuccin/lua/catppuccin/groups/syntax.lua`, lido do disco:
    //!   Comment=overlay2 · String=green · Number/Constant/Boolean=peach · Character=teal
    //!   Identifier=flamingo · Function=blue · Keyword/Statement/Conditional=mauve
    //!   Operator=sky · Type/StorageClass/Structure=yellow · Delimiter=overlay2
    //!   Special/PreProc=pink · Tag=lavender · Error=red
    rules: [
      { token: "comment", foreground: paleta.overlay2.slice(1), fontStyle: "italic" },
      { token: "string", foreground: paleta.green.slice(1) },
      { token: "string.escape", foreground: paleta.pink.slice(1) },
      { token: "number", foreground: paleta.peach.slice(1) },
      { token: "constant", foreground: paleta.peach.slice(1) },
      { token: "keyword", foreground: paleta.mauve.slice(1) },
      { token: "keyword.flow", foreground: paleta.mauve.slice(1) },
      { token: "operator", foreground: paleta.sky.slice(1) },
      { token: "delimiter", foreground: paleta.overlay2.slice(1) },
      { token: "type", foreground: paleta.yellow.slice(1) },
      { token: "type.identifier", foreground: paleta.yellow.slice(1) },
      { token: "function", foreground: paleta.blue.slice(1) },
      { token: "identifier", foreground: paleta.flamingo.slice(1) },
      { token: "variable", foreground: paleta.flamingo.slice(1) },
      { token: "variable.predefined", foreground: paleta.red.slice(1) },
      { token: "tag", foreground: paleta.lavender.slice(1) },
      { token: "attribute.name", foreground: paleta.blue.slice(1) },
      { token: "attribute.value", foreground: paleta.green.slice(1) },
      { token: "annotation", foreground: paleta.pink.slice(1) },
      { token: "invalid", foreground: paleta.red.slice(1) },
    ],
    colors: {
      //! A tela — tudo transparente, para o papel de parede ser o fundo.
      "editor.background": "#00000000",
      "editorGutter.background": "#00000000",
      "minimap.background": "#00000000",
      "editorOverviewRuler.background": "#00000000",
      "editorOverviewRuler.border": "#00000000",
      "editorStickyScroll.background": "#00000000",
      //! O realce da linha atual vira um véu clarinho em vez de uma cor sólida:
      //!   cor sólida aqui seria uma faixa opaca cruzando a figura.
      "editor.lineHighlightBackground": "#ffffff0a",
      "editor.lineHighlightBorder": "#00000000",
      //! Os deslizadores ficam translúcidos: eles vivem POR CIMA da figura e
      //!   opacos viravam duas barras escuras permanentes na direita.
      "minimapSlider.background": "#ffffff14",
      "minimapSlider.hoverBackground": "#ffffff1f",
      "scrollbarSlider.background": "#ffffff14",
      "scrollbarSlider.hoverBackground": "#ffffff22",
      //! ⚠️ AQUI A TRANSPARÊNCIA PARA, e é decisão. Caixa de sugestão, hover e
      //!   peek são INTERFACE QUE SE LÊ, não tela de fundo: translúcidas sobre
      //!   uma figura elas ficam ilegíveis. Quase-opacas (`f2`) para a figura
      //!   ainda existir na borda sem custar a leitura.
      //! `f2` no fim é a opacidade: quase opaco, para a figura existir na borda sem custar
      //!   a leitura. A COR vem do kit; o que é escolha nossa é só o quanto ela deixa passar.
      "editorWidget.background": `${paleta.mantle}f2`,
      "editorWidget.border": paleta.surface2,
      "editorSuggestWidget.background": `${paleta.mantle}f2`,
      "editorHoverWidget.background": `${paleta.mantle}f2`,
      "peekViewResult.background": `${paleta.mantle}f2`,
      "peekViewEditor.background": `${paleta.mantle}f2`,
      //! ⚠️ AS CORES VÊM DO `kits/editor/tema.lua`, e não estão escritas aqui — ver
      //!   `paleta-do-tema.ts`. Estavam escritas à mão até 26/08, e o texto usava
      //!   `#d7d9ea`: exatamente o valor que o kit documenta como **substituído em
      //!   17/08 por contraste** (13,76:1 → 16,37:1). A casca rodava a paleta anterior
      //!   à correção que o autor pediu, e ninguém veria isso olhando.
      "editorLineNumber.foreground": paleta.overlay0,
      "editorLineNumber.activeForeground": paleta.text,
      "editor.foreground": paleta.text,
      "editorCursor.foreground": paleta.lavender,
      "editor.selectionBackground": `${paleta.surface2}aa`,
      "editorIndentGuide.background1": `${paleta.surface1}88`,
      "editorIndentGuide.activeBackground1": paleta.overlay0,
      //! A sugestão do Copilot é texto fantasma; ela precisa ser lida como
      //!   "ainda não é seu código" sem sumir na figura. `overlay2` é o tom que o kit
      //!   reserva para o que está lá e não é conteúdo.
      "editorGhostText.foreground": paleta.overlay2,
    },
  });
}

/** As opções da edição. Cada uma é conduta do VSCode ligada de propósito. */
//! O QUE NÃO ESTÁ AQUI TAMBÉM É ESCOLHA: nada de `readOnly`, nada de
//!   `wordWrap: "off"` — os padrões do Monaco JÁ SÃO os do VSCode, e repetir o
//!   padrão só cria um lugar a mais para divergir dele no dia em que mudar.
function opcoes(): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    theme: TEMA,
    //! A MESMA fonte da casca. `IBM Plex Mono` é a do produto; `Adwaita Mono`
    //!   cobre os octantes do sigilo que a Plex não tem.
    fontFamily: "'IBM Plex Mono', 'Adwaita Mono', ui-monospace, monospace",
    fontSize: 13,
    lineHeight: 20,
    //! O editor mora num flex que muda de tamanho com o divisor do terminal e
    //!   com a lateral. Sem isto ele mede a área UMA vez e nunca mais.
    automaticLayout: true,
    minimap: { enabled: true },
    //? A SUGESTÃO INLINE — itens 4 e 5 da comparação com a documentação do VSCode
    //!
    //! Até 26/08 aqui havia só `{ enabled: true, mode: "prefix" }`, e o resto ficava no
    //! padrão do editor — que **não é** o padrão do VSCode em tudo. Cada linha abaixo é um
    //! ajuste que o documento nomeia, e que estava desligado por omissão nossa.
    inlineSuggest: {
      enabled: true,
      mode: "prefix",
      //! `editor.inlineSuggest.showToolbar` — a barrinha que aparece sobre a sugestão, com
      //!   as alternativas e o descartar. Sem ela, a única saída é decorar tecla.
      //!   `onHover` e não `always`: barra fixa sobre o papel de parede polui a tela vazia.
      showToolbar: "onHover",
      //! `editor.inlineSuggest.syntaxHighlightingEnabled` — o fantasma sai COLORIDO como o
      //!   resto do código, em vez de um bloco cinza uniforme. Sobre papel de parede isso
      //!   é o que separa "código proposto" de "mancha".
      syntaxHighlightingEnabled: true,
      //! `editor.inlineSuggest.fontFamily` — herda a fonte do editor. Explícito porque o
      //!   padrão do pacote é outro, e fonte diferente no fantasma parece defeito.
      fontFamily: "inherit",
      //! `editor.inlineSuggest.minShowDelay` — quanto a sugestão espera antes de APARECER,
      //!   depois de pronta. Sem folga, ela pisca e some enquanto a pessoa ainda digita.
      minShowDelay: 80,
      //! Não sugerir dentro de snippet: com o cursor pulando entre campos, o fantasma
      //!   compete com a própria navegação do snippet.
      suppressInSnippetMode: true,
    },
    suggest: { showWords: true },
    //! O Monaco desliga o realce de indentação por padrão; o VSCode o mostra.
    guides: { indentation: true, bracketPairs: true },
    stickyScroll: { enabled: true },
    bracketPairColorization: { enabled: true },
    renderWhitespace: "selection",
    smoothScrolling: true,
    cursorSmoothCaretAnimation: "on",
    scrollBeyondLastLine: true,
    padding: { top: 6 },
    //! Sem isto o Ctrl+F do Monaco procura só no que está visível.
    find: { addExtraSpaceOnTop: false, seedSearchStringFromSelection: "selection" },
  };
}

//? OS SERVIÇOS — o preço do ramo B1, e ele é estrutural
//!
//! 1. O `monaco-languageclient` **não soma** ao `monaco-editor`: ele o SUBSTITUI pelo
//!    `@codingame/monaco-vscode-editor-api`, que é o mesmo `vs/editor` embrulhado nos
//!    serviços de verdade do VSCode. O `package.json` faz isso por **alias**
//!    (`"monaco-editor": "npm:@codingame/monaco-vscode-editor-api"`), então nenhum import
//!    deste projeto mudou de nome — mas o que está por baixo mudou inteiro.
//! 2. ⚠️ **NADA FUNCIONA ANTES DE `initialize()`.** Medido: sem ele, o próprio
//!    `monaco.editor.create` estoura em `standaloneCodeEditor.js`, que chama
//!    `MarkdownRendererService.setDefaultCodeBlockRenderer` — e o erro é
//!    *"You are using a feature without registering the corresponding service override"*.
//!    O renderer morria **em silêncio**: tela vazia, log do main limpo.
//! 3. **A ESCOLHA DE QUAIS SERVIÇOS É A PARTE QUE IMPORTA**, e ela é por subtração. Ficam
//!    de fora, de propósito:
//!      · `editor` e `views` — eles ASSUMEM o ciclo de vida de abrir editor, e a casca já
//!        tem as próprias abas (`abas-do-editor.ts`). Registrá-los seria ter dois donos.
//!      · `theme` e `textmate` — o tema transparente desta casca é `defineTheme` do modo
//!        standalone, e o TextMate exigiria empacotar gramáticas que não temos. O
//!        `monarch` mantém a coloração que já está na tela.
//!      · `keybindings` — Ctrl+S e Ctrl+W são `editor.addCommand`, e continuam sendo.
//! 4. `initialize()` é ASSÍNCRONO, e é por isso que `montarEditor` virou `async` e a
//!    partida passou a esperá-lo. O `#editorHost` continua nascendo na hora — o que chega
//!    depois é o editor dentro dele.

//? AS LINGUAGENS — 240 KB que valem mais que os 71 MB ao lado
//!
//! ⚠️ ESTES DOIS IMPORTS SÃO O ELO QUE FALTAVA PARA O B1 FUNCIONAR, e a falta
//! deles produzia o sintoma mais mudo de toda esta corrida: servidor de pé,
//! aperto de mão completo, cliente ligado — e **`textDocument/didOpen` nunca
//! saindo**. Nenhum erro, nenhum aviso, nenhuma marca na tela.
//! A causa apareceu só quando forcei a linguagem à mão e o próprio VSCode
//! respondeu: **`Error: Unknown language id: python`**. O registro de linguagens
//! do `@codingame` nasce VAZIO — quem ensina que `.py` é `python` são as
//! contribuições das extensões padrão, e elas não vêm com o editor.
//! Sem elas, o documento nascia `plaintext`, o `documentSelector` do cliente
//! (`{ language: "python" }`) não casava, e não havia nada a sincronizar.
//! **São 116 KB e 124 KB** — ao lado dos 71 MB do resto, é o pedaço mais barato
//! e o único sem o qual nada acontece.
//! Importados pelo EFEITO: eles se registram ao carregar, e por isso não têm
//! nome à esquerda do `import`.
import "@codingame/monaco-vscode-python-default-extension";
import "@codingame/monaco-vscode-csharp-default-extension";

let servicos: Promise<void> | null = null;

//* Sobe os serviços do VSCode. Uma vez por sessão, e antes de qualquer editor.
function prepararServicos(): Promise<void> {
  //? ⚠️ A FIAÇÃO DE WORKERS VOLTOU, E É O AVESSO DO QUE ESTA CASA APRENDEU EM 26/08
  //!
  //! Na versão A1 (o `monaco-editor` oficial 0.56) a resposta certa era **não
  //! escrever nada**: o pacote trazia `createWorker` embutido e definir
  //! `MonacoEnvironment` SOBRESCREVIA a fiação boa. Está registrado no
  //! `tracker.md §22.10·1`, com a prova.
  //! **Trocado o pacote pelo `@codingame/...` (ramo B1), aquela auto-fiação NÃO
  //! EXISTE**, e o console passou a dizer, literalmente: *"You must define a
  //! function MonacoEnvironment.getWorkerUrl or getWorker for the worker label:
  //! editorWorkerService"* — com o aviso de que ele caía para a thread principal
  //! e podia congelar a tela.
  //! **A lição que fica não é "defina" nem "não defina": é que a resposta é do
  //! PACOTE, não do Monaco.** Trocar de pacote inverteu a regra, e só a medição
  //! disse isso — a receita de ontem estava errada hoje.
  //! ⚠️ NEM `configureDefaultWorkerFactory()` NEM `useWorkerFactory()`: **só importar**
  //!   `monaco-languageclient/workerFactory` já quebra a construção. Aquele módulo faz
  //!   `import()` DINÂMICO dos três workers no corpo dele, e import dinâmico obriga o
  //!   empacotador a partir a saída em pedaços — com uma frase que não fala de worker
  //!   nenhum: *"UMD and IIFE output formats are not supported for code-splitting builds"*.
  //!   Não adianta não chamar a função: o custo é do import.
  //! Então a fiação volta a ser a clássica, com `?worker` estático. Um arquivo emitido de
  //!   uma vez, servido da mesma origem — que é o que o CSP `default-src 'self'` exige.
  //! SÓ O `editorWorkerService`: os outros dois workers do padrão são do host de extensões
  //!   e do TextMate, serviços que esta casca **não registra**.
  self.MonacoEnvironment = {
    getWorker: (_id: string, _rotulo: string): Worker => new TrabalhadorDoEditor(),
  };

  servicos ??= inicializarServicos({
    //! `base` é obrigatório: é ele que traz o renderizador de markdown que o
    //!   `monaco.editor.create` pede — foi o erro que derrubou a tela.
    ...getBaseServiceOverride(),
    //! `configuration` é o que o cliente LSP usa para ler e mandar `settings`.
    ...getConfigurationServiceOverride(),
    ...getLanguagesServiceOverride(),
    //! ⚠️ `model` NÃO É OPCIONAL, e a falta dele foi MEDIDA: sem ele o aperto de
    //!   mão do LSP fecha inteiro (initialize → initialized → registerCapability
    //!   → workspace/configuration, tudo respondido) e **`textDocument/didOpen`
    //!   nunca sai**. O servidor fica de pé, ocioso, e a tela fica sem uma única
    //!   marca — o modo de falhar mais caro que existe, porque tudo parece certo.
    //! A causa: o `monaco-languageclient` sincroniza os documentos que a API do
    //!   VSCode enxerga, e é este serviço que faz um `ITextModel` do Monaco ser
    //!   um `TextDocument` do VSCode. Sem ele são dois mundos que não se veem.
    ...getModelServiceOverride(),
    //! `files`: o cliente de linguagem só considera documento o que tem um
    //!   provedor para o esquema da URI. Os nossos são `file:`, e é este serviço
    //!   que ensina o esquema à API do VSCode.
    ...getFilesServiceOverride(),
    //! `extensions`: as contribuições de linguagem chegam como EXTENSÃO, e sem
    //!   este serviço elas não têm onde se registrar.
    ...getExtensionsServiceOverride(),
    ...getMonarchServiceOverride(),
    ...getLogServiceOverride(),
  });
  return servicos;
}

let editor: monaco.editor.IStandaloneCodeEditor | null = null;

//* Monta o editor no elemento dado. Uma vez por sessão.
//! Ele nasce SEM MODELO: sem pasta aberta não há arquivo, e um modelo vazio de
//!   mentira faria a tela vazia (`#vazio`) competir com um editor que não edita
//!   nada. Quem põe o primeiro modelo é o `estado-do-editor`, ao abrir arquivo.
export async function montarEditor(host: HTMLElement): Promise<monaco.editor.IStandaloneCodeEditor> {
  if (editor) return editor;
  await prepararServicos();
  definirTema();
  editor = monaco.editor.create(host, { ...opcoes(), model: null });
  return editor;
}

//* O editor montado, ou `null` se a tela ainda não subiu.
//! Devolve `null` em vez de estourar: quem pergunta é atalho de teclado e barra
//!   de estado, e nenhum dos dois deve derrubar a tela por chegar cedo demais.
export function editorAtual(): monaco.editor.IStandaloneCodeEditor | null {
  return editor;
}

//* Põe o cursor no editor. É o gesto de "abriu, pode escrever".
export function focarEditor(): void {
  editor?.focus();
}
