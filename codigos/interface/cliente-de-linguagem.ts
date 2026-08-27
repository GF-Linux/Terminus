import { MonacoLanguageClient } from "monaco-languageclient";
import {
  AbstractMessageReader,
  AbstractMessageWriter,
  type DataCallback,
  type Message,
  type MessageReader,
  type MessageWriter,
} from "vscode-jsonrpc";
import * as monaco from "monaco-editor";
import * as vscode from "vscode";
import { api } from "./base-da-tela.js";

//? O CLIENTE DE LINGUAGEM — o ramo B1, do lado da tela
//!
//! 1. O `monaco-languageclient` faz a tradução inteira LSP↔editor: diagnóstico
//!    vira sublinhado, `completion` vira a caixa de sugestão, `definition` vira
//!    Ctrl+clique, `hover` vira a caixinha. **Nada disso é escrito aqui** — e é
//!    exatamente por isso que ele foi escolhido.
//! 2. ⚠️ **O PREÇO ESTÁ REGISTRADO:** ele não soma ao `monaco-editor`, ele o
//!    SUBSTITUI pelo `@codingame/monaco-vscode-editor-api` (78 MB). Isso executa
//!    o ramo **A2**, que a cabeça havia recusado por peso em 26/08 — e a cabeça
//!    reverteu essa decisão no mesmo dia, sabendo do custo. Está no `tracker.md §23.1`.
//! 3. O cliente roda na TELA e o servidor no `main`. O que os liga é o par
//!    leitor/escritor abaixo, que troca o cano de processo pela porta do Electron.

/** Lê as mensagens que o servidor manda, e as entrega ao cliente. */
//! ⚠️ AS MENSAGENS PODEM CHEGAR ANTES DE O CLIENTE ESTAR OUVINDO. O
//!   `MonacoLanguageClient` assina o `listen` DEPOIS de construir o leitor, e o
//!   servidor já pode ter respondido nesse meio — a resposta do `initialize` é o
//!   caso comum. Sem a fila abaixo, a primeira mensagem se perde e o cliente
//!   espera para sempre por uma resposta que já passou.
class LeitorPelaPorta extends AbstractMessageReader implements MessageReader {
  private aoChegar: DataCallback | null = null;
  private readonly fila: Message[] = [];
  private readonly cancelar: () => void;

  constructor(private readonly linguagem: string) {
    super();
    this.cancelar = api.lsp.aoReceber((linguagemDaVez, mensagem) => {
      //! UM ouvinte por cliente, e todos recebem TUDO: a porta é um fio só. Cada
      //!   cliente descarta o que não é dele — filtrar aqui é mais simples e mais
      //!   seguro que manter um roteador com estado no meio.
      if (linguagemDaVez !== this.linguagem) return;
      const msg = mensagem as Message;
      if (this.aoChegar) this.aoChegar(msg);
      else this.fila.push(msg);
    });
  }

  listen(aoChegar: DataCallback): { dispose(): void } {
    this.aoChegar = aoChegar;
    //! Esvazia o que chegou cedo, na ordem em que chegou.
    while (this.fila.length) aoChegar(this.fila.shift() as Message);
    return { dispose: () => this.dispose() };
  }

  override dispose(): void {
    this.cancelar();
    this.aoChegar = null;
    super.dispose();
  }
}

/** Manda as mensagens do cliente para o servidor, pela porta. */
class EscritorPelaPorta extends AbstractMessageWriter implements MessageWriter {
  constructor(private readonly linguagem: string) {
    super();
  }

  async write(mensagem: Message): Promise<void> {
    api.lsp.enviar(this.linguagem, mensagem);
  }

  //! O LSP não tem "descarregar": o `send` do Electron já entregou quando
  //!   voltou. Existe porque a interface exige.
  end(): void {}
}

/** Os clientes já de pé, um por linguagem. */
//! UM POR LINGUAGEM, espelhando o motor do outro lado: o servidor indexa o
//!   PROJETO uma vez e responde sobre qualquer arquivo dele.
const clientes = new Map<string, MonacoLanguageClient>();

/** O relógio do debounce, por linguagem. */
//! Um por LINGUAGEM e não um global: editar um `.py` não pode cancelar o pedido pendente
//!   do `.cs` que está aberto na aba ao lado.
const relogioPorLinguagem = new Map<string, ReturnType<typeof setTimeout>>();

