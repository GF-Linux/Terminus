//* O canal das extensões do VSCode: uma leitura, e nada mais.

import { ipcMain } from "electron";
import { listarExtensoesDoVscode } from "../infra/extensoes-do-vscode.js";
import { telaDeAbertura } from "../infra/tela-de-abertura.js";
import { respostaSegura as seguro } from "./resposta-segura.js";

//* Liga os canais que a casca LÊ DO AMBIENTE: extensões do VSCode e a tela de abertura.
//! ⚠️ REGISTRADOR PRÓPRIO, e eu tinha raciocinado ao contrário. Pus este canal dentro do
//!   `ponte-arquivo` argumentando que "ler extensão é leitura de arquivo, mesma família" — e
//!   **o portão reprovou**: aquele registrador já importava DOIS módulos de `sistema/`
//!   (`leitura-de-arquivo` e `escrita-confinada`), e o terceiro levou o M1 de 2 para 3.
//!   Aqui ele importa **um**, e o teto do E2 volta a fechar. O erro foi meu e a régua estava
//!   certa: o E2 mede ACOPLAMENTO, não parentesco temático.
//! Este registrador não recebe a janela: ele não abre diálogo, então não precisa dela.
export function registrarExtensoes(): void {
  //! Leitura de UMA pasta conhecida (`~/.vscode/extensions`), sem rede e sem escrita. O que
  //!   volta é manifesto — nome, versão, descrição e tipo —, nunca conteúdo de arquivo.
  ipcMain.handle("extensoes:listar", seguro(() => listarExtensoesDoVscode()));

  //! ⚠️ MORA NESTE REGISTRADOR, e não num novo, porque ele é o mesmo assunto: **o que a
  //!   casca lê do ambiente da pessoa**, fora do repositório. Extensões do VSCode e a tela
  //!   inicial do Neovim são as duas coisas. E com DOIS módulos de `sistema/` ele fica
  //!   exatamente no teto do E2 — que foi a régua que me pegou algumas horas atrás quando
  //!   raciocinei por parentesco temático em vez de acoplamento.
  ipcMain.handle("abertura:tela", seguro(() => telaDeAbertura()));
}
