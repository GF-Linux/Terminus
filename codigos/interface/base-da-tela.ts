//? BASE DA TELA — Decisão sobre o que as DUAS janelas compartilham 17/08/2026
//!
//! 1. O Terminus passou a ter duas janelas: a casca, e o terminal solto
//!    (ADR 0031). São páginas diferentes, com módulos diferentes.
//! 2. O `nucleo-da-casca.ts` não serve às duas: ele **monta o editor** ao ser
//!    importado, e um segundo editor brigaria pela mesma área da tela.
//!    (Até 25/08 a razão era mais dura: ele subia o Neovim, e um segundo Neovim
//!    disputaria o mesmo socket. O motor mudou; a regra de um só ficou.)
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

/** As aspas contam tanto quanto os sinais de maior e menor: o nome do arquivo
 *  entra dentro de `data-arquivo="..."`, e aspa dupla é nome POSIX legal que
 *  sobrevive a `unzip` e a `git checkout`. Sem escapá-la, um nome fecha o
 *  atributo cedo e acrescenta os que quiser — e o despachante de clique decide
 *  o que fazer olhando só para os `data-*` que encontra. */
export const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
