import type {
  Catalogo,
  EstadoTrilha,
  TopicoTrilha,
  Vestimenta,
  NoArquivo,
  ProjetoAberto,
  Resultado,
} from "../../shared/tipos.js";
import { definirCatalogo } from "./completar.js";
import { VistaCromatograma } from "./cromatograma.js";
import { Aparencia, TEMAS } from "./aparencia.js";
import { Editor } from "./editor.js";
import { Mascote } from "./mascote.js";
import { Paleta, type ItemPaleta } from "./paleta.js";
import { definicaoEm, definirArquivoAtual, iniciarServidor, limparArquivo } from "./servidor.js";
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

/**
 * Aba do editor. Só texto: desde a ADR 0006 o `.ab1` não disputa a área de
 * escrita — ele tem abas próprias, no painel de baixo.
 */
interface Aba {
  caminho: string;
  nome: string;
  /** O que está em edição — pode divergir do disco. */
  conteudo: string;
  /** O que está no disco. `conteudo !== gravado` é o que acende o marcador. */
  gravado: string;
  /** Versão do documento no language server; o protocolo exige que só cresça. */
  versao: number;
}

/** Aba do painel do cromatograma. Não guarda o traço: reler é mais barato que
 *  segurar megabytes por arquivo aberto. */
interface AbaAb1 {
  caminho: string;
  nome: string;
}

const estaSuja = (a: Aba): boolean => a.conteudo !== a.gravado;

let projeto: ProjetoAberto | null = null;
let catalogo: Catalogo | null = null;
const abas: Aba[] = [];
let ativa: number = -1;
const ab1s: AbaAb1[] = [];
let ativoAb1: number = -1;
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

