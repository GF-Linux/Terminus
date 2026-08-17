//? CASCA DO TERMINAL — Decisão sobre o terminal em janela própria 17/08/2026
//!
//! 1. Isto é a partida da SEGUNDA janela, e só dela. Não há árvore, não há
//!    editor, não há Neovim: um terminal e a linha de comando.
//! 2. Os módulos são os MESMOS da casca (`tela-do-terminal`, `linha-de-comando`),
//!    e os ids do HTML também. Duas versões da mesma linha de comando iriam
//!    divergir no primeiro conserto feito num lado só.
//! 3. O processo é um só, no lado do sistema. Esta janela não roda nada por
//!    conta própria: pede pela mesma ponte, e a saída chega às duas janelas.

import { $, api } from "./base-da-tela.js";
import { TerminalSaida } from "./tela-do-terminal.js";
import {
  definirHistorico, definirRodando, ligarLinhaDeComando, sincronizarPastaCmd,
} from "./linha-de-comando.js";

//! Sem o clique no traceback: abrir arquivo é da casca, e daqui não há editor
//! para receber. Um clique que não faz nada seria pior do que não ser clicável.
const terminal = new TerminalSaida($("term"));

//! O prompt daqui mostra o caminho, e não o nome curto do projeto: esta janela
//! não acompanha qual pasta a casca abriu, e inventar um nome curto seria
//! mentir sobre onde a linha vai rodar.
ligarLinhaDeComando(terminal);

$("btParar").addEventListener("click", () => api.parar());
$("btLimpar").addEventListener("click", () => terminal.limpar());
$("btVoltarParaCasca").addEventListener("click", () => api.terminal.devolver());

//* O foco vai para a linha assim que a janela abre: quem soltou o terminal
//* numa janela própria abriu para digitar.
async function iniciar(): Promise<void> {
  //! `.valor`, e não o `Resultado` inteiro: o embrulho é um objeto, e objeto é
  //! sempre verdadeiro. Passá-lo direto ligava a trava para sempre (ADR 0032).
  const jaRodando = await api.rodando();
  definirRodando(jaRodando.ok && jaRodando.valor);
  await sincronizarPastaCmd();
  const h = await api.historicoDeComandos();
  if (h.ok) definirHistorico(h.valor);
  terminal.reajustar();
  ($("entradaCmd") as HTMLInputElement).focus();
}

void iniciar();
