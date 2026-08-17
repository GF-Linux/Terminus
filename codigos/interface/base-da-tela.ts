//? BASE DA TELA — Decisão sobre o que as DUAS janelas compartilham 17/08/2026
//!
//! 1. O Terminus passou a ter duas janelas: a casca, e o terminal solto
//!    (ADR 0031). São páginas diferentes, com módulos diferentes.
//! 2. O `nucleo-da-casca.ts` não serve às duas: ele **sobe o Neovim** ao ser
//!    importado, e um segundo Neovim brigaria pelo mesmo socket
//!    (`/tmp/terminus-nvim.sock`).
//! 3. Então o que é de todo mundo — achar um elemento e a porta para o sistema —
//!    mora aqui, que não sabe nada sobre editor, árvore ou painel.
//! 4. O `nucleo-da-casca.ts` reexporta os dois, para nada que já existia
//!    precisar mudar de import.

//* A ÚNICA porta para o sistema. Tudo que sai da tela passa por aqui.
export const api = window.terminus;

//* Acha um elemento da página pelo id, e ESTOURA se ele não existir.
//* O estouro é de propósito: id que sumiu do HTML vira erro na hora de abrir, e
//* não uma tela meio montada que ninguém entende.
export const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} não existe na página`);
  return el as T;
};
