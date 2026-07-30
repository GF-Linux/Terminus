import type { Catalogo, NoArquivo, ProjetoAberto, Resultado } from "../../shared/tipos.js";
import { Editor } from "./editor.js";
import { Paleta, type ItemPaleta } from "./paleta.js";
import { TerminalSaida } from "./terminal.js";

/* -------------------------------------------------------------------------
   P1.3 — o painel da Bancada segue pausado a pedido do autor (26/07), enquanto
   a estrutura é definida. O catálogo já está carregado e verificado; o que falta
   é decidir a forma da navegação, não os dados.
   ------------------------------------------------------------------------- */
const BANCADA_PAUSADA = true;

const api = window.bancada;
const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} não existe no index.html`);
  return el as T;
};

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Desembrulha um Resultado, mostrando o erro no terminal em vez de sumir com ele. */
function ou<T>(r: Resultado<T>, aoFalhar: T): T {
  if (r.ok) return r.valor;
  terminal.erro(`${r.erro}\r\n`);
  abrirPainel();
  return aoFalhar;
}

/* ============================ estado ============================ */

interface Aba {
  caminho: string;
  nome: string;
  /** O que está em edição — pode divergir do disco. */
  conteudo: string;
  /** O que está no disco. `conteudo !== gravado` é o que acende o marcador. */
  gravado: string;
}

const estaSuja = (a: Aba): boolean => a.conteudo !== a.gravado;

let projeto: ProjetoAberto | null = null;
let catalogo: Catalogo | null = null;
const abas: Aba[] = [];
let ativa: number = -1;
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

/** Abre o arquivo de um quadro de traceback e para o cursor na linha. */
async function irParaQuadro(arquivo: string, linha: number): Promise<void> {
  await abrirArquivo(arquivo);
  // Só salta se o arquivo realmente virou a aba ativa — se a leitura falhou,
  // saltar levaria o cursor para a linha errada de outro arquivo.
  if (abas[ativa]?.caminho === arquivo) editor.irParaLinha(linha);
}

function definirPainel(aberto: boolean): void {
  $("painel").classList.toggle("oculto", !aberto);
  $("btPainel").classList.toggle("on", aberto);
  if (aberto) terminal.reajustar();
}

function abrirPainel(): void {
  definirPainel(true);
}

function alternarPainel(): void {
  definirPainel($("painel").classList.contains("oculto"));
}

/* ============================ editor ============================ */

const editor = new Editor({
  host: $("editorHost"),
  aoMudar: () => {
    if (ativa >= 0) {
      abas[ativa]!.conteudo = editor.conteudo();
      desenharAbas();
    }
  },
  aoMoverCursor: ({ linha, coluna }) => {
    $("posicao").textContent = `Ln ${linha}, Col ${coluna}`;
  },
  aoSalvar: () => void salvar(),
  aoRodar: () => void rodar(),
});

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
    { explorer: "Explorer", extensions: "Extensions", bancada: "Bancada", config: "Configurações" }[
      painel
    ] ?? painel;

  const acoes = $("sideAcoes");
  const corpo = $("lateral");
  acoes.innerHTML = "";

  if (painel === "explorer") {
    // Os ícones do cabeçalho são responsabilidade de desenharArvore(), que é
    // quem sabe se há pasta aberta — e é chamada de novo quando ela abre.
    desenharArvore();
  } else if (painel === "extensions") {
    // Sem casca do VSCodium não há marketplace (ADR 0003). O ícone ficou porque
    // o autor pediu na spec P1.3; o painel diz a verdade sobre o que há atrás.
    corpo.innerHTML = `<div class="aviso"><b>Sem marketplace</b>
      A Bancada não usa a casca do VSCodium, então não há extensões de terceiros
      para instalar. O que seria extensão aqui é o próprio catálogo do Biopython,
      que vive na barra de atividades como item de primeira classe.</div>`;
  } else if (painel === "bancada") {
    if (BANCADA_PAUSADA) {
      const c = catalogo;
      corpo.innerHTML = `<div class="aviso"><b>Pausado</b>
        A estrutura deste painel está em definição.<br><br>
        ${
          c
            ? `O catálogo já está carregado: <code>${c.task_count}</code> tarefas e
               <code>${c.entry_count}</code> funções verificadas contra o Biopython
               <code>${esc(c.biopython_version)}</code>.`
            : `<span style="color:var(--T)">O catálogo não carregou.</span>
               Rode <code>python3 tools/build_catalog.py</code>.`
        }</div>`;
    } else {
      desenharCatalogo();
    }
  } else {
    corpo.innerHTML = `<div class="aviso"><b>Ainda não existe</b>
      O interpretador usado está fixo no código (<code>src/main/ambiente.ts</code>).
      Vira tela de configuração quando houver mais de uma coisa para configurar.</div>`;
  }
}

/** O navegador de catálogo, preservado atrás de BANCADA_PAUSADA. */
function desenharCatalogo(): void {
  const c = catalogo;
  if (!c) return;
  $("lateral").innerHTML = c.tasks
    .map(
      (t) =>
        `<button class="row" data-tarefa="${esc(t.id)}"><span class="ch">&#9656;</span>
         <span class="nome">${esc(t.title)}</span>
         <span style="margin-left:auto;font-family:var(--mono);font-size:10px;color:var(--fg36)">${t.entries.length}</span>
        </button>`,
    )
    .join("");
}

function desenharArvore(): void {
  const corpo = $("lateral");
  // Sem pasta aberta não há o que criar nem atualizar: o cabeçalho fica vazio.
  $("sideAcoes").innerHTML = projeto ? ACOES_EXPLORER : "";

  if (!projeto) {
    corpo.innerHTML = `<div class="aviso"><b>Nenhuma pasta aberta</b>
      Abra a pasta da corrida para ver os arquivos e rodar os scripts nela.
      <button class="acao" id="btAbrirPasta">Abrir pasta…</button></div>`;
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
        const aberto = abas[ativa]?.caminho === no.caminho;
        // O .ab1 aparece na árvore mas não abre: ainda não há cromatograma.
        const suportado = /\.(py|txt|md|fasta|fa|fastq|csv|tsv|json|xml|cfg|toml|ya?ml)$/i.test(no.nome);
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

  // Renomear move o arquivo: a aba aberta tem de acompanhar, senão o próximo
  // Ctrl+S gravaria num caminho que não existe mais e recriaria o arquivo antigo.
  if (op.modo === "renomear") {
    const antigo = op.alvo!;
    for (const aba of abas) {
      if (aba.caminho === antigo) {
        aba.caminho = r.valor;
        aba.nome = r.valor.split("/").pop() ?? r.valor;
      } else if (aba.caminho.startsWith(`${antigo}/`)) {
        aba.caminho = r.valor + aba.caminho.slice(antigo.length);
      }
    }
    if (expandidas.has(antigo)) expandidas.delete(antigo);
    desenharAbas();
  }

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

  // Fecha as abas do que sumiu, sem perguntar de novo: o arquivo já foi para a
  // lixeira, insistir em "há alterações não gravadas" não salvaria nada.
  for (let i = abas.length - 1; i >= 0; i--) {
    const c = abas[i]!.caminho;
    if (c === alvo || c.startsWith(`${alvo}/`)) {
      abas.splice(i, 1);
      if (ativa >= i) ativa--;
    }
  }
  if (abas.length === 0) {
    ativa = -1;
    editor.abrir("");
  } else {
    if (ativa < 0) ativa = 0;
    editor.abrir(abas[ativa]!.conteudo, abas[ativa]!.gravado);
  }
  expandidas.delete(alvo);
  desenharAbas();
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
  const aberto = abas[ativa]?.caminho;
  if (aberto) {
    const dir = aberto.slice(0, aberto.lastIndexOf("/"));
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
  // Bancada tem de aparecer sem exigir "atualizar". Numa pasta de corrida a
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
  menu.innerHTML = `
    <button data-m="novo-arquivo">Novo arquivo</button>
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
  }
});

