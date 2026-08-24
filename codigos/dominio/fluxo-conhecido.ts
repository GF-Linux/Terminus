//* Decide se um rótulo é um dos fluxos que o Terminus sabe moldar e rodar.

import type { Fluxo } from "../compartilhado/tipos.js";

//* Diz se `rotulo` é `cpp`, `python` ou `csharp` — e estreita o tipo se for.
//! POR QUE UM MÓDULO PARA TRÊS PALAVRAS: a mesma lista estava escrita à mão em
//!   DOIS handlers, com mensagens de recusa diferentes. Duas cópias de uma regra
//!   é uma que vai ficar para trás quando um quarto fluxo entrar.
//! `rotulo is Fluxo` e não `boolean`: quem chama ganha o tipo estreitado de
//!   graça, e não precisa repetir a comparação para o compilador acreditar.
export function ehFluxoConhecido(rotulo: unknown): rotulo is Fluxo {
  return rotulo === "cpp" || rotulo === "python" || rotulo === "csharp";
}
