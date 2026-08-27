import * as vscode from "vscode";
import {
  RegisteredFileSystemProvider,
  RegisteredMemoryFile,
  registerFileSystemOverlay,
} from "@codingame/monaco-vscode-files-service-override";

//? OS DOCUMENTOS — a peça que faz o cliente de linguagem ENXERGAR o que está aberto
//!
//! ⚠️ ESTE ARQUIVO NASCEU DE UMA FALHA MEDIDA, e ela era silenciosa demais para
//! ser achada por leitura. Com o servidor de pé e o cliente ligado, o tráfego do
//! LSP mostrava o aperto de mão COMPLETO — `initialize`, `initialized`,
//! `client/registerCapability` ×2, `workspace/configuration` respondida — e
//! **`textDocument/didOpen` nunca saía**. Nenhum erro, nenhum aviso: o servidor
//! ficava de pé, ocioso, e a tela sem uma única marca.
//!
//! A CAUSA: o `monaco-languageclient` sincroniza os documentos que a **API do
//! VSCode** enxerga (`vscode.workspace`), não os modelos que o Monaco tem. Um
//! `monaco.editor.createModel(...)` cria modelo e **não** cria documento. São
//! dois mundos, e o registro de serviços sozinho não os liga.
//!
//! A PONTE SÃO DUAS COISAS, e uma sem a outra não basta:
//!   1. um **sistema de arquivos** que a API do VSCode saiba ler no esquema
//!      `file:` — nós lemos por IPC, então o conteúdo é registrado em memória;
//!   2. abrir o documento **pela API do VSCode** (`openTextDocument`), que é o
//!      que dispara o `didOpen` do cliente.

/** O sistema de arquivos em memória que a API do VSCode enxerga. */
//! `false` = gravável. O conteúdo que mora aqui é uma CÓPIA do que veio do disco
//!   pela porta; o disco de verdade continua sendo do `main`, e o Ctrl+S continua
//!   passando pelo `confinado()` de sempre. Isto não é um segundo caminho de
//!   escrita — é o que o cliente de linguagem lê.
const arquivos = new RegisteredFileSystemProvider(false);
registerFileSystemOverlay(1, arquivos);

/** Põe o conteúdo à vista da API do VSCode e abre o documento. */
//! Devolve o modelo do Monaco que ficou por trás — é ele que o editor mostra, e
//!   é o MESMO objeto que o documento do VSCode embrulha. Um só, e não dois: se
//!   fossem dois, o que a pessoa digita e o que o servidor analisa divergiriam.
export async function abrirDocumento(
  caminho: string,
  conteudo: string,
  linguagem: string,
  monaco: typeof import("monaco-editor"),
): Promise<import("monaco-editor").editor.ITextModel | null> {
  const uri = vscode.Uri.file(caminho);
  arquivos.registerFile(new RegisteredMemoryFile(uri, conteudo));

  //! O `openTextDocument` é o gesto que conta. Ele registra o documento no
  //!   `workspace`, e é aí que o cliente de linguagem manda `didOpen`.
  let doc = await vscode.workspace.openTextDocument(uri);

  //! ⚠️ A LINGUAGEM PRECISA SER DITA À MÃO, e esta linha é o segundo elo que
  //!   faltava. A API do VSCode deduz linguagem pelas CONTRIBUIÇÕES das
  //!   extensões padrão (`@codingame/monaco-vscode-python-default-extension` e
  //!   irmãs), e esta casca **não as instala** — 42 pacotes do `@codingame` já
  //!   são o preço do B1, e mais um por linguagem seria pior.
  //! Sem isto o documento nasce `plaintext`, o `documentSelector` do cliente
  //!   (`{ language: "python" }`) **não casa**, e o `didOpen` não sai — com o
  //!   servidor de pé e o aperto de mão completo. Foi exatamente o sintoma.
  //! Quem sabe a linguagem é o nosso `dominio/linguagem-do-arquivo.ts`, que já
  //!   decidia isso para o Monaco. Agora ele decide para os dois.
  if (doc.languageId !== linguagem) {
    doc = await vscode.languages.setTextDocumentLanguage(doc, linguagem);
  }
  console.info(`[terminus] documento ${caminho.split("/").pop()} => ${doc.languageId}`);

  return monaco.editor.getModel(monaco.Uri.file(caminho));
}

//* Larga o documento: a aba fechou.
export function fecharDocumento(caminho: string): void {
  //! Só o arquivo em memória sai. O modelo é descartado por quem o abriu
  //!   (`estado-do-editor`), que é quem sabe se ainda há aba usando.
  try {
    arquivos.delete(vscode.Uri.file(caminho));
  } catch {
    /* já não estava lá */
  }
}
