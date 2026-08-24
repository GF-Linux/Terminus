import { attach, type NeovimClient } from "neovim";
import type { PluginNvim } from "../../compartilhado/tipos.js";
import { SOCKET_NEOVIM } from "./motor-neovim-pty.js";

//? CONTROLE DO NEOVIM (RPC) — Decisão sobre quem manda nos comandos 16/08/2026
//!
//! 1. O motor é o Neovim, mas a casca é dona de um punhado de comandos do dia a
//!    dia: gravar, desfazer, abrir arquivo, abrir terminal.
//! 2. Eles são executados por msgpack-RPC no socket que o `--listen` abriu, e
//!    NÃO por teclas.
//! 3. A diferença é o projeto inteiro: ex-comando por RPC não mexe no modo.
//! 4. Por isso o Ctrl+S grava sem tirar a pessoa da escrita. O LazyVim mapeia
//!    `<C-s>` como `<Esc>:w`, que gravava e jogava para fora do modo de inserção.
//! 5. A casca intercepta o Ctrl+S antes de ele virar tecla e manda o `write`
//!    por aqui.
let cliente: NeovimClient | null = null;
let conectando: Promise<NeovimClient | null> | null = null;

//* Descarta a conexão com o Neovim. Chame quando ele (re)nasce.
//! NÃO fecha o Neovim: `quit()` aqui mataria o editor. O que morreu foi o
//!   socket, não o processo.
export function resetarControle(): void {
  cliente = null;
  conectando = null;
}

//* Devolve a conexão viva com o Neovim, criando-a na primeira chamada.
//* Tenta por ~3 s porque o socket surge um instante depois do `spawn` — e
//* alguém pode apertar Ctrl+S antes disso.
async function obter(): Promise<NeovimClient | null> {
  if (cliente) return cliente;
  if (conectando) return conectando;
  conectando = (async () => {
    // O socket surge um instante depois do spawn; algumas tentativas cobrem a
    // corrida entre o editor abrir e alguém apertar Ctrl+S logo de cara.
    for (let tentativa = 0; tentativa < 25; tentativa++) {
      try {
        const c = attach({ socket: SOCKET_NEOVIM });
        // uma chamada real confirma que o outro lado responde
        await c.eval("1");
        cliente = c;
        conectando = null;
        return c;
      } catch {
        await new Promise((r) => setTimeout(r, 120));
      }
    }
    conectando = null;
    return null;
  })();
  return conectando;
}

//* Executa um ex-comando (`:write`, `:undo`) SEM tocar no modo atual.
//* Se o socket morreu no meio, esquece a conexão para a próxima chamada
//* reconectar em vez de falhar para sempre.
async function comando(cmd: string): Promise<void> {
  const c = await obter();
  if (!c) throw new Error("Neovim não respondeu ao canal de controle.");
  try {
    await c.command(cmd);
  } catch (err) {
    resetarControle();
    throw err;
  }
}

//* Grava o arquivo aberto — sem tirar a pessoa do modo de escrita.
export async function salvarNeovim(): Promise<void> {
  await comando("silent! write");
}

//* Desfaz a última mudança (o Ctrl+Z da casca).
export async function desfazerNeovim(): Promise<void> {
  await comando("silent! undo");
}

//* Refaz o que foi desfeito (Ctrl+Shift+Z).
export async function refazerNeovim(): Promise<void> {
  await comando("silent! redo");
}

//* Abre um arquivo e já entra em modo de escrita.
//* Com `linha`, o cursor para direto nela — é o clique no traceback.
//! O nome do arquivo é escapado pelo PRÓPRIO Neovim (`fnameescape`): caminho
//!   com espaço, `#` ou `%` chega inteiro.
export async function abrirNoNeovim(caminho: string, linha?: number): Promise<void> {
  const c = await obter();
  if (!c) throw new Error("Neovim não respondeu ao canal de controle.");
  const escapado = (await c.call("fnameescape", [caminho])) as string;
  await c.command(`edit ${escapado}`);
  // A linha vem do quadro de traceback clicado no terminal: abrir o arquivo e
  // deixar a pessoa procurando a linha do erro seria metade do favor.
  if (typeof linha === "number" && Number.isInteger(linha) && linha > 0) {
    await c.command(`${linha}`);
    await c.command("normal! zz");
  }
  await c.command("startinsert");
}

//* Abre um terminal do Neovim (com PTY) num rasgo embaixo do editor.
//* É a resposta ao Alt+T que o KDE rouba: a casca é dona deste comando.
export async function abrirTerminalNeovim(): Promise<void> {
  const c = await obter();
  if (!c) throw new Error("Neovim não respondeu ao canal de controle.");
  await c.command("belowright split | resize 14 | terminal");
  await c.command("startinsert");
}

//* Pergunta ao lazy.nvim quais plugins existem, e se estão carregados.
//* Alimenta o painel lateral que substituiu o "Extensions".
export async function pluginsNeovim(): Promise<PluginNvim[]> {
  const c = await obter();
  if (!c) throw new Error("Neovim não respondeu ao canal de controle.");
  const codigo = `
    local ok, lazy = pcall(require, "lazy")
    if not ok then return {} end
    local out = {}
    for _, p in ipairs(lazy.plugins()) do
      out[#out + 1] = {
        nome = p.name or "?",
        url = p.url or "",
        dir = p.dir or "",
        carregado = (p._ and p._.loaded) ~= nil,
      }
    end
    table.sort(out, function(a, b) return a.nome:lower() < b.nome:lower() end)
    return out
  `;
  const r = (await c.request("nvim_exec_lua", [codigo, []])) as PluginNvim[];
  return Array.isArray(r) ? r : [];
}

//* Aponta a pasta de trabalho do Neovim para a pasta aberta na casca.
export async function cdNeovim(pasta: string): Promise<void> {
  const c = await obter();
  if (!c || !pasta) return;
  const escapado = (await c.call("fnameescape", [pasta])) as string;
  await c.command(`cd ${escapado}`);
}
