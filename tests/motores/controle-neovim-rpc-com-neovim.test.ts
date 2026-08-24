//? CANAL DE CONTROLE COM NEOVIM RESPONDENDO — a guarda da guarda 24/08/2026
//!
//! 1. POR QUE ESTE ARQUIVO EXISTE, e é a lição que a corrida 4 pagou em
//!    `escrita-em-pasta-por-atalho`: uma rede que só prova a RECUSA passa também num código
//!    que simplesmente parou de funcionar. Se a A8 fosse "consertada" com um `throw` fixo da
//!    frase, o arquivo vizinho ficaria verde e ninguém saberia que o Ctrl+S morreu.
//!    Aqui o Neovim responde, e o que se trava é o que a casca MANDA no fio.
//! 2. O NEOVIM É FALSO MAS O PROTOCOLO É REAL. `tests/apoio/neovim-falso.ts` fala
//!    msgpack-RPC com o mesmo codec que o pacote `neovim` usa por dentro — então não há
//!    dublê nenhum entre o teste e o código sob teste: `attach`, o aperto de mão e cada
//!    pedido atravessam o socket de verdade.
//! 3. ARQUIVO SEPARADO DO IRMÃO SEM NEOVIM, e não é organização: `SOCKET_NEOVIM` nasce do
//!    `TMPDIR` no carregamento do módulo, e `node --test` dá UM PROCESSO POR ARQUIVO. Dois
//!    arquivos = duas casas = dois mundos independentes, e eles ainda rodam em PARALELO,
//!    então o ciclo de 3 s do irmão não se soma ao tempo daqui.
//! 4. O PRIMEIRO PAR DE PEDIDOS É SEMPRE `nvim_get_api_info` + `nvim_eval`: o aperto de mão
//!    do próprio pacote, e a confirmação que `obter()` faz para saber que o outro lado
//!    responde de verdade. Os testes contam a partir deles em vez de escondê-los.

