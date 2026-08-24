//? FECHAMENTO DE PASTA — a rede da A7, depois do conserto 24/08/2026
//!
//! 1. ⚠️ ESTE ARQUIVO VIROU DO AVESSO EM 24/08. Ele nasceu travando o defeito **A7**: o
//!    módulo não oferecia forma nenhuma de voltar ao estado sem pasta aberta, e por isso a
//!    pasta que a pessoa fechava seguia **gravável** e seguia **"protegida"** contra
//!    exclusão — com a recusa afirmando que ela estava aberta. Aplicada a A7(a), o teste
//!    estrutural ficou vermelho e o bloco inteiro foi reescrito para a conduta pretendida.
//! 2. O DEFEITO, em uma linha: "Fechar pasta" era só do renderer — limpava a tela,
//!    redesenhava e avisava, com ZERO chamadas ao main. `raizAberta` tinha um único
//!    escritor no repositório, e ele só atribuía valor não-nulo.
//! 3. ⚠️ O ROTEIRO DE REPRO DA PRÓPRIA ÁRVORE ESTAVA ERRADO, e está medido no tracker §13.9.
//!    Ela dizia *"abrir `~/proj`, fechar, **abrir `~`**, excluir `proj`"* — e abrir `~`
//!    reatribui `raizAberta`, apagando o defeito no passo seguinte do próprio roteiro. O que
//!    reproduz é **fechar e não abrir mais nada**, e é esse o caminho testado aqui.
//! 4. AS DUAS CORES ESTÃO AQUI DE PROPÓSITO. Só provar que "depois de fechar tudo é
//!    recusado" passaria também num código que parou de aceitar qualquer coisa. Por isso
//!    cada afirmação tem a gêmea com a pasta **aberta**, dizendo que ali nada mudou.

import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { casa, janelaDeTeste, pastaNova } from "../apoio/casa-de-teste.ts";
import { controle, reiniciarDuble } from "../apoio/electron-duble.ts";
import { naoTratadas } from "../apoio/rejeicoes-nao-tratadas.ts";
import {
  entrarNaPasta,
  fecharPasta,
  pastaAberta,
  raizesDeEscrita,
} from "../../codigos/sistema/servicos/abertura-de-projeto.ts";
import {
  criarArquivoNoProjeto,
  criarPastaNoProjeto,
  gravarConfinado,
  renomearNoProjeto,
} from "../../codigos/sistema/servicos/escrita-confinada.ts";
import { excluirCaminho } from "../../codigos/sistema/servicos/exclusao-de-caminho.ts";

let aberta: string;

before(() => {
  aberta = pastaNova("para-fechar");
});

beforeEach(async () => {
  //! Reabre a cada teste: a pasta aberta é estado do MÓDULO, e `node --test` isola por
  //!   arquivo, não por teste. Sem reabrir, um teste herdaria o fechamento do anterior.
  await entrarNaPasta(aberta);
  reiniciarDuble();
});

//* Roda e devolve a mensagem da recusa, ou `"NÃO RECUSOU"`.
//! Uniformiza os dois formatos de propósito: `gravarConfinado` e os irmãos estouram de forma
//!   SÍNCRONA quando a lista de raízes está vazia (a guarda roda antes de qualquer promessa
//!   nascer), e `assert.rejects` REPASSA throw síncrono — foi medido nesta casa, e uma
//!   asserção errada aqui reprovaria o código certo.
async function recusa(fn: () => unknown): Promise<string> {
  try {
    await fn();
  } catch (erro) {
    return (erro as Error).message;
  }
  return "NÃO RECUSOU";
}

describe("fecharPasta devolve o main ao estado de não ter pasta nenhuma", () => {
  test("a pasta aberta some, e some para todo mundo que pergunta", () => {
    assert.equal(pastaAberta(), aberta);
    fecharPasta();
    assert.equal(pastaAberta(), null);
    assert.deepEqual(raizesDeEscrita(), []);
  });

  test("reabrir depois de fechar volta a funcionar", async () => {
    fecharPasta();
    await entrarNaPasta(aberta);
    assert.equal(pastaAberta(), aberta);
    assert.deepEqual(raizesDeEscrita(), [aberta]);
  });
});

