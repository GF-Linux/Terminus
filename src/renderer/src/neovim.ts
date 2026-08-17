import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

/**
 * A vista do Neovim (ADR 0025): um xterm que transporta o `nvim` de verdade,
 * rodando no processo principal por PTY.
 *
 * Diferente do `TerminalSaida` (tela sem entrada), aqui a digitação vai para o
 * Neovim e o cursor é dele — `disableStdin` fica **desligado**. A casca não
 * interpreta nada do que passa: bytes do teclado sobem, sequências ANSI descem,
 * e quem desenha é o Neovim.
 */
export class VistaNeovim {
  private readonly term: Terminal;
  private readonly fit = new FitAddon();
  private readonly api = window.terminus.neovim;
  private encerrado = false;

  constructor(host: HTMLElement, cwd: string) {
    this.term = new Terminal({
      // Adwaita Mono é o fallback dos octantes (U+1CD00) do sigilo — IBM Plex
      // Mono não os cobre. O grid do xterm é fixo, então misturar fontes por
      // glifo não desalinha a arte.
      fontFamily: "'IBM Plex Mono', 'Adwaita Mono', ui-monospace, monospace",
      fontSize: 13,
      // 1.0, não 1.2: arte de blocos/octantes (o sigilo do dashboard) só cola
      // sem costura horizontal com a linha justa. 1.2 deixava tudo "picotado".
      lineHeight: 1.0,
      cursorBlink: true,
      // O provider de links e outros usos futuros pedem a API proposta.
      allowProposedApi: true,
      // O Neovim gerencia a própria tela inteira; scrollback do xterm só
      // atrapalharia (duplicaria linhas ao rolar).
      scrollback: 0,
      // Fundo transparente: quem pinta atrás é a casca, com o papel de parede
      // do Jared-Linux (o mesmo `fundo.png` do Konsole). É assim que a figura
      // pertence ao terminal em vez de parecer um PNG colado num painel — e é
      // resolução de tela, não de grade de caracteres.
      allowTransparency: true,
      theme: { background: "#00000000", foreground: "#d7d9ea" },
    });

    this.term.loadAddon(this.fit);
    this.term.open(host);
    this.ajustar();

    // saída do Neovim → tela. Assinado ANTES de iniciar, senão os primeiros
    // quadros (o dashboard) chegariam antes de haver quem os escrevesse.
    this.api.aoSaida((dados) => this.term.write(dados));
    this.api.aoEncerrar((codigo) => {
      this.encerrado = true;
      this.term.write(
        `\r\n\x1b[90m[Neovim encerrou (código ${codigo}). Recarregue o Terminus para reabrir.]\x1b[0m\r\n`,
      );
    });

    // digitação da pessoa → PTY do Neovim
    this.term.onData((d) => {
      if (!this.encerrado) this.api.enviar(d);
    });

    const ro = new ResizeObserver(() => this.ajustar());
    ro.observe(host);

    // sobe o Neovim já com o tamanho ajustado à área
    this.api.iniciar(cwd, this.term.cols, this.term.rows);
  }

  private ajustar(): void {
    // O fit lança se o host ainda não tem dimensão (primeira pintura). Não é
    // erro: é cedo demais.
    try {
      this.fit.fit();
      this.api.redimensionar(this.term.cols, this.term.rows);
    } catch {
      /* host sem dimensão ainda */
    }
  }

  focar(): void {
    this.term.focus();
  }

  reajustar(): void {
    this.ajustar();
  }
}
