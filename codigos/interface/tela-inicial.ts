import { $, api, esc } from "./base-da-tela.js";

//? A TELA DE ABERTURA — a MESMA do Neovim da cabeça
//!
//! ⚠️ ISTO SUBSTITUI DUAS TENTATIVAS MINHAS QUE ESTAVAM ERRADAS, e o erro não era de cor:
//! era de leitura do pedido. Pediram *"o meu tema do Neovim ao abrir o programa, em vez do
//! ícone e da mensagem"*, e eu entreguei (1) um ícone com uma frase, e depois (2) uma amostra
//! de cores dizendo *"o tema vem do seu kit"*. **Um tema que explica a si mesmo é um bilhete,
//! não um tema** — e a cabeça teve de mandar foto do Neovim dela para eu ver a diferença.
//!
//! O QUE ELA PEDIU, e sempre esteve escrito num arquivo dela:
//! `~/.config/nvim/lua/plugins/dashboard.lua` — o logotipo JARED, a régua com L I N U X, a
//! ficha da máquina e o "bem-vindo, jared".
//!
//! ⚠️ E AQUELE ARQUIVO JÁ TINHA DECIDIDO como esta tela deve ser aqui dentro. Ele tem a
//! variante `dentro_da_bancada` (`BANCADA == "1"`) que **corta o menu** e deixa só identidade
//! e ficha, com a razão escrita: *"abrir/entrar em pasta é trabalho da casca"*. Esta tela
//! obedece — a decisão já estava tomada por quem tinha o direito de tomá-la, e eu passei duas
//! rodadas inventando no lugar de ler.

/** As cores da tela de abertura. Vêm do `dashboard.lua`; estas são a rede. */
//! ⚠️ A PALETA DESTA TELA **NÃO É A DO `tema.lua`** — é outra, declarada no próprio
//!   `dashboard.lua` com nomes próprios (`ink`, `deep`, `tide`, `glow`, `mist`, `foam`) e uma
//!   regra escrita: *"uma cor viva só (glow), usada com parcimônia. O resto é temperatura."*
//!   Confundir as duas foi parte do que me fez errar.
const RESERVA: Record<string, string> = {
  ink: "#0E0F18", deep: "#1A1C2B", tide: "#333650",
  glow: "#9184D9", mist: "#A8B0C4", foam: "#E9E9ED",
};

/** A proporção de uma célula da fonte monoespaçada: largura ÷ altura. */
//? ⚠️ ISTO CONSERTA UM LOGOTIPO ESTICADO EM 2×, e o erro era de aritmética, não de gosto.
//!
//! A arte tem **58 colunas por 5 linhas**. Eu desenhei cada célula como um quadrado de 1×1,
//! o que dá um desenho de proporção **11,6:1**. Mas no terminal a célula **não é quadrada** —
//! ela é cerca de duas vezes mais alta que larga —, então o desenho verdadeiro é **5,8:1**.
//! Resultado: o nome saía com o dobro da largura que devia ter. A cabeça viu na captura que
//! eu mandei; eu tinha olhado a mesma imagem e não vi.
//!
//! ⚠️ E A PROPORÇÃO É MEDIDA, NÃO CHUTADA. Escrever `0.5` funcionaria hoje e mentiria no dia
//! em que a fonte mudasse — e este projeto já usa duas (`IBM Plex Mono` com `Adwaita Mono`
//! como reserva para os octantes). Aqui a célula é medida na fonte que está de fato
//! desenhando, com o mesmo tamanho e a mesma entrelinha do editor.
function proporcaoDaCelula(): number {
  const sonda = document.createElement("span");
  //! `M` repetido, e não um caractere só: a largura de um glifo isolado sofre arredondamento
  //!   de subpixel, e o erro seria da ordem do que se quer medir. Dez larguras dividem o erro
  //!   por dez.
  sonda.textContent = "MMMMMMMMMM";
  sonda.style.cssText =
    "position:absolute; visibility:hidden; white-space:pre; " +
    "font-family:'IBM Plex Mono','Adwaita Mono',ui-monospace,monospace; " +
    "font-size:13px; line-height:normal";
  document.body.appendChild(sonda);
  const caixa = sonda.getBoundingClientRect();
  document.body.removeChild(sonda);

  //! ⚠️ `line-height:normal` E NÃO `1`. A célula de um TERMINAL tem a altura natural da fonte
  //!   (ascendente + descendente + entrelinha do próprio arquivo), e é para essa célula que a
  //!   arte foi desenhada. Medindo com `line-height:1` eu obtinha 6,96:1 — melhor que os
  //!   11,6:1 do quadrado, e ainda ~20% esticado. Com a entrelinha natural, a proporção é a
  //!   da tela de onde o desenho veio.
  //! A reserva de `0.5` cobre o caso de a medida vir zerada (fonte ainda não assentou) — e é
  //!   a proporção típica de terminal, não um número inventado.
  const largura = caixa.width / 10;
  return caixa.height > 0 && largura > 0 ? largura / caixa.height : 0.5;
}

