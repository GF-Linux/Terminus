//? ESCOLHA DA PASTA INICIAL — quem ganha, a linha de comando ou a memoria
//!
//! Quem digitou `terminus <pasta>` disse o que quer AGORA; sem argumento, volta
//! a ultima pasta aberta, porque reabrir no meio da mesma corrida e o caso comum.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pastaInicial } from "../../codigos/dominio/escolha-da-pasta-inicial.ts";

test("a linha de comando GANHA da pasta lembrada", () => {
  assert.equal(pastaInicial("/casa/pedida", "/casa/lembrada"), "/casa/pedida");
});

test("sem argumento, volta a pasta lembrada", () => {
  assert.equal(pastaInicial(null, "/casa/lembrada"), "/casa/lembrada");
});

test("sem argumento e sem memoria, nao abre nada", () => {
  assert.equal(pastaInicial(null, null), null);
});

test("argumento sozinho basta", () => {
  assert.equal(pastaInicial("/casa/pedida", null), "/casa/pedida");
});
