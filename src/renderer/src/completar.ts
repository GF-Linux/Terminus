import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import type { Catalogo, EntradaCatalogo } from "../../shared/tipos.js";

/**
 * Autocomplete alimentado pelo catálogo do Biopython.
 *
 * O que isto oferece e um language server não oferece: a **nota de curadoria**.
 * O Pylance mostra a assinatura de `gc_fraction`; só a Bancada mostra, na mesma
 * caixa, que ela devolve fração de 0 a 1 e não porcentagem. Essa é a promessa
 * didática do projeto virando gesto.
 *
 * Nada aqui é escrito à mão: assinatura, docstring e estado de depreciação vêm
 * de `data/biopython-catalog.json`, gerado por introspecção do Biopython
 * instalado, e a linha de `import` sai do próprio trecho verificado — que o
 * `tools/check_snippets.py` executa de verdade.
 */

let catalogo: Catalogo | null = null;

export function definirCatalogo(c: Catalogo | null): void {
  catalogo = c;
  preparadas = null;
}

interface Preparada {
  entrada: EntradaCatalogo;
  /** Último componente do caminho: `parse` em `Bio.SeqIO.parse`. */
  folha: string;
  /** Como se escreve a chamada no código: `SeqIO.parse`. */
  chamada: string;
  /** Linhas de import que o trecho verificado usa. */
  imports: string[];
  /**
   * Notas por tarefa. A mesma função pode servir a mais de uma — `SeqIO.read`
   * aparece em "ler arquivos" e em "ler cromatograma", com notas diferentes e
   * as duas úteis. Na lista ela é **uma** linha; aqui as notas se somam.
   */
  notas: { tarefa: string; nota: string }[];
}

let preparadas: Preparada[] | null = null;

/** Linhas de `import` do topo do trecho — é código verificado, não dedução. */
function importsDoTrecho(trecho: string): string[] {
  const linhas: string[] = [];
  for (const bruta of trecho.split("\n")) {
    const linha = bruta.trim();
    if (!linha || linha.startsWith("#")) continue;
    if (/^(from\s+\S+\s+import\s+.+|import\s+\S+)$/.test(linha)) linhas.push(linha);
    else break; // acabou o bloco de imports; o resto é uso
  }
  return linhas;
}

/**
 * Como a função aparece sendo chamada dentro do trecho verificado.
 *
 * Derivar isso do caminho pontilhado erraria: `Bio.SeqIO.parse` se escreve
 * `SeqIO.parse` depois de `from Bio import SeqIO`, e `Bio.SeqUtils.gc_fraction`
 * se escreve só `gc_fraction`. O trecho já sabe qual é qual.
 */
function formaDeChamada(caminho: string, folha: string, trecho: string): string {
  const re = new RegExp(`([A-Za-z_][\\w.]*\\.)?${folha}\\s*[\\(\\.]`);
  const m = re.exec(trecho);
  if (m) return (m[1] ?? "") + folha;
  // Sem uso no trecho: cai para o caminho sem o pacote raiz.
  const partes = caminho.split(".");
  return partes.length > 2 ? partes.slice(-2).join(".") : folha;
}

function preparar(): Preparada[] {
  if (preparadas) return preparadas;

  // Agrupado por caminho: assinatura, docstring e depreciação são da função e
  // não mudam entre tarefas; o que muda é a nota de curadoria.
  const porCaminho = new Map<string, Preparada>();

  for (const tarefa of catalogo?.tasks ?? []) {
    for (const entrada of tarefa.entries) {
      const existente = porCaminho.get(entrada.path);
      if (existente) {
        if (entrada.note) existente.notas.push({ tarefa: tarefa.title, nota: entrada.note });
        continue;
      }
      const folha = entrada.path.split(".").pop()!;
      porCaminho.set(entrada.path, {
        entrada,
        folha,
        chamada: formaDeChamada(entrada.path, folha, entrada.snippet),
        imports: importsDoTrecho(entrada.snippet),
        notas: entrada.note ? [{ tarefa: tarefa.title, nota: entrada.note }] : [],
      });
    }
  }

  preparadas = [...porCaminho.values()];
  return preparadas;
}

