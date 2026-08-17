//! A linha de comando do terminal. Sem shell: o que se digita vira programa e
//! argumentos separados, e metacaractere é recusado com explicação.

import { $, api, estado, terminal } from "./nucleo-da-casca.js";


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
  if (estado.projeto && (pastaCmd === estado.projeto.raiz || pastaCmd.startsWith(estado.projeto.raiz + "/"))) {
    const dentro = pastaCmd.slice(estado.projeto.raiz.length).replace(/^\//, "");
    return dentro ? `${estado.projeto.nome}/${dentro}` : estado.projeto.nome;
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
