//? CANAL DE CONTROLE SEM NEOVIM — a rede depois do conserto da A8 24/08/2026
//!
//! 1. ⚠️ ESTE ARQUIVO VIROU DO AVESSO EM 24/08, e o diff dele é a prova de que o conserto
//!    pegou. Ele nasceu travando o DEFEITO — as cinco funções penduravam, a rejeição do
//!    socket vazava, e a segunda chamada herdava a promessa morta — com o aviso do §12·3a·4
//!    ao lado. Aplicada a A8(c), os três testes ficaram VERMELHOS e foram reescritos para a
//!    conduta pretendida. Se este arquivo tivesse seguido verde sem mudar, o conserto não
//!    teria pegado.
//! 2. O QUE ELE TRAVA AGORA: que a frase que o autor escreveu para este caso —
//!    *"Neovim não respondeu ao canal de controle."* — **aparece de verdade**. Ela existe em
//!    quatro lugares do motor e, até 24/08, era inalcançável: exigia `obter()` resolver para
//!    `null`, e `obter()` nunca resolvia.
//! 3. O SOCKET É GARANTIDAMENTE AUSENTE AQUI, e não por sorte: o gancho redireciona `TMPDIR`
//!    para a casa temporária deste processo, e `SOCKET_NEOVIM` nasce dela. Sem isso o teste
//!    passaria ou falharia conforme o Terminus estivesse aberto na máquina de quem roda.
//! 4. A MONTAGEM MORA NUM `before`, E ISSO TAMBÉM É RESULTADO DO CONSERTO. Enquanto a A8
//!    vivia, uma rejeição não tratada nascia no escopo do gancho e o `node --test` reprovava
//!    o arquivo inteiro — medido, e é o que obrigou a versão anterior deste arquivo a fazer
//!    as chamadas no corpo do módulo. Sem vazamento, o lugar idiomático voltou a servir.
//! 5. UM CICLO SÓ PARA CINCO FUNÇÕES: elas dividem o `conectando` memoizado, então uma
//!    espera de `PACIENCIA_MS` prova as cinco. Cinco esperas custariam cinco vezes o relógio.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { naoTratadas } from "../apoio/rejeicoes-nao-tratadas.ts";
import { SOCKET_NEOVIM } from "../../codigos/sistema/motores/motor-neovim-pty.ts";
import {
  abrirNoNeovim,
  abrirTerminalNeovim,
  cdNeovim,
  PACIENCIA_MS,
  pluginsNeovim,
  salvarNeovim,
} from "../../codigos/sistema/motores/controle-neovim-rpc.ts";

/** A frase que o autor escreveu para este caso, e que era inalcançável até 24/08. */
const A_FRASE = "Neovim não respondeu ao canal de controle.";

type Desfecho = { tipo: "valor"; valor: unknown } | { tipo: "erro"; erro: Error } | { tipo: "pendurou" };

//* Corre a promessa contra um relógio e diz QUEM GANHOU, em vez de esperar para sempre.
//! O teto é o DOBRO do orçamento do canal, e derivado dele em vez de escrito à mão: assim
//!   uma regressão que volte a pendurar aparece como "pendurou" — falha legível — em vez de
//!   travar a suíte inteira sem veredito.
function correrContraORelogio<T>(promessa: Promise<T>): Promise<Desfecho> {
  return new Promise<Desfecho>((pronto) => {
    const relogio = setTimeout(() => pronto({ tipo: "pendurou" }), PACIENCIA_MS * 2);
    void promessa.then(
      (valor) => {
        clearTimeout(relogio);
        pronto({ tipo: "valor", valor });
      },
      (erro: unknown) => {
        clearTimeout(relogio);
        pronto({ tipo: "erro", erro: erro as Error });
      },
    );
  });
}

let cinco: Desfecho[];
let quantoDemorou: number;
let vazouNoCiclo: string[];
let segundaChamada: Desfecho;

