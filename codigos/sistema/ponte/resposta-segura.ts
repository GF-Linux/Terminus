//* Embrulha um handler para que exceção vire erro exibível, não promessa perdida.

import type { Resultado } from "../../compartilhado/tipos.js";

//! POR QUE ISTO EXISTE: uma exceção que escapa de um handler de `ipcMain.handle`
//!   vira promessa rejeitada do lado da tela, e a tela não tem o que mostrar.
//!   Embrulhada, ela chega como `{ ok: false, erro }` e a casca a exibe no
//!   terminal, com a frase que quem escreveu a guarda redigiu.
export function respostaSegura<A extends unknown[], T>(
  fn: (...args: A) => Promise<T> | T,
): (...args: A) => Promise<Resultado<T>> {
  return async (...args: A) => {
    try {
      return { ok: true, valor: await fn(...args) };
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : String(err) };
    }
  };
}