/** F12 — mesmo salto do traceback, com o destino vindo do pyright. */
async function irParaDefinicao(): Promise<void> {
  const alvo = await definicaoEm(editor.vista(), editor.posicaoDoCursor());
  if (!alvo) {
    avisar("sem definição para o que está sob o cursor");
    return;
  }
  await irParaQuadro(alvo.arquivo, alvo.linha);
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

function alternarPainel(): void {
  definirPainel($("painel").classList.contains("oculto"));
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
  localStorage.setItem("bancada.lateralAberta", aberta ? "1" : "0");
}

function alternarLateral(): void {
  definirLateralAberta(!lateralAberta);
}

/* ============================ editor ============================ */

const editor = new Editor({
  host: $("editorHost"),
  aoMudar: () => {
    if (ativa >= 0) {
      const aba = abas[ativa]!;
      aba.conteudo = editor.conteudo();
      desenharAbas();
      sincronizarComServidor(aba);
    }
  },
  aoMoverCursor: ({ linha, coluna }) => {
    $("posicao").textContent = `Ln ${linha}, Col ${coluna}`;
  },
  aoSalvar: () => void salvar(),
  aoRodar: () => void rodar(),
  aoImportar: (linhas) => avisar(`import acrescentado: ${linhas.join(" · ")}`),
});

/** Aviso passageiro na barra de estado, para edições que acontecem fora da
 *  vista — hoje só o import automático. */
let avisoPendente: number | undefined;
function avisar(texto: string): void {
  const alvo = $("estadoExec");
  alvo.textContent = texto;
  window.clearTimeout(avisoPendente);
  avisoPendente = window.setTimeout(() => {
    alvo.textContent = rodando ? "rodando…" : "pronto";
  }, 5000);
}

/* ============================ aparência ============================ */

const aparencia = new Aparencia($("fundoTela"), api, () => desenharConfigAparencia());

/* ============================ mascote ============================ */

/** Companhia, não ferramenta (ADR 0008). Só recebe o **tipo** do evento. */
const mascote = new Mascote(
  $("mascote"),
  (texto) => avisar(texto),
  // Auditar a memória dela é abrir o Markdown no editor de sempre — sem tela de
  // edição nova, e com Ctrl+S valendo como em qualquer arquivo (ADR 0009).
  (caminho) => void abrirArquivo(caminho),
);

/* ============================ cromatograma ============================ */

/**
 * O painel de baixo (ADR 0006).
 *
 * O cromatograma deixou de tomar a área do editor: agora é uma faixa deitada
 * embaixo dele, com uma aba por `.ab1`. O formato casa com o dado — o traço é
 * longo em x e curto em y — e, sobretudo, o script continua na tela enquanto o
 * cromatograma está aberto, que é o que a corrida realmente pede.
 */
const vistaAb1 = new VistaCromatograma($("cromatogramaHost"));

const EXT_CROMATOGRAMA = /\.ab1$/i;

function desenharAbasAb1(): void {
  const tem = ab1s.length > 0;
  $("painelCromo").classList.toggle("oculto", !tem);
  $("divCromo").classList.toggle("oculto", !tem);

  $("abasCromo").innerHTML = ab1s
    .map(
      (a, i) =>
        `<span class="pt${i === ativoAb1 ? " on" : ""}" data-ab1="${i}" title="${esc(a.caminho)}">
           ${esc(a.nome)}
           <button class="x" data-fechar-ab1="${i}" title="Fechar">✕</button></span>`,
    )
    .join("");
}

/** Abre — ou traz para a frente — o `.ab1` no painel de baixo. */
async function abrirCromatograma(caminho: string): Promise<void> {
  const ja = ab1s.findIndex((a) => a.caminho === caminho);
  if (ja >= 0) {
    ativoAb1 = ja;
    desenharAbasAb1();
    desenharArvore();
    await mostrarAb1(ab1s[ja]!);
    return;
  }

  const aba: AbaAb1 = { caminho, nome: caminho.split("/").pop() ?? caminho };
  ab1s.push(aba);
  ativoAb1 = ab1s.length - 1;
  // A aba nasce antes do dado chegar: a leitura é feita pelo Python do
  // laboratório e pode levar um segundo, e sem a aba o clique pareceria
  // não ter feito nada.
  desenharAbasAb1();
  desenharArvore();
  avisar(`lendo ${aba.nome}…`);
  await mostrarAb1(aba);
}

/**
 * Lê e desenha um `.ab1`.
 *
 * Relê a cada troca de aba de propósito: guardar megabytes de traço por arquivo
 * aberto custaria mais memória do que reler custa tempo.
 */
async function mostrarAb1(aba: AbaAb1): Promise<void> {
  const r = await api.cromatograma(aba.caminho);
  // Entre o pedido e a resposta o usuário pode ter fechado a aba ou trocado.
  if (ab1s[ativoAb1] !== aba) return;
  if (!r.ok) {
    vistaAb1.falhar(r.erro);
    terminal.erro(`${r.erro}\r\n`);
    abrirPainel();
    return;
  }
  vistaAb1.mostrar(r.valor);
  avisar(`${aba.nome}: ${r.valor.resumo.bases} bases`);
  mascote.reagir("cromatograma");
}

function trocarAb1(i: number): void {
  if (i === ativoAb1 || !ab1s[i]) return;
  ativoAb1 = i;
  desenharAbasAb1();
  desenharArvore();
  void mostrarAb1(ab1s[i]!);
}

function fecharAb1(i: number): void {
  if (!ab1s[i]) return;
  ab1s.splice(i, 1);
  ativoAb1 = ab1s.length === 0 ? -1 : Math.min(i, ab1s.length - 1);
  desenharAbasAb1();
  desenharArvore();
  if (ativoAb1 >= 0) void mostrarAb1(ab1s[ativoAb1]!);
  else vistaAb1.limpar();
}

/** Fecha o painel inteiro — o ✕ do cabeçalho, no gesto do painel do terminal. */
function fecharPainelCromo(): void {
  ab1s.length = 0;
  ativoAb1 = -1;
  vistaAb1.limpar();
  desenharAbasAb1();
  desenharArvore();
}

/* ======================= sincronia com o servidor ======================= */

/**
 * Manda o texto ao pyright depois que a digitação para.
 *
 * Só `.py`: mandar FASTA ou CSV faria o servidor analisar o que não é Python.
 * O atraso existe porque cada tecla dispararia uma reanálise do arquivo inteiro
 * — e a análise é o trabalho caro do outro lado.
 */
let sincronizaPendente: number | undefined;

function ehPython(caminho: string): boolean {
  return caminho.toLowerCase().endsWith(".py");
}

function sincronizarComServidor(aba: Aba): void {
  if (!ehPython(aba.caminho)) return;
  window.clearTimeout(sincronizaPendente);
  sincronizaPendente = window.setTimeout(() => {
    aba.versao += 1;
    api.lsp.mudar(aba.caminho, aba.versao, aba.conteudo);
  }, 300);
}

/** Registra o documento no servidor e passa a ser o alvo dos diagnósticos. */
function focarNoServidor(aba: Aba | undefined): void {
  definirArquivoAtual(aba && ehPython(aba.caminho) ? aba.caminho : null);
  editor.avisarDiagnosticos();
}

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
      extensions: "Extensions",
      bancada: "Bancada",
      trilha: "Trilha",
      config: "Configurações",
    }[painel] ?? painel;

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
  } else if (painel === "trilha") {
    void desenharTrilha();
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
    void desenharConfiguracoes();
  }
}

