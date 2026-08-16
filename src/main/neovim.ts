import { spawn, type IPty } from "node-pty";
import { rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import * as path from "node:path";

/**
 * O motor de edição passa a ser o Neovim (ADR 0025).
 *
 * Ele nasce dentro de um pseudo-terminal (node-pty): o `nvim` de verdade se
 * desenha sozinho — cores, plugins, LazyVim, Copilot, tudo funciona como no
 * terminal do sistema — e a casca só transporta bytes entre ele e o xterm do
 * renderizador. É o oposto do `TerminalSaida`, que era tela sem PTY; aqui há
 * PTY, então a digitação vai para o Neovim e o cursor é dele.
 *
 * **Isto exige node-pty compilado para o ABI do Electron** (`electron-rebuild`).
 * Na máquina do Deck isso era impossível (sem gcc); no Jared-Linux (Fedora) o
 * compilador existe. É a razão técnica de a virada morar nesta máquina.
 *
 * `--listen <socket>` abre um canal msgpack-RPC de controle para a próxima fatia:
 * é por ali que o Explorer clicável vai mandar `:edit` e o Ctrl+S da casca vai
 * virar `:w`. Inerte enquanto ninguém conecta.
 */

/** O socket de controle do Neovim desta sessão (Fatia 2). */
export const SOCKET_NEOVIM = path.join(tmpdir(), "bancada-nvim.sock");

let proc: IPty | null = null;

export interface OpcoesNeovim {
  /** Pasta onde o Neovim abre — a corrida aberta, ou a home na falta dela. */
  cwd: string;
  cols: number;
  rows: number;
  /** Saída do Neovim (sequências ANSI cruas) rumo ao xterm. */
  aoSaida: (dados: string) => void;
  /** O processo do Neovim terminou (`:qa`, queda, kill). */
  aoSair: (codigo: number) => void;
}

export function iniciarNeovim(op: OpcoesNeovim): void {
  pararNeovim();

  // `nvim --listen` recusa subir se o socket já existe. Um resto de sessão que
  // caiu mal deixaria o editor sem abrir, sem dizer por quê.
  try {
    rmSync(SOCKET_NEOVIM, { force: true });
  } catch {
    /* nada a remover */
  }

  // `--cmd` roda antes de qualquer config, e o autocmd fica de pé para toda a
  // sessão. Ele responde sozinho ao aviso de swap file (E325): a Bancada abre
  // arquivo por RPC, que é não-interativo, então um prompt de swap trava o
  // comando e volta E325 em vez de abrir. `v:swapchoice='e'` = "editar assim
  // mesmo" — seguro aqui porque a Bancada roda uma instância só, então todo swap
  // encontrado é resto de sessão morta, não outro Neovim vivo com o arquivo.
  proc = spawn("nvim", ["--cmd", "autocmd SwapExists * let v:swapchoice = 'e'", "--listen", SOCKET_NEOVIM], {
    name: "xterm-256color",
    cols: Math.max(2, op.cols),
    rows: Math.max(1, op.rows),
    cwd: op.cwd || homedir(),
    env: {
      ...process.env,
      TERM: "xterm-256color",
      // Sem isto o Neovim cai para 8 cores e o tema fica irreconhecível.
      COLORTERM: "truecolor",
      // Marca que este Neovim roda dentro da casca. A config lê isto para esconder
      // o que a Bancada já faz (o menu do dashboard) sem mexer no Neovim solto.
      BANCADA: "1",
    },
  });

  proc.onData(op.aoSaida);
  proc.onExit(({ exitCode }) => {
    proc = null;
    op.aoSair(exitCode);
  });
}

/** Digitação da pessoa (e sequências de controle do xterm) rumo ao Neovim. */
export function enviarNeovim(dados: string): void {
  proc?.write(dados);
}

export function redimensionarNeovim(cols: number, rows: number): void {
  if (proc && cols > 0 && rows > 0) proc.resize(cols, rows);
}

export function pararNeovim(): void {
  proc?.kill();
  proc = null;
}

export function neovimRodando(): boolean {
  return proc !== null;
}