//* Garante o servidor e o cliente daquela linguagem. Devolve a frase do que falta.
//! Devolve `null` quando deu certo, e a FRASE quando não — nunca lança: abrir um
//!   arquivo `.py` numa máquina sem pyright é caso comum, não acidente, e não
//!   pode custar a abertura do arquivo.
export async function garantirLinguagem(linguagem: string, raiz: string): Promise<string | null> {
  if (clientes.has(linguagem)) return null;
  if (!raiz) return null; //! sem pasta aberta não há projeto para o servidor indexar

  //! O SERVIDOR PRIMEIRO, o cliente depois. Invertendo, o cliente manda
  //!   `initialize` para um cano que ainda não existe e a primeira mensagem —
  //!   justamente a que negocia tudo — se perde.
  const r = await api.lsp.iniciar(linguagem, raiz);
  if (!r.ok) return r.erro;
  if (!r.valor.pronto) return r.valor.detalhe;

  //? ⚠️ O CLIENTE É ESTENDIDO PARA **NÃO PEDIR** DIAGNÓSTICO POR PULL
  //!
  //! Medido, e este foi o achado mais caro do B1: o pyright manda dois
  //! `client/registerCapability` no arranque, e um deles troca o diagnóstico de
  //! **push** (servidor empurra) para **pull** (cliente pede) — porque o cliente
  //! ANUNCIOU que sabe pedir. Só que quem pede, no VSCode, é a lista de editores
  //! visíveis do workbench (`window.visibleTextEditors`); a nossa área de escrita
  //! é um editor do **Monaco**, e essa lista fica vazia. Resultado: `didOpen`
  //! sai, o servidor analisa, e **ninguém nunca pergunta** — tela limpa, log
  //! limpo, servidor de pé. O modo de falhar mais mudo desta corrida inteira.
  //! `diagnosticPullOptions.match` não resolveu: ele filtra QUAIS documentos
  //! entram no pull, e não faz o pull acontecer.
  //! A saída é não anunciar a capacidade: sem ela o servidor volta a EMPURRAR, e
  //! o `publishDiagnostics` cai direto nos marcadores do editor.
  //! ⚠️ O QUE ISSO CUSTA, dito: perde-se o diagnóstico sob demanda (pedir de novo
  //! sem editar). Para um editor que sempre mostra o que está aberto, empurrar é
  //! o comportamento certo — e é o que o pyright fazia antes de existir pull.
  //!
  //! ⚠️⚠️ E ISTO QUEBROU O C#, num defeito de campo do mesmo dia. O **Roslyn NÃO SABE
  //! EMPURRAR** — ele só faz pull. Tirar a capacidade de todos calou o C# por completo:
  //! servidor de pé, projeto carregado, e **zero** sublinhado, enquanto o Python dava
  //! cinco. Por isso a remoção passou a ser **por linguagem**, e não geral: quem tem push
  //! fica no push (é mais simples e chega sozinho), quem só tem pull mantém a capacidade —
  //! e a casca puxa por conta própria, porque o puxador do VSCode depende de uma lista de
  //! editores visíveis do workbench que aqui é sempre vazia.
  type ParametrosDeInicio = { capabilities?: { textDocument?: { diagnostic?: unknown } } };
  class ClienteSemPull extends MonacoLanguageClient {
    protected override fillInitializeParams(params: ParametrosDeInicio): void {
      //! `super` primeiro: deixa o cliente montar as capacidades inteiras, e só
      //!   então tira UMA. Montar à mão seria assinar uma lista que envelhece.
      (super.fillInitializeParams as (p: ParametrosDeInicio) => void)(params);
      delete params.capabilities?.textDocument?.diagnostic;
    }
  }

  /** Servidores que só sabem PULL. Para eles a capacidade fica, e nós puxamos. */
  //! Lista curta e nomeada, em vez de "tenta push e vê no que dá": a diferença aparece
  //!   como AUSÊNCIA de sublinhado, que é indistinguível de "não há erro". Adivinhar aqui
  //!   custa um defeito silencioso; nomear custa uma linha.
  const SO_PULL = new Set(["csharp"]);
  const Cliente = SO_PULL.has(linguagem) ? MonacoLanguageClient : ClienteSemPull;

  const cliente = new Cliente({
    id: `terminus-${linguagem}`,
    name: `Terminus ${linguagem}`,
    clientOptions: {
      documentSelector: [{ language: linguagem }],
      //! ⚠️ SEM ISTO O ARQUIVO ABRE E NADA ACONTECE: o cliente precisa saber a
      //!   pasta do projeto para mandar `rootUri` no `initialize`. Sem raiz, o
      //!   pyright indexa nada e o Roslyn não acha a solução.
      //! ⚠️ `vscode.Uri.file` e NÃO um objeto de mentira. A primeira versão disto
      //!   fabricava `{ scheme, path, fsPath, toString }` à mão com um `as never`
      //!   por cima — e um `as never` é o compilador avisando que ninguém conferiu
      //!   nada. O `rootUri` que o cliente manda no `initialize` sai daqui: mal
      //!   formado, o servidor sobe, responde o aperto de mão e **não analisa
      //!   nada**, porque não sabe onde é o projeto.
      workspaceFolder: {
        uri: vscode.Uri.file(raiz),
        name: raiz.split("/").pop() ?? raiz,
        index: 0,
      },
      //? ⚠️ O DIAGNÓSTICO POR "PULL", E POR QUE ELE PRECISA DESTA CHAVE
      //!
      //! O pyright manda dois `client/registerCapability` no arranque, e um deles
      //! registra **diagnóstico por PULL** (`textDocument/diagnostic`): em vez de
      //! o servidor empurrar os erros, o CLIENTE os pede. Medido: com pull
      //! registrado e ninguém pedindo, o `didOpen` sai, o servidor analisa e a
      //! tela fica limpa — porque ninguém perguntou.
      //! Quem normalmente pede é o VSCode, para os documentos que estão num
      //! **editor visível** (`window.visibleTextEditors`). A nossa área de escrita
      //! é um editor do MONACO, não do workbench do VSCode — então essa lista é
      //! vazia, e o pedido nunca acontece.
      //! O `match` é a saída que a própria API oferece: ele decide quais
      //! documentos entram no pull, e devolvendo `true` nós assumimos que **todo
      //! documento que abrimos é visível** — o que é literalmente verdade aqui,
      //! porque a casca só abre documento para mostrar numa aba.
      diagnosticPullOptions: {
        onChange: true,
        onSave: true,
        match: () => true,
      },
      //! Erro do servidor NÃO derruba o editor: o padrão do cliente é reiniciar
      //!   algumas vezes e depois desistir, e desistir calado é o certo aqui —
      //!   quem diz o que houve é a barra de estado, por `lsp:estado`.
      errorHandler: {
        error: () => ({ action: 1 /* Continue */ }),
        closed: () => ({ action: 1 /* DoNotRestart */ }),
      },
    },
    messageTransports: {
      reader: new LeitorPelaPorta(linguagem),
      writer: new EscritorPelaPorta(linguagem),
    },
  });

  try {
    //! ⚠️ O ROSLYN AVISA QUANDO TERMINOU DE CARREGAR O PROJETO, e **é só depois disso que
    //!   ele tem o que dizer**. Antes, todo pedido de diagnóstico volta vazio. A
    //!   configuração do Neovim desta máquina faz exatamente isto: escuta
    //!   `workspace/projectInitializationComplete` e SÓ ENTÃO pede os diagnósticos.
    cliente.onNotification("workspace/projectInitializationComplete", () => {
      console.info(`[terminus] ${linguagem}: projeto carregado, pedindo diagnósticos`);
      puxarDiagnosticosComInsistencia(cliente, linguagem);
    });

    await cliente.start();
    clientes.set(linguagem, cliente);

    //! A abertura do projeto vai DEPOIS do `start`: antes dele não há canal, e a
    //!   notificação cairia num cliente que ainda não fala.
    const abertura = await api.lsp.abrirProjeto(linguagem, raiz);
    if (abertura.ok && abertura.valor) {
      console.info(`[terminus] ${linguagem}: ${abertura.valor}`);
    }

    //! ⚠️ E PUXA TAMBÉM A CADA EDIÇÃO, não só na carga do projeto. Sem isto, o sublinhado
    //!   nasce certo e **congela**: quem conserta o erro continua vendo o risco vermelho, e
    //!   quem cria um novo não vê nada. O `onDidChangeTextDocument` do VSCode é o gatilho
    //!   que o puxador do workbench usaria — aqui ele existe, só não estava ligado a nada.
    //! Debounce próprio: o servidor não precisa de um pedido por tecla.
    vscode.workspace.onDidChangeTextDocument((evento) => {
      if (evento.document.languageId !== linguagem) return;
      clearTimeout(relogioPorLinguagem.get(linguagem));
      relogioPorLinguagem.set(
        linguagem,
        setTimeout(() => puxarDiagnosticos(cliente, linguagem), 400),
      );
    });
    console.info(`[terminus] cliente de ${linguagem} ligado; documentos vistos:`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cliente as any).clientOptions?.documentSelector);
    return null;
  } catch (erro) {
    return `o servidor de ${linguagem} não completou o aperto de mão: ${String(erro)}`;
  }
}