/* ------------------------- painel de configurações ------------------------ */

async function desenharConfiguracoes(): Promise<void> {
  const corpo = $("lateral");
  const r = await api.fantasma.estado();
  if (!r.ok) {
    corpo.innerHTML = `<div class="aviso"><b>Erro</b>${esc(r.erro)}</div>`;
    return;
  }
  const e = r.valor;

  const alerta = e.chaveEmTextoPuro
    ? `<div class="alerta">A chave está em <b>texto puro</b> no disco, porque este
         sistema não ofereceu chaveiro. Arquivo: <code>${esc(e.arquivo)}</code></div>`
    : "";

  corpo.innerHTML = `
    <div class="cfg">
      <b>Texto fantasma</b>
      <p class="dim">Sugestão de código por IA, em cinza à frente do cursor. Sai
         desta máquina: o trecho em volta do cursor vai para o modelo.</p>
      ${
        e.configurado
          ? `<label class="chave">
               <input type="checkbox" id="cfgLigado" ${e.ligado ? "checked" : ""}>
               <span>${e.ligado ? "Ligado" : "Desligado"}</span>
             </label>
             <div class="linhas">
               <div><span>modelo</span><code>${esc(e.modelo ?? "?")}</code></div>
               <div><span>destino</span><code>${esc(e.endpoint ?? "?")}</code></div>
               <div><span>chave</span><code>${e.chaveiroDisponivel ? "no chaveiro do sistema" : "em texto puro"}</code></div>
             </div>
             ${alerta}
             <button class="acao" id="cfgEsquecer">Esquecer a chave</button>`
          : `<p class="dim">Nenhuma chave configurada.</p>
             <button class="acao" id="cfgImportar">Importar do Twinny (VS Code)</button>`
      }

      <b class="sep">Aparência</b>
      <div id="cfgAparencia"></div>

      <b class="sep">Mascote</b>
      <div id="cfgMascote"></div>

      <b class="sep">Interpretador</b>
      <p class="dim">Ainda fixo no código (<code>src/main/ambiente.ts</code>):
         tenta o env <code>easycontig-demo</code> do miniforge e cai para
         <code>/usr/bin/python3</code>.</p>
    </div>`;

  void desenharConfigMascote();
  desenharConfigAparencia();

  const marca = document.getElementById("cfgLigado") as HTMLInputElement | null;
  marca?.addEventListener("change", async () => {
    await api.fantasma.ligar(marca.checked);
    void desenharConfiguracoes();
  });

  document.getElementById("cfgImportar")?.addEventListener("click", async () => {
    const s = await api.fantasma.importarDoTwinny();
    if (!s.ok) {
      terminal.erro(`${s.erro}\r\n`);
      abrirPainel();
      return;
    }
    avisar("chave importada do Twinny");
    void desenharConfiguracoes();
  });

  document.getElementById("cfgEsquecer")?.addEventListener("click", async () => {
    if (!confirm("Esquecer a chave? O texto fantasma para de funcionar.")) return;
    await api.fantasma.esquecer();
    void desenharConfiguracoes();
  });
}

