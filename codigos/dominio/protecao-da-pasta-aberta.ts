//* Decide se um caminho e a pasta de trabalho aberta, ou uma pasta acima dela.

import * as path from "node:path";

//* Diz se apagar `alvo` levaria junto a pasta aberta.
//! POR QUE A TRAVA EXISTE: apagar a pasta aberta leva o trabalho do dia inteiro,
//!   e a tela pode voltar a errar — entao a recusa mora no processo principal,
//!   nao so no botao.
//! O `+ path.sep` na comparacao de ancestral nao e enfeite: sem ele, `/casa/pro`
//!   contaria como pasta acima de `/casa/proj`, porque um e prefixo textual do
//!   outro. Com o separador, so pasta de verdade acima entra.
export function ehPastaProtegida(alvo: string, raizAberta: string | null): boolean {
  if (!raizAberta) return false;
  const raiz = path.resolve(raizAberta);
  const escolhido = path.resolve(alvo);
  return escolhido === raiz || raiz.startsWith(escolhido + path.sep);
}