//* Transforma a arte de blocos num SVG de retângulos.
//! ⚠️ ISTO NÃO É PREFERÊNCIA — É O CONSERTO DE UM DEFEITO QUE SÓ APARECE OLHANDO A TELA.
//!   O logotipo é uma parede de `█` (U+2588). Num TERMINAL cada um preenche a célula inteira
//!   e as letras saem sólidas. Num navegador, não: a fonte deixa fios de fundo entre linhas e
//!   entre colunas, e o desenho sai **listrado**. Tentei `line-height:1` e desligar a
//!   suavização por subpixel — melhorou a franja colorida e **as listras continuaram**.
//! A arte é um BITMAP; então ela é desenhada como bitmap. Cada `█` vira um retângulo de 1×1
//!   num `viewBox`, e retângulos vizinhos se tocam por definição — não por sorte da fonte.
//!   De quebra, escala para qualquer tamanho sem serrilhar, porque é vetor.
//! O `dashboard.lua` já tinha dito isto de outro jeito, e eu levei três tentativas para
//!   entender: *"a resolução de uma imagem de fundo é a da tela; a de arte de células é a da
//!   grade"*. A grade é o que o SVG restitui.
function desenharLogotipo(linhas: string[], cor: string): string {
  if (linhas.length === 0) return "";

  const largura = Math.max(...linhas.map((l) => [...l].length));
  //! ⚠️ A ALTURA DA CÉLULA EM UNIDADES DE LARGURA. Com 1, o desenho fica quadrado e o nome
  //!   sai esticado; com a proporção real da fonte, ele sai como no terminal.
  const alturaDaCelula = 1 / proporcaoDaCelula();
  const retangulos: string[] = [];

  //! ⚠️ FAIXAS, E NÃO UM RETÂNGULO POR BLOCO — e isto também só apareceu OLHANDO a captura.
  //!   Com um `<rect>` de 1×1 por célula, cada borda ganha antisserrilhado e o desenho fica
  //!   costurado por uma grade de fios claros: sólido de longe, quadriculado de perto.
  //!   Juntando os blocos vizinhos de uma linha num retângulo só, as costuras VERTICAIS
  //!   deixam de existir — não são escondidas, deixam de ser desenhadas.
  //! O `shape-rendering="crispEdges"` cuida do que sobra (as horizontais, entre linhas):
  //!   ele manda o navegador alinhar as bordas ao pixel em vez de suavizá-las, que é
  //!   exatamente o que um terminal faz com uma célula.
  linhas.forEach((linha, y) => {
    //! Varre por CARACTERE (spread), não por índice: `█` cabe em um code unit, mas varrer por
    //!   `charAt` quebraria no dia em que o desenho usar meio-bloco (U+2596…) — e o próprio
    //!   `tema.lua` conta que octantes já foram tentados aqui.
    const celulas = [...linha];
    let inicio = -1;
    for (let x = 0; x <= celulas.length; x += 1) {
      const cheia = x < celulas.length && (celulas[x] as string).trim() !== "";
      if (cheia && inicio === -1) inicio = x;
      if (!cheia && inicio !== -1) {
        retangulos.push(
          `<rect x="${inicio}" y="${(y * alturaDaCelula).toFixed(3)}" ` +
            `width="${x - inicio}" height="${alturaDaCelula.toFixed(3)}"/>`,
        );
        inicio = -1;
      }
    }
  });

  return `<svg class="marca" viewBox="0 0 ${largura} ${(linhas.length * alturaDaCelula).toFixed(3)}"
    style="fill:${esc(cor)}" preserveAspectRatio="xMinYMid meet"
    shape-rendering="crispEdges" aria-label="JARED">${retangulos.join("")}</svg>`;
}

//* Desenha a tela de abertura.
export async function desenharTelaInicial(): Promise<void> {
  const alvo = $("vazio");
  const r = await api.telaDeAbertura();
  const dados = r.ok ? r.valor : { logotipo: [], cores: {}, ficha: [] };
  const c = { ...RESERVA, ...dados.cores };

  const logotipo = desenharLogotipo(dados.logotipo, c["foam"] as string);

  const ficha = dados.ficha
    .map(
      ([chave, valor]) =>
        `<div class="fl"><span class="k" style="color:${c["tide"]}">${esc(chave.toUpperCase())}</span>` +
        `<span class="v" style="color:${c["mist"]}">${esc(valor)}</span></div>`,
    )
    .join("");

  alvo.innerHTML = `
    <div class="abertura">
      <div class="rotulo" style="color:${c["tide"]}">J A R E D - L I N U X</div>
      ${logotipo}
      <div class="regua">
        <span style="background:${c["tide"]}"></span>
        <span class="lx" style="color:${c["mist"]}">L&nbsp;&nbsp;I&nbsp;&nbsp;N&nbsp;&nbsp;U&nbsp;&nbsp;X</span>
        <span style="background:${c["tide"]}"></span>
      </div>
      <div class="ficha">${ficha}</div>
      <div class="saudacao" style="color:${c["tide"]}">bem-vindo, jared</div>
    </div>`;
}
