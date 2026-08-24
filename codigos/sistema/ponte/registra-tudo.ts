//* O indice da camada de ponte: chama os oito registradores, e nada mais.

import type { BrowserWindow } from "electron";
import { registrarAparencia } from "./ponte-aparencia.js";
import { registrarArquivo } from "./ponte-arquivo.js";
import { registrarComoRodar } from "./ponte-como-rodar.js";
import { registrarExclusao } from "./ponte-exclusao.js";
import { registrarJanela } from "./ponte-janela.js";
import { registrarNeovim } from "./ponte-neovim.js";
import { registrarProjeto } from "./ponte-projeto.js";
import { registrarShell } from "./ponte-shell.js";

//* Registra os 37 canais de IPC, em oito registradores.
//! POR QUE UM INDICE, E NAO OITO CHAMADAS NA PARTIDA: a partida não precisa
//!   saber quantos registradores existem. Quando entrar o nono, muda uma linha
//!   aqui — e `janela/partida.ts` continua igual.
//! A JANELA CHEGA INJETADA e é repassada só a quem abre diálogo (ramo A1):
//!   arquivo, como-rodar, shell e neovim não a recebem, porque não precisam.
export function registrarPonte(janelaViva: () => BrowserWindow | null): void {
  registrarProjeto(janelaViva);
  registrarArquivo();
  registrarExclusao(janelaViva);
  registrarComoRodar();
  registrarAparencia(janelaViva);
  registrarShell();
  registrarNeovim();
  registrarJanela(janelaViva);
}
