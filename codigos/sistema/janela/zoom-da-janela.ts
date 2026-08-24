//* Liga Ctrl+= , Ctrl+- e Ctrl+0 para o tamanho da janela inteira.

import type { BrowserWindow } from "electron";
import { gravarAparencia, lerAparencia } from "../motores/configuracao-salva.js";

//! Fica no processo principal, e não no editor: "a letra está pequena" é
//!   problema da janela, e vale com o foco em qualquer painel.
export function ligarZoom(alvo: BrowserWindow): void {
  const LIMITE_MIN = 0.6;
  const LIMITE_MAX = 2.5;
  const PASSO = 0.1;

  const aplicar = (fator: number): void => {
    const preso = Math.min(LIMITE_MAX, Math.max(LIMITE_MIN, Number(fator.toFixed(2))));
    alvo.webContents.setZoomFactor(preso);
    gravarAparencia({ zoom: preso });
  };

  //! O zoom lembrado da sessão anterior vai depois do primeiro carregamento
  //!   porque o Electron reinicia o fator a cada navegação — aplicado antes, ele
  //!   seria descartado sem aviso.
  alvo.webContents.on("did-finish-load", () => {
    alvo.webContents.setZoomFactor(lerAparencia().zoom);
  });

  alvo.webContents.on("before-input-event", (evento, entrada) => {
    if (entrada.type !== "keyDown" || !entrada.control || entrada.alt || entrada.meta) return;
    const atual = alvo.webContents.getZoomFactor();
    if (entrada.key === "=" || entrada.key === "+") aplicar(atual + PASSO);
    else if (entrada.key === "-" || entrada.key === "_") aplicar(atual - PASSO);
    else if (entrada.key === "0") aplicar(1);
    else return;
    //! Sem isto o `Ctrl 0` chegaria ao editor como digitar zero.
    evento.preventDefault();
  });
}
