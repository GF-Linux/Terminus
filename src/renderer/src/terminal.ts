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

    // O xterm pinta o próprio fundo, então trocar o tema da casca (ADR 0010)
    // exige avisá-lo — senão o terminal fica com a cor do tema anterior.
    window.addEventListener("bancada:tema", () => this.acompanharTema());
  }

  private acompanharTema(): void {
    const css = getComputedStyle(document.documentElement);
    const cor = (nome: string, reserva: string): string =>
      css.getPropertyValue(nome).trim() || reserva;
    this.term.options.theme = {
      ...this.term.options.theme,
      background: cor("--chrome", "#141414"),
      foreground: cor("--fg74", "#f0f0f0bd"),
      black: cor("--chrome", "#141414"),
    };
  }

  /**
   * Torna cada quadro do traceback clicável.
   *
   * Usa o `registerLinkProvider` do próprio xterm — que já cuida do sublinhado
   * ao passar o mouse, do cursor e da faixa exata de células — em vez de
   * varrer o DOM procurando texto, que quebraria assim que a saída rolasse.
   *
   * **A linha lógica é remontada antes de casar o padrão.** Desde a ADR 0006 o
   * terminal fica em pé à direita, e numa coluna estreita `File "/home/…/x.py",
   * line 12` quase sempre quebra em duas linhas físicas. Casando linha por
   * linha, o quadro partido no meio simplesmente deixava de virar link — o
   * recurso morreria justamente onde é mais necessário.
   */
  private ligarTraceback(abrir: (d: DestinoTraceback) => void): void {
    this.term.registerLinkProvider({
      provideLinks: (y, retorno) => {
        const buffer = this.term.buffer.active;
        if (!buffer.getLine(y - 1)) return retorno(undefined);

        // Volta até o começo da linha lógica. O xterm pergunta por UMA linha
        // física — a que está sob o mouse — e ela pode ser o meio de um caminho
        // quebrado; sem recuar, meia linha nunca casa o padrão.
        let inicioY = y;
        while (buffer.getLine(inicioY - 1)?.isWrapped) inicioY--;

        // Emenda as continuações. Só a última pode ter espaço à direita
        // aparado: as do meio ocupam a largura inteira, e aparar encostaria
        // caracteres que estão separados.
        const colunas = this.term.cols;
        let texto = "";
        for (let i = inicioY; ; i++) {
          const atual = buffer.getLine(i - 1);
          if (!atual) break;
          const continua = buffer.getLine(i)?.isWrapped === true;
          texto += atual.translateToString(!continua);
          if (!continua) break;
        }

        const achados = [];
        for (const m of texto.matchAll(QUADRO)) {
          const inicio = m.index;
          const fim = inicio + m[0].length - 1;
          achados.push({
            // O xterm conta células a partir de 1 e inclui o fim. Como cada
            // linha emendada contribuiu exatamente `cols` células, a conta de
            // volta para (linha, coluna) é divisão inteira.
            range: {
              start: { x: (inicio % colunas) + 1, y: inicioY + Math.floor(inicio / colunas) },
              end: { x: (fim % colunas) + 1, y: inicioY + Math.floor(fim / colunas) },
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
