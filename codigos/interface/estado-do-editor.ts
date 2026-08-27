import * as monaco from "monaco-editor";
import { faixaParaOProtocolo } from "../dominio/faixa-do-editor.js";
import { linguagemDoArquivo } from "../dominio/linguagem-do-arquivo.js";
import { $, api } from "./base-da-tela.js";
import { garantirLinguagem } from "./cliente-de-linguagem.js";
import { abrirDocumento, fecharDocumento } from "./documentos-do-vscode.js";
import { editorAtual, focarEditor } from "./editor-monaco.js";

//? O ESTADO DO EDITOR — quais arquivos estão abertos, e qual deles está sujo
//!
//! 1. O Monaco tem MODELO, não arquivo. Um modelo é o texto mais o histórico de
//!    desfazer; ele não sabe de onde veio nem se foi gravado.
//! 2. Este arquivo é a ponte entre "modelo" e "arquivo": guarda o caminho, o
//!    que estava no disco na última gravação, e avisa quem desenha aba e barra.
//! 3. ⚠️ **UM MODELO POR CAMINHO, e o `uri` é a chave.** Criar dois modelos para
//!    o mesmo arquivo faz o Monaco duplicar decoração e o Ctrl+S gravar o buffer
//!    errado — é o defeito clássico de quem monta abas sobre Monaco, e está
//!    nomeado na planta como o ponto que mais quebra (N1).

/** Um arquivo aberto no editor. */
export interface Aberto {
  caminho: string;
  modelo: monaco.editor.ITextModel;
  /** O texto como estava no disco na última leitura ou gravação. */
  gravado: string;
  /** Onde o cursor e a rolagem estavam quando esta aba perdeu a vez. */
  vista: monaco.editor.ICodeEditorViewState | null;
}

const abertos = new Map<string, Aberto>();
let ativo: string | null = null;

/** Quem quer saber que a lista ou a sujeira mudou (as abas e a barra de estado). */
const ouvintes = new Set<() => void>();

//* Avisa quem desenha. Chamado por TODA mudança que a tela precisa refletir.
//! A TELA VAZIA É DECIDIDA AQUI, e não por quem abre arquivo: ela é função de
//!   UMA pergunta — "há algo aberto?" —, e essa pergunta só tem uma resposta
//!   verdadeira, que é esta lista. Espalhar o `toggle` pelos chamadores criaria
//!   tantas fontes da verdade quantos fossem eles.
//! ⚠️ ISTO É CONDUTA NOVA, e o motivo é o motor: com o Neovim, `#vazio` ficava
//!   escondido PARA SEMPRE (`.motor-neovim #vazio{display:none}`), porque o
//!   editor desenhava o próprio painel de abertura. O Monaco não desenha nada
//!   sem modelo — sem esta função, a área de escrita ficaria um retângulo preto
//!   e mudo quando não houvesse arquivo aberto.
function avisar(): void {
  const vazio = abertos.size === 0;
  $("vazio").classList.toggle("oculto", !vazio);
  $("editorHost").classList.toggle("oculto", vazio);
  for (const o of ouvintes) o();
}

//* Põe a tela vazia e o editor no estado certo. Chamado UMA vez, pelo núcleo.
//! ⚠️ NÃO PODE RODAR NA CARGA DESTE MÓDULO, e isso foi medido: quem CRIA o
//!   `#editorHost` é o `nucleo-da-casca`, que importa este arquivo — na hora em
//!   que este código avalia, o elemento ainda não existe e o `$` estoura de
//!   propósito. A página inteira morria em silêncio: sem árvore, sem tela vazia,
//!   sem editor. Por isso quem chama é o núcleo, DEPOIS de montar o host.
export function sincronizarTelaVazia(): void {
  avisar();
}

//* Assina as mudanças. Devolve como cancelar.
export function aoMudar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

//* Os arquivos abertos, na ordem em que foram abertos.
export function listaAberta(): Aberto[] {
  return [...abertos.values()];
}

//* O arquivo que está na tela agora, ou `null`.
export function arquivoAtivo(): Aberto | null {
  return ativo ? (abertos.get(ativo) ?? null) : null;
}