window.addEventListener("click", (ev) => {
  if (!(ev.target as HTMLElement).closest("#menu")) fecharMenu();
});
window.addEventListener("blur", fecharMenu);

async function escolherProjeto(): Promise<void> {
  const p = ou(await api.escolherProjeto(), null);
  if (!p) return;
  projeto = p;
  expandidas.clear();
  pastaAlvo = null;
  desenharArvore();
  terminal.nota(`pasta aberta: ${p.raiz}`);
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

/* ============================ abas ============================ */

function desenharAbas(): void {
  $("abas").innerHTML = abas
    .map((a, i) => {
      const sujo = estaSuja(a);
      return `<span class="tab${i === ativa ? " on" : ""}" data-aba="${i}">
           ${esc(a.nome)}
           <button class="${sujo ? "sujo" : "x"}" data-fechar="${i}"
                   title="${sujo ? "Não gravado" : "Fechar"}">${sujo ? "" : "✕"}</button>
         </span>`;
    })
    .join("");

  const a = abas[ativa];
  $("trilha").innerHTML = a
    ? `${esc(projeto?.nome ?? "")} <span>&rsaquo;</span> ${esc(a.nome)}`
    : "";
  $("tituloDoc").textContent = a
    ? `${a.nome}${estaSuja(a) ? " •" : ""}${projeto ? ` — ${projeto.nome}` : ""}`
    : "Bancada";
  $("editorHost").classList.toggle("ativo", ativa >= 0);
  $("vazio").classList.toggle("oculto", ativa >= 0);
}

async function abrirArquivo(caminho: string): Promise<void> {
  const jaAberta = abas.findIndex((a) => a.caminho === caminho);
  if (jaAberta >= 0) {
    trocarAba(jaAberta);
    return;
  }

  const r = await api.ler(caminho);
  if (!r.ok) {
    terminal.erro(`${r.erro}\r\n`);
    abrirPainel();
    return;
  }

  guardarAtual();
  abas.push({
    caminho,
    nome: caminho.split("/").pop() ?? caminho,
    conteudo: r.valor,
    gravado: r.valor,
  });
  ativa = abas.length - 1;
  editor.abrir(r.valor);
  desenharAbas();
  desenharArvore();
  editor.focar();
}

/** Guarda o texto em edição na aba atual antes de trocar de documento. */
function guardarAtual(): void {
  if (ativa >= 0) abas[ativa]!.conteudo = editor.conteudo();
}

function trocarAba(i: number): void {
  if (i === ativa || !abas[i]) return;
  guardarAtual();
  ativa = i;
  editor.abrir(abas[i]!.conteudo, abas[i]!.gravado);
  desenharAbas();
  desenharArvore();
  editor.focar();
}

function fecharAba(i: number): void {
  const a = abas[i];
  if (!a) return;
  if (estaSuja(a) && !confirm(`${a.nome} tem alterações não gravadas. Fechar mesmo assim?`)) return;

  abas.splice(i, 1);
  if (abas.length === 0) {
    ativa = -1;
    editor.abrir("");
  } else {
    ativa = Math.min(i, abas.length - 1);
    editor.abrir(abas[ativa]!.conteudo, abas[ativa]!.gravado);
  }
  desenharAbas();
  desenharArvore();
}

async function salvar(): Promise<void> {
  const a = abas[ativa];
  if (!a) return;
  const conteudo = editor.conteudo();
  const r = await api.gravar(a.caminho, conteudo);
  if (!r.ok) {
    terminal.erro(`não gravei ${a.nome}: ${r.erro}\r\n`);
    abrirPainel();
    return;
  }
  a.conteudo = conteudo;
  a.gravado = conteudo;
  editor.marcarGravado();
  desenharAbas();
}

/* ============================ execução ============================ */

let rodando = false;

function definirRodando(v: boolean): void {
  rodando = v;
  ($("btRodar") as HTMLButtonElement).disabled = v;
  ($("btParar") as HTMLButtonElement).disabled = !v;
  $("estadoExec").textContent = v ? "rodando…" : "pronto";
}

async function rodar(): Promise<void> {
  const a = abas[ativa];
  if (!a || rodando) return;
  if (!a.nome.endsWith(".py")) {
    terminal.nota(`${a.nome} não é script Python — nada a rodar.`);
    abrirPainel();
    return;
  }

  if (estaSuja(a)) await salvar();

  abrirPainel();
  terminal.comando(projeto?.nome ?? "", `python -u ${a.nome}`);
  definirRodando(true);
  api.rodar(a.caminho);
}

api.aoExecutar((e) => {
  switch (e.tipo) {
    case "saida":
      terminal.escrever(e.texto);
      break;
    case "erro":
      terminal.erro(e.texto);
      break;
    case "fim":
      definirRodando(false);
      terminal.nota(
        e.sinal
          ? `\r\ninterrompido (${e.sinal})`
          : e.codigo === 0
            ? "\r\nconcluído"
            : `\r\nsaiu com código ${e.codigo}`,
      );
      break;
    case "falha":
      definirRodando(false);
      terminal.erro(`\r\n${e.mensagem}\r\n`);
      break;
  }
});

/* ============================ ligações ============================ */

$("act").addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-p]");
  if (!b) return;
  for (const x of $("act").querySelectorAll("button")) {
    x.setAttribute("aria-selected", String(x === b));
  }
  definirLateral(b.dataset["p"]!);
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

