//* Entrega a janela viva, ou recusa com a frase que a tela sabe exibir.

import type { BrowserWindow } from "electron";

//! POR QUE EXTRAIDO: três registradores precisam da janela para abrir diálogo
//!   — projeto, exclusão e aparência. Três cópias das mesmas quatro linhas é a
//!   terceira repetição, e é onde o §6·R4 manda refatorar (nem antes, nem depois).
//! A frase da recusa é a mesma do monólito, palavra por palavra: ela chega à
//!   tela pelo `Resultado` e não pode mudar sem mudar o que a pessoa lê.
export function exigirJanela(janelaViva: () => BrowserWindow | null): BrowserWindow {
  const janela = janelaViva();
  if (!janela) throw new Error("Janela não disponível.");
  return janela;
}