//? PUXAR O DIAGNÓSTICO — o que o VSCode faz sozinho e aqui ninguém faz
//!
//! O cliente do VSCode pede diagnóstico para os documentos que estão num **editor
//! visível do workbench** (`window.visibleTextEditors`). A nossa área de escrita é um
//! editor do **Monaco**, e essa lista é sempre vazia — então o pedido nunca sai sozinho.
//! Este é o mesmo gesto que o `refresh_diagnostics` do `nvim-lspconfig` faz, e pela mesma
//! razão: fora do VSCode, quem puxa tem de ser quem sabe o que está aberto.
//! ⚠️ E ELE INSISTE, em vez de pedir uma vez. MEDIDO em 26/08: o Roslyn crua produz os três
//!   diagnósticos do arquivo, mas **não no instante em que anuncia
//!   `projectInitializationComplete`** — a sonda direta só os obteve esperando alguns
//!   segundos depois do aviso. Pedindo uma vez só, no instante do aviso, a resposta vem
//!   vazia e a tela fica limpa **para sempre**, porque nada mais dispara um novo pedido.
//! Os intervalos são folgados de propósito: pedir de novo é barato (o servidor responde do
//!   que já calculou), e ficar sem sublinhado por ter perguntado cedo é caro.
const INSISTENCIAS_MS = [0, 1500, 4000, 9000];

