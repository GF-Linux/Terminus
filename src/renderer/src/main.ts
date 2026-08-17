import type { NoArquivo, PluginNvim, ProjetoAberto, Resultado } from "../../shared/tipos.js";
import { Aparencia, TEMAS } from "./aparencia.js";
import { VistaNeovim } from "./neovim.js";
import urlMarca from "../../../media/marca.png";
import urlIcone from "../../../media/icon.png";
import { Paleta, type ItemPaleta } from "./paleta.js";
import { TerminalSaida } from "./terminal.js";

const api = window.terminus;
const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} não existe no index.html`);
  return el as T;
};

/** As aspas contam tanto quanto os sinais de maior e menor: o nome do arquivo
 *  entra dentro de `data-arquivo="..."`, e aspa dupla é nome POSIX legal que
 *  sobrevive a `unzip` e a `git checkout`. Sem escapá-la, um nome fecha o
 *  atributo cedo e acrescenta os que quiser — e o despachante de clique decide
 *  o que fazer olhando só para os `data-*` que encontra. */
const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Desembrulha um Resultado, mostrando o erro no terminal em vez de sumir com ele. */
function ou<T>(r: Resultado<T>, aoFalhar: T): T {
  if (r.ok) return r.valor;
  terminal.erro(`${r.erro}\r\n`);
  abrirPainel();
  return aoFalhar;
}

/* ============================ estado ============================ */

// A casca não guarda mais aba nem conteúdo de arquivo: quem sabe o que está
// aberto, e se foi gravado, é o Neovim (ADR 0025). O que sobra de estado aqui é
// o da própria casca — a pasta, a árvore e o que está sendo renomeado nela.
let projeto: ProjetoAberto | null = null;
/** Pastas expandidas na árvore, por caminho absoluto. */
const expandidas = new Map<string, NoArquivo[]>();
/** Pasta que recebe um "novo arquivo": a do arquivo aberto, ou a raiz. */
let pastaAlvo: string | null = null;
/** Edição de nome em curso na árvore, ou `null`. */
let renomeando: { modo: "arquivo" | "pasta" | "renomear"; dir: string; alvo?: string } | null = null;

/* ============================ terminal ============================ */

const terminal = new TerminalSaida($("term"), ({ arquivo, linha }) => {
  void irParaQuadro(arquivo, linha);
});

/**
 * Abre um arquivo no Neovim e entra em modo de escrita (ADR 0025).
 *
 * É o caminho único: o clique na árvore, o Ctrl+P e o quadro de traceback do
 * terminal chegam todos aqui. A casca não guarda o conteúdo — quem abre, guarda
 * e grava é o Neovim.
 */
async function abrirArquivo(caminho: string, linha?: number): Promise<void> {
  const r = await api.neovim.abrir(caminho, linha);
  if (!r.ok) {
    terminal.erro(`${r.erro}\r\n`);
    abrirPainel();
    return;
  }
  vistaNeovim?.focar();
  desenharArvore();
}

/** Abre o arquivo de um quadro de traceback com o cursor já na linha do erro. */
async function irParaQuadro(arquivo: string, linha: number): Promise<void> {
  await abrirArquivo(arquivo, linha);
}

function definirPainel(aberto: boolean): void {
  $("painel").classList.toggle("oculto", !aberto);
  $("divTerm").classList.toggle("oculto", !aberto);
  $("btPainel").classList.toggle("on", aberto);
  if (aberto) terminal.reajustar();
}

function abrirPainel(): void {
  definirPainel(true);
}

/**
 * Ctrl+` e o botão da barra: abrir aqui é gesto de quem vai digitar, então o
 * cursor já vai para a linha de comando. `abrirPainel` **não** faz isso de
 * propósito — ele é chamado sozinho sempre que aparece saída, e roubaria o foco
 * do editor no meio de uma frase.
 */
function alternarPainel(): void {
  const abrindo = $("painel").classList.contains("oculto");
  definirPainel(abrindo);
  if (abrindo) $("entradaCmd").focus();
}

/* ============================ divisores ============================ */

/**
 * Torna um painel arrastável (ADR 0006).
 *
 * A medida vai no estilo do próprio painel e fica guardada no `localStorage`:
 * quem alarga o terminal uma vez está dizendo como trabalha, e reabrir o app
 * estreito de novo obrigaria a repetir o gesto todo dia.
 *
 * O limite superior é uma função e não um número porque a janela muda de
 * tamanho — o Deck troca de resolução ao ligar o HDMI, e uma largura gravada
 * num monitor grande deixaria o editor com nada na tela pequena.
 */
function ligarDivisor(opcoes: {
  divisor: HTMLElement;
  painel: HTMLElement;
  eixo: "largura" | "altura";
  /** De que lado do painel está o divisor — muda o sinal do arraste. */
  borda?: "inicio" | "fim";
  padrao: number;
  min: number;
  max: () => number;
  chave: string;
  aoMudar?: () => void;
}): void {
  const { divisor, painel, eixo, padrao, min, max, chave, aoMudar } = opcoes;
  const borda = opcoes.borda ?? "fim";
  const prop = eixo === "largura" ? "width" : "height";

  const aplicar = (valor: number): void => {
    const teto = Math.max(min, max());
    painel.style[prop] = `${Math.round(Math.min(teto, Math.max(min, valor)))}px`;
    aoMudar?.();
  };

  const guardado = Number(localStorage.getItem(chave));
  if (Number.isFinite(guardado) && guardado > 0) aplicar(guardado);

  divisor.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    divisor.setPointerCapture(ev.pointerId);
    divisor.classList.add("arrastando");
    // Enquanto arrasta, o cursor manda em tudo: sem isto o ponteiro vira barra
    // de texto ao passar por cima do editor no meio do arraste.
    document.body.style.cursor = eixo === "largura" ? "ew-resize" : "ns-resize";

    const mover = (e: PointerEvent): void => {
      const r = painel.getBoundingClientRect();
      // A borda oposta à do divisor é o ponto fixo: a medida é a distância dela
      // até o ponteiro. Assim o divisor gruda no cursor mesmo quando o arraste
      // passa do limite e volta.
      aplicar(
        eixo === "largura"
          ? borda === "fim"
            ? r.right - e.clientX
            : e.clientX - r.left
          : r.bottom - e.clientY,
      );
    };
    const soltar = (): void => {
      divisor.classList.remove("arrastando");
      document.body.style.cursor = "";
      divisor.removeEventListener("pointermove", mover);
      divisor.removeEventListener("pointerup", soltar);
      divisor.removeEventListener("pointercancel", soltar);
      localStorage.setItem(chave, String(parseFloat(painel.style[prop]) || padrao));
    };

    divisor.addEventListener("pointermove", mover);
    divisor.addEventListener("pointerup", soltar);
    divisor.addEventListener("pointercancel", soltar);
  });

  // Duplo clique volta ao padrão: é a saída de quem arrastou demais e não
  // consegue mais pegar o divisor.
  divisor.addEventListener("dblclick", () => {
    aplicar(padrao);
    localStorage.setItem(chave, String(padrao));
  });
}

