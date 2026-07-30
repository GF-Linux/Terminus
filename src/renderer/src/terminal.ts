import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

/**
 * O terminal.
 *
 * xterm.js conforme a ADR 0003, mas **somente como tela**: não há PTY por trás.
 * node-pty é módulo nativo e a máquina de desenvolvimento (SteamOS) não tem gcc
 * nem make, com a raiz somente-leitura. O processo principal roda o script com
 * canos comuns e manda o texto para cá.
 *
 * Consequência visível: o cursor não pisca esperando digitação, `input()` trava o
 * script, e programas que checam `isatty` não colorem a saída. Está registrado em
 * src/main/execucao.ts.
 */
/**
 * A linha de quadro de um traceback do Python:
 *
 *     File "/home/deck/corridas/18S/medir_gc.py", line 12, in <module>
 *
 * O caminho é capturado inteiro entre aspas, então nome com espaço funciona. O
 * `python -u` que a Bancada usa recebe caminho absoluto, então o que vem aqui
 * também é absoluto — inclusive para quadros dentro de bibliotecas, que abrem
 * em modo leitura como em qualquer IDE.
 */
const QUADRO = /File "([^"]+)", line (\d+)/g;

export interface DestinoTraceback {
  arquivo: string;
  linha: number;
}

export class TerminalSaida {
  private readonly term: Terminal;
  private readonly fit = new FitAddon();

  constructor(host: HTMLElement, aoAbrirQuadro?: (d: DestinoTraceback) => void) {
    this.term = new Terminal({
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      fontSize: 12,
      lineHeight: 1.5,
      cursorBlink: false,
      // Sem PTY não há entrada: deixar o cursor visível prometeria digitação.
      cursorStyle: "underline",
      disableStdin: true,
      convertEol: true,
      scrollback: 5000,
      theme: {
        // Mesmos dois fundos e mesma base com alfa da casca.
        background: "#141414",
        foreground: "#f0f0f0bd",
        cursor: "#f0f0f05c",
        selectionBackground: "#f0f0f01e",
        black: "#141414",
        red: "#f0574f",
        green: "#3fc46b",
        yellow: "#e9b949",
        blue: "#4d96ff",
        magenta: "#e394dc",
        cyan: "#82d2ce",
        white: "#f0f0f0bd",
        brightBlack: "#f0f0f05c",
        brightWhite: "#f0f0f0",
      },
    });

    this.term.loadAddon(this.fit);
    this.term.open(host);
    this.ajustar();

    if (aoAbrirQuadro) this.ligarTraceback(aoAbrirQuadro);

    const ro = new ResizeObserver(() => this.ajustar());
    ro.observe(host);
  }

  /**
   * Torna cada quadro do traceback clicável.
   *
   * Usa o `registerLinkProvider` do próprio xterm — que já cuida do sublinhado
   * ao passar o mouse, do cursor e da faixa exata de células — em vez de
   * varrer o DOM procurando texto, que quebraria assim que a saída rolasse.
   */
  private ligarTraceback(abrir: (d: DestinoTraceback) => void): void {
    this.term.registerLinkProvider({
      provideLinks: (y, retorno) => {
        const linha = this.term.buffer.active.getLine(y - 1);
        if (!linha) return retorno(undefined);

        const texto = linha.translateToString(true);
        const achados = [];
        QUADRO.lastIndex = 0;

        for (const m of texto.matchAll(QUADRO)) {
          const inicio = m.index;
          achados.push({
            // O xterm conta células a partir de 1 e inclui o fim.
            range: {
              start: { x: inicio + 1, y },
              end: { x: inicio + m[0].length, y },
            },
            text: m[0],
            activate: () => abrir({ arquivo: m[1]!, linha: Number(m[2]) }),
          });
        }
        retorno(achados.length > 0 ? achados : undefined);
      },
    });
  }

  private ajustar(): void {
    // O fit lança se o host ainda não tem dimensão (painel fechado, primeira
    // pintura). Não é erro: é só cedo demais.
    try {
      this.fit.fit();
    } catch {
      /* host sem dimensão ainda */
    }
  }

  escrever(texto: string): void {
    this.term.write(texto);
  }

  /** Linha de comando, no tom do protótipo: seta + nome da pasta. */
  comando(pasta: string, comando: string): void {
    this.term.write(`\x1b[36m➜ ${pasta}\x1b[0m ${comando}\r\n`);
  }

  nota(texto: string): void {
    this.term.write(`\x1b[90m${texto}\x1b[0m\r\n`);
  }

  erro(texto: string): void {
    this.term.write(`\x1b[31m${texto}\x1b[0m`);
  }

  limpar(): void {
    this.term.clear();
  }

  reajustar(): void {
    this.ajustar();
  }
}
