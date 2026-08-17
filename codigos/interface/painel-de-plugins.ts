//! O painel de plugins do Neovim, que ocupou o lugar do antigo "Extensions".
//! A lista vem do lazy.nvim pela ponte; clicar abre a pasta do plugin.

import type { PluginNvim } from "../compartilhado/tipos.js";
import { $, abrirPainel, api, esc, terminal } from "./nucleo-da-casca.js";
import { assumirProjeto } from "./arvore-de-arquivos.js";
import { definirLateral, definirPainelLateral } from "./barra-lateral.js";


/** Os plugins que o lazy.nvim conhece, para não ter de decorar o que existe. */
let pluginsCache: PluginNvim[] | null = null;

//* Desenha a lista de plugins do Neovim, com filtro por nome.
//! Filtrar NÃO pergunta de novo ao Neovim: a resposta fica em cache, senão a
//!   lateral piscaria a cada tecla.
export async function desenharPlugins(filtro = ""): Promise<void> {
  const corpo = $("lateral");

  if (!pluginsCache) {
    corpo.innerHTML = `<div class="aviso">perguntando ao Neovim…</div>`;
    const r = await api.neovim.plugins();
    if (!r.ok) {
      corpo.innerHTML = `<div class="aviso"><b>Não consegui listar</b>${esc(r.erro)}</div>`;
      return;
    }
    pluginsCache = r.valor;
  }

  const alvo = filtro.trim().toLowerCase();
  const lista = alvo ? pluginsCache.filter((p) => p.nome.toLowerCase().includes(alvo)) : pluginsCache;
  const carregados = pluginsCache.filter((p) => p.carregado).length;

  corpo.innerHTML =
    `<form class="buscaPlugin" autocomplete="off">
       <input id="filtroPlugin" type="text" spellcheck="false" placeholder="filtrar plugins"
              value="${esc(filtro)}" aria-label="Filtrar plugins" />
     </form>
     <div class="contaPlugin">${lista.length} de ${pluginsCache.length} · ${carregados} carregados</div>` +
    lista
      .map(
        (p) =>
          `<div class="plugin${p.carregado ? " on" : ""}" data-plugin="${esc(p.dir)}"
                title="${esc(p.url || p.dir)}">
             <span class="pt2">${esc(p.nome)}</span>
             <span class="dim">${p.carregado ? "carregado" : "sob demanda"}</span>
           </div>`,
      )
      .join("");

  // Filtrar não relista: o cache é a resposta do Neovim, e refazer a pergunta a
  // cada tecla faria a lateral piscar.
  const campo = document.getElementById("filtroPlugin") as HTMLInputElement | null;
  if (campo) {
    campo.addEventListener("input", () => {
      const pos = campo.selectionStart;
      void desenharPlugins(campo.value).then(() => {
        const novo = document.getElementById("filtroPlugin") as HTMLInputElement | null;
        novo?.focus();
        if (pos !== null) novo?.setSelectionRange(pos, pos);
      });
    });
  }

  // Clicar abre a pasta do plugin no Explorer: é onde estão o README e o código,
  // que é o que se quer ver depois de achar o nome.
  for (const el of corpo.querySelectorAll<HTMLElement>(".plugin")) {
    el.addEventListener("click", () => {
      const dir = el.dataset["plugin"];
      if (dir) void abrirPastaDoPlugin(dir);
    });
  }
}

//* Abre a pasta do plugin como projeto — é lá que estão o README e o código.
async function abrirPastaDoPlugin(dir: string): Promise<void> {
  const r = await api.entrarNaPasta(dir);
  if (!r.ok) {
    terminal.erro(`${r.erro}\r\n`);
    abrirPainel();
    return;
  }
  await assumirProjeto(r.valor);
  definirPainelLateral("explorer");
  definirLateral("explorer");
}