/* ============================ doca do terminal ============================ */

/**
 * A posição do terminal (ADR 0025). O terminal deixou
 * de morar preso à direita: doca no rodapé, à direita ou à esquerda, e a medida
 * (largura nas laterais, altura no rodapé) é arrastável e lembrada por doca.
 */
type Doca = "direita" | "esquerda" | "baixo";
let doca: Doca = ((): Doca => {
  const g = localStorage.getItem("terminus.doca");
  return g === "esquerda" || g === "baixo" ? g : "direita";
})();

const chaveDaMedida = (d: Doca): string =>
  d === "baixo" ? "terminus.terminalAltura" : "terminus.terminalLargura";
const medidaPadrao = (d: Doca): number => (d === "baixo" ? 320 : 400);
const medidaMinima = (d: Doca): number => (d === "baixo" ? 120 : 220);
const tetoDaMedida = (d: Doca): number =>
  d === "baixo" ? $("centro").clientHeight - 160 : window.innerWidth - 480;

/** Aplica a medida do painel no eixo da doca atual, limpando a do outro eixo —
 *  senão uma largura lembrada sobreviveria como largura no modo rodapé. */
function aplicarMedidaTerminal(valor: number): void {
  const painel = $("painel");
  const prop = doca === "baixo" ? "height" : "width";
  const outra = doca === "baixo" ? "width" : "height";
  const min = medidaMinima(doca);
  const teto = Math.max(min, tetoDaMedida(doca));
  painel.style[outra] = "";
  painel.style[prop] = `${Math.round(Math.min(teto, Math.max(min, valor)))}px`;
  terminal.reajustar();
}

function definirDoca(nova: Doca): void {
  doca = nova;
  $("centro").dataset["doca"] = nova;
  localStorage.setItem("terminus.doca", nova);
  const marcas: [string, Doca][] = [
    ["btDocaBaixo", "baixo"],
    ["btDocaDireita", "direita"],
    ["btDocaEsquerda", "esquerda"],
  ];
  for (const [id, d] of marcas) $(id).classList.toggle("on", d === nova);
  const guardado = Number(localStorage.getItem(chaveDaMedida(nova)));
  aplicarMedidaTerminal(Number.isFinite(guardado) && guardado > 0 ? guardado : medidaPadrao(nova));
}

/**
 * O divisor do terminal, ciente da doca.
 *
 * Não usa o `ligarDivisor` genérico porque o eixo muda com a doca (largura nas
 * laterais, altura no rodapé) e o sinal do arraste também: à direita a medida
 * cresce indo para a esquerda, à esquerda o contrário, no rodapé indo para cima.
 * Ler `doca` no momento do arraste mantém um divisor só para as três posições.
 */
function ligarDivisorTerminal(): void {
  const divisor = $("divTerm");
  divisor.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    divisor.setPointerCapture(ev.pointerId);
    divisor.classList.add("arrastando");
    document.body.style.cursor = doca === "baixo" ? "ns-resize" : "ew-resize";

    const mover = (e: PointerEvent): void => {
      const r = $("painel").getBoundingClientRect();
      const valor =
        doca === "baixo"
          ? r.bottom - e.clientY
          : doca === "esquerda"
            ? e.clientX - r.left
            : r.right - e.clientX;
      aplicarMedidaTerminal(valor);
    };
    const soltar = (): void => {
      divisor.classList.remove("arrastando");
      document.body.style.cursor = "";
      divisor.removeEventListener("pointermove", mover);
      divisor.removeEventListener("pointerup", soltar);
      divisor.removeEventListener("pointercancel", soltar);
      const prop = doca === "baixo" ? "height" : "width";
      localStorage.setItem(
        chaveDaMedida(doca),
        String(parseFloat($("painel").style[prop]) || medidaPadrao(doca)),
      );
    };
    divisor.addEventListener("pointermove", mover);
    divisor.addEventListener("pointerup", soltar);
    divisor.addEventListener("pointercancel", soltar);
  });

  divisor.addEventListener("dblclick", () => {
    aplicarMedidaTerminal(medidaPadrao(doca));
    localStorage.setItem(chaveDaMedida(doca), String(medidaPadrao(doca)));
  });
}

/* ============================ lateral ============================ */

/**
 * A lateral abre e fecha (ADR 0007).
 *
 * Clicar no ícone que já está selecionado **fecha** a lateral e devolve os
 * 250 px ao editor — o gesto do VSCodium, que a mão já sabe, e o `Ctrl+B`
 * também. Fechada, nenhum ícone fica marcado: marcar um painel que não está na
 * tela é dizer o que não é verdade.
 */
let painelLateral = "explorer";
let lateralAberta = true;

function definirLateralAberta(aberta: boolean): void {
  lateralAberta = aberta;
  $("side").classList.toggle("oculto", !aberta);
  $("divLateral").classList.toggle("oculto", !aberta);
  for (const b of $("act").querySelectorAll<HTMLElement>("button[data-p]")) {
    b.setAttribute("aria-selected", String(aberta && b.dataset["p"] === painelLateral));
  }
  localStorage.setItem("terminus.lateralAberta", aberta ? "1" : "0");
}

function alternarLateral(): void {
  definirLateralAberta(!lateralAberta);
}

/* ===================== motor Neovim (ADR 0025) =====================
   Fatia 1: o Neovim é o editor visível. O CodeMirror acima continua existindo
   por baixo — as abas ainda o alimentam — mas fica escondido pela classe
   `motor-neovim` na casca; a limpeza dele é a Fatia 3. Aqui só montamos o Neovim
   sobre a área de edição e mandamos o clique do Explorer abrir lá. A integração
   fina (Ctrl+S da casca → :w, cursor do Neovim → barra de estado) é a Fatia 2,
   pelo socket RPC. */
