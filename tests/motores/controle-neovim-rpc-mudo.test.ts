//? CANAL DE CONTROLE COM SOCKET MUDO — a guarda do TETO 24/08/2026
//!
//! 1. POR QUE ESTE ARQUIVO EXISTE, e é um buraco que eu mesmo achei na minha rede: o
//!    conserto da A8 tem duas metades — a conexão feita por nós (que mata o vazamento) e o
//!    TETO na confirmação (que impede pendurar). O arquivo irmão, sem Neovim nenhum, exercita
//!    só a primeira: sem socket, o código nunca chega a chamar `eval`, então o teto poderia
//!    ser removido e aquela suíte seguiria verde.
//! 2. O CASO QUE SÓ AQUI APARECE: alguém ESCUTA no socket e não fala msgpack — um Neovim
//!    travado, ou um resto de sessão com outro dono. `attach` conecta, `eval` é enviado, e
//!    a resposta nunca vem. Medido em 24/08: sem teto, essa promessa não assenta nem em
//!    800 ms nem nunca — é o mesmo mecanismo da A8, alcançado por outra porta.
//! 3. ELE TAMBÉM É A GUARDA DE `largarSoquete`. Ao desistir de um socket mudo, o motor o
//!    encerra com `end()`. Medido: `destroy()` faz o iterador do transporte do pacote
//!    `neovim` rejeitar com `Premature close`, sem tratador — trocar o silêncio da A8 por
//!    um vazamento novo. A asserção de "nada vazou" aqui é o que trava essa escolha.
//! 4. ARQUIVO PRÓPRIO PORQUE É UM TERCEIRO MUNDO: `node --test` dá um processo por arquivo,
//!    e o estado do socket é global ao processo. Sem-Neovim, Neovim-que-responde e
//!    Neovim-mudo são três estados do mundo, e cada um precisa do seu.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { naoTratadas } from "../apoio/rejeicoes-nao-tratadas.ts";
import { subirNeovimFalso, type NeovimFalso } from "../apoio/neovim-falso.ts";
import { SOCKET_NEOVIM } from "../../codigos/sistema/motores/motor-neovim-pty.ts";
import { PACIENCIA_MS, salvarNeovim } from "../../codigos/sistema/motores/controle-neovim-rpc.ts";

/** A frase que o autor escreveu para este caso. */
const A_FRASE = "Neovim não respondeu ao canal de controle.";

let falso: NeovimFalso;
let desfecho: { rejeitou: boolean; mensagem: string };
let quantoDemorou: number;

before(async () => {
  falso = await subirNeovimFalso(SOCKET_NEOVIM, { mudo: true });
  const comecou = Date.now();
  desfecho = await new Promise((pronto) => {
    //! O relógio é o dobro do orçamento: uma regressão que volte a pendurar tem de virar
    //!   falha legível, não suíte travada sem veredito.
    const relogio = setTimeout(() => pronto({ rejeitou: false, mensagem: "PENDUROU" }), PACIENCIA_MS * 2);
    void salvarNeovim().then(
      () => {
        clearTimeout(relogio);
        pronto({ rejeitou: false, mensagem: "RESOLVEU — o socket mudo não pode ter respondido" });
      },
      (erro: unknown) => {
        clearTimeout(relogio);
        pronto({ rejeitou: true, mensagem: (erro as Error).message });
      },
    );
  });
  quantoDemorou = Date.now() - comecou;
});

after(async () => {
  await falso.parar();
});

describe("socket que aceita a conexão e nunca responde", () => {
  test("o canal desiste e diz a frase, em vez de pendurar", () => {
    assert.ok(desfecho.rejeitou, `esperava a recusa; veio ${desfecho.mensagem}`);
    assert.equal(desfecho.mensagem, A_FRASE);
  });

  test("desiste dentro do orçamento — o teto por tentativa não estoura o prazo total", () => {
    //! É a conta que fez o laço passar a ser regido por PRAZO e não por contagem: com 25
    //!   tentativas fixas e teto de 300 ms, o pior caso seria 25 × 420 ms = 10,5 s, três
    //!   vezes e meia o "~3 s" que o motor promete por escrito.
    assert.ok(
      quantoDemorou >= PACIENCIA_MS,
      `esperava ao menos ${PACIENCIA_MS} ms de insistência; foram ${quantoDemorou} ms`,
    );
    assert.ok(
      quantoDemorou < PACIENCIA_MS * 2,
      `o orçamento é de ~${PACIENCIA_MS} ms e a espera foi de ${quantoDemorou} ms`,
    );
  });

  test("tentou VÁRIAS vezes — o laço faz a segunda volta, que era o coração da A8", () => {
    //! Cada tentativa manda um `nvim_get_api_info` (o aperto de mão do pacote) e um
    //!   `nvim_eval` (a confirmação). O socket mudo guarda os dois sem responder, então a
    //!   contagem deles é a prova direta de quantas voltas o laço deu.
    const apertos = falso.pedidos.filter((p) => p.startsWith("nvim_get_api_info")).length;
    assert.ok(apertos > 1, `o laço deu ${apertos} volta(s) — a A8 travava exatamente na primeira`);
  });

  test("NADA vaza ao largar o socket mudo — a guarda de `end()` em vez de `destroy()`", () => {
    assert.deepEqual(naoTratadas, []);
  });
});
