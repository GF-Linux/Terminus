import type { Catalogo, NoArquivo, ProjetoAberto, Resultado } from "../../shared/tipos.js";
import { Editor } from "./editor.js";
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
let painelAcao: (() => void) | null = null;

/* ============================ terminal ============================ */

const terminal = new TerminalSaida($("term"));

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

function definirLateral(painel: string): void {
  $("sideT").textContent =
    { explorer: "Explorer", extensions: "Extensions", bancada: "Bancada", config: "Configurações" }[
      painel
    ] ?? painel;

  const acao = $("sideAcao");
  const corpo = $("lateral");
  painelAcao = null;
  acao.textContent = "";

  if (painel === "explorer") {
    acao.textContent = "···";
    painelAcao = () => void escolherProjeto();
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

  const nivel = (nos: NoArquivo[], prof: number): void => {
    for (const no of nos) {
      const recuo = 8 + prof * 14;
      if (no.tipo === "pasta") {
        const aberta = expandidas.has(no.caminho);
        linhas.push(
          `<button class="row" data-pasta="${esc(no.caminho)}" style="padding-left:${recuo}px">
             <span class="ch">${aberta ? "&#9662;" : "&#9656;"}</span>
             <span class="ic">&#128193;</span><span class="nome">${esc(no.nome)}</span></button>`,
        );
        if (aberta) nivel(expandidas.get(no.caminho)!, prof + 1);
      } else {
        const aberto = abas[ativa]?.caminho === no.caminho;
        // O .ab1 aparece na árvore mas não abre: ainda não há cromatograma.
        const suportado = /\.(py|txt|md|fasta|fa|fastq|csv|tsv|json|xml|cfg|toml|ya?ml)$/i.test(no.nome);
        linhas.push(
          `<button class="row${aberto ? " on" : ""}${suportado ? "" : " opaco"}"
                   data-arquivo="${esc(no.caminho)}" style="padding-left:${recuo + 16}px"
                   ${suportado ? "" : 'title="Sem visualizador nesta versão"'}>
             <span class="ic">&#9679;</span><span class="nome">${esc(no.nome)}</span></button>`,
        );
      }
    }
  };

  nivel(projeto.filhos, 1);
  corpo.innerHTML = linhas.join("");
}

async function escolherProjeto(): Promise<void> {
  const p = ou(await api.escolherProjeto(), null);
  if (!p) return;
  projeto = p;
  expandidas.clear();
  desenharArvore();
  terminal.nota(`pasta aberta: ${p.raiz}`);
}

async function alternarPasta(caminho: string): Promise<void> {
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

$("sideAcao").addEventListener("click", () => painelAcao?.());

$("lateral").addEventListener("click", (ev) => {
  const alvo = ev.target as HTMLElement;
  const pasta = alvo.closest<HTMLElement>("[data-pasta]");
  if (pasta) return void alternarPasta(pasta.dataset["pasta"]!);
  const arq = alvo.closest<HTMLElement>("[data-arquivo]");
  if (arq) return void abrirArquivo(arq.dataset["arquivo"]!);
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

// Ctrl+` — o mesmo atalho do VSCodium, porque é o que a mão do usuário já sabe.
window.addEventListener("keydown", (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key === "`") {
    ev.preventDefault();
    alternarPainel();
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