const MOTOR_NEOVIM = true;
let vistaNeovim: VistaNeovim | null = null;
if (MOTOR_NEOVIM) {
  document.body.classList.add("motor-neovim");
  const hostNeovim = document.createElement("div");
  hostNeovim.id = "neovimHost";
  $("stage").appendChild(hostNeovim);
  vistaNeovim = new VistaNeovim(hostNeovim, "");
}

/**
 * Aviso de algo que aconteceu fora da vista.
 *
 * A barra de estado perdeu o campo de recado (ADR 0025), então o aviso vai para
 * o terminal — visível se o painel estiver aberto, e sem sumir sozinho depois de
 * cinco segundos. Nada é engolido em silêncio, que era o risco de simplesmente
 * apagar a função.
 */
function avisar(texto: string): void {
  terminal.nota(texto);
}

/* ============================ aparência ============================ */

const aparencia = new Aparencia($("fundoTela"), api, () => desenharConfigAparencia());

/* ============================ marca ============================ */

// O sigilo entra por import, não por caminho no HTML: em desenvolvimento o
// servidor do Vite devolveria o index.html no lugar do arquivo (medido:
// content-type text/html), e o ícone simplesmente não aparecia.
($("imgMarca") as HTMLImageElement).src = urlMarca;
($("imgMarcaGrande") as HTMLImageElement).src = urlIcone;

/* ============================ lateral ============================ */

/** Ícones do cabeçalho do Explorer, no traço do resto da casca. */
const ACOES_EXPLORER = `
  <button data-acao="novo-arquivo" title="Novo arquivo">
    <svg viewBox="0 0 24 24"><path d="M13 3H6v18h12V8z"/><path d="M13 3v5h5"/>
      <path d="M12 12v6M9 15h6"/></svg></button>
  <button data-acao="nova-pasta" title="Nova pasta">
    <svg viewBox="0 0 24 24"><path d="M3 6h6l2 2h10v11H3z"/><path d="M12 11v6M9 14h6"/></svg></button>
  <button data-acao="atualizar" title="Atualizar">
    <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 11-2.3-5.7"/><path d="M20 4v4h-4"/></svg></button>
  <button data-acao="abrir-pasta" title="Abrir outra pasta">
    <svg viewBox="0 0 24 24"><path d="M3 6h6l2 2h10v11H3z"/></svg></button>`;

function definirLateral(painel: string): void {
  $("sideT").textContent =
    {
      explorer: "Explorer",
      extensions: "Plugins",
      config: "Configurações",
    }[painel] ?? painel;

  const acoes = $("sideAcoes");
  acoes.innerHTML = "";

  if (painel === "explorer") {
    // Os ícones do cabeçalho são responsabilidade de desenharArvore(), que é
    // quem sabe se há pasta aberta — e é chamada de novo quando ela abre.
    desenharArvore();
  } else if (painel === "extensions") {
    // O antigo "Extensions" (que só sabia dizer que não havia marketplace) virou
    // o navegador de plugins do Neovim (ADR 0025): o motor tem plugin demais para
    // se descobrir de cor, e `:Lazy` é uma tela dentro do editor. Aqui a lista
    // fica na lateral, filtrável e clicável, como numa IDE.
    void desenharPlugins();
  } else {
    void desenharConfiguracoes();
  }
}

/* --------------------------- painel de plugins --------------------------- */

/** Os plugins que o lazy.nvim conhece, para não ter de decorar o que existe. */
let pluginsCache: PluginNvim[] | null = null;

async function desenharPlugins(filtro = ""): Promise<void> {
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

/** Abre a pasta de um plugin como projeto — o README e o código ficam à mão. */
async function abrirPastaDoPlugin(dir: string): Promise<void> {
  const r = await api.entrarNaPasta(dir);
  if (!r.ok) {
    terminal.erro(`${r.erro}\r\n`);
    abrirPainel();
    return;
  }
  await assumirProjeto(r.valor);
  painelLateral = "explorer";
  definirLateral("explorer");
}

/* ------------------------- painel de configurações ------------------------ */

/**
 * Configurações da casca.
 *
 * Ficou só a aparência: o texto fantasma e o Copilot eram do produto
 * anterior e saíram com a ADR 0025. O que configura o editor agora é a config do
 * Neovim, que é dele — e a casca não vai fingir ser dona disso.
 */
async function desenharConfiguracoes(): Promise<void> {
  $("lateral").innerHTML = `
    <div class="cfg">
      <b class="sep">Aparência</b>
      <div id="cfgAparencia"></div>

      <b class="sep">Editor</b>
      <p class="dim">O motor é o <b>Neovim</b>. Atalhos, plugins, tema do texto e
         autocomplete moram na configuração dele
         (<code>~/.config/nvim</code>) — o Terminus não os duplica.</p>
    </div>`;
  desenharConfigAparencia();
}

function desenharConfigAparencia(): void {
  const alvo = document.getElementById("cfgAparencia");
  const a = aparencia.atual();
  if (!alvo || !a) return;

  const temas = Object.entries(TEMAS)
    .map(
      ([id, t]) =>
        `<button class="tema${a.tema === id ? " on" : ""}" data-tema="${id}">${esc(t.nome)}</button>`,
    )
    .join("");

  alvo.innerHTML = `
    <p class="dim">Papel de parede atrás do editor — só ali. As abas, a árvore e o

    ${
      a.imagem
        ? `<div class="previa" style="background-image:url('${a.imagem}')"></div>
           <div class="botoes">
             <button class="acao" data-a="trocar">Trocar imagem…</button>
             <button class="acao" data-a="tirar">Tirar</button>
           </div>
           <label class="deslize"><span>Escurecer</span>
             <input type="range" id="apEscurecer" min="0" max="95" value="${Math.round(a.escurecer * 100)}">
             <b>${Math.round(a.escurecer * 100)}%</b></label>
           <label class="deslize"><span>Desfoque</span>
             <input type="range" id="apDesfoque" min="0" max="24" value="${a.desfoque}">
             <b>${a.desfoque}px</b></label>
           ${
             a.animado
               ? `<div class="junta">
                    <span class="rot">Volta do loop</span>
                    <div class="temas">
                      ${(
                        [
                          ["crossfade", "Dissolver"],
                          ["vaivem", "Vai-e-vem"],
                          ["seco", "Corte seco"],
                        ] as const
                      )
                        .map(
                          ([id, nome]) =>
                            `<button class="tema${a.junta === id ? " on" : ""}" data-junta="${id}">${nome}</button>`,
                        )
                        .join("")}
                    </div>
                    <p class="dim">GIF de papel de parede quase nunca fecha o loop:
                       o último quadro não casa com o primeiro e a volta dá um
                       tranco. <b>Dissolver</b> mistura o fim no começo;
                       <b>vai-e-vem</b> toca de trás para a frente e não tem volta
                       para esconder — mas inverte o movimento da cena.</p>
                  </div>`
               : ""
           }`
        : `<button class="acao" data-a="trocar">Escolher imagem…</button>`
    }

    <b class="sep">Tema</b>
    <div class="temas">${temas}
      ${
        a.imagem
          ? `<button class="tema${a.tema === "gerado" ? " on" : ""}" data-a="gerar">Do wallpaper</button>`
          : ""
      }
    </div>`;

  alvo.querySelectorAll<HTMLElement>("[data-a]").forEach((b) => {
    b.addEventListener("click", async () => {
      const acao = b.dataset["a"];
      if (acao === "trocar") {
        if (await aparencia.escolherImagem()) desenharConfigAparencia();
      } else if (acao === "tirar") {
        await aparencia.tirarImagem();
        desenharConfigAparencia();
      } else if (acao === "gerar") {
        avisar("tirando as cores da imagem…");
        const deu = await aparencia.gerarTema();
        avisar(deu ? "tema gerado a partir do papel de parede" : "não consegui ler a imagem");
        desenharConfigAparencia();
      }
    });
  });

  alvo.querySelectorAll<HTMLElement>("[data-tema]").forEach((b) => {
    b.addEventListener("click", async () => {
      await aparencia.definir({ tema: b.dataset["tema"]! });
      desenharConfigAparencia();
    });
  });

  alvo.querySelectorAll<HTMLElement>("[data-junta]").forEach((b) => {
    b.addEventListener("click", async () => {
      await aparencia.definir({ junta: b.dataset["junta"]! });
      desenharConfigAparencia();
    });
  });

  // Os deslizadores mexem na tela a cada arrasto, mas só gravam ao soltar: um
  // arquivo por pixel de arraste seria escrita à toa no disco.
  const ligarDeslize = (id: string, campo: "escurecer" | "desfoque", fator: number): void => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    el.addEventListener("input", () => {
      const valor = Number(el.value) * fator;
      if (campo === "escurecer") $("stage").style.setProperty("--veu", String(valor));
      else {
        const f = $("fundoTela");
        f.style.filter = valor ? `blur(${valor}px)` : "";
        f.style.transform = valor ? "scale(1.06)" : "";
      }
      const rotulo = el.parentElement?.querySelector("b");
      if (rotulo) rotulo.textContent = campo === "escurecer" ? `${el.value}%` : `${el.value}px`;
    });
    el.addEventListener("change", async () => {
      await aparencia.definir({ [campo]: Number(el.value) * fator });
    });
  };
  ligarDeslize("apEscurecer", "escurecer", 0.01);
  ligarDeslize("apDesfoque", "desfoque", 1);
}

