import { spawn, type IPty } from "node-pty";
import { rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import * as path from "node:path";

//? MOTOR NEOVIM (PTY) — Decisão sobre o motor de edição 16/08/2026
//!
//! 1. O editor do Terminus é o Neovim de verdade, num pseudo-terminal (node-pty).
//! 2. Ele se desenha sozinho: cores, plugins, LazyVim e Copilot funcionam como no
//!    terminal do sistema. A casca só transporta bytes.
//! 3. Aqui HÁ PTY — a digitação vai para o Neovim e o cursor é dele. É o oposto
//!    da tela do terminal da casca, que não tem PTY.
//! 4. Exige node-pty compilado para o ABI do Electron (`npx electron-rebuild
//!    -f -w node-pty`). Sem compilador C++ na máquina, nada disto sobe.
//! 5. `--listen <socket>` abre o canal de controle msgpack-RPC. Quem o usa é o
//!    `controle-neovim-rpc.ts`.
/** O socket de controle do Neovim desta sessão (Fatia 2). */
export const SOCKET_NEOVIM = path.join(tmpdir(), "terminus-nvim.sock");

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

//* Sobe o Neovim dentro de um pseudo-terminal, na pasta pedida.
//! Mata o anterior antes: um Neovim por janela, senão dois disputam o socket.
//! Apaga o socket velho — `nvim --listen` RECUSA subir se o arquivo já existe,
//!   e um resto de sessão travada deixaria o editor sem abrir, sem dizer por quê.
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
  // sessão. Ele responde sozinho ao aviso de swap file (E325): o Terminus abre
  // arquivo por RPC, que é não-interativo, então um prompt de swap trava o
  // comando e volta E325 em vez de abrir. `v:swapchoice='e'` = "editar assim
  // mesmo" — seguro aqui porque o Terminus roda uma instância só, então todo swap
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
      // o que o Terminus já faz (o menu do dashboard) sem mexer no Neovim solto.
      BANCADA: "1",
    },
  });

  proc.onData(op.aoSaida);
  proc.onExit(({ exitCode }) => {
    proc = null;
    op.aoSair(exitCode);
  });
}

//* Manda a digitação da pessoa (e as teclas de controle) para o Neovim.
export function enviarNeovim(dados: string): void {
  proc?.write(dados);
}

//* Avisa o Neovim que a área mudou de tamanho, em colunas e linhas.
export function redimensionarNeovim(cols: number, rows: number): void {
  if (proc && cols > 0 && rows > 0) proc.resize(cols, rows);
}

//* Mata o Neovim desta janela.
export function pararNeovim(): void {
  proc?.kill();
  proc = null;
}
