import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { NoArquivo, ProjetoAberto } from "../shared/tipos.js";

/** Pastas que nunca interessam numa pasta de corrida e só poluem a árvore. */
const IGNORAR = new Set([".git", "__pycache__", ".venv", "node_modules", ".ipynb_checkpoints"]);

/** Um único nível da árvore. Pasta grande não trava a interface porque os
 *  filhos só são lidos quando alguém expande o nó. */
export async function listar(dir: string): Promise<NoArquivo[]> {
  const entradas = await fs.readdir(dir, { withFileTypes: true });
  const nos: NoArquivo[] = [];

  for (const e of entradas) {
    if (e.name.startsWith(".") || IGNORAR.has(e.name)) continue;
    const pasta = e.isDirectory();
    nos.push({
      nome: e.name,
      caminho: path.join(dir, e.name),
      tipo: pasta ? "pasta" : "arquivo",
      filhos: null,
    });
  }

  // Pastas antes de arquivos, cada grupo em ordem alfabética — a mesma ordem do
  // VSCodium, para a árvore não parecer aleatória a quem vem de lá.
  nos.sort((a, b) =>
    a.tipo === b.tipo
      ? a.nome.localeCompare(b.nome, "pt-BR")
      : a.tipo === "pasta"
        ? -1
        : 1,
  );
  return nos;
}

export async function abrirProjeto(raiz: string): Promise<ProjetoAberto> {
  return { raiz, nome: path.basename(raiz), filhos: await listar(raiz) };
}

/** Teto de arquivos varridos pelo Ctrl+P. Uma pasta de corrida tem dezenas;
 *  este número existe para o caso de alguém abrir `$HOME` por engano e a
 *  varredura não segurar a janela por minutos. */
const TETO_VARREDURA = 20_000;

/**
 * Todos os arquivos do projeto, em caminho relativo à raiz, para o Ctrl+P.
 *
 * Percorre em largura para que, se o teto for atingido, o que sobrou seja o
 * nível mais raso — que é onde estão os scripts que se quer abrir, não o fundo
 * de alguma pasta de dados.
 */
export async function listarTudo(raiz: string): Promise<string[]> {
  const achados: string[] = [];
  let fila = [raiz];

  while (fila.length > 0 && achados.length < TETO_VARREDURA) {
    const proxima: string[] = [];
    for (const dir of fila) {
      let entradas;
      try {
        entradas = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue; // pasta sem permissão ou que sumiu no meio da varredura
      }
      for (const e of entradas) {
        if (e.name.startsWith(".") || IGNORAR.has(e.name)) continue;
        const alvo = path.join(dir, e.name);
        if (e.isDirectory()) proxima.push(alvo);
        else if (achados.length < TETO_VARREDURA) achados.push(path.relative(raiz, alvo));
      }
    }
    fila = proxima;
  }
  return achados;
}

/** Extensões que o editor abre como texto. O resto precisa de visualizador
 *  próprio — `.ab1` é o caso que importa, e ainda não existe. */
const TEXTO = new Set([".py", ".txt", ".md", ".fasta", ".fa", ".fastq", ".csv", ".tsv", ".json", ".xml", ".cfg", ".toml", ".yaml", ".yml"]);

export function ehTexto(arquivo: string): boolean {
  return TEXTO.has(path.extname(arquivo).toLowerCase());
}

export async function lerArquivo(arquivo: string): Promise<string> {
  return fs.readFile(arquivo, "utf8");
}

export async function gravarArquivo(arquivo: string, conteudo: string): Promise<void> {
  await fs.writeFile(arquivo, conteudo, "utf8");
}

/* ------------------------------ criar, renomear, excluir ------------------ */

/**
 * Recusa nomes que escapariam da pasta ou quebrariam a árvore.
 *
 * O nome vem de um campo de texto na interface, então tratar como caminho seria
 * deixar `../../algo` gravar fora do projeto. Aqui só se aceita um componente
 * simples de nome.
 */
function validarNome(nome: string): string {
  const limpo = nome.trim();
  if (!limpo) throw new Error("O nome não pode ser vazio.");
  if (limpo === "." || limpo === "..") throw new Error(`"${limpo}" não é um nome.`);
  if (limpo.includes("/") || limpo.includes("\\")) {
    throw new Error("O nome não pode conter barra — crie a pasta primeiro.");
  }
  if (limpo.includes("\0")) throw new Error("Nome inválido.");
  return limpo;
}

/** Impede que uma operação saia da raiz do projeto aberto. */
function dentroDe(raiz: string, alvo: string): void {
  const rel = path.relative(raiz, alvo);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Fora da pasta do projeto.");
  }
}

/** Cria o arquivo vazio e devolve o caminho. Falha se já existir. */
export async function criarArquivo(raiz: string, dir: string, nome: string): Promise<string> {
  const alvo = path.join(dir, validarNome(nome));
  dentroDe(raiz, alvo);
  // 'wx' falha se existir — melhor do que checar antes e apagar o arquivo de
  // alguém que apareceu no meio.
  const fh = await fs.open(alvo, "wx");
  await fh.close();
  return alvo;
}

export async function criarPasta(raiz: string, dir: string, nome: string): Promise<string> {
  const alvo = path.join(dir, validarNome(nome));
  dentroDe(raiz, alvo);
  await fs.mkdir(alvo);
  return alvo;
}

export async function renomear(raiz: string, antigo: string, nome: string): Promise<string> {
  const alvo = path.join(path.dirname(antigo), validarNome(nome));
  dentroDe(raiz, antigo);
  dentroDe(raiz, alvo);
  if (alvo === antigo) return antigo;
  // `rename` sobrescreveria o destino em silêncio.
  try {
    await fs.access(alvo);
    throw new Error(`Já existe "${path.basename(alvo)}" nessa pasta.`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Já existe")) throw err;
  }
  await fs.rename(antigo, alvo);
  return alvo;
}
