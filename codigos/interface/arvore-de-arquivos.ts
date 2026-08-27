//! A árvore de arquivos do Explorer: abrir pasta, navegar, criar, renomear,
//! excluir e o menu de contexto. É o painel que mais gente toca com o mouse.

import type { NoArquivo, ProjetoAberto } from "../compartilhado/tipos.js";
import {
  $, abrirArquivo, abrirPainel, api, avisar, esc, estado, expandidas, ou, terminal,
} from "./nucleo-da-casca.js";
import { largarTudo } from "./estado-do-editor.js";
import { Paleta, type ItemPaleta } from "./busca-rapida-de-arquivo.js";
import { ACOES_EXPLORER, painelLateral } from "./barra-lateral.js";

//* Redesenha a árvore inteira do Explorer.
//! Só pinta se o Explorer for o painel visível — senão qualquer coisa que abra
//!   arquivo jogaria a árvore por cima do painel que está na tela.
export function desenharArvore(): void {
  // Só pinta se o Explorer for o painel visível. Sem isto, qualquer coisa que
  // abrisse arquivo — o traceback clicável, o Ctrl+P — jogava a árvore por cima
  // do painel que estava na tela.
  if (painelLateral !== "explorer") return;
  const corpo = $("lateral");
  // Sem pasta aberta não há o que criar nem atualizar: o cabeçalho fica vazio.
  $("sideAcoes").innerHTML = estado.projeto ? ACOES_EXPLORER : "";

  if (!estado.projeto) {
    // As pastas já abertas ficam à mão: o Terminus volta sozinha na última, e
    // trocar entre as corridas da semana não devia passar por diálogo de
    // arquivo. O ✕ tira da lista sem tocar no disco.
    const lista = estado.recentes.length
      ? `<div class="estado.recentes"><span class="rot">Abertas antes</span>${estado.recentes
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
    `<div class="sect"><span class="ch">&#9662;</span>${esc(estado.projeto.nome)}</div>`,
  ];

  /** A linha com o campo de texto, quando há nome sendo digitado nesta pasta. */
  const campo = (dir: string, recuo: number): void => {
    if (!estado.renomeando || estado.renomeando.modo === "renomear" || estado.renomeando.dir !== dir) return;
    const ic = estado.renomeando.modo === "pasta" ? "&#128193;" : "&#9679;";
    linhas.push(
      `<div class="row" style="padding-left:${recuo}px">
         <span class="ic">${ic}</span><input id="campoNome" spellcheck="false"></div>`,
    );
  };

  const nivel = (nos: NoArquivo[], prof: number): void => {
    for (const no of nos) {
      const recuo = 8 + prof * 14;
      const editando = estado.renomeando?.modo === "renomear" && estado.renomeando.alvo === no.caminho;

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

  campo(estado.projeto.raiz, 8 + 14);
  nivel(estado.projeto.filhos, 1);
  corpo.innerHTML = linhas.join("");

  const entrada = document.getElementById("campoNome") as HTMLInputElement | null;
  if (entrada) prepararCampo(entrada);
}

/* -------------------- criar, renomear, excluir na árvore ------------------ */

//* Prepara o campo de nome: seleciona só o nome, sem a extensão.
export function prepararCampo(entrada: HTMLInputElement): void {
  const atual = estado.renomeando;
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
    estado.renomeando = null;
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

//* Confirma o nome digitado e cria (ou renomeia) de verdade.
//! Renomear NÃO avisa o Neovim: o buffer aberto segue no nome antigo, e é
//!   preciso reabrir o arquivo.
export async function confirmarNome(
  op: NonNullable<typeof estado.renomeando>,
  nome: string,
): Promise<void> {
  estado.renomeando = null;
  const raiz = estado.projeto?.raiz;
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

//* Exclui um arquivo ou pasta, com confirmação do sistema.
//! Vai para a LIXEIRA, nunca `unlink` — e quando a lixeira não alcança, a tela
//!   diz "apagar de vez, não tem volta" em vez de prometer recuperação.
export async function excluir(alvo: string): Promise<void> {
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

//* Relê do disco as pastas abertas e redesenha. É o botão de atualizar.
export async function atualizarArvore(): Promise<void> {
  if (!estado.projeto) return;
  const raiz = await api.abrirProjeto(estado.projeto.raiz);
  if (!raiz.ok) {
    terminal.erro(`${raiz.erro}\r\n`);
    return;
  }
  estado.projeto = raiz.valor;

  for (const dir of [...expandidas.keys()]) {
    const filhos = await api.listar(dir);
    // Pasta que sumiu do disco simplesmente deixa de estar expandida.
    if (filhos.ok) expandidas.set(dir, filhos.valor);
    else expandidas.delete(dir);
  }
  desenharArvore();
}

//* Onde um "novo arquivo" deve nascer: a pasta em foco, ou a raiz.
export function dirCorrente(): string {
  if (estado.pastaAlvo && expandidas.has(estado.pastaAlvo)) return estado.pastaAlvo;
  {
    const dir = "";
    if (dir === estado.projeto?.raiz || expandidas.has(dir)) return dir;
  }
  return estado.projeto?.raiz ?? "";
}

//* Começa a criar arquivo ou pasta: abre o campo de nome NA árvore.
export function comecarNovo(modo: "arquivo" | "pasta", dir = dirCorrente()): void {
  if (!estado.projeto) return;
  estado.renomeando = { modo, dir };
  desenharArvore();
}

//* Começa a renomear: abre o campo de nome sobre a linha escolhida.
export function comecarRenomear(alvo: string): void {
  if (!estado.projeto) return;
  estado.renomeando = { modo: "renomear", dir: alvo.slice(0, alvo.lastIndexOf("/")), alvo };
  desenharArvore();
}

/* ------------------------------ abertura rápida --------------------------- */

export const paleta = new Paleta((item: ItemPaleta) => void abrirArquivo(item.abs));

//* Abre o Ctrl+P: busca por subsequência em todos os arquivos do projeto.
export async function abrirPaleta(): Promise<void> {
  const raiz = estado.projeto?.raiz;
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

//* Fecha o menu de contexto.
export function fecharMenu(): void {
  $("menu").classList.add("oculto");
}

//* Abre o menu de contexto da árvore no ponto clicado.
export function abrirMenu(x: number, y: number, alvo: string, pasta: boolean): void {
  const menu = $("menu");
  const dir = pasta ? alvo : alvo.slice(0, alvo.lastIndexOf("/"));

  // A raiz do estado.projeto **não** tem "Excluir" (ADR 0013). Ela tem "Fechar pasta",
  // que é o que a pessoa quer dizer quando manda a pasta embora da IDE. O menu
  // antigo oferecia excluir mirando a raiz, e um clique no vazio da árvore
  // mandava a pasta de trabalho inteira para a lixeira do sistema.
  const ehRaiz = alvo === estado.projeto?.raiz;
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
      if (dir !== estado.projeto?.raiz && !expandidas.has(dir)) void alternarPasta(dir);
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
      void fecharProjeto();
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

//* Encurta um caminho para caber na tela, trocando a home por `~`.
export function encurtar(caminho: string): string {
  const pai = caminho.slice(0, caminho.lastIndexOf("/")).replace(/^\/home\/[^/]+/, "~");
  return pai.length > LARGURA_CAMINHO ? `…${pai.slice(-LARGURA_CAMINHO)}` : pai;
}


//* Relê a lista de pastas abertas antes.
export async function atualizarRecentes(): Promise<void> {
  const r = await api.pastasRecentes();
  estado.recentes = r.ok ? r.valor : [];
}

//* Assume uma pasta como o projeto aberto: árvore, recentes e terminal.
export async function assumirProjeto(p: ProjetoAberto): Promise<void> {
  estado.projeto = p;
  expandidas.clear();
  estado.pastaAlvo = null;
  await atualizarRecentes();
  desenharArvore();
  terminal.nota(`pasta aberta: ${p.raiz}`);
  // O terminal vai junto: seguir digitando dentro da pasta anterior seria o
  // engano mais fácil de cometer e mais difícil de notar.
  await levarTerminalPara(p.raiz);
  avisarQueTrocou();
}

/**
 * Leva o terminal para a pasta recém-aberta, escrevendo um `cd` de verdade.
 *
 * Desde 19/08 o terminal é um shell com PTY, então a pasta dele é do bash — não
 * há mais um valor nosso para trocar por dentro. O `cd` aparece na tela como
 * qualquer linha digitada, e é assim que deve ser: quem lê o rolo depois vê por
 * que a pasta mudou.
 *
 * Com programa rodando na frente, a linha é RECUSADA pelo lado do sistema e o
 * aviso vem no lugar dela. Escrever `cd` dentro de um `python` interativo ou de
 * um `sudo` esperando senha seria pior do que não trocar de pasta.
 */
async function levarTerminalPara(raiz: string): Promise<void> {
  const r = await api.shell.irPara(raiz);
  if (r.ok && !r.valor) {
    terminal.nota(`o terminal está ocupado — ele continua na pasta anterior (cd '${raiz}' quando terminar)`);
  }
}

/**
 * Avisa o resto da casca que a pasta aberta é outra (ADR 0027).
 *
 * É um evento e não uma chamada porque quem escuta — o chip de fluxo da barra —
 * precisa abrir projeto, e abrir projeto é daqui. Chamar de volta fecharia um
 * ciclo entre os dois módulos; o evento deixa a seta apontando só para um lado.
 */
function avisarQueTrocou(): void {
  window.dispatchEvent(new CustomEvent("terminus:projeto-trocou"));
}

//* Abre o diálogo do sistema para escolher a pasta.
export async function escolherProjeto(): Promise<void> {
  const p = ou(await api.escolherProjeto(), null);
  if (!p) return;
  await assumirProjeto(p);
}

//* Fecha a pasta aberta. NÃO toca no disco.
//! Existe por um incidente: sem o verbo "fechar", um "Excluir" na raiz mandou
//!   `~/projetos` inteiro para a lixeira.
//! ⚠️ O MAIN É AVISADO PRIMEIRO, e a ordem é a regra (árvore **A7**, consertada em 24/08).
//!   Até hoje esta função era só da tela: limpava `estado.projeto`, redesenhava e avisava,
//!   sem uma única chamada ao main. A pasta "fechada" seguia gravável pelos quatro canais de
//!   escrita e seguia "protegida" contra exclusão, com a recusa dizendo que ela estava aberta.
//! POR QUE AVISAR ANTES DE LIMPAR A TELA, e não depois: se o main recusar, a tela ainda mostra
//!   a pasta e a pessoa vê o erro com o estado íntegro. Limpando primeiro, uma falha deixaria
//!   tela e main discordando — que é exatamente o defeito que este conserto acaba de fechar.
export async function fecharProjeto(): Promise<void> {
  const r = await api.fecharPasta();
  if (!r.ok) {
    terminal.erro(`${r.erro}\r\n`);
    abrirPainel();
    return;
  }
  const nome = estado.projeto?.nome;
  estado.projeto = null;
  expandidas.clear();
  //! ⚠️ AS ABAS TAMBÉM VÃO (26/08). Sem isto, fechar a pasta deixaria abertos arquivos de um
  //!   projeto que já não está aberto — e o Ctrl+S deles apontaria para fora da raiz
  //!   confinada, sendo recusado pelo main com uma frase que a tela não saberia explicar.
  //!   O `largarTudo` descarta os modelos (senão eles vazam) e avisa o Copilot de cada um.
  largarTudo();
  estado.pastaAlvo = null;
  desenharArvore();
  if (nome) terminal.nota(`pasta fechada: ${nome} (nada foi apagado)`);
  avisar(`${nome ?? "pasta"} fechada — nada foi apagado`);
  //! O terminal NÃO é mandado para lugar nenhum ao fechar a pasta. Fechar não é
  //! um pedido de sair de onde se está: quem estava no meio de um trabalho na
  //! pasta continua nela, e o Konsole também não se mexeria.
  avisarQueTrocou();
}

//* Abre uma pasta da lista de recentes, sem passar pelo diálogo.
export async function abrirRecente(raiz: string): Promise<void> {
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

//* Abre ou fecha uma pasta da árvore, lendo o conteúdo na primeira vez.
export async function alternarPasta(caminho: string): Promise<void> {
  estado.pastaAlvo = expandidas.has(caminho) ? null : caminho;
  if (expandidas.has(caminho)) {
    expandidas.delete(caminho);
  } else {
    expandidas.set(caminho, ou(await api.listar(caminho), []));
  }
  desenharArvore();
}

