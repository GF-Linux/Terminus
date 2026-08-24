//* Os oito canais de arquivo e pasta: ler, listar, gravar, criar, renomear.

import { ipcMain } from "electron";
import {
  criarArquivoNoProjeto,
  criarPastaNoProjeto,
  gravarConfinado,
  renomearNoProjeto,
} from "../servicos/escrita-confinada.js";
import {
  abrirParaTela,
  lerParaEditor,
  listarPasta,
  listarProjeto,
} from "../servicos/leitura-de-arquivo.js";
import { respostaSegura as seguro } from "./resposta-segura.js";

//* Liga os canais de leitura e escrita de arquivo.
//! Este registrador não conhece `fs` nem a pasta aberta: ele confere a forma do
//!   que chegou pelo IPC e entrega ao serviço. O confinamento mora em
//!   `servicos/escrita-confinada`, que é quem sabe qual raiz vale agora.
export function registrarArquivo(): void {
  //! `projeto:abrir` também serve de "atualizar" para a árvore, e é chamado a
  //!   cada criação de arquivo — por isso ele não liga nada.
  ipcMain.handle("projeto:abrir", seguro((_e, raiz: string) => abrirParaTela(raiz)));
  ipcMain.handle("projeto:listar", seguro((_e, dir: string) => listarPasta(dir)));
  ipcMain.handle("projeto:arquivos", seguro((_e, raiz: string) => listarProjeto(raiz)));

  ipcMain.handle("arquivo:ler", seguro((_e, arquivo: unknown) => lerParaEditor(arquivo)));
  ipcMain.handle(
    "arquivo:gravar",
    seguro((_e, arquivo: unknown, conteudo: unknown) => gravarConfinado(arquivo, conteudo)),
  );
  ipcMain.handle(
    "arquivo:criar",
    seguro((_e, raiz: string, dir: string, nome: string) => criarArquivoNoProjeto(raiz, dir, nome)),
  );
  ipcMain.handle(
    "pasta:criar",
    seguro((_e, raiz: string, dir: string, nome: string) => criarPastaNoProjeto(raiz, dir, nome)),
  );
  ipcMain.handle(
    "caminho:renomear",
    seguro((_e, raiz: string, antigo: string, nome: string) =>
      renomearNoProjeto(raiz, antigo, nome),
    ),
  );
}
