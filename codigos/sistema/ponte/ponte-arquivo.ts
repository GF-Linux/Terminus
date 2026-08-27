//* Os oito canais de arquivo e pasta: abrir, listar, ler, gravar, criar e renomear.

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

  //? ✅ `arquivo:ler` E `arquivo:gravar` VOLTARAM em 26/08/2026 — e a razão vem ANTES, como
  //?   o próprio arquivo exigia de quem os ressuscitasse.
  //!
  //! 1. A RAZÃO, e ela é nova: **a tela virou o editor.** Até 25/08 quem abria arquivo era o
  //!    Neovim, num processo à parte que lia o disco por conta própria — a casca só mandava
  //!    `neovim:abrir` e nunca via um byte. Com o Monaco (planta de 26/08), o texto é um
  //!    `ITextModel` DENTRO do renderer: para existir, ele precisa do conteúdo; para o Ctrl+S
  //!    valer alguma coisa, ele precisa voltar. Não é conveniência — sem estes dois canais o
  //!    editor não abre e não grava.
  //! 2. POR QUE A LEITURA CONTINUA LARGA (fora da pasta aberta), que era a objeção escrita:
  //!    porque é a CONDUTA DE HOJE, e o §12·3 manda preservá-la. `neovim:abrir` nunca confinou
  //!    nada — o salto do traceback abre `site-packages/…` e a config do próprio Neovim, e é
  //!    isso que faz o quadro de erro clicável valer. Confinar aqui não seria preservar a
  //!    conduta: seria remover um recurso a pretexto de portar outro.
  //! 3. O ALCANCE NÃO É O MESMO DA LEITURA CRUA, e a diferença mora no serviço, não aqui:
  //!    `lerParaEditor` recusa o que não é texto, recusa o `config.json` do Terminus, e recusa
  //!    caminho vazio ou com `\0`. A porta ganhou leitura de TEXTO, não leitura de disco.
  //! 4. A ESCRITA NÃO GANHOU ALCANCE NENHUM. `gravarConfinado` é a peça-vitrine do
  //!    confinamento e continua exatamente como estava: realpath + as raízes que o main
  //!    conhece. Sem pasta aberta, `raizesDeEscrita()` é vazio e **nada** é gravável — de
  //!    propósito, e isso não mudou.
  //! 5. ISTO FECHA A A15 pela metade: as duas funções deixam de ser chamadas só por `tests/`.
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
