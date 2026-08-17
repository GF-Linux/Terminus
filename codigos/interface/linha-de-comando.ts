//! A linha de comando do terminal. Sem shell: o que se digita vira programa e
//! argumentos separados, e metacaractere é recusado com explicação.

import type { ProjetoAberto } from "../compartilhado/tipos.js";
import { $, api } from "./base-da-tela.js";
import type { TerminalSaida } from "./tela-do-terminal.js";

//? POR QUE ESTE MÓDULO NÃO IMPORTA MAIS A CASCA (ADR 0031)
//!
//! 1. A mesma linha de comando roda em DUAS janelas: a casca, e o terminal
//!    solto. Importar `nucleo-da-casca.js` traria o Neovim junto, e um segundo
//!    Neovim brigaria pelo socket do primeiro.
//! 2. Então as duas coisas que vinham de lá — a tela onde escrever e qual é a
//!    pasta aberta — passam a ENTRAR por `ligarLinhaDeComando`.
//! 3. A pasta entra como FUNÇÃO, e não como valor: ela muda quando se abre
//!    outra pasta, e um valor copiado na partida ficaria velho no prompt.
let terminal!: TerminalSaida;
let projetoAberto: () => ProjetoAberto | null = () => null;

export function ligarLinhaDeComando(
  tela: TerminalSaida,
  projeto: () => ProjetoAberto | null = () => null,
): void {
  terminal = tela;
  projetoAberto = projeto;
}


/**
 * Há um comando em execução?
 *
 * Sobrou da execução do arquivo aberto (o ▶, que saiu com a ADR 0025): hoje só a
 * linha de comando roda algo, e o estado serve para o ■ parar e para o Ctrl+C
 * saber se mata um processo ou limpa a linha.
 */
let rodando = false;

//* Liga e desliga o estado "há algo rodando".
//! A linha APAGA em vez de desabilitar: desabilitada ela perderia o foco, e com
//!   ele o Ctrl+C que interrompe o que está rodando.
export function definirRodando(v: boolean): void {
  rodando = v;
  ($("btParar") as HTMLButtonElement).disabled = !v;
  // A linha apaga em vez de desabilitar: desabilitada ela perderia o foco, e com
  // ele o Ctrl+C que interrompe o que está rodando.
  $("linhaCmd").classList.toggle("ocupada", v);
}

//? A SAÍDA DO PROCESSO — Decisão sobre o terminal que travava 17/08/2026
//!
//! 1. O processo principal empurra tudo por `exec:evento`: o que o programa
//!    escreve, o erro dele, e o FIM. Depois da virada da ADR 0025, ninguém na
//!    interface assinava esse evento — a assinatura saiu junto com o ▶ do editor
//!    antigo e não foi religada aqui.
//! 2. Consequência medida: `definirRodando(false)` só existia na partida. A
//!    PRIMEIRA linha que nascesse um processo deixava a trava ligada para
//!    sempre, e da segunda em diante toda linha ouvia "há algo rodando — pare
//!    antes". O ■ também não soltava: ele manda parar, mas quem desliga a trava
//!    é o "fim", que não chegava.
//! 3. E a saída do programa não aparecia na tela, pelo mesmo motivo.
//! 4. Um defeito só, com duas caras. Por isso a correção é uma assinatura só.
api.aoExecutar((e) => {
  switch (e.tipo) {
    case "saida":
      terminal.escrever(e.texto);
      break;
    case "erro":
      terminal.erro(e.texto);
      break;
    case "falha":
      //! Falha é o processo que nem chegou a nascer (programa que não existe,
      //! sem permissão). Solta a trava: não há o que parar.
      terminal.erro(`${e.mensagem}\r\n`);
      definirRodando(false);
      break;
    case "fim":
      //! Código 0 não vira linha na tela: o comum não merece recado. O que é
      //! maior que 0, e o sinal que matou, viram — senão o programa morre em
      //! silêncio e parece que rodou.
      //! Código NEGATIVO também não vira: é o errno de um processo que nem
      //! nasceu, e o "falha" logo acima já disse a frase certa. Medido: um
      //! comando que não existe mostrava "comando não encontrado" e, na linha
      //! seguinte, "saiu com código -2" — o mesmo fato contado duas vezes, a
      //! segunda em número que não quer dizer nada para quem lê.
      if (e.sinal) terminal.nota(`interrompido (${e.sinal})`);
      else if (e.codigo !== null && e.codigo > 0) terminal.nota(`saiu com código ${e.codigo}`);
      definirRodando(false);
      break;
  }
});

/**
 * O terminal deixou de ser só tela.
 *
 * Motivo de existir, sem rodeio: o autor foi instalar o pandas para estudar e
 * não tinha onde digitar. Uma IDE em que não se instala biblioteca não serve
 * para aprender Python, que é o propósito declarado desta.
 *
 * Três escolhas que valem a leitura:
 *
 * 1. **É um `<input>`, não digitação dentro do xterm.** Sem PTY não existe eco
 *    nem readline do outro lado; escrever no xterm significaria reimplementar
 *    cursor, seleção, colar e acentuação. O campo do sistema já faz tudo isso.
 * 2. **A pasta é a do terminal, não a do arquivo aberto**, e o `cd` a move. É o
 *    que qualquer pessoa espera, e `pip install` não tem arquivo aberto algum.
 * 3. **O eco vem antes da saída.** A linha digitada é repetida no terminal com o
 *    prompt do momento, para que rolar a saída para cima continue contando a
 *    história de quem pediu o quê — o campo esvazia, o registro fica.
 */
