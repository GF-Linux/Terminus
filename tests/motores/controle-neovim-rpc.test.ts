//? CANAL DE CONTROLE SEM NEOVIM — a rede que trava a conduta de HOJE 24/08/2026
//!
//! 1. ⚠️ TUDO O QUE ESTE ARQUIVO AFIRMA HOJE É O DEFEITO **A8**, NÃO A INTENÇÃO. É o §12·3a·4
//!    em uso: a rede registra o que o código FAZ, com o aviso ao lado, para não passar a
//!    mentir junto. Quando a A8 for consertada, cada teste daqui vira do avesso — e é o diff
//!    deles que prova que o conserto pegou.
//! 2. O DEFEITO, medido na corrida 3 e remedido aqui: o laço de `obter()` promete 25
//!    tentativas em ~3 s, e **nunca faz a segunda volta**. `attach({socket})` num socket
//!    ausente devolve um cliente cujo `eval` NUNCA ASSENTA — nem resolve nem rejeita —,
//!    então o `catch` do laço nunca roda. Como `conectando` é memoizado, toda chamada
//!    seguinte herda a mesma promessa morta.
//! 3. A CONSEQUÊNCIA QUE ESTES TESTES TRAVAM: a frase que o autor escreveu para exatamente
//!    este caso — *"Neovim não respondeu ao canal de controle."*, em `:66`, `:96`, `:112` e
//!    `:121` — é **inalcançável**, porque exige que `obter()` resolva para `null`.
//! 4. O SOCKET É GARANTIDAMENTE AUSENTE AQUI, e não por sorte: o gancho redireciona `TMPDIR`
//!    para a casa temporária deste processo, e `SOCKET_NEOVIM` nasce dela. Sem isso o teste
//!    passaria ou falharia conforme o Terminus estivesse aberto na máquina de quem roda.
//! 5. ⚠️ A MEDIÇÃO MORA NO CORPO DO MÓDULO, E NÃO DENTRO DOS TESTES, pela razão que
//!    `escrita-confinada.test.ts:29-42` já mediu com cinco arquivos de isolamento: o
//!    `node --test` REPROVA o teste em cujo escopo uma rejeição não tratada nasce, mesmo com
//!    tratador instalado. E é justamente uma rejeição não tratada que a A8 produz. Tentei
//!    primeiro dentro dos testes e colhi **3 falhas com `failureType: 'unhandledRejection'`** —
//!    o defeito herdado reprovando a rede que veio medi-lo.
//! 6. O TETO DE ESPERA É PROPOSITALMENTE MAIOR QUE O ORÇAMENTO DO CONSERTO. Um teto curto
//!    diria "pendurou" também **depois** do conserto, e a rede seguiria verde escondendo a
//!    mudança. Com `TETO_DA_ESPERA` acima do orçamento, o conserto obriga estes testes a
//!    ficarem vermelhos — que é como o diff aparece.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { naoTratadas, A8_SOCKET_NEOVIM } from "../apoio/rejeicoes-nao-tratadas.ts";
import { SOCKET_NEOVIM } from "../../codigos/sistema/motores/motor-neovim-pty.ts";
import {
  abrirNoNeovim,
  abrirTerminalNeovim,
  cdNeovim,
  pluginsNeovim,
  salvarNeovim,
} from "../../codigos/sistema/motores/controle-neovim-rpc.ts";

/** Acima do orçamento de paciência do canal — ver o item 6 do cabeçalho. */
const TETO_DA_ESPERA = 5000;

type Desfecho<T> = { tipo: "valor"; valor: T } | { tipo: "erro"; erro: Error } | { tipo: "pendurou" };

//* Corre a promessa contra um relógio e diz QUEM GANHOU, em vez de esperar para sempre.
//! O relógio NÃO é `unref`: no caso que este arquivo trava não há mais nada pendente no
//!   laço de eventos, e um relógio solto deixaria o processo sair antes de ele disparar —
//!   o teste terminaria sem veredito nenhum.
function correrContraORelogio<T>(promessa: Promise<T>, ms: number): Promise<Desfecho<T>> {
  return new Promise<Desfecho<T>>((pronto) => {
    const relogio = setTimeout(() => pronto({ tipo: "pendurou" }), ms);
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

//! AS CINCO DE UMA VEZ, e não uma por vez, porque elas dividem o `conectando` memoizado:
//!   um ciclo de espera prova as cinco, e cinco ciclos custariam cinco vezes o relógio.
const cinco: Desfecho<unknown>[] = await Promise.all([
  correrContraORelogio(salvarNeovim(), TETO_DA_ESPERA),
  correrContraORelogio(abrirNoNeovim("/tmp/x.txt"), TETO_DA_ESPERA),
  correrContraORelogio(abrirTerminalNeovim(), TETO_DA_ESPERA),
  correrContraORelogio(pluginsNeovim(), TETO_DA_ESPERA),
  correrContraORelogio(cdNeovim("/tmp"), TETO_DA_ESPERA),
]);

/** O que vazou como rejeição não tratada durante o ciclo acima. */
const vazou: string[] = naoTratadas.slice();

//! NÃO chama `resetarControle()` de propósito: o estado que sobrou do ciclo acima É o objeto
//!   da medição seguinte. Limpá-lo mediria um canal virgem, não o canal memoizado morto.
const segundaChamada: Desfecho<unknown> = await correrContraORelogio(salvarNeovim(), TETO_DA_ESPERA);

describe("o socket de controle é ausente por construção, não por sorte", () => {
  test("SOCKET_NEOVIM mora na casa temporária deste processo", () => {
    assert.equal(SOCKET_NEOVIM, `${process.env["TMPDIR"]}/terminus-nvim.sock`);
  });
});

describe("⚠️ DEFEITO A8 — a conduta de hoje, travada com o aviso ao lado (§12·3a·4)", () => {
  test("⚠️ as quatro funções que carregam a frase PENDURAM, e cdNeovim junto", () => {
    //? Depois do conserto, as quatro têm de REJEITAR com "Neovim não respondeu ao canal de
    //?   controle." e o `cdNeovim` tem de VOLTAR em silêncio. Hoje nenhuma das cinco assenta.
    assert.deepEqual(
      cinco.map((d) => d.tipo),
      ["pendurou", "pendurou", "pendurou", "pendurou", "pendurou"],
      "hoje nenhuma das cinco assenta — é o defeito A8",
    );
  });

  test("⚠️ a rejeição do socket VAZA sem tratador — é ela que mata o processo em node puro", () => {
    //? Depois do conserto, NADA pode vazar: o erro do socket passa a ser tratado na origem.
    assert.ok(
      vazou.some((m) => A8_SOCKET_NEOVIM.test(m)),
      `esperava o connect ENOENT vazando; chegaram: ${JSON.stringify(vazou)}`,
    );
  });

  test("⚠️ a segunda chamada herda a promessa MORTA em vez de tentar de novo", () => {
    //? Depois do conserto, a segunda chamada tem de começar um ciclo NOVO e rejeitar com a
    //?   frase — é a metade memoizada do defeito, e é ela que faz o silêncio durar a sessão inteira.
    assert.equal(segundaChamada.tipo, "pendurou");
  });
});