function desenharArvore(): void {
  // Só pinta se o Explorer for o painel visível. Sem isto, qualquer coisa que
  // abrisse arquivo — o traceback clicável, o Ctrl+P — jogava a árvore por cima
  // do painel que estava na tela.
  if (painelLateral !== "explorer") return;
  const corpo = $("lateral");
  // Sem pasta aberta não há o que criar nem atualizar: o cabeçalho fica vazio.
  $("sideAcoes").innerHTML = projeto ? ACOES_EXPLORER : "";

  if (!projeto) {
    // As pastas já abertas ficam à mão: o Terminus volta sozinha na última, e
    // trocar entre as corridas da semana não devia passar por diálogo de
    // arquivo. O ✕ tira da lista sem tocar no disco.
    const lista = recentes.length
      ? `<div class="recentes"><span class="rot">Abertas antes</span>${recentes
          .map(
            (p) => `<div class="rec">
               <button class="cam" data-recente="${esc(p)}" title="${esc(p)}">
                 ${esc(p.split("/").pop() ?? p)}<span class="pai">${esc(encurtar(p))}</span>
               </button>
               <button class="x" data-esquecer="${esc(p)}" title="Tirar da lista">✕</button>
             </div>`,
          )
          .join("")}</div>`
      : "";

    corpo.innerHTML = `<div class="aviso"><b>Nenhuma pasta aberta</b>
      Abra a pasta da corrida para ver os arquivos e rodar os scripts nela.
      <button class="acao" id="btAbrirPasta">Abrir pasta…</button>${lista}</div>`;
    $("btAbrirPasta").onclick = () => void escolherProjeto();
    return;
  }

  const linhas: string[] = [
    `<div class="sect"><span class="ch">&#9662;</span>${esc(projeto.nome)}</div>`,
  ];

  /** A linha com o campo de texto, quando há nome sendo digitado nesta pasta. */
  const campo = (dir: string, recuo: number): void => {
    if (!renomeando || renomeando.modo === "renomear" || renomeando.dir !== dir) return;
    const ic = renomeando.modo === "pasta" ? "&#128193;" : "&#9679;";
    linhas.push(
      `<div class="row" style="padding-left:${recuo}px">
         <span class="ic">${ic}</span><input id="campoNome" spellcheck="false"></div>`,
    );
  };

  const nivel = (nos: NoArquivo[], prof: number): void => {
    for (const no of nos) {
      const recuo = 8 + prof * 14;
      const editando = renomeando?.modo === "renomear" && renomeando.alvo === no.caminho;

      if (no.tipo === "pasta") {
        const aberta = expandidas.has(no.caminho);
        linhas.push(
          editando
            ? `<div class="row" style="padding-left:${recuo}px"><span class="ch"></span>
                 <span class="ic">&#128193;</span><input id="campoNome" spellcheck="false"></div>`
            : `<button class="row" data-pasta="${esc(no.caminho)}" data-no="${esc(no.caminho)}"
                       style="padding-left:${recuo}px">
                 <span class="ch">${aberta ? "&#9662;" : "&#9656;"}</span>
                 <span class="ic">&#128193;</span><span class="nome">${esc(no.nome)}</span></button>`,
        );
        if (aberta) {
          campo(no.caminho, recuo + 30);
          nivel(expandidas.get(no.caminho)!, prof + 1);
        }
      } else {
        // Qual arquivo está aberto é do Neovim (ADR 0025): a casca deixou de
        // guardar abas, então a árvore não marca mais linha "ativa".
        const aberto = false;
        const suportado = !/\.(png|jpe?g|gif|webp|pdf|zip|gz|so|bin)$/i.test(no.nome);
        linhas.push(
          editando
            ? `<div class="row" style="padding-left:${recuo + 16}px">
                 <span class="ic">&#9679;</span><input id="campoNome" spellcheck="false"></div>`
            : `<button class="row${aberto ? " on" : ""}${suportado ? "" : " opaco"}"
                       data-arquivo="${esc(no.caminho)}" data-no="${esc(no.caminho)}"
                       style="padding-left:${recuo + 16}px"
                       ${suportado ? "" : 'title="Sem visualizador nesta versão"'}>
                 <span class="ic">&#9679;</span><span class="nome">${esc(no.nome)}</span></button>`,
        );
      }
    }
  };

  campo(projeto.raiz, 8 + 14);
  nivel(projeto.filhos, 1);
  corpo.innerHTML = linhas.join("");

  const entrada = document.getElementById("campoNome") as HTMLInputElement | null;
  if (entrada) prepararCampo(entrada);
}

