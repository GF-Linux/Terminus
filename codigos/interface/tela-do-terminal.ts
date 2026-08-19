import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

/**
 * O terminal.
 *
 * xterm.js, e agora com PTY DE VERDADE atrás (`motor-do-shell-pty.ts`, 19/08).
 * Antes disto era só uma TELA: o processo principal rodava o comando com canos
 * comuns e mandava o texto para cá.
 *
 * O que muda, e por que a mudança existe: sem PTY, todo programa que se pergunta
 * se fala com um terminal responde "não" e desliga a cor sozinho. Medido:
 *
 *     ls --color=auto        por cano  b'alsa\n...'          <- sem cor
 *                            por PTY   b'\x1b[01;34malsa...'  <- com cor
 *     sys.stdout.isatty()    por cano  False    por PTY  True
 *
 * Era esse o defeito relatado — "o Konsole mostra cor e o Terminus não". Não era
 * tema, nem xterm.js: era a falta do pseudo-terminal.
 *
 * **A digitação agora acontece DENTRO desta tela**, e não mais num `<input>`
 * abaixo dela. O campo existia porque sem PTY não havia eco nem readline do
 * outro lado, então escrever no xterm obrigaria a reimplementar cursor,
 * histórico e edição de linha à mão. Com um shell de verdade quem faz tudo isso
 * é o `readline` do bash — o mesmo que faz no Konsole, e melhor do que a nossa
 * cópia fazia: `Tab` completa, `Ctrl+R` procura no histórico, `Ctrl+A`/`Ctrl+E`
 * andam na linha.
 *
 * É o mesmo desenho que a `vista-do-neovim.ts` já usava desde a ADR 0025. Duas
 * telas, um jeito só: teclado sobe, ANSI desce, e esta classe não interpreta
 * nada do que passa.
 */
/**
 * A linha de quadro de um traceback do Python:
 *
 *     File "/home/deck/corridas/18S/medir_gc.py", line 12, in <module>
 *
 * O caminho é capturado inteiro entre aspas, então nome com espaço funciona. O
 * `python -u` que o Terminus usa recebe caminho absoluto, então o que vem aqui
 * também é absoluto — inclusive para quadros dentro de bibliotecas, que abrem
 * em modo leitura como em qualquer IDE.
 */
const QUADRO = /File "([^"]+)", line (\d+)/g;

export interface DestinoTraceback {
  arquivo: string;
  linha: number;
}

export interface OpcoesTerminal {
  /** Clique num quadro de traceback. Sem isto, o quadro não vira link. */
  aoAbrirQuadro?: (d: DestinoTraceback) => void;
  /** O que se digitou, rumo ao shell. Bytes crus, sem interpretação daqui. */
  aoDigitar?: (dados: string) => void;
  /** A tela mudou de medida: o shell precisa saber, senão desenha torto. */
  aoRedimensionar?: (cols: number, rows: number) => void;
}

export class TerminalSaida {
  private readonly term: Terminal;
  private readonly fit = new FitAddon();
  private readonly aoRedimensionar: ((cols: number, rows: number) => void) | undefined;
  /** Última medida avisada ao shell, para não repetir o mesmo aviso. */
  private ultimaMedida = "";

  constructor(host: HTMLElement, opcoes: OpcoesTerminal = {}) {
    this.aoRedimensionar = opcoes.aoRedimensionar;
    this.term = new Terminal({
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      fontSize: 12,
      lineHeight: 1.5,
      //! Agora há entrada de verdade: o cursor pisca porque ele de fato espera
      //! digitação. Antes ficava sublinhado e parado justamente para não
      //! prometer o que não havia.
      cursorBlink: true,
      cursorStyle: "block",
      disableStdin: false,
      //! FORA. `convertEol` transformava `\n` em `\r\n` porque o texto vinha de
      //! um cano, onde só há `\n`. Um PTY já manda `\r\n` — converter de novo
      //! empurraria toda linha uma a mais para baixo, e programa de tela cheia
      //! (`htop`, `nano`) desenharia em escada.
      convertEol: false,
      //! O histórico de rolagem é da tela. Programa de tela cheia usa a tela
      //! alternativa e não suja este rolo, como no Konsole.
      scrollback: 5000,
      theme: {
        // Mesmos dois fundos e mesma base com alfa da casca.
        background: "#14161f",
        foreground: "#d7d9eac2",
        cursor: "#b9bef2",
        selectionBackground: "#d7d9ea1f",
        black: "#14161f",
        red: "#f0574f",
        green: "#3fc46b",
        yellow: "#e9b949",
        blue: "#8f95d6",
        magenta: "#b9bef2",
        cyan: "#82d2ce",
        white: "#d7d9eac2",
        brightBlack: "#d7d9ea61",
        brightWhite: "#d7d9ea",
      },
    });

    this.term.loadAddon(this.fit);
    this.term.open(host);
    this.ajustar();

    if (opcoes.aoAbrirQuadro) this.ligarTraceback(opcoes.aoAbrirQuadro);
    if (opcoes.aoDigitar) this.term.onData(opcoes.aoDigitar);

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
      background: cor("--chrome", "#14161f"),
      foreground: cor("--fg74", "#d7d9eac2"),
      black: cor("--chrome", "#14161f"),
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
    //! O shell precisa saber a medida nova, senão a quebra de linha dele fica na
    //! antiga. O `ResizeObserver` dispara muito (arrastar o divisor é um evento
    //! por pixel), então só avisa quando a medida REALMENTE mudou: cada aviso
    //! vira um SIGWINCH, e programa de tela cheia se redesenha inteiro a cada um.
    const medida = `${this.term.cols}x${this.term.rows}`;
    if (medida !== this.ultimaMedida) {
      this.ultimaMedida = medida;
      this.aoRedimensionar?.(this.term.cols, this.term.rows);
    }
  }

  /** As medidas atuais, para a partida do shell nascer no tamanho certo. */
  get cols(): number {
    return this.term.cols;
  }
  get rows(): number {
    return this.term.rows;
  }

  //* Põe o cursor aqui. Quem abre o painel do terminal vai digitar.
  focar(): void {
    this.term.focus();
  }

  escrever(texto: string): void {
    this.term.write(texto);
  }

  //! O método `comando()` saiu (19/08). Ele desenhava `➜ pasta` e ecoava a linha
  //! digitada, porque sem shell ninguém mais faria isso. O bash tem prompt
  //! próprio — o da pessoa, com as cores e o git dela — e ecoa sozinho.

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
