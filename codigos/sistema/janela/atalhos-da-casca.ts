//* Os atalhos que a CASCA é dona: Ctrl+S, Ctrl+Z, Ctrl+Shift+Z e Ctrl+crase.

import type { BrowserWindow } from "electron";
import {
  abrirTerminalNeovim,
  desfazerNeovim,
  refazerNeovim,
  salvarNeovim,
} from "../motores/controle-neovim-rpc.js";

//! Intercepta ANTES de virar tecla no Neovim. O LazyVim mapeia `<C-s>` como
//!   `<Esc>:w`, que grava e joga a pessoa para fora do modo de escrita.
export function ligarAtalhosNeovim(alvo: BrowserWindow): void {
  alvo.webContents.on("before-input-event", (evento, entrada) => {
    if (entrada.type !== "keyDown" || !entrada.control || entrada.alt || entrada.meta) return;
    const tecla = entrada.key.toLowerCase();
    if (tecla === "s") {
      evento.preventDefault();
      void salvarNeovim().catch(() => {
        /* sem editor aberto ainda, ou socket em pé de guerra: nada a gravar */
      });
    } else if (tecla === "z") {
      evento.preventDefault();
      void (entrada.shift ? refazerNeovim() : desfazerNeovim()).catch(() => {});
    } else if (entrada.code === "Backquote") {
      //! Ctrl+` : a resposta ao Alt+t que o KDE rouba. Abre o terminal do Neovim.
      evento.preventDefault();
      void abrirTerminalNeovim().catch(() => {});
    }
  });
}
