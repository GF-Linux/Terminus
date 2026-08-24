//? PASTA ABERTA POR ATALHO — a rede da A9 CONSERTADA, e a virada do teste 24/08/2026
//!
//! 1. Este arquivo TRAVAVA O DEFEITO até 24/08 (§12·3a·4): a pasta aberta por atalho
//!    recusava toda escrita, e o teste registrava a recusa com o aviso de que aquilo era o
//!    defeito, não a intenção. A cabeça decidiu pela opção **(a)** da árvore A9 e o teste
//!    VIROU: agora ele afirma que escrever FUNCIONA, e o aviso saiu.
//! 2. O conserto é uma linha em `entrarNaPasta`: a raiz é resolvida NA ENTRADA
//!    (`resolverParaLeitura`), então `raizAberta` guarda o lugar real e os dois lados da
//!    guarda passam a falar do mesmo lugar. Antes, `raizesDeEscrita()` devolvia o atalho e
//!    `confinado()` resolvia o alvo — e o que estava dentro era declarado fora.
//! 3. O PREÇO, que a cabeça autorizou por escrito: a tela passa a mostrar o nome REAL em
//!    vez do nome do atalho. Está travado aqui embaixo, porque virou conduta pretendida.
//! 4. Arquivo PRÓPRIO porque `node --test` isola por arquivo (medido): abrir outra pasta
//!    aqui não mexe no `raizAberta` das outras suítes, que é estado de módulo.
//! 5. ⚠️ O QUE NÃO PODE AFROUXAR: consertar a A9 não é abrir a guarda. Os dois últimos
//!    testes existem para isso — o de fora continua recusado, e o atalho DENTRO do projeto
//!    que aponta para fora continua recusado. Sem eles, "gravar funciona" passaria também
//!    num código que simplesmente parou de conferir.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { casa, pastaNova } from "../apoio/casa-de-teste.ts";
import { esperarAsAtrasadas, naoTratadas } from "../apoio/rejeicoes-nao-tratadas.ts";
import {
  entrarNaPasta,
  pastaAberta,
  raizesDeEscrita,
} from "../../codigos/sistema/servicos/abertura-de-projeto.ts";
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

const deFora = pastaNova("fora-do-projeto");

//! No corpo do módulo pela A8 — ver `tests/servicos/abertura-de-projeto.test.ts`, item 2.
//!   A A8 foi consertada em 24/08 e a forma sobreviveu à causa (árvore **A11**).
const aberto = await entrarNaPasta(atalho);
await esperarAsAtrasadas();

describe("A9 · a pasta aberta por atalho é a pasta REAL — e escrever nela funciona", () => {
  test("a raiz de escrita é o LUGAR REAL, não o atalho — é daqui que vem tudo", () => {
    assert.deepEqual(raizesDeEscrita(), [real]);
    assert.equal(pastaAberta(), real);
    assert.notEqual(real, path.resolve(atalho));
    assert.equal(real.startsWith(casa()), true);
  });

  test("gravar funciona dentro da pasta aberta — o que a A9 consertou", async () => {
    const alvo = path.join(atalho, "nota.txt");
    await gravarConfinado(alvo, "oi");
    //! Confere no LUGAR REAL, não no caminho pedido: é o mesmo arquivo por dois nomes, e
    //!   olhar pelo lado real é o que prova que a escrita caiu dentro da pasta aberta.
    assert.equal(existsSync(path.join(real, "nota.txt")), true);
  });

  test("criar arquivo funciona — era o que a A3(a) tinha alargado", async () => {
    const criado = await criarArquivoNoProjeto(atalho, "novo.txt");
    assert.equal(criado, path.join(real, "novo.txt"));
    assert.equal(existsSync(criado), true);
  });

  test("criar pasta funciona", async () => {
    const criada = await criarPastaNoProjeto(atalho, "sub");
    assert.equal(criada, path.join(real, "sub"));
    assert.equal(existsSync(criada), true);
  });
});

describe("o preço que a cabeça autorizou: a tela passa a dizer o nome real", () => {
  //! A árvore A9 declarou este custo e a decisão de 24/08 o aceitou por escrito. Fica
  //!   travado porque agora é conduta PRETENDIDA — se alguém a desfizer, isto avisa.
  test("o que a interface recebe é o caminho real, e o nome é o da pasta real", () => {
    assert.equal(aberto.raiz, real);
    assert.equal(aberto.nome, "projeto-real");
    assert.notEqual(aberto.nome, "atalho-para-o-projeto");
  });
});

describe("consertar a A9 NÃO afrouxou a guarda", () => {
  test("arquivo de fora continua recusado", () => {
    assert.throws(
      () => gravarConfinado(path.join(deFora, "roubado.txt"), "x"),
      /está fora da pasta aberta/,
    );
  });

  test("atalho DENTRO do projeto apontando para fora continua recusado", () => {
    const vitima = path.join(deFora, "vitima.txt");
    writeFileSync(vitima, "original", "utf8");
    const armadilha = path.join(real, "parece-daqui.txt");
    symlinkSync(vitima, armadilha);
    assert.throws(() => gravarConfinado(armadilha, "x"), /está fora da pasta aberta/);
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
