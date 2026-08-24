//* Guarda QUAL janela existe agora, e responde a quem precisar dela.

import type { BrowserWindow } from "electron";

let atual: BrowserWindow | null = null;

//* Diz que esta passou a ser a janela do Terminus (ou que não há nenhuma).
export function definirJanela(janela: BrowserWindow | null): void {
  atual = janela;
}

//* A janela de agora, ou `null` quando ainda não há nenhuma.
//! POR QUE UM MÓDULO SÓ PARA ISTO: antes, `janela` era variável solta no
//!   monólito e OITO handlers a alcançavam direto. Estado com oito donos é o que
//!   prende um arquivo inteiro junto. Aqui ele tem um dono, e quem precisa
//!   PERGUNTA — e a pergunta pode ser injetada em quem for testar sem Electron.
export function janelaViva(): BrowserWindow | null {
  return atual;
}
