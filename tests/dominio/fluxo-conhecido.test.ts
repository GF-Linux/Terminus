//? FLUXO CONHECIDO — a lista que estava escrita a mao em DOIS lugares
//!
//! A mesma comparacao `cpp | python | csharp` vivia em `projeto:novo` e em
//! `projeto:como-rodar`, com mensagens de recusa diferentes. Duas copias de uma
//! regra e uma que vai ficar para tras quando um quarto fluxo entrar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ehFluxoConhecido } from "../../codigos/dominio/fluxo-conhecido.ts";

test("aceita os tres fluxos que o Terminus sabe moldar", () => {
  assert.equal(ehFluxoConhecido("cpp"), true);
  assert.equal(ehFluxoConhecido("python"), true);
  assert.equal(ehFluxoConhecido("csharp"), true);
});

test("recusa linguagem que o Terminus nao molda", () => {
  assert.equal(ehFluxoConhecido("rust"), false);
});

test("recusa o que nem e string — a carga do IPC chega crua", () => {
  assert.equal(ehFluxoConhecido(undefined), false);
  assert.equal(ehFluxoConhecido(null), false);
  assert.equal(ehFluxoConhecido(42), false);
  assert.equal(ehFluxoConhecido({ fluxo: "python" }), false);
});

//! Maiuscula nao passa: a etiqueta vem de um botao da propria casca, nao de
//! digitacao livre, e aceitar variacao aqui esconderia botao com rotulo errado.
test("recusa variacao de caixa", () => {
  assert.equal(ehFluxoConhecido("Python"), false);
});
