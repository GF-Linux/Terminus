//* Decide se um caminho JA RESOLVIDO cai dentro de alguma das raizes permitidas.

import * as path from "node:path";

//* Diz se `real` esta dentro de alguma raiz — ou E uma delas.
//! POR QUE ASSIM: a comparacao e por `path.relative`, e nao por `startsWith` de
//!   texto. `/casa/proj-outro` COMECA com `/casa/proj` e nao esta dentro dele —
//!   com texto puro, o vizinho passaria pela guarda. O `relative` devolve
//!   `../proj-outro`, e o `..` denuncia a saida.
//! O caso `rel === ""` e o proprio caminho ser a raiz, que e permitido: abrir a
//!   pasta aberta nao e sair dela.
//! Sem raiz nenhuma a resposta e `false`, e e de proposito: quando nao ha pasta
//!   aberta, NADA e gravavel.
export function dentroDaRaiz(real: string, raizes: readonly string[]): boolean {
  for (const raiz of raizes) {
    const rel = path.relative(raiz, real);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return true;
  }
  return false;
}
