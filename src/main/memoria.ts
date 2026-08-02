import * as fs from "node:fs";
import * as path from "node:path";
import { PASTA_FERN } from "./config.js";
import type { ArquivoDeMemoria } from "../shared/tipos.js";

/**
 * A memória do mascote (ADR 0009).
 *
 * O miniMD (`contexto.md`) continua sendo o que **eu** escrevo à mão sobre o
 * trabalho do autor, e ela só lê. Isto aqui é outra coisa: a memória que ela
 * própria escreve sobre a convivência com ele. As duas nunca se misturam —
 * `contexto.md` fica fora desta pasta e ela não tem ferramenta que o alcance.
 *
 * Três camadas, no formato do "closed loop" que o autor pediu:
 *
 *   perfil.md          o que ficou sabendo dele e não muda toda semana.
 *                      Destilado ao fim das conversas, não escrito na correria.
 *   diario/<data>.md   o que aconteceu naquele dia. Memória episódica, crua.
 *   notas/<nome>.md    arquivos que ele mandou guardar — datas, listas, o que for.
 *
 * **Tudo é Markdown legível e editável.** É o que torna "ela decide o que
 * guardar" aceitável: o autor abre qualquer um destes arquivos na Bancada e
 * corrige. Memória de agente que só a máquina lê é memória que ninguém audita.
 */

const DIARIO = path.join(PASTA_FERN, "diario");
const NOTAS = path.join(PASTA_FERN, "notas");
const PERFIL = path.join(PASTA_FERN, "perfil.md");

/** Tetos de leitura, para a memória não engolir o pedido inteiro. */
const TETO_PERFIL = 2500;
const TETO_DIARIO = 900;
const DIAS_DE_DIARIO = 4;

function garantirPastas(): void {
  for (const p of [PASTA_FERN, DIARIO, NOTAS]) {
    fs.mkdirSync(p, { recursive: true, mode: 0o700 });
  }
}