describe("depois de fechar, os QUATRO canais de escrita recusam", () => {
  test("gravar, criar arquivo, criar pasta e renomear — os quatro, com a mesma frase", async () => {
    //? Era o sintoma mais gordo da A7: a pasta fechada continuava em `raizesDeEscrita()`,
    //?   então os quatro canais seguiam aceitando escrita numa pasta que a pessoa acreditava
    //?   ter desligado. Nenhum deles dependia da tela — o canal bastava.
    const antigo = await criarArquivoNoProjeto(aberta, "antes-de-fechar.txt");
    fecharPasta();

    const quatro = [
      await recusa(() => gravarConfinado(path.join(aberta, "x.txt"), "conteúdo")),
      await recusa(() => criarArquivoNoProjeto(aberta, "novo.txt")),
      await recusa(() => criarPastaNoProjeto(aberta, "sub")),
      await recusa(() => renomearNoProjeto(antigo, "outro.txt")),
    ];
    for (const frase of quatro) {
      assert.match(frase, /está fora da pasta aberta/, `um dos quatro canais não recusou: ${frase}`);
    }
    assert.equal(existsSync(path.join(aberta, "x.txt")), false);
  });

  test("com a pasta ABERTA, os quatro continuam aceitando — a guarda da guarda", async () => {
    //! Sem esta gêmea, um código que simplesmente parasse de escrever passaria no teste
    //!   acima e ninguém saberia que o Explorer inteiro tinha morrido.
    const criado = await criarArquivoNoProjeto(aberta, "ainda-funciona.txt");
    assert.equal(existsSync(criado), true);
    await gravarConfinado(criado, "texto");
    assert.equal(existsSync(await criarPastaNoProjeto(aberta, "pasta-viva")), true);
    assert.equal(path.basename(await renomearNoProjeto(criado, "renomeado.txt")), "renomeado.txt");
  });
});

describe("depois de fechar, a recusa de exclusão para de mentir", () => {
  test("a pasta fechada deixa de ser recusada — quem decide passa a ser a caixa", async () => {
    //? A frase era falsa: *"é a pasta de trabalho aberta (ou está acima dela)"*, dita sobre
    //?   uma pasta que a pessoa acabou de fechar. Com a A7(a) ela não é mais dita, porque o
    //?   estado deixou de sustentá-la — a opção (d) da árvore ficou ABSORVIDA por esta.
    fecharPasta();
    //! O duble responde CANCELA (`respostaDaCaixa` volta a 1 no `reiniciarDuble`), então
    //!   nada é apagado — e é isso que se quer provar: a caixa foi ALCANÇADA.
    assert.equal(await excluirCaminho(aberta, janelaDeTeste, casa()), false);
    assert.deepEqual(controle.chamadas, ["dialog.showMessageBox"]);
    assert.equal(existsSync(aberta), true);
  });

  test("a pasta ACIMA da fechada idem", async () => {
    fecharPasta();
    assert.equal(await excluirCaminho(casa(), janelaDeTeste, casa()), false);
    assert.equal(existsSync(casa()), true);
  });

  test("com a pasta ABERTA a trava continua de pé, e a caixa NEM ABRE", async () => {
    //! A gêmea da recusa, e ela guarda duas coisas: que a trava não sumiu junto com a
    //!   mentira, e que ela continua acontecendo ANTES da pergunta — se a caixa viesse
    //!   primeiro, a pessoa confirmaria uma exclusão que ia ser recusada de qualquer jeito.
    await assert.rejects(
      () => excluirCaminho(aberta, janelaDeTeste, casa()),
      /é a pasta de trabalho aberta \(ou está acima dela\)/,
    );
    assert.deepEqual(controle.chamadas, []);
  });
});

describe("o andaime não está escondendo nada", () => {
  test("NENHUMA rejeição não tratada vazou durante a suíte", () => {
    assert.deepEqual(naoTratadas, []);
  });
});
