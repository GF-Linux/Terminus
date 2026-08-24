//? ENTRADA RECUSADA — o que nem chega a virar caminho
//!
//! 1. A ORDEM importa, e e o motivo deste modulo existir separado: o caminho
//!    que comeca com "-" e recusado ANTES de resolver. Depois de resolver,
//!    `path.resolve("-c")` vira `<pasta atual>/-c`, que CAI DENTRO de uma raiz
//!    permitida e passaria na conferencia.
//! 2. Um caminho com traco na frente vira opcao do programa que o recebe.

import { test } from "node:test";
import assert from "node:assert/strict";
import { recusarEntrada } from "../../codigos/dominio/entrada-recusada.ts";

test("devolve a propria string quando ela e valida", () => {
  assert.equal(recusarEntrada("/casa/proj/a.txt", "arquivo"), "/casa/proj/a.txt");
});

test("recusa o que nao e string", () => {
  assert.throws(() => recusarEntrada(42, "arquivo"), /não é válido/);
});

test("recusa string vazia", () => {
  assert.throws(() => recusarEntrada("", "caminho"), /não é válido/);
});

test("recusa string com byte nulo", () => {
  assert.throws(() => recusarEntrada("/casa/a\u0000.txt", "arquivo"), /não é válido/);
});

test("recusa caminho que comeca com traco, e diz POR QUE", () => {
  assert.throws(() => recusarEntrada("-c", "caminho"), /não pode começar com/);
});

test("o traco no MEIO do nome e legitimo e passa", () => {
  assert.equal(recusarEntrada("/casa/proj/meu-arquivo.txt", "arquivo"), "/casa/proj/meu-arquivo.txt");
});
