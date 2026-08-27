//* Sabe qual painel a lateral desenha — e e o unico que conhece os tres.

import { $ } from "./nucleo-da-casca.js";
import { aoTrocarPainel } from "./barra-lateral.js";
import { desenharArvore } from "./arvore-de-arquivos.js";
import { desenharExtensoes } from "./painel-de-extensoes.js";
import { desenharConfiguracoes } from "./tela-de-configuracoes.js";

//* Troca qual painel a lateral mostra: Explorer, Extensoes ou Configuracoes.
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
      extensions: "Extensões",
      config: "Configurações",
    }[painel] ?? painel;

  const acoes = $("sideAcoes");
  acoes.innerHTML = "";

  if (painel === "explorer") {
    //! Os icones do cabecalho sao responsabilidade de desenharArvore(), que e
    //!   quem sabe se ha pasta aberta — e e chamada de novo quando ela abre.
    desenharArvore();
  } else if (painel === "extensions") {
    //? ✅ O TERCEIRO PAINEL VOLTOU em 26/08/2026, e nao e o mesmo.
    //! O antigo listava os plugins do lazy.nvim, perguntando ao Neovim vivo — e morreu com o
    //!   motor. Este parte de um dado que ja existe no disco: as extensoes que a pessoa usa
    //!   NO VSCODE. Ele nao instala nada; o que ele responde e "isto e o que voce usa, e isto
    //!   e o que o Terminus saberia carregar", que e a informacao que falta para decidir
    //!   depois. O gesto do clique e o mesmo do painel antigo: abre a pasta no Explorer.
    void desenharExtensoes();
  } else {
    void desenharConfiguracoes();
  }
}

//! A inscricao roda ao carregar o modulo. Quem importa este arquivo e a
//!   `casca-principal`, no arranque.
aoTrocarPainel(definirLateral);
