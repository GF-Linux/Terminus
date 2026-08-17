//! A barra lateral: a coluna de ícones, o painel que ela abre, e o divisor.

import { $ } from "./nucleo-da-casca.js";
import { desenharArvore } from "./arvore-de-arquivos.js";
import { desenharPlugins } from "./painel-de-plugins.js";
import { desenharConfiguracoes } from "./tela-de-configuracoes.js";


/**
 * A lateral abre e fecha (ADR 0007).
 *
 * Clicar no ícone que já está selecionado **fecha** a lateral e devolve os
 * 250 px ao editor — o gesto do VSCodium, que a mão já sabe, e o `Ctrl+B`
 * também. Fechada, nenhum ícone fica marcado: marcar um painel que não está na
 * tela é dizer o que não é verdade.
 */
export let painelLateral = "explorer";
export let lateralAberta = true;

//* Mostra ou esconde a lateral inteira (o Ctrl+B).
export function definirLateralAberta(aberta: boolean): void {
  lateralAberta = aberta;
  $("side").classList.toggle("oculto", !aberta);
  $("divLateral").classList.toggle("oculto", !aberta);
  for (const b of $("act").querySelectorAll<HTMLElement>("button[data-p]")) {
    b.setAttribute("aria-selected", String(aberta && b.dataset["p"] === painelLateral));
  }
  localStorage.setItem("terminus.lateralAberta", aberta ? "1" : "0");
}

//* Inverte o estado da lateral.
export function alternarLateral(): void {
  definirLateralAberta(!lateralAberta);
}



/** Ícones do cabeçalho do Explorer, no traço do resto da casca. */
export const ACOES_EXPLORER = `
  <button data-acao="novo-arquivo" title="Novo arquivo">
    <svg viewBox="0 0 24 24"><path d="M13 3H6v18h12V8z"/><path d="M13 3v5h5"/>
      <path d="M12 12v6M9 15h6"/></svg></button>
  <button data-acao="nova-pasta" title="Nova pasta">
    <svg viewBox="0 0 24 24"><path d="M3 6h6l2 2h10v11H3z"/><path d="M12 11v6M9 14h6"/></svg></button>
  <button data-acao="atualizar" title="Atualizar">
    <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 11-2.3-5.7"/><path d="M20 4v4h-4"/></svg></button>
  <button data-acao="abrir-pasta" title="Abrir outra pasta">
    <svg viewBox="0 0 24 24"><path d="M3 6h6l2 2h10v11H3z"/></svg></button>`;

//* Troca qual painel a lateral mostra: Explorer, Plugins ou Configurações.
export function definirLateral(painel: string): void {
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


//* Troca qual painel a lateral mostra. Fica aqui, e não em quem chama, porque a
//* variável é lida por outros painéis (a árvore só se desenha se for a visível).
//* Guarda qual painel está visível, para os outros módulos consultarem.
export function definirPainelLateral(nome: string): void {
  painelLateral = nome;
}
