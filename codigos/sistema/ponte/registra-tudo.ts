//* O indice da camada de ponte: chama os dez registradores, e nada mais.

import type { BrowserWindow } from "electron";
import { registrarAparencia } from "./ponte-aparencia.js";
import { registrarArquivo } from "./ponte-arquivo.js";
import { registrarComoRodar } from "./ponte-como-rodar.js";
import { registrarCopilot } from "./ponte-copilot.js";
import { registrarExclusao } from "./ponte-exclusao.js";
import { registrarExtensoes } from "./ponte-extensoes.js";
import { registrarJanela } from "./ponte-janela.js";
import { registrarLsp } from "./ponte-lsp.js";
import { registrarProjeto } from "./ponte-projeto.js";
import { registrarShell } from "./ponte-shell.js";

//* Registra os 40 canais de IPC, em dez registradores.
//! POR QUE UM INDICE, E NAO OITO CHAMADAS NA PARTIDA: a partida não precisa
//!   saber quantos registradores existem. Quando entrar o nono, muda uma linha
//!   aqui — e `janela/partida.ts` continua igual.
//! A JANELA CHEGA INJETADA e é repassada só a quem abre diálogo (ramo A1):
//!   arquivo, como-rodar, shell e copilot não a recebem, porque não precisam.
//! ⚠️ O `registrarNeovim` saiu em 26/08/2026 com o motor inteiro (planta do
//!   Monaco). Continuam sendo OITO registradores: o do Copilot entrou no lugar,
//!   e a linha que a partida chama não mudou — que é o que este índice existe
//!   para garantir.
export function registrarPonte(janelaViva: () => BrowserWindow | null): void {
  registrarProjeto(janelaViva);
  registrarArquivo();
  registrarExclusao(janelaViva);
  registrarComoRodar();
  registrarAparencia(janelaViva);
  registrarShell();
  registrarCopilot();
  registrarLsp();
  registrarExtensoes();
  registrarJanela(janelaViva);
}
