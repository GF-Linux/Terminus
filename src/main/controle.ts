import { attach, type NeovimClient } from "neovim";
import type { PluginNvim } from "../shared/tipos.js";
import { SOCKET_NEOVIM } from "./neovim.js";

/**
 * O canal de controle do Neovim (Fatia 2, ADR 0025).
 *
 * O motor é o Neovim, mas a casca é dona de um punhado de comandos do dia a dia
 * — gravar, desfazer, abrir — e os executa por msgpack-RPC pelo socket que o
 * `nvim --listen` abriu.
 *
 * A diferença para mandar teclas é o ponto inteiro: um ex-comando por RPC
 * (`nvim_command`) **não mexe no modo**. É isso que deixa o Ctrl+S gravar sem
 * tirar a pessoa da escrita — o LazyVim mapeia `<C-s>` como `<Esc>:w`, e era essa
 * saída do modo de inserção que incomodava. A casca intercepta o Ctrl+S antes de
 * ele virar tecla e manda o `write` por aqui.
 */

let cliente: NeovimClient | null = null;
let conectando: Promise<NeovimClient | null> | null = null;

/**
 * Chame quando o Neovim (re)nasce: a conexão antiga aponta para um socket morto.
 *
 * **Não fecha o Neovim** — só descarta a referência do cliente. Chamar `quit()`
 * aqui mandaria um `:qa` e mataria o editor; o que morreu foi o socket, não o
 * processo que a casca quer manter vivo.
 */
export function resetarControle(): void {
  cliente = null;
  conectando = null;
}

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

/** Executa um ex-comando sem tocar no modo atual. Reconecta na próxima chamada
 *  se o socket tiver morrido no meio. */
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

/** Grava o buffer atual — sem sair do modo de escrita. */
export async function salvarNeovim(): Promise<void> {
  await comando("silent! write");
}

/** Desfaz a última mudança. */
export async function desfazerNeovim(): Promise<void> {
  await comando("silent! undo");
}

/** Refaz (Ctrl+Shift+Z). */
export async function refazerNeovim(): Promise<void> {
  await comando("silent! redo");
}

/**
 * Abre um arquivo e já entra em modo de escrita.
 *
 * `fnameescape` é pedido ao próprio Neovim, então caminho com espaço, `#` ou `%`
 * chega inteiro — sem a escapada à mão que a Fatia 1 fazia por teclas. O
 * `startinsert` é o que cumpre o pedido: abriu um arquivo, já está escrevendo, e
 * só sai disso quem apertar Esc.
 */
export async function abrirNoNeovim(caminho: string): Promise<void> {
  const c = await obter();
  if (!c) throw new Error("Neovim não respondeu ao canal de controle.");
  const escapado = (await c.call("fnameescape", [caminho])) as string;
  await c.command(`edit ${escapado}`);
  await c.command("startinsert");
}

/**
 * Abre um terminal do Neovim (PTY completo) num rasgo embaixo do editor, já em
 * modo de digitar.
 *
 * É a resposta ao `Alt+t` roubado pelo KDE: a casca é dona deste comando por uma
 * tecla que chega de verdade (`Ctrl+\``), e o terminal é o do próprio Neovim —
 * um só lugar, não um segundo terminal concorrente na casca.
 */
export async function abrirTerminalNeovim(): Promise<void> {
  const c = await obter();
  if (!c) throw new Error("Neovim não respondeu ao canal de controle.");
  await c.command("belowright split | resize 14 | terminal");
  await c.command("startinsert");
}

/**
 * Os plugins do Neovim, perguntados ao lazy.nvim.
 *
 * É o que o painel "Extensions" da casca mostra: o Neovim tem plugin demais para
 * quem está começando descobrir por conta, e `:Lazy` é uma tela dentro do editor.
 * Aqui a lista fica na lateral, clicável, do jeito que uma IDE mostra.
 */
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

/** Aponta o diretório de trabalho do Neovim para a corrida aberta. */
export async function cdNeovim(pasta: string): Promise<void> {
  const c = await obter();
  if (!c || !pasta) return;
  const escapado = (await c.call("fnameescape", [pasta])) as string;
  await c.command(`cd ${escapado}`);
}
