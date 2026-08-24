//* Sabe qual painel a lateral desenha — e e o unico que conhece os tres.

import { $ } from "./nucleo-da-casca.js";
import { aoTrocarPainel } from "./barra-lateral.js";
import { desenharArvore } from "./arvore-de-arquivos.js";
import { desenharPlugins } from "./painel-de-plugins.js";
import { desenharConfiguracoes } from "./tela-de-configuracoes.js";

//* Troca qual painel a lateral mostra: Explorer, Plugins ou Configuracoes.
//! POR QUE ESTE MODULO EXISTE: o despacho morava em `barra-lateral.ts`, que por
//!   isso importava os tres paineis — e dois deles importavam a barra de volta.
//!   Dois ciclos de import, sobreviventes a duas refatoracoes anteriores deste
//!   alvo, porque os portoes daquelas corridas nao mediam ciclo.
//! Aqui a seta anda num sentido so: este modulo conhece os paineis, os paineis
//!   conhecem a barra, e a barra nao conhece ninguem.
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
    //! Os icones do cabecalho sao responsabilidade de desenharArvore(), que e
    //!   quem sabe se ha pasta aberta — e e chamada de novo quando ela abre.
    desenharArvore();
  } else if (painel === "extensions") {
    //! O antigo "Extensions" (que so sabia dizer que nao havia marketplace) virou
    //!   o navegador de plugins do Neovim (ADR 0025): o motor tem plugin demais
    //!   para se descobrir de cor, e `:Lazy` e uma tela dentro do editor. Aqui a
    //!   lista fica na lateral, filtravel e clicavel, como numa IDE.
    void desenharPlugins();
  } else {
    void desenharConfiguracoes();
  }
}

//! A inscricao roda ao carregar o modulo. Quem importa este arquivo e a
//!   `casca-principal`, no arranque.
aoTrocarPainel(definirLateral);
