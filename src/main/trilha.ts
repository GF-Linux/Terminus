import * as fs from "node:fs";
import * as path from "node:path";
import { PASTA_BANCADA } from "./config.js";
import type { ExercicioTrilha, TopicoTrilha, Vestimenta } from "../shared/tipos.js";

/**
 * A trilha de estudo (ADR 0015).
 *
 * ## A separação que organiza tudo: conceito × vestimenta
 *
 * Um exercício é um **conceito** (o que se aprende) mais um **contrato** (a
 * função a escrever) mais uma **vestimenta** (a roupa do enunciado). O mesmo
 * `conta(itens, alvo)` aparece contando bases, atendimentos, avistamentos ou
 * quadrantes — e o verificador é **um só**, porque o contrato não mudou.
 *
 * Isso não é enfeite. Conceito que só aparece numa roupa vira receita: quem só
 * viu dicionário contando bases aprendeu a contar bases, não aprendeu
 * dicionário. E amarrar a trilha inteira a sequenciamento deixaria de fora
 * metade do laboratório.
 *
 * ## O formato
 *
 * Markdown de linha, sem YAML e sem dependência nova — o autor edita no próprio
 * editor da Bancada:
 *
 *     # Título do tópico
 *     semana: 1
 *     entrega: o que fica pronto na semana
 *
 *     Uma ou duas frases de abertura.
 *
 *     ## conceitos
 *     - item
 *
 *     ## recursos
 *     - nome do recurso :: https://…
 *
 *     ## exercício conta
 *     função: conta(itens, alvo)
 *     o que faz: descrição curta do contrato
 *
 *     ### sequências
 *     enunciado nessa roupa
 *
 *     ### clínica
 *     enunciado nessa roupa
 */

const PASTA_TRILHAS = "trilhas";

/** Progresso é dado pessoal: fica com o resto do que é do usuário, fora do repo. */
const ARQUIVO_PROGRESSO = path.join(PASTA_BANCADA, "trilha.json");

interface Progresso {
  /** `feito["t1/conta"] = "2026-08-01T…"` */
  feito: Record<string, string>;
  vestimenta: Vestimenta;
}

function lerProgresso(): Progresso {
  try {
    const bruto = JSON.parse(fs.readFileSync(ARQUIVO_PROGRESSO, "utf8")) as Partial<Progresso>;
    return { feito: bruto.feito ?? {}, vestimenta: bruto.vestimenta ?? "sequências" };
  } catch {
    return { feito: {}, vestimenta: "sequências" };
  }
}

function gravarProgresso(p: Progresso): void {
  fs.mkdirSync(PASTA_BANCADA, { recursive: true, mode: 0o700 });
  fs.writeFileSync(ARQUIVO_PROGRESSO, JSON.stringify(p, null, 2), { mode: 0o600 });
}

export function definirVestimenta(v: Vestimenta): Progresso {
  const p = lerProgresso();
  p.vestimenta = v;
  gravarProgresso(p);
  return p;
}

export function marcarFeito(chave: string, feito: boolean): Progresso {
  const p = lerProgresso();
  if (feito) p.feito[chave] = new Date().toISOString();
  else delete p.feito[chave];
  gravarProgresso(p);
  return p;
}

/* ------------------------------- leitura ---------------------------------- */

function analisar(texto: string, id: string): TopicoTrilha {
  const topico: TopicoTrilha = {
    id,
    titulo: id,
    semana: 0,
    entrega: "",
    abertura: "",
    conceitos: [],
    recursos: [],
    exercicios: [],
  };

  let secao = "";
  let exercicio: ExercicioTrilha | null = null;
  let vestimenta = "";
  const abertura: string[] = [];

  for (const linha of texto.split("\n")) {
    const t = linha.trim();

    if (t.startsWith("# ")) {
      topico.titulo = t.slice(2).trim();
      secao = "cabecalho";
      continue;
    }
    if (t.startsWith("### ")) {
      vestimenta = t.slice(4).trim();
      if (exercicio) exercicio.enunciados[vestimenta] = "";
      continue;
    }
    if (t.startsWith("## ")) {
      const cab = t.slice(3).trim();
      if (cab.startsWith("exercício ")) {
        exercicio = {
          id: cab.slice("exercício ".length).trim(),
          funcao: "",
          contrato: "",
          enunciados: {},
        };
        topico.exercicios.push(exercicio);
        secao = "exercicio";
        vestimenta = "";
      } else {
        secao = cab;
        exercicio = null;
      }
      continue;
    }

    if (secao === "cabecalho") {
      const par = /^(semana|entrega):\s*(.+)$/.exec(t);
      if (par) {
        if (par[1] === "semana") topico.semana = Number(par[2]);
        else topico.entrega = par[2]!;
      } else if (t) {
        abertura.push(t);
      }
      continue;
    }
    if (secao === "conceitos" && t.startsWith("- ")) {
      topico.conceitos.push(t.slice(2));
      continue;
    }
    if (secao === "recursos" && t.startsWith("- ")) {
      const [nome, url] = t.slice(2).split("::").map((s) => s.trim());
      topico.recursos.push({ nome: nome ?? "", url: url ?? "" });
      continue;
    }
    if (secao === "exercicio" && exercicio) {
      const par = /^(função|o que faz):\s*(.+)$/.exec(t);
      if (par && !vestimenta) {
        if (par[1] === "função") exercicio.funcao = par[2]!;
        else exercicio.contrato = par[2]!;
      } else if (vestimenta) {
        // Junta as linhas do enunciado preservando o parágrafo.
        const atual = exercicio.enunciados[vestimenta] ?? "";
        exercicio.enunciados[vestimenta] = t ? `${atual} ${t}`.trim() : `${atual}\n`;
      }
    }
  }

  topico.abertura = abertura.join(" ");
  return topico;
}