//* Este arquivo tem mudança que ainda não foi para o disco?
//! Compara com o TEXTO GRAVADO e não com uma bandeira: quem digita e desfaz até
//!   voltar ao original não está mais sujo, e uma bandeira diria que está.
export function estaSujo(a: Aberto): boolean {
  return a.modelo.getValue() !== a.gravado;
}

//* Traz um arquivo para a tela, lendo do disco se ele ainda não estiver aberto.
//! A ORDEM IMPORTA: guardar a vista da aba que sai ANTES de trocar o modelo.
//!   Depois da troca o editor já perdeu a posição, e a aba anterior voltaria
//!   sempre no topo — que é a diferença entre alternar aba e reabrir arquivo.
//! ⚠️ A RAIZ CHEGA POR PARÂMETRO, e não lida de `nucleo-da-casca`. Não é estilo:
//!   o núcleo IMPORTA este módulo, e importá-lo de volta fecharia um ciclo — o
//!   M2 do portão é exatamente a régua que mede isso, e ele está em zero.
export async function abrirNoEditor(
  caminho: string,
  linha?: number,
  raiz = "",
): Promise<string | null> {
  const editor = editorAtual();
  if (!editor) return "O editor ainda não subiu.";

  const anterior = arquivoAtivo();
  if (anterior) anterior.vista = editor.saveViewState();

  let alvo = abertos.get(caminho);
  if (!alvo) {
    const r = await api.lerArquivo(caminho);
    if (!r.ok) return r.erro;

    //! O `uri` é o caminho do arquivo, e é ele que impede o modelo duplicado.
    //!   `monaco.Uri.file` normaliza — dois caminhos que apontam para o mesmo
    //!   lugar chegam ao mesmo `uri`, e o `getModel` acha o que já existe.
    const uri = monaco.Uri.file(caminho);
    //! ⚠️ O DOCUMENTO É ABERTO PELA API DO VSCODE, e não por `createModel`. A
    //!   razão inteira está em `documentos-do-vscode.ts`: `createModel` cria
    //!   MODELO e não cria DOCUMENTO, e o cliente de linguagem só sincroniza
    //!   documento — com `createModel` o servidor sobe, o aperto de mão fecha, e
    //!   `didOpen` nunca sai. Medido, e sem um erro sequer na tela.
    //! O `createModel` fica como rede: se a API do VSCode não devolver modelo
    //!   (linguagem sem servidor, esquema estranho), o arquivo ainda ABRE — o
    //!   editor não pode depender do LSP para mostrar texto.
    const modelo =
      monaco.editor.getModel(uri) ??
      (await abrirDocumento(caminho, r.valor, linguagemDoArquivo(caminho), monaco)) ??
      monaco.editor.createModel(r.valor, linguagemDoArquivo(caminho), uri);

    alvo = { caminho, modelo, gravado: r.valor, vista: null };
    abertos.set(caminho, alvo);

    //! O SERVIDOR DE LINGUAGEM SOBE AQUI — na primeira vez que um arquivo
    //!   daquela linguagem é aberto, e não na partida. Subir tudo na partida
    //!   custaria segundos e memória por linguagens que a pessoa talvez nem use
    //!   nesta pasta; e o servidor precisa da raiz, que na partida pode não haver.
    //! `void` e SEM `await`: indexar um projeto C# leva segundos, e o arquivo tem
    //!   de aparecer na tela agora. O diagnóstico chega quando chegar — que é
    //!   exatamente como o VSCode se comporta.
    void garantirLinguagem(linguagemDoArquivo(caminho), raiz).then((falta) => {
      //! Falta de servidor é ESTADO, não erro na cara de quem escreve. Fica na
      //!   barra, por `lsp:estado`, e não numa caixa.
      if (falta) console.info(`[terminus] ${falta}`);
    });

    //! Qualquer edição pode mudar a sujeira, e a aba mostra isso com um ponto.
    //! ⚠️ E OS DELTAS VÃO PARA O COPILOT, no mesmo gesto. É disto que a **edição seguinte**
    //!   (NES) vive: sem histórico de edição o servidor recusa com
    //!   `activeDocumentHasNoEdits` — e essa foi a razão de eu ter concluído duas vezes,
    //!   errado, que o recurso era impossível.
    //! O formato do Monaco (`range` + `rangeLength` + `text`) é o mesmo do LSP; a única
    //!   conversão é a de base-um para base-zero, que é do domínio.
    modelo.onDidChangeContent((evento) => {
      avisar();
      api.copilot.editou({
        caminho,
        mudancas: evento.changes.map((m) => ({
          range: faixaParaOProtocolo({
            startLineNumber: m.range.startLineNumber,
            startColumn: m.range.startColumn,
            endLineNumber: m.range.endLineNumber,
            endColumn: m.range.endColumn,
          }),
          rangeLength: m.rangeLength,
          text: m.text,
        })),
      });
    });

    //! ⚠️ O COPILOT PASSA A CONHECER ESTA ABA como contexto das outras. É o item 10 da
    //!   comparação com a documentação do VSCode: *"related files open … helps set this
    //!   context"*. Antes disto, ter dez arquivos abertos não mudava nada — o servidor
    //!   só via aquele em que o cursor estava.
    api.copilot.acompanhar({
      caminho,
      linguagem: linguagemDoArquivo(caminho),
      texto: r.valor,
    });
  }

  ativo = caminho;
  editor.setModel(alvo.modelo);
  if (alvo.vista) editor.restoreViewState(alvo.vista);

  if (linha !== undefined && linha > 0) {
    //! `revealLineInCenter` e não `revealLine`: o quadro de traceback aponta
    //!   para o meio de um arquivo, e mostrar a linha colada no topo esconde
    //!   justamente o contexto que explica o erro.
    editor.revealLineInCenter(linha);
    editor.setPosition({ lineNumber: linha, column: 1 });
  }

  focarEditor();
  avisar();
  return null;
}

