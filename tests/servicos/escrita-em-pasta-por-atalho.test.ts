//? PASTA ABERTA POR ATALHO — a rede que registra o que a A3(a) ALARGOU 24/08/2026
//!
//! 1. ⚠️ ESTES TESTES TRAVAM O DEFEITO, NÃO A INTENÇÃO (§12·3a·4). É a árvore **A9**:
//!    `raizesDeEscrita()` guarda a raiz com `path.resolve` (sem realpath) e `confinado()`
//!    resolve o alvo COM realpath. Numa pasta aberta por atalho os dois falam de lugares
//!    diferentes, e o que está dentro é declarado fora.
//! 2. Antes da A3(a), só `gravar` recusava. **Depois dela, `criar` e `renomear` também** —
//!    porque passaram a usar a mesma guarda. O alargamento está aqui, escrito, em vez de
//!    aparecer um dia como "mas isso funcionava".
//! 3. Arquivo PRÓPRIO porque `node --test` isola por arquivo (medido): abrir outra pasta
//!    aqui não mexe no `raizAberta` das outras suítes, que é estado de módulo.
//! 4. Quando a A9 for consertada, ESTES TESTES VIRAM. É o aviso funcionando: ninguém
//!    conserta a A9 sem passar por aqui e declarar a virada.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync } from "node:fs";
import * as path from "node:path";
import { casa, pastaNova } from "../apoio/casa-de-teste.ts";
import { esperarAsAtrasadas, inesperadas } from "../apoio/rejeicoes-nao-tratadas.ts";
import { entrarNaPasta, raizesDeEscrita } from "../../codigos/sistema/servicos/abertura-de-projeto.ts";
import {
  criarArquivoNoProjeto,
  criarPastaNoProjeto,
  gravarConfinado,
} from "../../codigos/sistema/servicos/escrita-confinada.ts";

const base = pastaNova("com-atalho");
const real = path.join(base, "projeto-real");
mkdirSync(real);
const atalho = path.join(base, "atalho-para-o-projeto");
symlinkSync(real, atalho, "dir");

//! No corpo do módulo pela A8 — ver `tests/servicos/abertura-de-projeto.test.ts`, item 2.
await entrarNaPasta(atalho);
await esperarAsAtrasadas();

describe("A9 · a pasta aberta por atalho recusa escrita — herdado, e agora nos três canais", () => {
  test("a raiz de escrita é o ATALHO, não o lugar real — é daqui que vem tudo", () => {
    assert.deepEqual(raizesDeEscrita(), [path.resolve(atalho)]);
    assert.notEqual(path.resolve(atalho), real);
    assert.equal(atalho.startsWith(casa()), true);
  });

  test("gravar recusa dentro da própria pasta aberta (A9, herdado de antes da A3)", () => {
    assert.throws(
      () => gravarConfinado(path.join(atalho, "nota.txt"), "oi"),
      /está fora da pasta aberta/,
    );
  });

  //? ⚠️ ALARGAMENTO da A3(a): antes de 24/08 esta criação FUNCIONAVA, porque `criar`
  //?   comparava texto contra a raiz que o renderer mandava — o próprio atalho, que batia.
  test("criar arquivo passou a recusar também — o que a A3(a) alargou", () => {
    assert.throws(() => criarArquivoNoProjeto(atalho, "novo.txt"), /está fora da pasta aberta/);
  });

  test("criar pasta passou a recusar também", () => {
    assert.throws(() => criarPastaNoProjeto(atalho, "sub"), /está fora da pasta aberta/);
  });
});

describe("o andaime não está escondendo nada", () => {
  test("nenhuma rejeição INESPERADA vazou durante a suíte", async () => {
    await esperarAsAtrasadas();
    assert.deepEqual(inesperadas(), []);
  });
});