export const campoCmd = $("entradaCmd") as HTMLInputElement;

/** Pasta atual do terminal, em caminho absoluto. */
let pastaCmd = "";
/** Do mais recente para o mais antigo; `-1` é a linha que está sendo escrita. */
export let historicoCmd: string[] = [];
let posHistorico = -1;
let rascunhoCmd = "";

//* O nome curto da pasta atual, para o prompt.
export function rotuloDaPasta(): string {
  if (!pastaCmd) return "~";
  const projeto = projetoAberto();
  if (projeto && (pastaCmd === projeto.raiz || pastaCmd.startsWith(projeto.raiz + "/"))) {
    const dentro = pastaCmd.slice(projeto.raiz.length).replace(/^\//, "");
    return dentro ? `${projeto.nome}/${dentro}` : projeto.nome;
  }
  // Fora da pasta aberta o nome curto mentiria sobre onde o comando vai rodar.
  return pastaCmd.replace(/^\/home\/[^/]+/, "~");
}

//* Redesenha o prompt com a pasta atual.
export function pintarPrompt(): void {
  $("promptCmd").textContent = `➜ ${rotuloDaPasta()}`;
}

//* Pergunta ao sistema em que pasta a linha de comando está.
export async function sincronizarPastaCmd(): Promise<void> {
  const r = await api.pastaDoComando();
  if (r.ok) pastaCmd = r.valor;
  pintarPrompt();
}

//* Executa a linha digitada e mostra a saída no terminal.
//! Quem decide se a linha é válida é a triagem, no processo principal — aqui
//!   só se mostra o que ela respondeu.
export async function executarLinha(linha: string): Promise<void> {
  const texto = linha.trim();
  if (texto === "") return;

  // `clear` não é processo: some com o que está na tela e pronto. Fica aqui, e
  // não no processo principal, porque quem tem a tela é este lado.
  if (texto === "clear" || texto === "cls") {
    terminal.limpar();
    campoCmd.value = "";
    posHistorico = -1;
    return;
  }

  terminal.comando(rotuloDaPasta(), texto);
  campoCmd.value = "";
  posHistorico = -1;
  rascunhoCmd = "";

  const r = await api.comando(texto);

  // Repetido não empilha, para a seta ↑ não gastar dez toques em `pip list`.
  historicoCmd = [texto, ...historicoCmd.filter((x) => x !== texto)];

  if (!r.ok) {
    terminal.erro(`${r.erro}\r\n`);
    return;
  }
  pastaCmd = r.valor.pasta;
  pintarPrompt();
  if (r.valor.nota) terminal.nota(r.valor.nota);
  if (r.valor.rodando) definirRodando(true);
}

$("linhaCmd").addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (rodando) {
    terminal.nota("há algo rodando — pare antes (■ no cabeçalho, ou Ctrl+C aqui)");
    return;
  }
  void executarLinha(campoCmd.value);
});

// Clicar na faixa do prompt, e não só no campo, põe o cursor para digitar.
$("linhaCmd").addEventListener("mousedown", (ev) => {
  if (ev.target !== campoCmd) {
    ev.preventDefault();
    campoCmd.focus();
  }
});

campoCmd.addEventListener("keydown", (ev) => {
  // Ctrl+C: com algo rodando, mata — é o gesto que a mão já tem. Sem nada
  // rodando, limpa a linha, como faz qualquer shell. Com texto selecionado não
  // se mete: ali Ctrl+C é copiar, e roubar isso seria pior que não ter o gesto.
  const temSelecao = campoCmd.selectionStart !== campoCmd.selectionEnd;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "c" && !temSelecao) {
    ev.preventDefault();
    if (rodando) {
      api.parar();
      terminal.nota("^C");
    } else {
      campoCmd.value = "";
      posHistorico = -1;
    }
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "l") {
    ev.preventDefault();
    terminal.limpar();
    return;
  }

  // O histórico é uma pilha do mais recente para o mais antigo: ↑ afunda, ↓
  // volta, e voltar além do topo devolve a linha que estava escrita antes.
  if (ev.key === "ArrowUp") {
    if (posHistorico + 1 >= historicoCmd.length) return;
    ev.preventDefault();
    if (posHistorico === -1) rascunhoCmd = campoCmd.value;
    posHistorico++;
    campoCmd.value = historicoCmd[posHistorico] ?? "";
    campoCmd.setSelectionRange(campoCmd.value.length, campoCmd.value.length);
    return;
  }
  if (ev.key === "ArrowDown") {
    if (posHistorico < 0) return;
    ev.preventDefault();
    posHistorico--;
    campoCmd.value = posHistorico === -1 ? rascunhoCmd : (historicoCmd[posHistorico] ?? "");
    campoCmd.setSelectionRange(campoCmd.value.length, campoCmd.value.length);
  }
});


//* Guarda o histórico lido do config.json na partida.
export function definirHistorico(linhas: string[]): void {
  historicoCmd = linhas;
}