/* -------------------- criar, renomear, excluir na árvore ------------------ */

/** Liga o campo de nome: Enter confirma, Esc cancela, sair do campo cancela. */
function prepararCampo(entrada: HTMLInputElement): void {
  const atual = renomeando;
  if (!atual) return;

  if (atual.modo === "renomear" && atual.alvo) {
    const nome = atual.alvo.split("/").pop() ?? "";
    entrada.value = nome;
    // Seleciona só o miolo: renomear costuma ser mexer no nome, não na extensão.
    const ponto = nome.lastIndexOf(".");
    entrada.setSelectionRange(0, ponto > 0 ? ponto : nome.length);
  } else if (atual.modo === "arquivo") {
    // Pré-preenchido com a extensão que este ambiente existe para escrever.
    entrada.value = ".py";
    entrada.setSelectionRange(0, 0);
  }
  entrada.focus();

  let encerrado = false;
  const encerrar = (): void => {
    encerrado = true;
    renomeando = null;
    desenharArvore();
  };

  entrada.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      const nome = entrada.value;
      encerrado = true;
      void confirmarNome(atual, nome);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      encerrar();
    }
  });
  entrada.addEventListener("blur", () => {
    if (!encerrado) encerrar();
  });
}

async function confirmarNome(
  op: NonNullable<typeof renomeando>,
  nome: string,
): Promise<void> {
  renomeando = null;
  const raiz = projeto?.raiz;
  if (!raiz || !nome.trim()) {
    desenharArvore();
    return;
  }

  let r;
  if (op.modo === "arquivo") r = await api.criarArquivo(raiz, op.dir, nome);
  else if (op.modo === "pasta") r = await api.criarPasta(raiz, op.dir, nome);
  else r = await api.renomear(raiz, op.alvo!, nome);

  if (!r.ok) {
    terminal.erro(`${r.erro}\r\n`);
    abrirPainel();
    await atualizarArvore();
    return;
  }

  // Renomear move o caminho: a árvore esquece o que sabia da pasta antiga. O
  // buffer aberto no Neovim continua apontando para o nome anterior — quem
  // renomeia pela árvore e segue editando precisa reabrir. Está registrado como
  // limitação conhecida, não como comportamento pretendido.
  if (op.modo === "renomear" && expandidas.has(op.alvo!)) expandidas.delete(op.alvo!);

  await atualizarArvore();
  if (op.modo === "arquivo") await abrirArquivo(r.valor);
}

async function excluir(alvo: string): Promise<void> {
  const r = await api.excluir(alvo);
  if (!r.ok) {
    terminal.erro(`${r.erro}\r\n`);
    abrirPainel();
    return;
  }
  if (!r.valor) return; // cancelado na confirmação

  // O que sumiu pode continuar aberto no Neovim, com o buffer na memória. A
  // casca não fecha por ele: fechar buffer sujo por trás de quem edita é pior
  // que deixar o aviso aparecer na hora de gravar.
  expandidas.delete(alvo);
  await atualizarArvore();
  terminal.nota(`movido para a lixeira: ${alvo}`);
}

/** Recarrega a raiz e todas as pastas expandidas, preservando o que está aberto. */
async function atualizarArvore(): Promise<void> {
  if (!projeto) return;
  const raiz = await api.abrirProjeto(projeto.raiz);
  if (!raiz.ok) {
    terminal.erro(`${raiz.erro}\r\n`);
    return;
  }
  projeto = raiz.valor;

  for (const dir of [...expandidas.keys()]) {
    const filhos = await api.listar(dir);
    // Pasta que sumiu do disco simplesmente deixa de estar expandida.
    if (filhos.ok) expandidas.set(dir, filhos.valor);
    else expandidas.delete(dir);
  }
  desenharArvore();
}

/** Onde um "novo arquivo" deve nascer: a pasta em foco, ou a raiz. */
function dirCorrente(): string {
  if (pastaAlvo && expandidas.has(pastaAlvo)) return pastaAlvo;
  {
    const dir = "";
    if (dir === projeto?.raiz || expandidas.has(dir)) return dir;
  }
  return projeto?.raiz ?? "";
}

function comecarNovo(modo: "arquivo" | "pasta", dir = dirCorrente()): void {
  if (!projeto) return;
  renomeando = { modo, dir };
  desenharArvore();
}

function comecarRenomear(alvo: string): void {
  if (!projeto) return;
  renomeando = { modo: "renomear", dir: alvo.slice(0, alvo.lastIndexOf("/")), alvo };
  desenharArvore();
}

/* ------------------------------ abertura rápida --------------------------- */

const paleta = new Paleta((item: ItemPaleta) => void abrirArquivo(item.abs));

async function abrirPaleta(): Promise<void> {
  const raiz = projeto?.raiz;
  if (!raiz) {
    terminal.nota("Abra uma pasta antes — não há onde procurar.");
    abrirPainel();
    return;
  }

  // A lista é montada a cada abertura, não cacheada: um arquivo criado fora da
  // Terminus tem de aparecer sem exigir "atualizar". Numa pasta de corrida a
  // varredura é instantânea.
  const r = await api.arquivosDoProjeto(raiz);
  if (!r.ok) {
    terminal.erro(`${r.erro}\r\n`);
    abrirPainel();
    return;
  }
  paleta.abrir(r.valor.map((rel) => ({ rel, abs: `${raiz}/${rel}` })));
}

/* ------------------------------ menu de contexto -------------------------- */

function fecharMenu(): void {
  $("menu").classList.add("oculto");
}