before(async () => {
  const comecou = Date.now();
  cinco = await Promise.all([
    correrContraORelogio(salvarNeovim()),
    correrContraORelogio(abrirNoNeovim("/tmp/x.txt")),
    correrContraORelogio(abrirTerminalNeovim()),
    correrContraORelogio(pluginsNeovim()),
    correrContraORelogio(cdNeovim("/tmp")),
  ]);
  quantoDemorou = Date.now() - comecou;
  vazouNoCiclo = naoTratadas.slice();

  //! NÃO chama `resetarControle()` de propósito: o estado deixado pelo ciclo acima É o
  //!   objeto da medição seguinte. Limpá-lo mediria um canal virgem, não o canal que
  //!   acabou de desistir — que era justamente onde morava a metade memoizada do defeito.
  segundaChamada = await correrContraORelogio(salvarNeovim());
});

describe("o socket de controle é ausente por construção, não por sorte", () => {
  test("SOCKET_NEOVIM mora na casa temporária deste processo", () => {
    assert.equal(SOCKET_NEOVIM, `${process.env["TMPDIR"]}/terminus-nvim.sock`);
  });
});

describe("sem Neovim escutando, o canal DESISTE e DIZ — era a A8", () => {
  test("as quatro funções que carregam a frase rejeitam COM ela", () => {
    //! A asserção é sobre a FRASE, não sobre "rejeitou": qualquer estouro faria um teste de
    //!   "rejeitou" passar, inclusive o `TypeError` que a A8 produzia por outros caminhos.
    //!   O que estava quebrado era exatamente a frase não poder aparecer.
    const quatro = cinco.slice(0, 4);
    assert.deepEqual(
      quatro.map((d) => d.tipo),
      ["erro", "erro", "erro", "erro"],
      `esperava as quatro rejeitando; vieram ${JSON.stringify(quatro.map((d) => d.tipo))}`,
    );
    for (const d of quatro) {
      assert.equal((d as { erro: Error }).erro.message, A_FRASE);
    }
  });

  test("cdNeovim volta em SILÊNCIO — ele é disparado por `entrarNaPasta`, que não pode cair", () => {
    //? A assimetria é intencional e é do autor: `cdNeovim` tem `if (!c || !pasta) return;`.
    //?   Abrir uma pasta com o Neovim fora do ar continua abrindo a pasta.
    assert.deepEqual(cinco[4], { tipo: "valor", valor: undefined });
  });

  test("desiste DEPOIS de esperar o orçamento inteiro, não na primeira tentativa", () => {
    //! O piso é a metade que importa: um "conserto" que devolvesse `null` na hora exibiria
    //!   a frase e passaria no teste acima — e teria destruído a espera que existe para
    //!   cobrir a corrida entre o Neovim subir e alguém apertar Ctrl+S.
    assert.ok(
      quantoDemorou >= PACIENCIA_MS,
      `esperava ao menos ${PACIENCIA_MS} ms de insistência; foram ${quantoDemorou} ms`,
    );
    assert.ok(
      quantoDemorou < PACIENCIA_MS * 2,
      `o orçamento é de ~${PACIENCIA_MS} ms e a espera foi de ${quantoDemorou} ms`,
    );
  });

  test("NADA vaza como rejeição não tratada — é o que matava o processo em Node puro", () => {
    //? Até 24/08 o `connect ENOENT` do socket vazava aqui. Era ele que reprovava a suíte de
    //?   `escrita-confinada` e que matou uma sonda de medição em silêncio, com exit 0.
    assert.deepEqual(vazouNoCiclo, []);
    assert.deepEqual(naoTratadas, []);
  });

  test("a segunda chamada TENTA DE NOVO e diz a frase — não herda promessa morta", () => {
    //? Esta era a metade memoizada do defeito: `conectando` ficava pendente para sempre, e
    //?   uma falha só condenava o recurso pela sessão inteira.
    assert.equal(segundaChamada.tipo, "erro");
    assert.equal((segundaChamada as { erro: Error }).erro.message, A_FRASE);
  });
});
