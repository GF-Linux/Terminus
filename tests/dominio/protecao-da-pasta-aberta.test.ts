//? PROTECAO DA PASTA ABERTA — a trava que impede apagar o trabalho do dia
//!
//! 1. A trava fica no processo principal, e nao so na tela: tela pode voltar a
//!    errar, e apagar a pasta aberta leva o trabalho inteiro.
//! 2. Ela recusa a pasta aberta E qualquer pasta ACIMA dela — apagar o pai
//!    apaga o filho junto.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ehPastaProtegida } from "../../codigos/dominio/protecao-da-pasta-aberta.ts";

test("sem pasta aberta, nada esta protegido", () => {
  assert.equal(ehPastaProtegida("/casa/proj", null), false);
});

test("protege a propria pasta aberta", () => {
  assert.equal(ehPastaProtegida("/casa/proj", "/casa/proj"), true);
});

test("protege a pasta ACIMA da aberta", () => {
  assert.equal(ehPastaProtegida("/casa", "/casa/proj"), true);
});

test("NAO protege arquivo dentro da pasta aberta — excluir ali e o uso normal", () => {
  assert.equal(ehPastaProtegida("/casa/proj/a.txt", "/casa/proj"), false);
});

test("NAO protege pasta irma", () => {
  assert.equal(ehPastaProtegida("/casa/outro", "/casa/proj"), false);
});

//! `/casa/pro` e prefixo textual de `/casa/proj`, mas nao e pasta acima dela.
test("NAO protege vizinho cujo nome e prefixo do da raiz", () => {
  assert.equal(ehPastaProtegida("/casa/pro", "/casa/proj"), false);
});
