import { attach, type NeovimClient } from "neovim";
import { createConnection, type Socket } from "node:net";
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
//? A RECONEXÃO — Decisão sobre por que ela deixou de pendurar 24/08/2026 (árvore A8)
//!
//! 1. O laço anterior prometia 25 tentativas em ~3 s e NUNCA FAZIA A SEGUNDA VOLTA. Ele
//!    chamava `attach({ socket })`, que abre a conexão por dentro, e depois confirmava com
//!    `await c.eval("1")`. Sem socket do outro lado essa promessa NÃO ASSENTA — nem resolve
//!    nem rejeita —, então o `catch` do laço nunca rodava. E `conectando` é memoizado: toda
//!    chamada seguinte herdava a mesma promessa morta, e Ctrl+S / Ctrl+Z / F12 / o terminal
//!    do editor / o painel de plugins penduravam em silêncio pelo resto da sessão. A frase
//!    escrita para este caso — "Neovim não respondeu ao canal de controle." — era inalcançável.
//! 2. O CONSERTO TEM DUAS METADES, e uma sem a outra não basta:
//!      (a) TETO na confirmação, para promessa que não assenta virar falha e o laço andar;
//!      (b) A CONEXÃO É NOSSA — abrimos o socket, esperamos o `connect` e só então chamamos
//!          `attach`. É isto que impede a rejeição não tratada: sem tratador, o
//!          `connect ENOENT` vaza e MATA o processo em Node puro, que é onde a suíte roda.
//! 3. ⚠️ NÃO BASTA PÔR TRATADOR DE `error` NO SOCKET E ENTREGÁ-LO AO `attach` — medido em
//!    24/08: com o socket já falhado, `attach` ainda vaza o `connect ENOENT`, porque quem
//!    rejeita é o iterador do transporte (`neovim/lib/utils/transport.js:87`, um
//!    `iter.next().then(...)` sem ramo de erro). Por isso a ordem é conectar PRIMEIRO,
//!    anexar DEPOIS — e nunca anexar em socket morto.
//! 4. O RELÓGIO MANDA, NÃO A CONTAGEM, e a razão é aritmética: com 25 tentativas fixas e
//!    teto de 300 ms, o pior caso seria 25 × (300 + 120) = 10,5 s — três vezes e meia o
//!    "~3 s" que este arquivo promete por escrito. Com prazo, a promessa continua verdadeira
//!    qualquer que seja o custo de cada tentativa.

/** Quanto o canal espera o socket do Neovim aparecer, no total. É o "~3 s" desta página. */
//! Exportado porque a rede precisa dimensionar a espera dela a partir DAQUI: um teste com
//!   número próprio ficaria mentindo no dia em que este orçamento mudasse.
export const PACIENCIA_MS = 3000;

/** Intervalo entre uma tentativa e a seguinte. */
const ESPERA_ENTRE_TENTATIVAS_MS = 120;

/** Teto de UMA confirmação: socket que aceita e não responde não pendura o canal. */
const TETO_DA_CONFIRMACAO_MS = 300;

let cliente: NeovimClient | null = null;
let conectando: Promise<NeovimClient | null> | null = null;

//* Descarta a conexão com o Neovim. Chame quando ele (re)nasce.
//! NÃO fecha o Neovim: `quit()` aqui mataria o editor. O que morreu foi o
//!   socket, não o processo.
export function resetarControle(): void {
  cliente = null;
  conectando = null;
}

//* Espera `ms` sem segurar nada além do próprio relógio.
function espera(ms: number): Promise<void> {
  return new Promise((pronto) => setTimeout(pronto, ms));
}

//* Corre a promessa contra um relógio: o que não assenta a tempo vira falha, não pendura.
//! A promessa original segue viva depois do teto, e é de propósito que ela continue com
//!   tratador aqui: se rejeitar tarde, a rejeição já tem dono e não vaza.
function comTeto<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((pronto, falhar) => {
    const relogio = setTimeout(() => falhar(new Error("o Neovim não confirmou a tempo")), ms);
    void promessa.then(
      (valor) => {
        clearTimeout(relogio);
        pronto(valor);
      },
      (erro: unknown) => {
        clearTimeout(relogio);
        falhar(erro as Error);
      },
    );
  });
}

//* Abre o socket de controle e só devolve depois que ele ESTÁ conectado. `null` = não deu.
//! O tratador de `error` é permanente, não de uma vez: socket sem ouvinte de `error`
//!   derruba o processo pelo EventEmitter, e isso vale também para a queda no meio da
//!   sessão, muito depois desta função ter voltado.
function abrirSoquete(caminho: string): Promise<Socket | null> {
  return new Promise((pronto) => {
    const soquete = createConnection(caminho);
    soquete.on("error", () => pronto(null));
    soquete.once("connect", () => pronto(soquete));
  });
}

//* Larga um socket que aceitou a conexão e não respondeu.
//! `end()`, NUNCA `destroy()` — medido em 24/08: `destroy()` faz o iterador do transporte
//!   rejeitar com `Premature close`, e essa rejeição não tem tratador dentro do pacote
//!   `neovim`. Largar com `destroy()` seria trocar o silêncio da A8 por um vazamento novo.
function largarSoquete(soquete: Socket): void {
  soquete.end();
}

//* Devolve a conexão viva com o Neovim, criando-a na primeira chamada.
//* Insiste por `PACIENCIA_MS` porque o socket surge um instante depois do `spawn` — e
//* alguém pode apertar Ctrl+S antes disso. Esgotado o prazo, devolve `null`, e é esse
//* `null` que vira a frase "Neovim não respondeu ao canal de controle." na tela.
async function obter(): Promise<NeovimClient | null> {
  if (cliente) return cliente;
  if (conectando) return conectando;
  conectando = (async () => {
    const prazo = Date.now() + PACIENCIA_MS;
    for (;;) {
      const soquete = await abrirSoquete(SOCKET_NEOVIM);
      if (soquete) {
        const c = attach({ reader: soquete, writer: soquete });
        try {
          // uma chamada real confirma que o outro lado responde
          await comTeto(c.eval("1"), TETO_DA_CONFIRMACAO_MS);
          cliente = c;
          conectando = null;
          return c;
        } catch {
          largarSoquete(soquete);
        }
      }
      //! A ÚLTIMA ESPERA É APARADA no que resta do prazo, e isto foi um teste que pegou:
      //!   com a espera cheia, o laço parava uma volta ANTES do fim — medido, 2904 ms de um
      //!   orçamento de 3000. Dormir além do prazo seria estourá-lo; dormir a espera inteira
      //!   e só então conferir seria desperdiçar a última tentativa. O que resta é o certo.
      const resta = prazo - Date.now();
      if (resta <= 0) break;
      await espera(Math.min(ESPERA_ENTRE_TENTATIVAS_MS, resta));
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