function hoje(): string {
  // Data local, não UTC: às 21h de Brasília o diário do dia não pode virar o de
  // amanhã só porque o servidor de fuso zero já mudou de data.
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function lerSeExistir(arquivo: string, teto = Infinity): string | null {
  try {
    const texto = fs.readFileSync(arquivo, "utf8").trim();
    if (!texto) return null;
    return texto.length > teto ? `${texto.slice(-teto)}\n(…início cortado…)` : texto;
  } catch {
    return null;
  }
}

/**
 * Valida o nome de uma nota.
 *
 * Um componente só, sem barra e sem `..`, e o caminho final é conferido contra
 * a pasta — a mesma regra que já vale para criar arquivo na árvore do projeto.
 * A diferença é que aqui quem propõe o nome é um modelo de linguagem, o que
 * torna a checagem menos opcional ainda.
 */
export function caminhoDaNota(nome: string): string {
  const limpo = nome.trim().replace(/\.md$/i, "");
  if (!limpo || limpo.length > 60 || !/^[\p{L}\p{N} _.()-]+$/u.test(limpo) || limpo.includes("..")) {
    throw new Error(`nome de nota inválido: ${nome}`);
  }
  const alvo = path.join(NOTAS, `${limpo}.md`);
  if (path.dirname(alvo) !== NOTAS) throw new Error("caminho fora da pasta de notas");
  return alvo;
}

/* ------------------------------- escrita ---------------------------------- */

export function lembrar(texto: string): string {
  garantirPastas();
  const arquivo = path.join(DIARIO, `${hoje()}.md`);
  const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const cabecalho = fs.existsSync(arquivo) ? "" : `# ${hoje()}\n\n`;
  fs.appendFileSync(arquivo, `${cabecalho}- **${agora}** ${texto.trim()}\n`, { mode: 0o600 });
  return `guardado no diário de ${hoje()}`;
}

export function anotar(nome: string, conteudo: string, modo: "escrever" | "acrescentar"): string {
  garantirPastas();
  const arquivo = caminhoDaNota(nome);
  if (modo === "acrescentar" && fs.existsSync(arquivo)) {
    fs.appendFileSync(arquivo, `\n${conteudo.trim()}\n`, { mode: 0o600 });
  } else {
    fs.writeFileSync(arquivo, `${conteudo.trim()}\n`, { mode: 0o600 });
  }
  return `${modo === "acrescentar" ? "acrescentado em" : "gravado em"} notas/${path.basename(arquivo)}`;
}

export function lerNota(nome: string): string {
  const arquivo = caminhoDaNota(nome);
  const texto = lerSeExistir(arquivo, 4000);
  if (texto === null) throw new Error(`não existe nota chamada "${nome}"`);
  return texto;
}

export function listarNotas(): string[] {
  try {
    return fs
      .readdirSync(NOTAS)
      .filter((f) => f.endsWith(".md"))
      .sort();
  } catch {
    return [];
  }
}

export function gravarPerfil(texto: string): void {
  garantirPastas();
  fs.writeFileSync(PERFIL, `${texto.trim()}\n`, { mode: 0o600 });
}

/* ------------------------------- leitura ---------------------------------- */

export function lerPerfil(): string | null {
  return lerSeExistir(PERFIL, TETO_PERFIL);
}

/** Os últimos dias de diário, do mais antigo para o mais novo. */
export function lerDiarioRecente(): string {
  let arquivos: string[];
  try {
    arquivos = fs.readdirSync(DIARIO).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return "";
  }
  return arquivos
    .slice(-DIAS_DE_DIARIO)
    .map((f) => lerSeExistir(path.join(DIARIO, f), TETO_DIARIO))
    .filter((t): t is string => t !== null)
    .join("\n\n");
}

/**
 * O bloco de memória que acompanha cada conversa.
 *
 * Montado aqui, no processo principal, e nunca devolvido à interface: a
 * interface não precisa ver o que ela lembra do autor para desenhar um balão.
 */
export function blocoDeMemoria(): string {
  const partes: string[] = [];
  const perfil = lerPerfil();
  const diario = lerDiarioRecente();
  const notas = listarNotas();

  if (perfil) partes.push(`O que você já sabe sobre ele (seu perfil dele):\n\n${perfil}`);
  if (diario) partes.push(`Seu diário dos últimos dias:\n\n${diario}`);
  if (notas.length) {
    partes.push(
      `Notas que você guardou a pedido dele (use ler_nota para abrir):\n${notas
        .map((n) => `- ${n.replace(/\.md$/, "")}`)
        .join("\n")}`,
    );
  }
  return partes.join("\n\n");
}

/** O que a interface mostra na tela de auditoria. */
export function listarMemoria(): { pasta: string; arquivos: ArquivoDeMemoria[] } {
  const arquivos: ArquivoDeMemoria[] = [];

  const juntar = (dir: string, rotulo: string): void => {
    let nomes: string[];
    try {
      nomes = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    } catch {
      return;
    }
    for (const nome of nomes.sort().reverse()) {
      const caminho = path.join(dir, nome);
      const info = fs.statSync(caminho);
      arquivos.push({ nome, caminho, tipo: rotulo, bytes: info.size, alterado: info.mtimeMs });
    }
  };

  if (fs.existsSync(PERFIL)) {
    const info = fs.statSync(PERFIL);
    arquivos.push({
      nome: "perfil.md",
      caminho: PERFIL,
      tipo: "perfil",
      bytes: info.size,
      alterado: info.mtimeMs,
    });
  }
  juntar(NOTAS, "nota");
  juntar(DIARIO, "diário");

  return { pasta: PASTA_FERN, arquivos };
}

export function apagarDaMemoria(caminho: string): void {
  // Só dentro da pasta dela: um caminho vindo da interface não manda em nada
  // fora daqui, nem que a interface esteja errada.
  const alvo = path.resolve(caminho);
  if (!alvo.startsWith(PASTA_FERN + path.sep)) {
    throw new Error("esse arquivo não é da memória do mascote");
  }
  fs.rmSync(alvo);
}