function abrirMenu(x: number, y: number, alvo: string, pasta: boolean): void {
  const menu = $("menu");
  const dir = pasta ? alvo : alvo.slice(0, alvo.lastIndexOf("/"));

  // A raiz do projeto **não** tem "Excluir" (ADR 0013). Ela tem "Fechar pasta",
  // que é o que a pessoa quer dizer quando manda a pasta embora da IDE. O menu
  // antigo oferecia excluir mirando a raiz, e um clique no vazio da árvore
  // mandava a pasta de trabalho inteira para a lixeira do sistema.
  const ehRaiz = alvo === projeto?.raiz;
  menu.innerHTML = ehRaiz
    ? `<button data-m="novo-arquivo">Novo arquivo</button>
       <button data-m="nova-pasta">Nova pasta</button>
       <hr>
       <button data-m="fechar-pasta">Fechar pasta</button>`
    : `<button data-m="novo-arquivo">Novo arquivo</button>
       <button data-m="nova-pasta">Nova pasta</button>
       <hr>
       <button data-m="renomear">Renomear<span class="atalho">F2</span></button>
       <button data-m="excluir">Excluir<span class="atalho">Del</span></button>`;
  menu.dataset["alvo"] = alvo;
  menu.dataset["dir"] = dir;
  menu.classList.remove("oculto");

  // Posiciona só depois de visível, senão a medida sai zerada e o menu
  // vazaria para fora da janela perto da borda.
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
}

$("menu").addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-m]");
  if (!b) return;
  const menu = $("menu");
  const alvo = menu.dataset["alvo"]!;
  const dir = menu.dataset["dir"]!;
  fecharMenu();

  switch (b.dataset["m"]) {
    case "novo-arquivo":
      if (dir !== projeto?.raiz && !expandidas.has(dir)) void alternarPasta(dir);
      comecarNovo("arquivo", dir);
      break;
    case "nova-pasta":
      comecarNovo("pasta", dir);
      break;
    case "renomear":
      comecarRenomear(alvo);
      break;
    case "excluir":
      void excluir(alvo);
      break;
    case "fechar-pasta":
      fecharProjeto();
      break;
  }
});

window.addEventListener("click", (ev) => {
  if (!(ev.target as HTMLElement).closest("#menu")) fecharMenu();
});
window.addEventListener("blur", fecharMenu);

/**
 * A pasta onde a corrida mora, encurtada para caber na lateral:
 * `/home/deck/corridas/18S` → `~/corridas`.
 *
 * O corte é feito **aqui e pela esquerda**, não por CSS: o `text-overflow` corta
 * pela direita, que é onde está a parte que identifica o caminho, e a saída de
 * inverter isso com `direction:rtl` foi pior — o navegador reordena a barra e
 * `~/projetos` aparece na tela como `projetos/~`.
 */
const LARGURA_CAMINHO = 26;

function encurtar(caminho: string): string {
  const pai = caminho.slice(0, caminho.lastIndexOf("/")).replace(/^\/home\/[^/]+/, "~");
  return pai.length > LARGURA_CAMINHO ? `…${pai.slice(-LARGURA_CAMINHO)}` : pai;
}

let recentes: string[] = [];

async function atualizarRecentes(): Promise<void> {
  const r = await api.pastasRecentes();
  recentes = r.ok ? r.valor : [];
}

/** Assume a pasta como projeto aberto — o mesmo fim para o diálogo e o recente. */
async function assumirProjeto(p: ProjetoAberto): Promise<void> {
  projeto = p;
  expandidas.clear();
  pastaAlvo = null;
  await atualizarRecentes();
  desenharArvore();
  terminal.nota(`pasta aberta: ${p.raiz}`);
  // O terminal volta para a raiz junto: seguir digitando dentro da corrida
  // anterior seria o engano mais fácil de cometer e mais difícil de notar.
  await sincronizarPastaCmd();
}

async function escolherProjeto(): Promise<void> {
  const p = ou(await api.escolherProjeto(), null);
  if (!p) return;
  await assumirProjeto(p);
}

/**
 * Tira a pasta da IDE **sem tocar no disco** (ADR 0013).
 *
 * É o que faltava, e a falta doeu: sem um "fechar pasta", a única coisa parecida
 * era "Excluir", que mandava a pasta de trabalho inteira para a lixeira do
 * sistema. Fechar não apaga nada, não esquece o recente, e os arquivos já
 * abertos continuam abertos — quem fechou a pasta não pediu para perder o que
 * estava editando.
 */
function fecharProjeto(): void {
  const nome = projeto?.nome;
  projeto = null;
  expandidas.clear();
  pastaAlvo = null;
  desenharArvore();
  if (nome) terminal.nota(`pasta fechada: ${nome} (nada foi apagado)`);
  avisar(`${nome ?? "pasta"} fechada — nada foi apagado`);
  // O prompt mostrava o nome da pasta; sem ela, mostra o caminho de verdade.
  pintarPrompt();
}

async function abrirRecente(raiz: string): Promise<void> {
  const r = await api.entrarNaPasta(raiz);
  if (!r.ok) {
    // Pasta que sumiu do disco sai da lista em vez de virar erro repetido.
    terminal.erro(`${r.erro}\r\n`);
    abrirPainel();
    await atualizarRecentes();
    desenharArvore();
    return;
  }
  await assumirProjeto(r.valor);
}

async function alternarPasta(caminho: string): Promise<void> {
  pastaAlvo = expandidas.has(caminho) ? null : caminho;
  if (expandidas.has(caminho)) {
    expandidas.delete(caminho);
  } else {
    expandidas.set(caminho, ou(await api.listar(caminho), []));
  }
  desenharArvore();
}

/* ========================= linha de comando (ADR 0020) ===================== */

/**
 * Há um comando em execução?
 *
 * Sobrou da execução do arquivo aberto (o ▶, que saiu com a ADR 0025): hoje só a
 * linha de comando roda algo, e o estado serve para o ■ parar e para o Ctrl+C
 * saber se mata um processo ou limpa a linha.
 */
let rodando = false;

function definirRodando(v: boolean): void {
  rodando = v;
  ($("btParar") as HTMLButtonElement).disabled = !v;
  // A linha apaga em vez de desabilitar: desabilitada ela perderia o foco, e com
  // ele o Ctrl+C que interrompe o que está rodando.
  $("linhaCmd").classList.toggle("ocupada", v);
}