function puxarDiagnosticosComInsistencia(cliente: MonacoLanguageClient, linguagem: string): void {
  for (const espera of INSISTENCIAS_MS) {
    setTimeout(() => puxarDiagnosticos(cliente, linguagem), espera);
  }
}

/** A tradução de gravidade: LSP conta 1..4, o Monaco usa outra escala. */
//! Sem esta tabela, um erro vira "dica" e some da tela — o número passa, o significado não.
const GRAVIDADE: Record<number, monaco.MarkerSeverity> = {
  1: monaco.MarkerSeverity.Error,
  2: monaco.MarkerSeverity.Warning,
  3: monaco.MarkerSeverity.Info,
  4: monaco.MarkerSeverity.Hint,
};

interface DiagnosticoLsp {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity?: number;
  message: string;
  code?: string | number;
  source?: string;
}

//* Pede o diagnóstico de um documento e escreve os marcadores no editor.
//! ⚠️ O PEDIDO É NOSSO, e não do `DiagnosticFeature` do cliente. Foi a terceira tentativa,
//!   e as duas anteriores estão registradas porque explicam esta:
//!     1. deixar o cliente puxar sozinho — **nunca puxava**: ele pede para os documentos que
//!        estão num editor VISÍVEL do workbench, e a nossa área de escrita é do Monaco;
//!     2. disparar o emissor interno do `DiagnosticFeature` — **puxava e voltava vazio**,
//!        porque ele manda `previousResultId` e o servidor responde "não mudou", deixando o
//!        conjunto anterior (vazio) de pé.
//!   Pedindo direto, sem `previousResultId`, o servidor devolve o relatório inteiro — que é
//!   exatamente o que a sonda crua obteve do Roslyn: os três erros do arquivo.
//! É também o que o `nvim-lspconfig` faz (`refresh_diagnostics`), e pela mesma razão: fora
//!   do VSCode, quem puxa tem de ser quem sabe o que está aberto.
async function pedirDiagnostico(
  cliente: MonacoLanguageClient,
  linguagem: string,
  uri: vscode.Uri,
): Promise<void> {
  const modelo = monaco.editor.getModel(monaco.Uri.file(uri.fsPath));
  if (!modelo) return;

  try {
    const r = (await cliente.sendRequest("textDocument/diagnostic", {
      textDocument: { uri: uri.toString() },
    })) as { items?: DiagnosticoLsp[]; kind?: string } | null;

    //! `kind: "unchanged"` não traz itens — e não é "zero itens": é "o que você já tem
    //!   continua valendo". Apagar os marcadores aqui faria o sublinhado piscar e sumir.
    if (!r || r.kind === "unchanged" || !r.items) return;

    monaco.editor.setModelMarkers(
      modelo,
      `lsp-${linguagem}`,
      r.items.map((d) => ({
        //! O LSP conta linha e coluna a partir de ZERO; o Monaco, a partir de UM. Errar isto
        //!   por um põe o risco vermelho uma linha acima do erro — o que parece "o servidor
        //!   está confuso" e não um defeito nosso.
        startLineNumber: d.range.start.line + 1,
        startColumn: d.range.start.character + 1,
        endLineNumber: d.range.end.line + 1,
        endColumn: d.range.end.character + 1,
        message: d.message,
        severity: GRAVIDADE[d.severity ?? 1] ?? monaco.MarkerSeverity.Error,
        source: d.source ?? linguagem,
        code: d.code === undefined ? undefined : String(d.code),
      })),
    );
  } catch {
    //! Servidor que não sabe responder `textDocument/diagnostic` (o pyright empurra, e é o
    //!   certo para ele) não é erro: é outro caminho, e ele já funciona.
  }
}

//* Pede o diagnóstico de todos os documentos daquela linguagem.
function puxarDiagnosticos(cliente: MonacoLanguageClient, linguagem: string): void {
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === linguagem && doc.uri.scheme === "file") {
      void pedirDiagnostico(cliente, linguagem, doc.uri);
    }
  }
}

//* As linguagens com cliente de pé agora.
export function linguagensLigadas(): string[] {
  return [...clientes.keys()];
}