/* ============================ trilha ============================ */

/**
 * O painel da trilha (ADR 0015).
 *
 * A regra do desenho: **um exercício de cada vez na tela**. Lista de degraus
 * fechada, o tópico aberto mostra abertura, conceitos, recursos e exercícios.
 * Roadmap que mostra tudo aberto vira parede de texto, e parede de texto é onde
 * trilha de estudo morre.
 */
let trilha: EstadoTrilha | null = null;
let topicoAberto: string | null = null;

const VESTIMENTAS: Vestimenta[] = ["sequências", "clínica", "campo", "laboratório"];

async function desenharTrilha(): Promise<void> {
  if (!trilha) {
    const r = await api.trilha.ler();
    if (!r.ok) {
      $("lateral").innerHTML = `<div class="aviso"><b>Trilha indisponível</b>${esc(r.erro)}</div>`;
      return;
    }
    trilha = r.valor;
  }
  pintarTrilha();
}

function pintarTrilha(): void {
  const t = trilha;
  if (!t) return;

  const seletor = `<div class="vestimentas">
      <span class="rot">Contexto dos enunciados</span>
      <div class="opcoes">${VESTIMENTAS.map(
        (v) =>
          `<button class="tema${v === t.vestimenta ? " on" : ""}" data-vest="${v}">${v}</button>`,
      ).join("")}</div>
      <p class="dim">O conceito é o mesmo em todas — muda a roupa do enunciado, e o
         seu progresso não se perde ao trocar.</p>
    </div>`;

  const degraus = t.topicos
    .map((topico) => {
      const total = topico.exercicios.length;
      const feitos = topico.exercicios.filter((e) => t.feito[`${topico.id}/${e.id}`]).length;
      const aberto = topicoAberto === topico.id;
      const estado = total === 0 ? "em preparo" : `${feitos}/${total}`;

      return `<div class="degrau${aberto ? " aberto" : ""}">
        <button class="cab" data-topico="${esc(topico.id)}">
          <span class="sem">${topico.semana}</span>
          <span class="tit">${esc(topico.titulo)}</span>
          <span class="cont${feitos && feitos === total ? " ok" : ""}">${estado}</span>
        </button>
        ${aberto ? corpoDoTopico(topico, t) : ""}
      </div>`;
    })
    .join("");

  $("lateral").innerHTML = `<div class="trilha">${seletor}${degraus}</div>`;
}

function corpoDoTopico(topico: TopicoTrilha, t: EstadoTrilha): string {
  const exercicios = topico.exercicios.length
    ? topico.exercicios
        .map((e) => {
          const chave = `${topico.id}/${e.id}`;
          const feito = Boolean(t.feito[chave]);
          const enunciado = e.enunciados[t.vestimenta] ?? Object.values(e.enunciados)[0] ?? "";
          return `<div class="ex${feito ? " feito" : ""}">
            <div class="assinatura">${esc(e.funcao || e.id)}</div>
            <p>${esc(enunciado)}</p>
            <div class="acoes">
              <button data-praticar="${esc(topico.id)}|${esc(e.id)}">${feito ? "abrir" : "praticar"}</button>
              <button data-verificar="${esc(topico.id)}|${esc(e.id)}">corrigir</button>
            </div>
          </div>`;
        })
        .join("")
    : `<p class="preparo">Os exercícios deste tópico ainda não foram escritos.
         Os conceitos e os recursos já valem — o resto vem.</p>`;

  return `<div class="corpo">
      <p class="abertura">${esc(topico.abertura)}</p>
      <span class="rot">Conceitos</span>
      <ul class="conceitos">${topico.conceitos.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      <span class="rot">Recursos</span>
      <ul class="recursos">${topico.recursos
        .map((r) => `<li><a href="${esc(r.url)}" target="_blank">${esc(r.nome)}</a></li>`)
        .join("")}</ul>
      <span class="rot">Exercícios</span>
      ${exercicios}
      <p class="entrega">Entrega da semana: ${esc(topico.entrega)}</p>
    </div>`;
}

