//* Os quatro canais de aparência: estado, definir, escolher e tirar o papel de parede.

import { ipcMain, type BrowserWindow } from "electron";
import { escolherImagem } from "../janela/dialogos-do-sistema.js";
import {
  gravarAparencia,
  guardarWallpaper,
  lerAparencia,
  lerWallpaper,
  tirarWallpaper,
} from "../motores/configuracao-salva.js";
import { exigirJanela } from "./janela-exigida.js";
import { respostaSegura as seguro } from "./resposta-segura.js";

//* Liga os canais de aparência (ADR 0010).
//! A imagem volta junto do estado em toda resposta: a tela precisa das duas
//!   coisas ao mesmo tempo, e devolver só uma obrigaria a casca a fazer duas
//!   chamadas para desenhar um quadro.
export function registrarAparencia(janelaViva: () => BrowserWindow | null): void {
  ipcMain.handle(
    "aparencia:estado",
    seguro(() => ({ ...lerAparencia(), imagem: lerWallpaper() })),
  );
  ipcMain.handle(
    "aparencia:definir",
    seguro((_e, parcial: Record<string, unknown>) => ({
      ...gravarAparencia(parcial),
      imagem: lerWallpaper(),
    })),
  );
  ipcMain.handle(
    "aparencia:escolher",
    seguro(async () => {
      const imagem = await escolherImagem(exigirJanela(janelaViva), "Escolher papel de parede");
      if (!imagem) return null;
      return { ...guardarWallpaper(imagem), imagem: lerWallpaper() };
    }),
  );
  ipcMain.handle(
    "aparencia:tirar",
    seguro(() => ({ ...tirarWallpaper(), imagem: null })),
  );
}