import { test, describe, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { inesperadas, naoTratadas } from "../apoio/rejeicoes-nao-tratadas.ts";
import { subirNeovimFalso } from "../apoio/neovim-falso.ts";
import { SOCKET_NEOVIM } from "../../codigos/sistema/motores/motor-neovim-pty.ts";
import {
  abrirNoNeovim,
  abrirTerminalNeovim,
  cdNeovim,
  desfazerNeovim,
  pluginsNeovim,
  refazerNeovim,
  resetarControle,
  salvarNeovim,
} from "../../codigos/sistema/motores/controle-neovim-rpc.ts";

//! No corpo do módulo, e não num `before`: o socket tem de estar escutando antes do primeiro
//!   `obter()`, e o corpo é o único ponto garantidamente anterior a qualquer teste.
const falso = await subirNeovimFalso(SOCKET_NEOVIM);

/** O aperto de mão do pacote mais a confirmação de `obter()` — o par que abre toda conexão. */
const APERTO_DE_MAO = ["nvim_get_api_info([])", 'nvim_eval(["1"])'];

beforeEach(() => {
  //! `node --test` isola por ARQUIVO, não por teste: sem reiniciar os dois lados, o segundo
  //!   teste leria os pedidos do primeiro e passaria por herança.
  resetarControle();
  falso.pedidos.length = 0;
  falso.respostaLua = [];
});

after(async () => {
  await falso.parar();
});

describe("os comandos do dia a dia chegam ao Neovim como ex-comandos", () => {
  test("salvarNeovim manda `silent! write` depois do aperto de mão", async () => {
    await salvarNeovim();
    assert.deepEqual(falso.pedidos, [...APERTO_DE_MAO, 'nvim_command(["silent! write"])']);
  });

  test("desfazer e refazer são `silent! undo` e `silent! redo`", async () => {
    await desfazerNeovim();
    await refazerNeovim();
    assert.deepEqual(falso.pedidos, [
      ...APERTO_DE_MAO,
      'nvim_command(["silent! undo"])',
      'nvim_command(["silent! redo"])',
    ]);
  });

  test("abrirTerminalNeovim rasga a janela embaixo e entra em escrita", async () => {
    await abrirTerminalNeovim();
    assert.deepEqual(falso.pedidos, [
      ...APERTO_DE_MAO,
      'nvim_command(["belowright split | resize 14 | terminal"])',
      'nvim_command(["startinsert"])',
    ]);
  });
});

describe("abrirNoNeovim — quem escapa o nome é o PRÓPRIO Neovim", () => {
  test("o caminho com espaço passa por `fnameescape` antes do `edit`", async () => {
    //! A asserção é sobre o PEDIDO de escape, não sobre o resultado dele: reimplementar o
    //!   escape do Vim aqui seria trocar a fonte da verdade por uma cópia nossa.
    await abrirNoNeovim("/casa/a b.txt");
    assert.deepEqual(falso.pedidos, [
      ...APERTO_DE_MAO,
      'nvim_call_function(["fnameescape",["/casa/a b.txt"]])',
      'nvim_command(["edit /casa/a b.txt"])',
      'nvim_command(["startinsert"])',
    ]);
  });

  test("com linha, o cursor para nela e a tela centraliza", async () => {
    await abrirNoNeovim("/casa/x.py", 12);
    assert.deepEqual(falso.pedidos.slice(APERTO_DE_MAO.length + 1), [
      'nvim_command(["edit /casa/x.py"])',
      'nvim_command(["12"])',
      'nvim_command(["normal! zz"])',
      'nvim_command(["startinsert"])',
    ]);
  });

  test("linha zero ou fracionária é ignorada — não vira ex-comando", async () => {
    //? O clique no traceback é quem manda a linha; um zero herdado de parse falho viraria
    //?   `:0`, que no Vim é um endereço válido e levaria o cursor para o lugar errado.
    await abrirNoNeovim("/casa/x.py", 0);
    await abrirNoNeovim("/casa/y.py", 2.5);
    const comandos = falso.pedidos.filter((p) => p.startsWith("nvim_command"));
    assert.deepEqual(comandos, [
      'nvim_command(["edit /casa/x.py"])',
      'nvim_command(["startinsert"])',
      'nvim_command(["edit /casa/y.py"])',
      'nvim_command(["startinsert"])',
    ]);
  });
});

describe("pluginsNeovim — o painel só mostra o que veio em lista", () => {
  test("devolve a lista que o lazy.nvim respondeu", async () => {
    falso.respostaLua = [{ nome: "telescope", url: "u", dir: "d", carregado: true }];
    assert.deepEqual(await pluginsNeovim(), [{ nome: "telescope", url: "u", dir: "d", carregado: true }]);
  });

  test("resposta que não é lista vira lista vazia em vez de estourar na tela", async () => {
    falso.respostaLua = { erro: "lazy não carregou" };
    assert.deepEqual(await pluginsNeovim(), []);
  });
});

describe("cdNeovim — a pasta do editor segue a pasta da casca", () => {
  test("manda `cd` com o nome escapado pelo Neovim", async () => {
    await cdNeovim("/casa/proj");
    assert.deepEqual(falso.pedidos, [
      ...APERTO_DE_MAO,
      'nvim_call_function(["fnameescape",["/casa/proj"]])',
      'nvim_command(["cd /casa/proj"])',
    ]);
  });

  test("pasta vazia não vira `cd` nenhum", async () => {
    await cdNeovim("");
    assert.deepEqual(falso.pedidos, APERTO_DE_MAO);
  });
});

describe("a conexão é reaproveitada, e `resetarControle` a descarta", () => {
  test("duas chamadas SEGUIDAS dão UM aperto de mão só — o cliente fica guardado", async () => {
    await salvarNeovim();
    await desfazerNeovim();
    assert.equal(falso.pedidos.filter((p) => p.startsWith("nvim_get_api_info")).length, 1);
  });

  test("duas chamadas AO MESMO TEMPO dão UM aperto de mão só — a conexão em curso é partilhada", async () => {
    //! ⚠️ ESTE TESTE NASCEU DE UMA SABOTAGEM QUE NÃO MORDEU. O teste acima, sozinho, seguia
    //!   verde com o memo de `conectando` REMOVIDO — porque em chamadas sequenciais quem
    //!   evita o segundo aperto de mão é o `cliente` já guardado, não o memo. O memo só
    //!   trabalha quando duas chamadas partem antes de a primeira chegar, que é exatamente
    //!   o caso do Ctrl+S apertado na partida — e é a metade memoizada do defeito A8.
    await Promise.all([salvarNeovim(), desfazerNeovim(), abrirTerminalNeovim()]);
    assert.equal(falso.pedidos.filter((p) => p.startsWith("nvim_get_api_info")).length, 1);
  });

  test("depois de resetarControle, a chamada seguinte aperta a mão de novo", async () => {
    //? É o que faz o Ctrl+S voltar a funcionar quando o Neovim renasce: o socket velho
    //?   morreu, e insistir nele deixaria a casca falando com um cadáver para sempre.
    await salvarNeovim();
    resetarControle();
    await salvarNeovim();
    assert.equal(falso.pedidos.filter((p) => p.startsWith("nvim_get_api_info")).length, 2);
  });
});

describe("com o Neovim de pé, nada vaza", () => {
  test("nenhuma rejeição não tratada em toda a suíte", () => {
    assert.deepEqual(inesperadas(), []);
    assert.deepEqual(naoTratadas, []);
  });
});