/** Cria (ou reabre) o arquivo do exercício na pasta da corrida e abre no editor. */
async function praticar(topicoId: string, exercicioId: string): Promise<void> {
  const t = trilha;
  const raiz = projeto?.raiz;
  if (!t) return;
  if (!raiz) {
    avisar("abra a pasta da corrida antes — o exercício nasce dentro dela");
    return;
  }
  const topico = t.topicos.find((x) => x.id === topicoId);
  const exercicio = topico?.exercicios.find((x) => x.id === exercicioId);
  if (!topico || !exercicio) return;

  const enunciado = exercicio.enunciados[t.vestimenta] ?? Object.values(exercicio.enunciados)[0] ?? "";
  const r = await api.trilha.praticar({
    raizProjeto: raiz,
    topico: topico.id,
    exercicio,
    vestimenta: t.vestimenta,
    enunciado,
  });
  if (!r.ok) {
    terminal.erro(`${r.erro}\r\n`);
    abrirPainel();
    return;
  }
  await atualizarArvore();
  await abrirArquivo(r.valor.caminho);
  avisar(r.valor.novo ? "exercício criado na pasta da corrida" : "exercício reaberto");
}

/**
 * Roda o verificador do exercício.
 *
 * Usa o mesmo motor de execução do `Ctrl+Enter` — o resultado aparece no
 * terminal de sempre, no Python do laboratório. A correção não é uma tela
 * especial: é o seu código rodando.
 */
async function corrigir(topicoId: string, exercicioId: string): Promise<void> {
  const raiz = projeto?.raiz;
  if (!raiz) {
    avisar("abra a pasta da corrida antes");
    return;
  }
  const arquivo = `${raiz}/trilha/${topicoId}_${exercicioId}.py`;
  const r = await api.trilha.verificar(exercicioId, arquivo);
  if (!r.ok) {
    terminal.erro(`${r.erro}\r\n`);
    abrirPainel();
    return;
  }

  abrirPainel();
  terminal.comando(projeto?.nome ?? "", `corrigir ${topicoId}/${exercicioId}`);
  definirRodando(true);
  mascote.reagir("rodando");
  corrigindo = `${topicoId}/${exercicioId}`;
  api.rodar(r.valor.verificador, [r.valor.teste, r.valor.arquivo]);
}

/** Qual exercício está sendo corrigido agora — para marcar quando passar. */
let corrigindo: string | null = null;

async function concluirCorrecao(passou: boolean): Promise<void> {
  const chave = corrigindo;
  corrigindo = null;
  if (!chave || !passou) return;
  const r = await api.trilha.marcar(chave, true);
  if (r.ok) trilha = r.valor;
  if (painelLateral === "trilha" && lateralAberta) pintarTrilha();
  avisar(`exercício ${chave} passou`);
}

/**
 * A seção de aparência (ADR 0010).
 *
 * O aviso sobre o cromatograma fica escrito na tela, e não só no código: quem
 * clarear demais o papel de parede precisa saber por que o padrão era escuro.
 */
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
       painel do cromatograma seguem opacos: o traço das quatro bases não divide
       fundo com imagem nenhuma.</p>

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

/**
 * A seção do mascote em Configurações.
 *
 * Diz três coisas na cara, porque são as três que importam: que a conversa sai
 * da máquina, **o que exatamente sai** (a fala e o resumo — nada do que está
 * aberto), e onde mora o sprite, que é arte pessoal e fica fora do repositório.
 */
