//* Os seis canais de arquivo e pasta: abrir, listar, criar e renomear.

import { ipcMain } from "electron";
import {
  criarArquivoNoProjeto,
  criarPastaNoProjeto,
  renomearNoProjeto,
} from "../servicos/escrita-confinada.js";
import {
  abrirParaTela,
  listarPasta,
  listarProjeto,
} from "../servicos/leitura-de-arquivo.js";
import { respostaSegura as seguro } from "./resposta-segura.js";

//* Liga os canais de leitura e escrita de arquivo.
//! Este registrador não conhece `fs` nem a pasta aberta: ele confere a forma do
//!   que chegou pelo IPC e entrega ao serviço. Desde 24/08 (A3·a) os caminhos de escrita
//!   confinam do mesmo jeito, em `servicos/escrita-confinada`: realpath + as raízes que o
//!   DONO conhece.
//! ⚠️ ERAM QUATRO — gravar, criar arquivo, criar pasta, renomear — e desde a A5(a), no mesmo
//!   24/08, este registrador expõe TRÊS: `gravar` deixou de ter canal. A regra de confinamento
//!   não mudou e `gravarConfinado` continua inteira no serviço; o que saiu foi a porta de
//!   entrada dela pelo IPC.
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

  //? ⚠️ AQUI MORAVAM `arquivo:ler` E `arquivo:gravar` — saíram em 24/08/2026, por decisão
  //?   da cabeça, porque o TRACEBACK CLICÁVEL foi declarado abandonado (árvore A5, opção
  //?   (a)). Eram os dois únicos canais deste registrador sem chamador na tela. `lerParaEditor`
  //?   e `gravarConfinado` NÃO foram apagados junto: `gravarConfinado` é a peça-vitrine do
  //?   confinamento, e apagá-la por arrasto seria jogar fora a melhor peça por causa da
  //?   superfície da pior. As duas passaram a ser chamadas só por `tests/` — e o que fazer
  //?   com elas é a árvore A15, devolvida à cabeça na mesma corrida.
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
