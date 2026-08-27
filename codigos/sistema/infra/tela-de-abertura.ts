import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import * as path from "node:path";
import type { AberturaDoNvim } from "../../compartilhado/tipos.js";

//? A TELA DE ABERTURA — a MESMA que o Neovim da cabeça mostra
//!
//! ⚠️ ESTE ARQUIVO EXISTE PORQUE EU ENTENDI O PEDIDO ERRADO DUAS VEZES. Pediram *"o meu tema
//! do Neovim ao abrir o programa, em vez do ícone e da mensagem"* — e eu entreguei uma
//! amostra de cores com uma frase explicando a mim mesmo. Um "tema" que diz *"o tema vem do
//! seu kit"* não é um tema; é um bilhete. A tela pedida é o **dashboard**: o logotipo JARED,
//! a régua com L I N U X, a ficha do sistema e o "bem-vindo, jared".
//!
//! A FONTE É O ARQUIVO DELA: `~/.config/nvim/lua/plugins/dashboard.lua`. O logotipo e as
//! cores são lidos de lá, não copiados para cá — se ela mudar o desenho, o Terminus muda
//! junto, que é a mesma regra que vale para o `tema.lua`.
//!
//! ⚠️ E O `dashboard.lua` JÁ DECIDIU o que mostrar aqui dentro: ele tem uma variante
//! `dentro_da_bancada` (`BANCADA == "1"`) que corta o MENU e deixa só identidade + ficha,
//! porque *"abrir/entrar em pasta é trabalho da casca"*. Esta tela obedece essa decisão —
//! ela já estava tomada, e por quem tinha o direito de tomá-la.

/** Onde a tela inicial do Neovim mora. */
function caminhoDoPainel(): string {
  return path.join(homedir(), ".config/nvim/lua/plugins/dashboard.lua");
}

/** O desenho e a paleta, lidos do arquivo dela. */
//! Regex sobre um formato conhecido, não interpretador de Lua — a mesma decisão do
//!   `paleta-do-tema.ts`, pela mesma razão: são um bloco de strings e seis cores.
function lerPainel(): { logotipo: string[]; cores: Record<string, string> } {
  let lua: string;
  try {
    lua = readFileSync(caminhoDoPainel(), "utf8");
  } catch {
    //! Sem Neovim configurado, a tela ainda existe — só sem o logotipo. Melhor uma tela com
    //!   a ficha do que uma tela de erro sobre um arquivo que não é do Terminus.
    return { logotipo: [], cores: {} };
  }

  const bloco = /local\s+wordmark\s*=\s*\{([\s\S]*?)\n\}/.exec(lua);
  const logotipo = bloco
    ? [...bloco[1]!.matchAll(/"([^"]*)"/g)].map((m) => m[1] as string)
    : [];

  const blocoCores = /local\s+cores\s*=\s*\{([\s\S]*?)\n\}/.exec(lua);
  const cores: Record<string, string> = {};
  if (blocoCores) {
    for (const par of blocoCores[1]!.matchAll(/(\w+)\s*=\s*"(#[0-9a-fA-F]{6})"/g)) {
      cores[par[1] as string] = par[2] as string;
    }
  }
  return { logotipo, cores };
}

//! As leituras abaixo são as MESMAS do `dashboard.lua`: `/etc/os-release`, `/proc/uptime`,
//!   `$SHELL`, `/proc/cpuinfo` e `lspci`. Não é coincidência — é o ponto. Se a ficha aqui
//!   dissesse outra coisa que a do Neovim, seriam duas telas discordando sobre a mesma
//!   máquina.
function ler(caminho: string): string {
  try {
    return readFileSync(caminho, "utf8");
  } catch {
    return "";
  }
}

/** Corta como o `dashboard.lua` corta: 44 colunas, com reticência. */
function corta(s: string, n = 44): string {
  const limpo = (s || "?").replace(/\s+$/, "");
  return limpo.length > n ? `${limpo.slice(0, n - 1)}…` : limpo;
}

function uptime(): string {
  const segundos = Number(/^(\d+)/.exec(ler("/proc/uptime"))?.[1] ?? 0);
  const d = Math.floor(segundos / 86400);
  const h = Math.floor((segundos % 86400) / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return `${d > 0 ? `${d}d ` : ""}${h > 0 ? `${h}h ` : ""}${m}m`;
}

function placaDeVideo(): string {
  //! ⚠️ O ÚNICO QUE PRECISA DE PROCESSO EXTERNO, e o `dashboard.lua` diz o que fazer quando
  //!   falha: *"vira '?' e pronto"*. A tela de abertura não pode depender de `lspci` existir.
  try {
    const saida = execFileSync("sh", [
      "-c",
      "lspci 2>/dev/null | grep -iE 'VGA|3D|Display' | head -1",
    ], { encoding: "utf8", timeout: 2000 });
    const nome =
      /\[([^\]]+)\]/.exec(saida)?.[1] ?? /controller:\s*(.*?)\s*\(/.exec(saida)?.[1] ?? "?";
    return nome.replace(/Corporation\s*/, "").replace(/^\s+/, "");
  } catch {
    return "?";
  }
}

//* Monta a tela de abertura: o desenho dela, as cores dela, a máquina dela.
export function telaDeAbertura(): AberturaDoNvim {
  const { logotipo, cores } = lerPainel();
  return {
    logotipo,
    cores,
    ficha: [
      ["os", corta(/PRETTY_NAME="([^"]+)"/.exec(ler("/etc/os-release"))?.[1] ?? "Linux")],
      ["uptime", corta(uptime())],
      ["shell", corta((process.env["SHELL"] ?? "?").split("/").pop() ?? "?")],
      [
        "cpu",
        corta(
          (/model name\s*:\s*([^\n]+)/.exec(ler("/proc/cpuinfo"))?.[1] ?? "?")
            .replace(/\(R\)/g, "")
            .replace(/\(TM\)/g, "")
            .replace(/\s*@.*/, "")
            .replace(/\s+/g, " "),
        ),
      ],
      ["gpu", corta(placaDeVideo())],
    ],
  };
}
