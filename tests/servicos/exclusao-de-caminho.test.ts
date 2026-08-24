//? EXCLUSÃO DE CAMINHO — a rede da única operação irreversível do Terminus 24/08/2026
//!
//! 1. É a única que não tem volta, e por isso a trava mora no SERVIÇO e não só na tela —
//!    *"tela pode voltar a errar, e apagar a pasta aberta leva o trabalho do dia inteiro"*.
//!    Esta suíte é o que impede a trava de sair sem ninguém ver.
//! 2. OS DOIS RAMOS SÃO DIFERENTES DE VERDADE, e o teste os separa: lixeira quando ela
//!    alcança o disco, `rmSync` quando não alcança — e o `rmSync` só depois de a caixa ter
//!    dito, com todas as letras, que não tem volta. Trocar os dois ramos apaga de vez o que
//!    a pessoa achou que ia para a lixeira; é isso que o duble, ao NÃO apagar, deixa aparecer.
//! 3. `aLixeiraAlcanca` compara o dispositivo do alvo com o da casa. Aqui a casa chega por
//!    parâmetro (é assim em produção: `app.getPath("home")` vem da ponte), então o teste
//!    escolhe os dois ramos passando uma casa que existe ou uma que não existe.

import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { casa, janelaDeTeste, pastaNova } from "../apoio/casa-de-teste.ts";
import { controle, reiniciarDuble } from "../apoio/electron-duble.ts";
import { esperarAsAtrasadas, naoTratadas } from "../apoio/rejeicoes-nao-tratadas.ts";
import { entrarNaPasta } from "../../codigos/sistema/servicos/abertura-de-projeto.ts";
import { excluirCaminho } from "../../codigos/sistema/servicos/exclusao-de-caminho.ts";

const aberta = pastaNova("excluir");
before(async () => {
  await entrarNaPasta(aberta);
  await esperarAsAtrasadas();
});

const CONFIRMA = 0;
const CANCELA = 1;

function arquivoNovo(nome: string): string {
  const alvo = path.join(aberta, nome);
  writeFileSync(alvo, "conteúdo");
  return alvo;
}

beforeEach(() => reiniciarDuble());

describe("a pasta de trabalho é intocável", () => {
  test("recusa apagar a PRÓPRIA pasta aberta", async () => {
    await assert.rejects(() => excluirCaminho(aberta, janelaDeTeste, casa()), /pasta de trabalho aberta/);
  });

  test("recusa apagar uma pasta ACIMA da aberta", async () => {
    await assert.rejects(() => excluirCaminho(casa(), janelaDeTeste, casa()), /pasta de trabalho aberta/);
  });

  test("a recusa acontece ANTES de perguntar — a caixa nem abre", async () => {
    //! Se a pergunta viesse primeiro, a pessoa confirmaria uma exclusão que vai ser
    //!   recusada de qualquer jeito. A ordem é conduta, e é conferível pelo duble.
    await assert.rejects(() => excluirCaminho(aberta, janelaDeTeste, casa()));
    assert.deepEqual(controle.chamadas, []);
  });
});

describe("perguntar antes, sempre", () => {
  test("cancelar devolve false e NÃO apaga", async () => {
    const alvo = arquivoNovo("sobrevivente.txt");
    controle.respostaDaCaixa = CANCELA;
    assert.equal(await excluirCaminho(alvo, janelaDeTeste, casa()), false);
    assert.equal(existsSync(alvo), true);
    assert.deepEqual(controle.chamadas, ["dialog.showMessageBox"]);
  });
});

describe("os dois ramos, e a diferença entre eles", () => {
  test("com lixeira alcançável, vai para a LIXEIRA e não é apagado de vez", async () => {
    const alvo = arquivoNovo("para-a-lixeira.txt");
    controle.respostaDaCaixa = CONFIRMA;
    assert.equal(await excluirCaminho(alvo, janelaDeTeste, casa()), true);
    assert.equal(controle.chamadas.includes(`shell.trashItem:${alvo}`), true);
    //! O duble NÃO apaga de propósito: se alguém trocar os dois ramos, este arquivo
    //!   some — e some porque virou `rmSync`. É a troca ficando visível.
    assert.equal(existsSync(alvo), true);
  });

  test("sem lixeira alcançável, apaga de vez — e só depois de confirmar", async () => {
    const alvo = arquivoNovo("sem-volta.txt");
    controle.respostaDaCaixa = CONFIRMA;
    //! Casa que não existe: `statSync` estoura e `aLixeiraAlcanca` responde `false`. É o
    //!   caso do pendrive e do disco externo, onde `shell.trashItem` MENTE — apaga de vez
    //!   e devolve sucesso.
    const casaInalcancavel = path.join(casa(), "disco-que-nao-existe");
    assert.equal(await excluirCaminho(alvo, janelaDeTeste, casaInalcancavel), true);
    assert.equal(existsSync(alvo), false);
    assert.equal(controle.chamadas.some((c) => c.startsWith("shell.trashItem")), false);
  });

  test("apaga pasta inteira, com o que houver dentro", async () => {
    const sub = path.join(aberta, "pasta-cheia");
    mkdirSync(sub, { recursive: true });
    writeFileSync(path.join(sub, "dentro.txt"), "x");
    controle.respostaDaCaixa = CONFIRMA;
    assert.equal(await excluirCaminho(sub, janelaDeTeste, path.join(casa(), "nao-existe")), true);
    assert.equal(existsSync(sub), false);
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
