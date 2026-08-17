//! Núcleo da casca — o que TODOS os painéis usam.
//!
//! Existe para o resto poder ser cortado em arquivos por assunto. Quem mexe num
//! painel não precisa ler isto; quem mexe aqui mexe em todo mundo.

import type { NoArquivo, ProjetoAberto, Resultado } from "../compartilhado/tipos.js";
import { VistaNeovim } from "./vista-do-neovim.js";
import { TerminalSaida } from "./tela-do-terminal.js";
import urlMarca from "../../media/marca.png";
import urlIcone from "../../media/icon.png";

//* A ÚNICA porta para o sistema. Tudo que sai da tela passa por aqui.
export const api = window.terminus;

//* Acha um elemento da página pelo id, e ESTOURA se ele não existir.
//* O estouro é de propósito: id que sumiu do HTML vira erro na hora de abrir, e
//* não uma tela meio montada que ninguém entende.
export const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} não existe na pagina.html`);
  return el as T;
};


/** As aspas contam tanto quanto os sinais de maior e menor: o nome do arquivo
 *  entra dentro de `data-arquivo="..."`, e aspa dupla é nome POSIX legal que
 *  sobrevive a `unzip` e a `git checkout`. Sem escapá-la, um nome fecha o
 *  atributo cedo e acrescenta os que quiser — e o despachante de clique decide
 *  o que fazer olhando só para os `data-*` que encontra. */
export const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");


//* O estado que mais de um painel lê e escreve.
//* É um objeto, e não variáveis soltas, porque módulo de JavaScript não deixa
//* quem importa trocar o valor de uma variável — só o conteúdo de um objeto.
export const estado: {
  projeto: ProjetoAberto | null;
  pastaAlvo: string | null;
  renomeando: { modo: "arquivo" | "pasta" | "renomear"; dir: string; alvo?: string } | null;
  recentes: string[];
} = { projeto: null, pastaAlvo: null, renomeando: null, recentes: [] };

//* As pastas abertas na árvore, por caminho absoluto, com o que há dentro.
export const expandidas = new Map<string, NoArquivo[]>();

//* O Neovim é o editor: nasce aqui, ocupando a área de escrita.
document.body.classList.add("motor-neovim");
const hostNeovim = document.createElement("div");
hostNeovim.id = "neovimHost";
$("stage").appendChild(hostNeovim);
export const vistaNeovim = new VistaNeovim(hostNeovim, "");

//* A tela do terminal da casca. O clique num quadro de traceback abre o arquivo
//* na linha do erro.
export const terminal = new TerminalSaida($("term"), ({ arquivo, linha }) => {
  void abrirArquivo(arquivo, linha);
});

//* Abre um arquivo no Neovim e já entra em modo de escrita.
//* É o caminho único: clique na árvore, Ctrl+P e traceback chegam todos aqui.
export async function abrirArquivo(caminho: string, linha?: number): Promise<void> {
  const r = await api.neovim.abrir(caminho, linha);
  if (!r.ok) {
    terminal.erro(`${r.erro}\r\n`);
    abrirPainel();
    return;
  }
  vistaNeovim.focar();
}

//* Mostra ou esconde o painel do terminal, junto com o divisor dele.
export function definirPainel(aberto: boolean): void {
  $("painel").classList.toggle("oculto", !aberto);
  $("divTerm").classList.toggle("oculto", !aberto);
  $("btPainel").classList.toggle("on", aberto);
  if (aberto) terminal.reajustar();
}

//* Abre o painel SEM roubar o foco — é chamado sozinho quando aparece saída, e
//* roubar o cursor no meio de uma frase seria pior que não mostrar.
export function abrirPainel(): void {
  definirPainel(true);
}

//* Desembrulha um Resultado da ponte, mostrando o erro no terminal em vez de
//* sumir com ele em silêncio.
export function ou<T>(r: Resultado<T>, aoFalhar: T): T {
  if (r.ok) return r.valor;
  terminal.erro(`${r.erro}\r\n`);
  abrirPainel();
  return aoFalhar;
}

//* Abre e fecha o painel do terminal, e ao ABRIR põe o cursor na linha de
//* comando — quem aperta o atalho vai digitar.
export function alternarPainel(): void {
  const abrindo = $("painel").classList.contains("oculto");
  definirPainel(abrindo);
  if (abrindo) $("entradaCmd").focus();
}

//* Recado de algo que aconteceu fora da vista. Vai para o terminal porque a
//* barra de estado não tem mais campo de recado — e nada pode ser engolido.
export function avisar(texto: string): void {
  terminal.nota(texto);
}

//* A marca entra por import, e não por caminho no HTML: em desenvolvimento o
//* servidor do Vite devolve a página no lugar do arquivo (medido: content-type
//* text/html) e o ícone simplesmente não aparece.
($("imgMarca") as HTMLImageElement).src = urlMarca;
($("imgMarcaGrande") as HTMLImageElement).src = urlIcone;

/**
 * Torna um painel arrastável (ADR 0006).
 *
 * A medida vai no estilo do próprio painel e fica guardada no `localStorage`:
 * quem alarga o terminal uma vez está dizendo como trabalha, e reabrir o app
 * estreito de novo obrigaria a repetir o gesto todo dia.
 *
 * O limite superior é uma função e não um número porque a janela muda de
 * tamanho — o Deck troca de resolução ao ligar o HDMI, e uma largura gravada
 * num monitor grande deixaria o editor com nada na tela pequena.
 */
export function ligarDivisor(opcoes: {
  divisor: HTMLElement;
  painel: HTMLElement;
  eixo: "largura" | "altura";
  /** De que lado do painel está o divisor — muda o sinal do arraste. */
  borda?: "inicio" | "fim";
  padrao: number;
  min: number;
  max: () => number;
  chave: string;
  aoMudar?: () => void;
}): void {
  const { divisor, painel, eixo, padrao, min, max, chave, aoMudar } = opcoes;
  const borda = opcoes.borda ?? "fim";
  const prop = eixo === "largura" ? "width" : "height";

  const aplicar = (valor: number): void => {
    const teto = Math.max(min, max());
    painel.style[prop] = `${Math.round(Math.min(teto, Math.max(min, valor)))}px`;
    aoMudar?.();
  };

  const guardado = Number(localStorage.getItem(chave));
  if (Number.isFinite(guardado) && guardado > 0) aplicar(guardado);

  divisor.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    divisor.setPointerCapture(ev.pointerId);
    divisor.classList.add("arrastando");
    // Enquanto arrasta, o cursor manda em tudo: sem isto o ponteiro vira barra
    // de texto ao passar por cima do editor no meio do arraste.
    document.body.style.cursor = eixo === "largura" ? "ew-resize" : "ns-resize";

    const mover = (e: PointerEvent): void => {
      const r = painel.getBoundingClientRect();
      // A borda oposta à do divisor é o ponto fixo: a medida é a distância dela
      // até o ponteiro. Assim o divisor gruda no cursor mesmo quando o arraste
      // passa do limite e volta.
      aplicar(
        eixo === "largura"
          ? borda === "fim"
            ? r.right - e.clientX
            : e.clientX - r.left
          : r.bottom - e.clientY,
      );
    };
    const soltar = (): void => {
      divisor.classList.remove("arrastando");
      document.body.style.cursor = "";
      divisor.removeEventListener("pointermove", mover);
      divisor.removeEventListener("pointerup", soltar);
      divisor.removeEventListener("pointercancel", soltar);
      localStorage.setItem(chave, String(parseFloat(painel.style[prop]) || padrao));
    };

    divisor.addEventListener("pointermove", mover);
    divisor.addEventListener("pointerup", soltar);
    divisor.addEventListener("pointercancel", soltar);
  });

  // Duplo clique volta ao padrão: é a saída de quem arrastou demais e não
  // consegue mais pegar o divisor.
  divisor.addEventListener("dblclick", () => {
    aplicar(padrao);
    localStorage.setItem(chave, String(padrao));
  });
}