//* Grava o arquivo que está na tela. Devolve a frase do erro, ou `null`.
//! O Ctrl+S grava O MODELO ATIVO, não "o arquivo aberto". Sem modelo ativo —
//!   foco no terminal, nenhuma pasta aberta — ele NÃO grava e NÃO reclama: é a
//!   mesma conduta que o `salvarNeovim()` tinha (falhava calado sem editor), e
//!   o §12·3 manda preservá-la.
export async function gravarAtivo(): Promise<string | null> {
  const alvo = arquivoAtivo();
  if (!alvo) return null;

  const conteudo = alvo.modelo.getValue();
  const r = await api.gravarArquivo(alvo.caminho, conteudo);
  if (!r.ok) return r.erro;

  alvo.gravado = conteudo;
  avisar();
  return null;
}

//* Fecha uma aba: descarta o modelo e avisa o Copilot que não precisa mais dele.
//! ⚠️ O `dispose()` NÃO É OPCIONAL. Sem ele, um Ctrl+P que passeia por duzentos
//!   arquivos deixa duzentos modelos vivos, cada um com o próprio tokenizador e
//!   o próprio histórico de desfazer, até a aba do Electron ficar pesada sem
//!   nada na tela explicando por quê.
export function fecharAba(caminho: string): void {
  const alvo = abertos.get(caminho);
  if (!alvo) return;

  alvo.modelo.dispose();
  fecharDocumento(caminho);
  abertos.delete(caminho);
  api.copilot.fechou(caminho);

  if (ativo === caminho) {
    //! A vez passa para a última aba aberta, como no VSCode — e não para a
    //!   primeira: quem fecha uma aba estava trabalhando ali perto.
    const proxima = [...abertos.keys()].pop() ?? null;
    ativo = proxima;
    const editor = editorAtual();
    if (editor) editor.setModel(proxima ? (abertos.get(proxima)?.modelo ?? null) : null);
  }
  avisar();
}

//* Larga TODOS os arquivos. É o "Fechar pasta".
//! Sem isto, fechar a pasta deixaria abas de um projeto que não está mais
//!   aberto — com o Ctrl+S apontando para fora da raiz confinada, que o main
//!   recusaria com uma frase que a tela não saberia explicar (N4 da planta).
export function largarTudo(): void {
  for (const caminho of [...abertos.keys()]) {
    abertos.get(caminho)?.modelo.dispose();
    fecharDocumento(caminho);
    api.copilot.fechou(caminho);
  }
  abertos.clear();
  ativo = null;
  editorAtual()?.setModel(null);
  avisar();
}