/**
 * O terminal deixou de ser só tela.
 *
 * Motivo de existir, sem rodeio: o autor foi instalar o pandas para estudar e
 * não tinha onde digitar. Uma IDE em que não se instala biblioteca não serve
 * para aprender Python, que é o propósito declarado desta.
 *
 * Três escolhas que valem a leitura:
 *
 * 1. **É um `<input>`, não digitação dentro do xterm.** Sem PTY não existe eco
 *    nem readline do outro lado; escrever no xterm significaria reimplementar
 *    cursor, seleção, colar e acentuação. O campo do sistema já faz tudo isso.
 * 2. **A pasta é a do terminal, não a do arquivo aberto**, e o `cd` a move. É o
 *    que qualquer pessoa espera, e `pip install` não tem arquivo aberto algum.
 * 3. **O eco vem antes da saída.** A linha digitada é repetida no terminal com o
 *    prompt do momento, para que rolar a saída para cima continue contando a
 *    história de quem pediu o quê — o campo esvazia, o registro fica.
 */
const campoCmd = $("entradaCmd") as HTMLInputElement;

/** Pasta atual do terminal, em caminho absoluto. */
let pastaCmd = "";
/** Do mais recente para o mais antigo; `-1` é a linha que está sendo escrita. */
let historicoCmd: string[] = [];
let posHistorico = -1;
let rascunhoCmd = "";

/** O rótulo do prompt: nome da pasta aberta mais o caminho de dentro dela. */
function rotuloDaPasta(): string {
  if (!pastaCmd) return "~";
  if (projeto && (pastaCmd === projeto.raiz || pastaCmd.startsWith(projeto.raiz + "/"))) {
    const dentro = pastaCmd.slice(projeto.raiz.length).replace(/^\//, "");
    return dentro ? `${projeto.nome}/${dentro}` : projeto.nome;
  }
  // Fora da pasta aberta o nome curto mentiria sobre onde o comando vai rodar.
  return pastaCmd.replace(/^\/home\/[^/]+/, "~");
}

function pintarPrompt(): void {
  $("promptCmd").textContent = `➜ ${rotuloDaPasta()}`;
}

async function sincronizarPastaCmd(): Promise<void> {
  const r = await api.pastaDoComando();
  if (r.ok) pastaCmd = r.valor;
  pintarPrompt();
}

async function executarLinha(linha: string): Promise<void> {
  const texto = linha.trim();
  if (texto === "") return;

  // `clear` não é processo: some com o que está na tela e pronto. Fica aqui, e
  // não no processo principal, porque quem tem a tela é este lado.
  if (texto === "clear" || texto === "cls") {
    terminal.limpar();
    campoCmd.value = "";
    posHistorico = -1;
    return;
  }

  terminal.comando(rotuloDaPasta(), texto);
  campoCmd.value = "";
  posHistorico = -1;
  rascunhoCmd = "";

  const r = await api.comando(texto);

  // Repetido não empilha, para a seta ↑ não gastar dez toques em `pip list`.
  historicoCmd = [texto, ...historicoCmd.filter((x) => x !== texto)];

  if (!r.ok) {
    terminal.erro(`${r.erro}\r\n`);
    return;
  }
  pastaCmd = r.valor.pasta;
  pintarPrompt();
  if (r.valor.nota) terminal.nota(r.valor.nota);
  if (r.valor.rodando) definirRodando(true);
}

$("linhaCmd").addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (rodando) {
    terminal.nota("há algo rodando — pare antes (■ no cabeçalho, ou Ctrl+C aqui)");
    return;
  }
  void executarLinha(campoCmd.value);
});

// Clicar na faixa do prompt, e não só no campo, põe o cursor para digitar.
$("linhaCmd").addEventListener("mousedown", (ev) => {
  if (ev.target !== campoCmd) {
    ev.preventDefault();
    campoCmd.focus();
  }
});

campoCmd.addEventListener("keydown", (ev) => {
  // Ctrl+C: com algo rodando, mata — é o gesto que a mão já tem. Sem nada
  // rodando, limpa a linha, como faz qualquer shell. Com texto selecionado não
  // se mete: ali Ctrl+C é copiar, e roubar isso seria pior que não ter o gesto.
  const temSelecao = campoCmd.selectionStart !== campoCmd.selectionEnd;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "c" && !temSelecao) {
    ev.preventDefault();
    if (rodando) {
      api.parar();
      terminal.nota("^C");
    } else {
      campoCmd.value = "";
      posHistorico = -1;
    }
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "l") {
    ev.preventDefault();
    terminal.limpar();
    return;
  }

  // O histórico é uma pilha do mais recente para o mais antigo: ↑ afunda, ↓
  // volta, e voltar além do topo devolve a linha que estava escrita antes.
  if (ev.key === "ArrowUp") {
    if (posHistorico + 1 >= historicoCmd.length) return;
    ev.preventDefault();
    if (posHistorico === -1) rascunhoCmd = campoCmd.value;
    posHistorico++;
    campoCmd.value = historicoCmd[posHistorico] ?? "";
    campoCmd.setSelectionRange(campoCmd.value.length, campoCmd.value.length);
    return;
  }
  if (ev.key === "ArrowDown") {
    if (posHistorico < 0) return;
    ev.preventDefault();
    posHistorico--;
    campoCmd.value = posHistorico === -1 ? rascunhoCmd : (historicoCmd[posHistorico] ?? "");
    campoCmd.setSelectionRange(campoCmd.value.length, campoCmd.value.length);
  }
});

/* ============================ ligações ============================ */

$("act").addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-p]");
  if (!b) return;
  const alvo = b.dataset["p"]!;

  // No ícone já aberto, o clique fecha — é como se alterna a lateral sem tirar
  // a mão do mouse.
  if (alvo === painelLateral && lateralAberta) {
    definirLateralAberta(false);
    return;
  }
  painelLateral = alvo;
  definirLateralAberta(true);
  definirLateral(alvo);
});

$("sideAcoes").addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-acao]");
  if (!b) return;
  switch (b.dataset["acao"]) {
    case "novo-arquivo":
      comecarNovo("arquivo");
      break;
    case "nova-pasta":
      comecarNovo("pasta");
      break;
    case "atualizar":
      void atualizarArvore();
      break;
    case "abrir-pasta":
      void escolherProjeto();
      break;
  }
});