$("abas").addEventListener("click", (ev) => {
  const alvo = ev.target as HTMLElement;
  const fechar = alvo.closest<HTMLElement>("[data-fechar]");
  if (fechar) {
    ev.stopPropagation();
    return fecharAba(Number(fechar.dataset["fechar"]));
  }
  const aba = alvo.closest<HTMLElement>("[data-aba]");
  if (aba) trocarAba(Number(aba.dataset["aba"]));
});

$("btRodar").addEventListener("click", () => void rodar());
$("btParar").addEventListener("click", () => api.parar());
$("btLimpar").addEventListener("click", () => terminal.limpar());
$("btFecharPainel").addEventListener("click", () => definirPainel(false));
$("btPainel").addEventListener("click", () => alternarPainel());

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
  if (mod && ev.key.toLowerCase() === "w" && ativa >= 0) {
    ev.preventDefault();
    fecharAba(ativa);
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
  desenharAbas();
  definirRodando(false);

  // `bancada ~/corridas/18S` já abre a pasta, sem passar pelo diálogo.
  const inicial = await api.projetoInicial();
  if (inicial.ok && inicial.valor) {
    projeto = inicial.valor;
    desenharArvore();
  }

  const c = await api.catalogo();
  if (c.ok) {
    catalogo = c.valor;
  } else {
    terminal.erro(`${c.erro}\r\n`);
    abrirPainel();
  }

  // A barra de estado mostra o ambiente detectado, nunca um valor escrito à mão.
  const v = await api.versoes();
  if (v.ok) {
    const { biopython, blast, tracy, python } = v.valor;
    $("ambiente").textContent = `Biopython ${biopython} · BLAST+ ${blast} · Tracy ${tracy}`;
    $("pyver").textContent = `Python ${python}`;
  } else {
    $("ambiente").textContent = "ambiente não detectado";
  }
}

void iniciar();