async function desenharConfigMascote(): Promise<void> {
  const alvo = document.getElementById("cfgMascote");
  if (!alvo) return;

  const r = await api.mascote.estado();
  if (!r.ok) {
    alvo.innerHTML = `<p class="dim">${esc(r.erro)}</p>`;
    return;
  }
  const m = r.valor;

  alvo.innerHTML = `
    <p class="dim">Companhia de bancada. Reage ao trabalho sem rede nenhuma;
       conversar, sim, sai da máquina.</p>
    ${
      m.temChave
        ? `<label class="chave">
             <input type="checkbox" id="cfgMascoteLigado" ${m.ligado ? "checked" : ""}>
             <span>Conversa ${m.ligado ? "ligada" : "desligada"}</span>
           </label>`
        : `<p class="dim">Sem chave — a conversa usa a mesma do texto fantasma.</p>`
    }
    <label class="campoNome">
      <span>Nome</span>
      <input id="cfgMascoteNome" value="${esc(m.nome)}" maxlength="40" spellcheck="false">
    </label>
    <div class="linhas">
      <div><span>modelo</span><code>${esc(m.modelo)}</code></div>
      <div><span>lê</span><code>${m.temContexto ? esc(m.arquivoContexto) : "nada — o resumo não existe"}</code></div>
      <div><span>sprite</span><code>${
        m.quadros.length ? `${m.quadros.length} quadros em ${esc(m.pastaSprite)}` : "nenhum — usando o desenho de reserva"
      }</code></div>
    </div>
    <div class="alerta">O mascote <b>não</b> vê arquivo aberto, caminho, código nem
      saída do terminal. A conversa leva só o que você escreve e o resumo do
      <code>contexto.md</code> — escrito à mão, fora de qualquer repositório.</div>`;

  const marca = document.getElementById("cfgMascoteLigado") as HTMLInputElement | null;
  marca?.addEventListener("change", async () => {
    await api.mascote.ligar(marca.checked);
    await mascote.recarregar();
    void desenharConfigMascote();
  });

  // O nome grava ao sair do campo ou no Enter — não a cada tecla, que gravaria
  // arquivo a cada letra digitada.
  const campoNome = document.getElementById("cfgMascoteNome") as HTMLInputElement | null;
  const gravarNome = async (): Promise<void> => {
    if (!campoNome || campoNome.value.trim() === m.nome) return;
    await api.mascote.nomear(campoNome.value);
    await mascote.recarregar();
    avisar(`o mascote agora se chama ${campoNome.value.trim()}`);
  };
  campoNome?.addEventListener("blur", () => void gravarNome());
  campoNome?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      campoNome.blur();
    }
  });
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
  // Só pinta se o Explorer for o painel visível. Sem isto, qualquer coisa que
  // abrisse arquivo — o traceback clicável, o Ctrl+P, o "praticar" da trilha —
  // jogava a árvore por cima do painel que estava na tela. Apareceu na trilha
  // porque lá praticar e corrigir são dois cliques seguidos no mesmo painel.
  if (painelLateral !== "explorer") return;
  const corpo = $("lateral");
  // Sem pasta aberta não há o que criar nem atualizar: o cabeçalho fica vazio.
  $("sideAcoes").innerHTML = projeto ? ACOES_EXPLORER : "";

  if (!projeto) {
    // As pastas já abertas ficam à mão: a Bancada volta sozinha na última, e
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
        // O `.ab1` aberto marca a linha igual a um arquivo de texto — ele está
        // aberto, só que no painel de baixo (ADR 0006).
        const aberto =
          abas[ativa]?.caminho === no.caminho || ab1s[ativoAb1]?.caminho === no.caminho;
        const suportado = /\.(py|txt|md|fasta|fa|fastq|csv|tsv|json|xml|cfg|toml|ya?ml|ab1)$/i.test(no.nome);
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
    for (const ab1 of ab1s) {
      if (ab1.caminho === antigo) {
        ab1.caminho = r.valor;
        ab1.nome = r.valor.split("/").pop() ?? r.valor;
      } else if (ab1.caminho.startsWith(`${antigo}/`)) {
        ab1.caminho = r.valor + ab1.caminho.slice(antigo.length);
      }
    }
    if (expandidas.has(antigo)) expandidas.delete(antigo);
    desenharAbas();
    desenharAbasAb1();
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

  // O painel de baixo segue a mesma regra: o que foi para a lixeira não pode
  // continuar como aba, e reler o caminho daria erro na cara do usuário.
  for (let i = ab1s.length - 1; i >= 0; i--) {
    const c = ab1s[i]!.caminho;
    if (c === alvo || c.startsWith(`${alvo}/`)) {
      ab1s.splice(i, 1);
      if (ativoAb1 >= i) ativoAb1--;
    }
  }
  if (ab1s.length === 0) {
    ativoAb1 = -1;
    vistaAb1.limpar();
  } else {
    if (ativoAb1 < 0) ativoAb1 = 0;
    void mostrarAb1(ab1s[ativoAb1]!);
  }

  expandidas.delete(alvo);
  desenharAbas();
  desenharAbasAb1();
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
  // Antes de olhar as abas do editor: `.ab1` nunca abre lá desde a ADR 0006.
  if (EXT_CROMATOGRAMA.test(caminho)) return abrirCromatograma(caminho);

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
  const aba: Aba = {
    caminho,
    nome: caminho.split("/").pop() ?? caminho,
    conteudo: r.valor,
    gravado: r.valor,
    versao: 1,
  };
  abas.push(aba);
  ativa = abas.length - 1;
  editor.abrir(r.valor);
  if (ehPython(caminho)) api.lsp.abrir(caminho, r.valor);
  focarNoServidor(aba);
  desenharAbas();
  desenharArvore();
  editor.focar();
}

