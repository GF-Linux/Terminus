import { BrowserWindow } from "electron";
import * as path from "node:path";

//? JANELA DO TERMINAL — Decisão sobre soltar o terminal da casca 17/08/2026
//!
//! 1. Pedido antigo: poder mudar o terminal de lugar, ou tirá-lo para uma janela
//!    própria. A primeira metade virou a doca (rodapé, direita, esquerda) na
//!    ADR 0006; esta é a segunda.
//! 2. Para que serve, sem rodeio: com dois monitores, ou com a janela do
//!    Terminus estreita, o terminal encostado come a área de escrita. Solto, ele
//!    vai para onde sobra tela.
//! 3. É UMA janela, no máximo. Duas janelas de terminal disputariam o mesmo
//!    processo (há um por vez) e ninguém saberia qual delas está rodando o quê.
//! 4. Fechar a janela DEVOLVE o terminal para a casca. Fechar não pode ser um
//!    jeito de perder o terminal de vista sem saber como trazê-lo de volta.

let janela: BrowserWindow | null = null;

/** Chamado quando a janela some, para a casca voltar a mostrar o painel. */
let aoFechar: (() => void) | null = null;

export function ligarAvisoDeFechamento(f: () => void): void {
  aoFechar = f;
}

export function terminalEstaSolto(): boolean {
  return janela !== null && !janela.isDestroyed();
}

/**
 * Abre a janela do terminal, ou traz para frente a que já existe.
 *
 * `pai` serve só para posicionar a janela nova ao lado da casca — não é uma
 * janela filha de verdade (`parent`), de propósito: filha fica sempre por cima
 * e não aparece na barra de tarefas, e o objetivo aqui é o contrário, poder
 * jogar o terminal para o outro monitor e alternar com Alt+Tab.
 */
export function soltarTerminal(pai: BrowserWindow, dirPreload: string, dirRenderer: string, urlDev?: string): void {
  if (terminalEstaSolto()) {
    janela!.show();
    janela!.focus();
    return;
  }

  const [x, y] = pai.getPosition();
  const [largura] = pai.getSize();

  janela = new BrowserWindow({
    width: 760,
    height: 460,
    //! Nasce à direita da casca, e não em cima dela: aparecer por cima esconderia
    //! justamente a tela que se quis liberar.
    x: x + largura + 12,
    y: y + 60,
    title: "Terminal — Terminus",
    backgroundColor: "#0c0e16",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(dirPreload, "index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (urlDev) void janela.loadURL(`${urlDev}/interface/pagina-do-terminal.html`);
  else void janela.loadFile(path.join(dirRenderer, "interface", "pagina-do-terminal.html"));

  janela.on("closed", () => {
    janela = null;
    aoFechar?.();
  });
}

//* Fecha a janela e devolve o terminal para a casca.
export function devolverTerminal(): void {
  if (terminalEstaSolto()) janela!.close();
}

//* Todas as janelas vivas, para a saída de um comando chegar às duas.
//! Sem isto, a saída ia só para quem pediu (`e.sender`): mandar rodar pelo botão
//! da casca com o terminal solto imprimiria numa tela escondida.
export function janelasVivas(casca: BrowserWindow | null): BrowserWindow[] {
  const todas = [casca, janela];
  return todas.filter((j): j is BrowserWindow => j !== null && !j.isDestroyed());
}