/* ---------------------------- painel de detalhe --------------------------- */

function linha(pai: HTMLElement, classe: string, texto: string): void {
  const el = pai.appendChild(document.createElement("div"));
  el.className = classe;
  el.textContent = texto;
}

function detalhe(p: Preparada): HTMLElement {
  const caixa = document.createElement("div");
  caixa.className = "cm-info-bancada";

  linha(caixa, "cam", p.entrada.path);
  if (p.entrada.signature) linha(caixa, "ass", p.folha + p.entrada.signature);
  if (p.entrada.doc) linha(caixa, "doc", p.entrada.doc);

  // A nota de curadoria é o motivo desta fonte existir — vem antes do resto.
  // Com mais de uma tarefa, cada nota é rotulada: sem o rótulo, duas frases
  // soltas sobre a mesma função pareceriam contraditórias.
  for (const n of p.notas) {
    linha(caixa, "nota", p.notas.length > 1 ? `${n.tarefa}: ${n.nota}` : n.nota);
  }

  if (p.entrada.deprecated) {
    linha(caixa, "dep", `Depreciado — ${p.entrada.deprecated}`);
  }
  if (p.imports.length > 0) {
    linha(caixa, "imp", p.imports.join("\n"));
  }
  return caixa;
}

/* ------------------------------- import automático ------------------------ */

/** Onde enfiar um `import` novo: logo depois do último import já existente. */
function pontoDeInsercao(doc: string): number {
  const linhas = doc.split("\n");
  let ultima = -1;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]!.trim();
    if (/^(from\s+\S+\s+import\s+.+|import\s+\S+)/.test(l)) ultima = i;
    // Para na primeira linha de código de verdade: imports no meio do arquivo
    // existem, mas não é onde se acrescenta um.
    else if (l && !l.startsWith("#")) break;
  }
  if (ultima < 0) return 0;
  return linhas.slice(0, ultima + 1).join("\n").length + 1;
}

/**
 * Aceita a sugestão e, se faltar, acrescenta o `import` no topo.
 *
 * Completar `gc_fraction` num arquivo sem o import produz código que não roda —
 * e o público deste ambiente é quem esquece o import, não quem depura o
 * `NameError`. O acréscimo é anunciado por `aoImportar`, para nunca ser uma
 * edição silenciosa em outra parte do arquivo.
 */
function aplicar(p: Preparada, aoImportar: (linhas: string[]) => void) {
  return (view: EditorView, _c: Completion, from: number, to: number): void => {
    const doc = view.state.doc.toString();
    const existentes = new Set(doc.split("\n").map((l) => l.trim()));
    const faltando = p.imports.filter((i) => !existentes.has(i));
    const texto = faltando.length > 0 ? `${faltando.join("\n")}\n` : "";
    const at = texto ? pontoDeInsercao(doc) : 0;

    // Em ordem crescente de posição: o import vem antes porque nasce no topo.
    const mudancas = texto
      ? [
          { from: at, to: at, insert: texto },
          { from, to, insert: p.chamada },
        ]
      : [{ from, to, insert: p.chamada }];

    // O cursor é calculado à mão, não mapeado: `mapPos` recebe posição do
    // documento **antigo**, e o fim da chamada só existe no novo. Somar o
    // tamanho do import — quando ele entrou acima — é a conta certa e direta.
    const anchor = from + (at <= from ? texto.length : 0) + p.chamada.length;

    view.dispatch({ changes: mudancas, selection: { anchor }, scrollIntoView: true });
    if (faltando.length > 0) aoImportar(faltando);
  };
}

/* --------------------------------- a fonte -------------------------------- */

/** Identificador com pontos imediatamente antes do cursor. */
const ALVO = /[A-Za-z_][\w.]*$/;

/** Mínimo de letras antes de a caixa aparecer sozinha. */
const MINIMO = 2;