/** Guarda o texto em edição na aba atual antes de trocar de documento. */
function guardarAtual(): void {
  const a = abas[ativa];
  if (a) a.conteudo = editor.conteudo();
}

function trocarAba(i: number): void {
  if (i === ativa || !abas[i]) return;
  guardarAtual();
  ativa = i;
  const alvo = abas[i]!;
  editor.abrir(alvo.conteudo, alvo.gravado);
  focarNoServidor(alvo);
  desenharAbas();
  desenharArvore();
  editor.focar();
}

function fecharAba(i: number): void {
  const a = abas[i];
  if (!a) return;
  if (estaSuja(a) && !confirm(`${a.nome} tem alterações não gravadas. Fechar mesmo assim?`)) return;

  if (ehPython(a.caminho)) {
    api.lsp.fechar(a.caminho);
    limparArquivo(a.caminho);
  }

  abas.splice(i, 1);
  if (abas.length === 0) {
    ativa = -1;
    editor.abrir("");
    focarNoServidor(undefined);
  } else {
    ativa = Math.min(i, abas.length - 1);
    const alvo = abas[ativa]!;
    editor.abrir(alvo.conteudo, alvo.gravado);
    focarNoServidor(alvo);
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
  mascote.reagir("gravou");
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
  mascote.reagir("rodando");
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
      mascote.reagir(e.codigo === 0 && !e.sinal ? "ok" : "erro");
      // Se o que rodou era uma correção da trilha, o código de saída é a nota.
      void concluirCorrecao(e.codigo === 0 && !e.sinal);
      break;
    case "falha":
      definirRodando(false);
      terminal.erro(`\r\n${e.mensagem}\r\n`);
      mascote.reagir("erro");
      break;
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

  // trilha (ADR 0015)
  const vest = alvo.closest<HTMLElement>("[data-vest]");
  if (vest) {
    return void api.trilha.vestimenta(vest.dataset["vest"] as Vestimenta).then((r) => {
      if (r.ok) trilha = r.valor;
      pintarTrilha();
    });
  }
  const cabecalho = alvo.closest<HTMLElement>("[data-topico]");
  if (cabecalho) {
    const id = cabecalho.dataset["topico"]!;
    topicoAberto = topicoAberto === id ? null : id;
    pintarTrilha();
    return;
  }
  const pratica = alvo.closest<HTMLElement>("[data-praticar]");
  if (pratica) {
    const [t, e] = pratica.dataset["praticar"]!.split("|");
    return void praticar(t!, e!);
  }
  const corrige = alvo.closest<HTMLElement>("[data-verificar]");
  if (corrige) {
    const [t, e] = corrige.dataset["verificar"]!.split("|");
    return void corrigir(t!, e!);
  }

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

$("abasCromo").addEventListener("click", (ev) => {
  const alvo = ev.target as HTMLElement;
  const fechar = alvo.closest<HTMLElement>("[data-fechar-ab1]");
  if (fechar) {
    ev.stopPropagation();
    return fecharAb1(Number(fechar.dataset["fecharAb1"]));
  }
  const aba = alvo.closest<HTMLElement>("[data-ab1]");
  if (aba) trocarAb1(Number(aba.dataset["ab1"]));
});

$("btFecharCromo").addEventListener("click", () => fecharPainelCromo());

$("btRodar").addEventListener("click", () => void rodar());
$("btParar").addEventListener("click", () => api.parar());
$("btLimpar").addEventListener("click", () => terminal.limpar());
$("btFecharPainel").addEventListener("click", () => definirPainel(false));
$("btPainel").addEventListener("click", () => alternarPainel());
$("btMascote").addEventListener("click", () => {
  mascote.alternar();
  $("btMascote").classList.toggle("on", mascote.estaVisivel());
});

// Janela menor não pode deixar o mascote fora da tela.
window.addEventListener("resize", () => mascote.reancorar());

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
  // Ctrl+W fecha a aba de onde a mão está: dentro do painel de baixo fecha o
  // `.ab1`, fora dele fecha o arquivo do editor.
  if (mod && ev.key.toLowerCase() === "w") {
    const noCromo = document.activeElement?.closest("#painelCromo");
    if (noCromo && ativoAb1 >= 0) {
      ev.preventDefault();
      fecharAb1(ativoAb1);
      return;
    }
    if (ativa >= 0) {
      ev.preventDefault();
      fecharAba(ativa);
      return;
    }
  }
  if (ev.key === "Escape") fecharMenu();

  // F12 no editor: ir para a definição do que está sob o cursor.
  if (ev.key === "F12" && document.activeElement?.closest("#editorHost")) {
    ev.preventDefault();
    void irParaDefinicao();
    return;
  }

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
  desenharAbasAb1();
  definirRodando(false);

  // Papel de parede e tema antes de qualquer desenho: trocar de tema depois da
  // primeira pintura faria a tela piscar na cor errada na abertura.
  await aparencia.carregar();

  // A lateral abre fechada se foi assim que ficou da última vez.
  definirLateralAberta(localStorage.getItem("bancada.lateralAberta") !== "0");

  ligarDivisor({
    divisor: $("divLateral"),
    painel: $("side"),
    eixo: "largura",
    borda: "inicio",
    padrao: 250,
    min: 170,
    max: () => window.innerWidth - 520,
    chave: "bancada.larguraLateral",
  });

  // Os dois painéis da ADR 0006. O teto deixa sempre um pedaço utilizável de
  // editor: um painel que pode engolir a tela inteira recria o problema que
  // esta mudança veio resolver.
  ligarDivisor({
    divisor: $("divTerm"),
    painel: $("painel"),
    eixo: "largura",
    padrao: 400,
    min: 220,
    max: () => window.innerWidth - 480,
    chave: "bancada.larguraTerminal",
    aoMudar: () => terminal.reajustar(),
  });
  ligarDivisor({
    divisor: $("divCromo"),
    painel: $("painelCromo"),
    eixo: "altura",
    padrao: 320,
    // O mínimo é o do CSS: abaixo dele o traço não cabe sem rolagem vertical.
    min: 260,
    max: () => $("stage").clientHeight - 160,
    chave: "bancada.alturaCromatograma",
  });

  iniciarServidor(
    () => editor.avisarDiagnosticos(),
    (motivo) => {
      // Sem language server o editor continua inteiro — só perde os avisos.
      terminal.erro(`language server indisponível: ${motivo}\r\n`);
      $("ambiente").textContent = "sem análise de tipos";
    },
  );

  // `bancada ~/corridas/18S` já abre a pasta; sem argumento, volta a última
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

  const c = await api.catalogo();
  if (c.ok) {
    catalogo = c.valor;
    // O catálogo chega depois do editor existir; a fonte de autocomplete lê
    // deste ponto, então basta avisá-la.
    definirCatalogo(c.valor);
  } else {
    terminal.erro(`${c.erro}\r\n`);
    abrirPainel();
  }

  // O mascote entra por último: é companhia, e nada do resto depende dele.
  await mascote.iniciar(api);
  $("btMascote").classList.toggle("on", mascote.estaVisivel());

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
