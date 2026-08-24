//? CRIAÇÃO DE PROJETO — a rede do botão de fluxo, e da ordem que ele guarda 24/08/2026
//!
//! 1. O caso de uso encadeia três coisas: perguntar ONDE, moldar a pasta, e entrar nela.
//!    A ordem entre as duas últimas é conduta observável — e o teste da pasta que já existe
//!    é o que a prova, porque `criarProjeto` recusa `EEXIST` e aí entrar seria errado.
//! 2. ⚠️ A CRIAÇÃO BEM-SUCEDIDA MOROU NO CORPO DO MÓDULO até 24/08 (andaime da **A8**: ela
//!    chama `entrarNaPasta`, que disparava `cdNeovim`). Consertada a A8, voltou ao `before`
//!    idiomático na árvore **A11**. O caso que RECUSA continua dentro do próprio teste, e
//!    por razão do código: estoura antes de chegar em `entrarNaPasta`.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { casa, janelaDeTeste, pastaNova } from "../apoio/casa-de-teste.ts";
import { controle } from "../apoio/electron-duble.ts";
import { esperarAsAtrasadas, naoTratadas } from "../apoio/rejeicoes-nao-tratadas.ts";
import { pastaAberta } from "../../codigos/sistema/servicos/abertura-de-projeto.ts";
import { escolherECriar } from "../../codigos/sistema/servicos/criacao-de-projeto.ts";

const guarda = pastaNova("criacao");
const destino = path.join(guarda, "projeto-novo");

let criado: Awaited<ReturnType<typeof escolherECriar>>;
//! Cópia TIRADA NA HORA, e não `controle.chamadas` lido depois: os testes de baixo mexem no
//!   dublê (o de cancelar troca `ondeSalvar`), e ler no fim veria a soma de todos eles.
let chamadasDaCriacao: string[];

before(async () => {
  controle.ondeSalvar = destino;
  criado = await escolherECriar(janelaDeTeste, "python");
  await esperarAsAtrasadas();
  chamadasDaCriacao = [...controle.chamadas];
});

describe("escolherECriar — a pasta nasce pronta e já aberta", () => {
  test("perguntou ONDE com o diálogo de SALVAR, não o de abrir", () => {
    //! `showSaveDialog` pergunta o lugar E o nome de uma vez; com o de abrir seriam
    //!   duas telas. É decisão escrita no código, e é o que o duble registra.
    assert.deepEqual(chamadasDaCriacao, ["dialog.showSaveDialog"]);
  });

  test("devolve o arquivo principal, e ele existe no disco", () => {
    assert.notEqual(criado, null);
    assert.equal(criado?.principal, path.join(destino, "main.py"));
    assert.equal(existsSync(criado?.principal ?? ""), true);
  });

  test("a pasta nasceu com o molde dentro, não vazia", () => {
    assert.equal(readdirSync(destino).length > 0, true);
  });

  test("devolve o fluxo escolhido e a árvore da pasta nova", () => {
    assert.equal(criado?.fluxo, "python");
    assert.equal(criado?.projeto.raiz, destino);
  });

  test("a pasta criada VIROU a pasta aberta", () => {
    assert.equal(pastaAberta(), destino);
  });
});

describe("os dois jeitos de não criar nada", () => {
  test("cancelar o diálogo devolve null e não toca no disco", async () => {
    controle.ondeSalvar = null;
    const antes = pastaAberta();
    assert.equal(await escolherECriar(janelaDeTeste, "cpp"), null);
    assert.equal(pastaAberta(), antes);
  });

  //! A prova da ORDEM: `criarProjeto` usa `mkdir` SEM `recursive` de propósito, para não
  //!   escrever por cima do trabalho de alguém. Se `entrarNaPasta` viesse antes, a pasta
  //!   alheia viraria a pasta aberta — e gravável — mesmo com a criação recusada.
  test("apontar para pasta que JÁ EXISTE estoura, e a pasta aberta não muda", async () => {
    const ocupada = path.join(casa(), "pasta-de-outro-trabalho");
    mkdirSync(ocupada, { recursive: true });
    controle.ondeSalvar = ocupada;
    const antes = pastaAberta();
    await assert.rejects(() => escolherECriar(janelaDeTeste, "python"), /Já existe/);
    assert.equal(pastaAberta(), antes);
    assert.notEqual(pastaAberta(), ocupada);
  });
});

describe("o andaime não está escondendo nada", () => {
  test("NENHUMA rejeição não tratada vazou durante a suíte", async () => {
    await esperarAsAtrasadas();
    //! A asserção era "nada INESPERADO" enquanto a A8 vazava o `connect ENOENT` do socket
    //!   do Neovim. Consertada a A8 em 24/08, o perdão saiu e a exigência passou a ser total.
    assert.deepEqual(naoTratadas, []);
  });
});