export function lerTrilha(raizApp: string): {
  topicos: TopicoTrilha[];
  feito: Record<string, string>;
  vestimenta: Vestimenta;
} {
  const dir = path.join(raizApp, PASTA_TRILHAS, "fase1");
  let arquivos: string[] = [];
  try {
    arquivos = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    /* sem trilha instalada */
  }

  const topicos = arquivos.map((f) =>
    analisar(fs.readFileSync(path.join(dir, f), "utf8"), f.replace(/^\d+-|\.md$/g, "")),
  );
  const p = lerProgresso();
  return { topicos, feito: p.feito, vestimenta: p.vestimenta };
}

/* ------------------------------- praticar --------------------------------- */

/**
 * Cria (ou reencontra) o arquivo do exercício na pasta da corrida.
 *
 * O enunciado vai como comentário no topo e o esqueleto já traz a assinatura
 * que o verificador vai chamar — ninguém deve errar exercício por ter escrito o
 * nome da função diferente do combinado.
 *
 * **Nunca sobrescreve**: se o arquivo existe, devolve o caminho e pronto. O
 * trabalho de quem está aprendendo é a última coisa que se pode perder.
 */
export function prepararExercicio(entrada: {
  raizProjeto: string;
  topico: string;
  exercicio: ExercicioTrilha;
  vestimenta: string;
  enunciado: string;
}): { caminho: string; novo: boolean } {
  const pasta = path.join(entrada.raizProjeto, "trilha");
  fs.mkdirSync(pasta, { recursive: true });
  const caminho = path.join(pasta, `${entrada.topico}_${entrada.exercicio.id}.py`);
  if (fs.existsSync(caminho)) return { caminho, novo: false };

  const assinatura = entrada.exercicio.funcao || `${entrada.exercicio.id}()`;
  const nome = assinatura.replace(/\(.*/, "");
  const parametros = /\((.*)\)/.exec(assinatura)?.[1] ?? "";

  const quebrar = (texto: string, largura = 74): string[] => {
    const palavras = texto.split(/\s+/);
    const linhas: string[] = [];
    let atual = "";
    for (const p of palavras) {
      if ((atual + " " + p).trim().length > largura) {
        linhas.push(atual.trim());
        atual = p;
      } else {
        atual += ` ${p}`;
      }
    }
    if (atual.trim()) linhas.push(atual.trim());
    return linhas;
  };

  const corpo = [
    `# ${entrada.topico} · ${entrada.exercicio.id}`,
    "#",
    ...quebrar(entrada.enunciado).map((l) => `# ${l}`),
    "#",
    `# O que a correção espera: ${entrada.exercicio.contrato}`,
    "",
    "",
    `def ${nome}(${parametros}):`,
    "    # escreva aqui",
    "    ...",
    "",
  ].join("\n");

  fs.writeFileSync(caminho, corpo, "utf8");
  return { caminho, novo: true };
}

/** O verificador do exercício, se existir. */
export function caminhoDoTeste(raizApp: string, exercicio: string): string | null {
  const alvo = path.join(raizApp, PASTA_TRILHAS, "fase1", "testes", `${exercicio}.py`);
  return fs.existsSync(alvo) ? alvo : null;
}

export function caminhoDoVerificador(raizApp: string): string {
  return path.join(raizApp, PASTA_TRILHAS, "verificar.py");
}
