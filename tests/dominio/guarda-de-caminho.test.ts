//? GUARDA DE CAMINHO — a rede que trava o confinamento antes de ele mudar de casa
//!
//! 1. Esta e a conduta que a fatia 1 promete PRESERVAR (§12·3): o que a
//!    `confinado` de janela-principal.ts recusa hoje, o dominio recusa depois.
//! 2. As asercoes foram lidas do codigo de origem, nao inventadas: o caso do
//!    prefixo textual e o do caminho igual a raiz vem das duas pernas do
//!    `if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)))`.
//! 3. O dominio decide sobre caminho JA RESOLVIDO. Quem chama realpath e a
//!    infra — e essa divisao e o que torna esta suite possivel sem Electron.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dentroDaRaiz } from "../../codigos/dominio/guarda-de-caminho.ts";

test("aceita o caminho que E a propria raiz", () => {
  assert.equal(dentroDaRaiz("/casa/proj", ["/casa/proj"]), true);
});

test("aceita arquivo dentro da raiz", () => {
  assert.equal(dentroDaRaiz("/casa/proj/sub/a.txt", ["/casa/proj"]), true);
});

test("recusa caminho fora da raiz", () => {
  assert.equal(dentroDaRaiz("/casa/outro/a.txt", ["/casa/proj"]), false);
});

test("recusa quando NAO ha raiz nenhuma — sem pasta aberta, nada e gravavel", () => {
  assert.equal(dentroDaRaiz("/casa/proj/a.txt", []), false);
});

//! O caso que a comparacao de texto pura erraria: `/casa/proj-outro` comeca com
//! `/casa/proj`, mas nao esta dentro dele. E irmao, nao filho.
test("recusa vizinho cujo nome COMECA com o nome da raiz", () => {
  assert.equal(dentroDaRaiz("/casa/proj-outro/a.txt", ["/casa/proj"]), false);
});

test("aceita quando cai na SEGUNDA raiz da lista", () => {
  assert.equal(dentroDaRaiz("/casa/b/a.txt", ["/casa/a", "/casa/b"]), true);
});
