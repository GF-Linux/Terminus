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
//!   que chegou pelo IPC e entrega ao serviço. Desde 24/08 (A3·a) os QUATRO caminhos de
//!   escrita — gravar, criar arquivo, criar pasta, renomear — confinam do mesmo jeito, em
//!   `servicos/escrita-confinada`: realpath + as raízes que o DONO conhece.
//! ⚠️ `_raiz` É RECEBIDA E IGNORADA, de propósito. A interface continua mandando a raiz do
//!   projeto nos três canais, e a assinatura do IPC não mudou — mas quem decide onde se
//!   pode escrever passou a ser o main. O parâmetro fica visível aqui, com o sublinhado,
//!   para o próximo leitor não procurar onde ele é usado: não é.
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
    seguro((_e, _raiz: string, dir: unknown, nome: unknown) => criarArquivoNoProjeto(dir, nome)),
  );
  ipcMain.handle(
    "pasta:criar",
    seguro((_e, _raiz: string, dir: unknown, nome: unknown) => criarPastaNoProjeto(dir, nome)),
  );
  ipcMain.handle(
    "caminho:renomear",
    seguro((_e, _raiz: string, antigo: unknown, nome: unknown) =>
      renomearNoProjeto(antigo, nome),
    ),
  );
}
