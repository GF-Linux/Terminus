//! A doca do terminal — rodapé, direita ou esquerda.
//! A medida é arrastável e fica lembrada por doca.

import { $, terminal } from "./nucleo-da-casca.js";


/**
 * A posição do terminal (ADR 0025). O terminal deixou
 * de morar preso à direita: doca no rodapé, à direita ou à esquerda, e a medida
 * (largura nas laterais, altura no rodapé) é arrastável e lembrada por doca.
 */
type Doca = "direita" | "esquerda" | "baixo";
export let doca: Doca = ((): Doca => {
  const g = localStorage.getItem("terminus.doca");
  return g === "esquerda" || g === "baixo" ? g : "direita";
})();

const chaveDaMedida = (d: Doca): string =>
  d === "baixo" ? "terminus.terminalAltura" : "terminus.terminalLargura";
const medidaPadrao = (d: Doca): number => (d === "baixo" ? 320 : 400);
const medidaMinima = (d: Doca): number => (d === "baixo" ? 120 : 220);
const tetoDaMedida = (d: Doca): number =>
  d === "baixo" ? $("centro").clientHeight - 160 : window.innerWidth - 480;

//* Aplica a medida do painel no eixo da doca atual.
//! Limpa a medida do outro eixo: uma largura lembrada sobreviveria como
//!   largura no modo rodapé, e o painel nasceria torto.
export function aplicarMedidaTerminal(valor: number): void {
  const painel = $("painel");
  const prop = doca === "baixo" ? "height" : "width";
  const outra = doca === "baixo" ? "width" : "height";
  const min = medidaMinima(doca);
  const teto = Math.max(min, tetoDaMedida(doca));
  painel.style[outra] = "";
  painel.style[prop] = `${Math.round(Math.min(teto, Math.max(min, valor)))}px`;
  terminal.reajustar();
}

//* Move o terminal para o rodapé, a direita ou a esquerda, e lembra a escolha.
export function definirDoca(nova: Doca): void {
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

//* Torna a borda entre editor e terminal arrastável.
//* Duplo clique volta ao padrão — a saída de quem arrastou até não achar mais.
//! É um divisor só para as três docas: o eixo e o sinal do arraste são lidos
//!   no momento em que se arrasta.
export function ligarDivisorTerminal(): void {
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

