//! A tela de Configurações. Ficou só a aparência: o que configura o editor é a
//! config do Neovim, em ~/.config/nvim, e a casca não finge ser dona dela.

import { TEMAS } from "../design/temas-e-papel-de-parede.js";
import { $, avisar, esc } from "./nucleo-da-casca.js";
import { aparencia, aoMudarAparencia } from "./aparencia-da-casca.js";


//* Desenha a tela de Configurações. Hoje só aparência.
export async function desenharConfiguracoes(): Promise<void> {
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

//* Desenha os controles de papel de parede, escurecimento, desfoque e tema.
//! A inscricao roda ao CARREGAR o modulo, e ele carrega no arranque (a lateral
//!   o importa). E o que substitui o callback que a aparencia passava a si mesma.
aoMudarAparencia(() => desenharConfigAparencia());

export function desenharConfigAparencia(): void {
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