$("lateral").addEventListener("click", (ev) => {
  const alvo = ev.target as HTMLElement;

  const recente = alvo.closest<HTMLElement>("[data-recente]");
  if (recente) return void abrirRecente(recente.dataset["recente"]!);
  const esquecer = alvo.closest<HTMLElement>("[data-esquecer]");
  if (esquecer) {
    return void api.esquecerPasta(esquecer.dataset["esquecer"]!).then((r) => {
      if (r.ok) recentes = r.valor;
      desenharArvore();
    });
  }

  const pasta = alvo.closest<HTMLElement>("[data-pasta]");
  if (pasta) return void alternarPasta(pasta.dataset["pasta"]!);
  const arq = alvo.closest<HTMLElement>("[data-arquivo]");
  if (arq) {
    pastaAlvo = null;
    return void abrirArquivo(arq.dataset["arquivo"]!);
  }
});

$("lateral").addEventListener("contextmenu", (ev) => {
  const no = (ev.target as HTMLElement).closest<HTMLElement>("[data-no]");
  if (!projeto) return;
  ev.preventDefault();
  if (no) {
    const caminho = no.dataset["no"]!;
    abrirMenu(ev.clientX, ev.clientY, caminho, no.hasAttribute("data-pasta"));
  } else {
    // Clique no vazio da lateral: o alvo é a raiz do projeto.
    abrirMenu(ev.clientX, ev.clientY, projeto.raiz, true);
  }
});

$("btParar").addEventListener("click", () => api.parar());
$("btLimpar").addEventListener("click", () => terminal.limpar());
$("btFecharPainel").addEventListener("click", () => definirPainel(false));
$("btPainel").addEventListener("click", () => alternarPainel());
// A marca do dono, à direita da barra: abre no navegador do sistema, porque o
// `setWindowOpenHandler` da janela recusa abrir link aqui dentro.
$("linkGithub").addEventListener("click", (ev) => {
  ev.preventDefault();
  window.open(`https://github.com/${$("nomeGithub").textContent?.trim() ?? ""}`, "_blank");
});


// Atalhos globais, nos mesmos gestos do VSCodium — é o que a mão já sabe.
window.addEventListener("keydown", (ev) => {
  const mod = ev.ctrlKey || ev.metaKey;

  // Com a paleta aberta ela é quem manda: o teclado inteiro pertence à busca,
  // e um Ctrl+N daqui criaria arquivo por trás dela.
  if (paleta.aberta) {
    if (mod && ev.key.toLowerCase() === "p") {
      ev.preventDefault();
      paleta.fechar();
    }
    return;
  }

  if (mod && ev.key === "`") {
    ev.preventDefault();
    alternarPainel();
    return;
  }
  if (mod && ev.key.toLowerCase() === "b") {
    ev.preventDefault();
    alternarLateral();
    return;
  }
  if (mod && ev.key.toLowerCase() === "p") {
    ev.preventDefault();
    void abrirPaleta();
    return;
  }
  if (mod && ev.key.toLowerCase() === "n") {
    ev.preventDefault();
    comecarNovo("arquivo");
    return;
  }
  if (ev.key === "Escape") fecharMenu();

  // F2 e Delete valem sobre a linha da árvore que está com o foco. Dentro do
  // editor, Delete apaga texto — roubar isso apagaria arquivo por engano.
  const linha = document.activeElement?.closest<HTMLElement>("#lateral [data-no]");
  const selecionado = linha?.dataset["no"];
  if (!selecionado) return;

  if (ev.key === "F2") {
    ev.preventDefault();
    comecarRenomear(selecionado);
  } else if (ev.key === "Delete") {
    ev.preventDefault();
    void excluir(selecionado);
  }
});

$("btFechar").addEventListener("click", () => api.janela.fechar());
$("btMinimizar").addEventListener("click", () => api.janela.minimizar());
$("btMaximizar").addEventListener("click", () => api.janela.alternarMaximo());

/* ============================ partida ============================ */

async function iniciar(): Promise<void> {
  definirLateral("explorer");
  definirRodando(false);

  // Papel de parede e tema antes de qualquer desenho: trocar de tema depois da
  // primeira pintura faria a tela piscar na cor errada na abertura.
  await aparencia.carregar();

  // A lateral abre fechada se foi assim que ficou da última vez.
  definirLateralAberta(localStorage.getItem("terminus.lateralAberta") !== "0");

  ligarDivisor({
    divisor: $("divLateral"),
    painel: $("side"),
    eixo: "largura",
    borda: "inicio",
    padrao: 250,
    min: 170,
    max: () => window.innerWidth - 520,
    chave: "terminus.larguraLateral",
  });

  // Os dois painéis da ADR 0006. O teto deixa sempre um pedaço utilizável de
  // editor: um painel que pode engolir a tela inteira recria o problema que
  // esta mudança veio resolver.
  // O divisor do terminal é ciente da doca (ADR 0025); os botões do cabeçalho
  // trocam a posição, e a doca salva é aplicada agora.
  ligarDivisorTerminal();
  $("btDocaBaixo").addEventListener("click", () => definirDoca("baixo"));
  $("btDocaDireita").addEventListener("click", () => definirDoca("direita"));
  $("btDocaEsquerda").addEventListener("click", () => definirDoca("esquerda"));
  definirDoca(doca);
  
  // `terminus ~/projeto` já abre a pasta; sem argumento, volta a última
  // pasta aberta. Os recentes vêm junto para a tela vazia não nascer sem eles.
  await atualizarRecentes();
  const inicial = await api.projetoInicial();
  if (inicial.ok && inicial.valor) {
    projeto = inicial.valor;
    terminal.nota(`pasta aberta: ${inicial.valor.raiz}`);
  } else if (!inicial.ok) {
    // A pasta lembrada existe mas não abriu (permissão, disco removido). O
    // Explorer já mostra a tela vazia; sem uma palavra, ela pareceria só
    // esquecimento. O painel **não** abre sozinho: é partida do aplicativo,
    // não resultado de algo que a pessoa pediu agora.
    terminal.erro(`não reabri a última pasta: ${inicial.erro}\r\n`);
    avisar("não consegui reabrir a última pasta");
  }
  desenharArvore();

  // O Neovim nasceu na home; aponta ele para a corrida aberta (ADR 0025).
  if (MOTOR_NEOVIM && vistaNeovim && projeto) api.neovim.cd(projeto.raiz);

  // A linha de comando precisa saber onde está antes de alguém digitar, e o
  // histórico é lido do config.json — não do localStorage, ver `config.ts`.
  await sincronizarPastaCmd();
  const h = await api.historicoDeComandos();
  if (h.ok) historicoCmd = h.valor;


  // O ambiente do laboratório saiu da
  // barra de estado com a virada da ADR 0025: o Terminus não é mais a IDE do
  // laboratório, e essas versões eram informação de lá.
}

void iniciar();
