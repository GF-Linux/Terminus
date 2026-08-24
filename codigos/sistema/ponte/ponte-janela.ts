//* Os tres canais da moldura: minimizar, alternar maximo e fechar.

import { ipcMain, type BrowserWindow } from "electron";

//* Liga os botoes da barra de titulo que o Terminus desenha.
//! ZERO MODULOS DE `sistema/` importados: este registrador so precisa da janela,
//!   e a janela chega injetada (ramo A1). E o caso que mostra o que a metrica do
//!   E2 mede — um registrador pode ter varios canais e acoplamento nenhum.
//! A casca desenha a propria barra de titulo (ADR 0003), entao os tres gestos
//!   que o sistema daria de graca precisam atravessar a porta.
export function registrarJanela(janelaViva: () => BrowserWindow | null): void {
  ipcMain.on("janela:minimizar", () => janelaViva()?.minimize());
  ipcMain.on("janela:alternar-maximo", () => {
    const janela = janelaViva();
    if (!janela) return;
    if (janela.isMaximized()) janela.unmaximize();
    else janela.maximize();
  });
  ipcMain.on("janela:fechar", () => janelaViva()?.close());
}