/**
 * Onde sugerir é atrapalhar.
 *
 * Dentro de texto entre aspas e de comentário não se escreve código, e a caixa
 * ali só rouba o `Tab` e cobre o que a pessoa está lendo. Depois de `def` ou
 * `class` quem escreve está **batizando** algo — nenhuma sugestão pode saber o
 * nome que ela escolheu, e oferecer lista nesse ponto é o caso mais puro de
 * "sugestão que não conversa com o código".
 */
export function lugarDeSugerir(ctx: CompletionContext): boolean {
  const linha = ctx.state.doc.lineAt(ctx.pos);
  const ate = linha.text.slice(0, ctx.pos - linha.from);

  // Batizando um `def`/`class`: nenhuma lista sabe o nome que a pessoa escolheu.
  if (/\b(def|class)\s+\w*$/.test(ate)) return false;

  // Comentário e texto entre aspas, medidos **na linha**, sem consultar a
  // árvore sintática. Enquanto se digita, a árvore vem incompleta e chegou a
  // responder "estou numa string" para código comum — o que calava a caixa a
  // esmo e foi visto acontecendo com `get_cache_to`. Varrer a linha é bobo,
  // mas é determinístico, e o caso que interessa (`#` e aspas) é local.
  let aspa: string | null = null;
  for (let i = 0; i < ate.length; i++) {
    const ch = ate[i]!;
    if (aspa) {
      if (ch === "\\") i++;
      else if (ch === aspa) aspa = null;
      continue;
    }
    if (ch === '"' || ch === "'") aspa = ch;
    else if (ch === "#") return false;
  }
  return aspa === null;
}

export function fonteDoCatalogo(aoImportar: (linhas: string[]) => void) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const antes = ctx.matchBefore(ALVO);
    if (!antes || (antes.from === antes.to && !ctx.explicit)) return null;
    if (!ctx.explicit && !lugarDeSugerir(ctx)) return null;

    const digitado = antes.text;
    const itens = preparar();
    if (itens.length === 0) return null;

    const ponto = digitado.lastIndexOf(".");
    const prefixo = ponto >= 0 ? digitado.slice(0, ponto) : null;
    const parcial = (ponto >= 0 ? digitado.slice(ponto + 1) : digitado).toLowerCase();

    // Uma letra só casa com meio catálogo, e a caixa vira ruído em cima de quem
    // ainda está formando a palavra. Com `Ctrl+Espaço` a lista aparece assim
    // mesmo — pedir explicitamente é outra intenção.
    if (prefixo === null && parcial.length < MINIMO && !ctx.explicit) return null;

    const opcoes: Completion[] = [];
    for (const p of itens) {
      // Depois de um ponto, só interessa o que pertence àquele objeto —
      // `SeqIO.` não deve oferecer `gc_fraction`.
      if (prefixo !== null && !p.chamada.startsWith(`${prefixo}.`)) continue;

      // **Começa com**, e não casamento difuso. O filtro difuso do CodeMirror
      // aceita letras salteadas, e era ele que trazia entrada do catálogo para
      // cima de coisa que nada tinha a ver com o que estava escrito. O catálogo
      // é curadoria: quando ele aparece, tem de ser porque casa de verdade.
      if (parcial && !p.folha.toLowerCase().startsWith(parcial)) continue;

      opcoes.push({
        label: prefixo !== null ? p.chamada : p.folha,
        detail: p.entrada.signature ?? p.entrada.kind,
        type: p.entrada.kind === "class" ? "class" : "function",
        info: () => detalhe(p),
        apply: aplicar(p, aoImportar),
        // Depreciado continua aparecendo — o catálogo o inclui justamente para
        // ser reconhecido em código antigo — mas nunca na frente do que presta.
        boost: p.entrada.deprecated ? -60 : 0,
      });
    }
    if (opcoes.length === 0) return null;

    return {
      from: prefixo !== null ? antes.from : antes.from,
      options: opcoes,
      // O CodeMirror filtra e pontua sozinho enquanto se digita, sem nova
      // consulta, desde que o conjunto só encolha.
      validFor: /^[\w.]*$/,
    };
  };
}
