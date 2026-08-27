import { closeSync, openSync, readSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { NoArquivo, ProjetoAberto } from "../../compartilhado/tipos.js";

/** Pastas que nunca interessam numa pasta de corrida e só poluem a árvore. */
const IGNORAR = new Set([".git", "__pycache__", ".venv", "node_modules", ".ipynb_checkpoints"]);

//* Lista o que há dentro de uma pasta: pastas primeiro, depois arquivos.
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

//* Abre uma pasta como projeto e devolve o primeiro nível da árvore.
export async function abrirProjeto(raiz: string): Promise<ProjetoAberto> {
  return { raiz, nome: path.basename(raiz), filhos: await listar(raiz) };
}

/** Teto de arquivos varridos pelo Ctrl+P. Uma pasta de corrida tem dezenas;
 *  este número existe para o caso de alguém abrir `$HOME` por engano e a
 *  varredura não segurar a janela por minutos. */
const TETO_VARREDURA = 20_000;

//* Todos os arquivos do projeto, em caminho relativo — alimenta o Ctrl+P.
//! Varredura em largura com teto de 20 mil: projeto grande não pode pendurar
//!   a interface.
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

/** Extensões que o editor NÃO abre: são binárias, e mostrar isso seria lixo. */
//? ⚠️ ESTA REGRA INVERTEU EM 26/08/2026, POR DEFEITO DE CAMPO
//!
//! Aqui havia uma LISTA BRANCA de 14 extensões — `.py`, `.txt`, `.md`, `.fasta`, `.fa`,
//! `.fastq`, `.csv`, `.tsv`, `.json`, `.xml`, `.cfg`, `.toml`, `.yaml`, `.yml` — herdada
//! da Bancada, o projeto de bioinformática que o Terminus substituiu.
//! Ela **nunca doeu** porque o canal que a usava (`arquivo:ler`) **não tinha chamador**:
//! quem abria arquivo era o Neovim, que lia o disco por conta própria. Quando o editor
//! virou o Monaco e o canal ressuscitou, ela virou o portão de TUDO — e só conhecia a
//! bancada. Relato da cabeça: *"Arquivo Csharp não é lido"*. Medido, eram **dez de
//! catorze**: `.cs`, `.ts`, `.cpp`, `.lua`, `.html`, `.css`, `.sh`, `.csproj`,
//! `Dockerfile` e `.gitignore`.
//! Pior: ela **contradizia o próprio domínio**. O `dominio/linguagem-do-arquivo.ts` sabe
//! que `.cs` é csharp e que `Dockerfile` é dockerfile — e a infra recusava os dois.
//!
//! **A regra certa é a inversa: texto é o PADRÃO.** Um editor de código não pode ter uma
//! lista de linguagens que ele aceita; a lista envelhece a cada linguagem nova, e o modo
//! de falhar é sempre o mesmo — recusar em silêncio o arquivo de quem está trabalhando.
const BINARIO = new Set([
  // imagem
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".avif", ".tif", ".tiff",
  // áudio e vídeo
  ".mp3", ".ogg", ".wav", ".flac", ".mp4", ".mkv", ".webm", ".mov", ".avi",
  // pacote e arquivo comprimido
  ".zip", ".gz", ".bz2", ".xz", ".zst", ".7z", ".rar", ".tar", ".jar", ".nupkg",
  // executável e biblioteca
  ".exe", ".dll", ".so", ".dylib", ".o", ".a", ".bin", ".wasm", ".pyc", ".class",
  // fonte e documento fechado
  ".ttf", ".otf", ".woff", ".woff2", ".eot", ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  // banco e imagem de disco
  ".db", ".sqlite", ".sqlite3", ".iso", ".img",
]);

/** Quantos bytes olhar para decidir se o conteúdo é binário. */
//! 8 KB é o que o `git` usa para a mesma pergunta. Ler o arquivo inteiro para responder
//!   "posso abrir?" transformaria a pergunta barata na cara.
const AMOSTRA = 8192;

//* Diz se o arquivo é de texto: pela extensão E pelo conteúdo.
//! ⚠️ AS DUAS CONFERÊNCIAS, E NÃO UMA. A extensão pega o caso comum de graça (não abre
//!   o `.png` nem o lê); o CONTEÚDO pega o caso que a extensão não pode pegar — um
//!   binário com nome de texto, que existe e é justamente o que estraga a tela.
//! O sinal é o byte **zero**: texto não tem `\0`, binário quase sempre tem nos
//!   primeiros bytes (cabeçalho ELF, PNG, ZIP). Bytes altos NÃO servem de sinal — este
//!   projeto é todo escrito em português, e acento em UTF-8 é byte alto.
//! Devolve `false` em vez de estourar quando o caminho não existe: quem chama isto está
//!   decidindo se pede a leitura, e a frase de "o arquivo sumiu" é do leitor, não daqui.
export function ehTexto(arquivo: string): boolean {
  if (BINARIO.has(path.extname(arquivo).toLowerCase())) return false;

  let descritor: number | undefined;
  try {
    descritor = openSync(arquivo, "r");
    const amostra = Buffer.alloc(AMOSTRA);
    const lidos = readSync(descritor, amostra, 0, AMOSTRA, 0);
    //! Arquivo vazio ABRE: nada delata, e recusá-lo impediria o gesto mais comum de
    //!   todos — criar arquivo pela árvore e abri-lo em seguida.
    return amostra.subarray(0, lidos).indexOf(0) === -1;
  } catch {
    return false;
  } finally {
    if (descritor !== undefined) closeSync(descritor);
  }
}

/** Teto do que o editor aceita abrir. Script de laboratório não chega perto
 *  disso; um `.csv` de saída bruta chega, e aí a recusa é a resposta certa. */
const TETO_LEITURA = 32 * 1024 * 1024;

//* Lê um arquivo de texto do disco.
export async function lerArquivo(arquivo: string): Promise<string> {
  // A extensão diz o que o nome promete, não o que o arquivo é. Sem esta
  // conferência, um `notas.txt` que seja atalho para `/dev/zero` — ou para um
  // cano — nunca chega ao fim: o `readFile` acumula até estourar a memória e
  // derruba o aplicativo inteiro, não a aba. Numa pasta de corrida que veio de
  // fora, quem escolhe o nome não é quem abre.
  const info = await fs.stat(arquivo);
  if (!info.isFile()) {
    throw new Error(`${path.basename(arquivo)} não é um arquivo comum — o Terminus não abre.`);
  }
  if (info.size > TETO_LEITURA) {
    const mb = (info.size / 1024 / 1024).toFixed(1);
    throw new Error(
      `${path.basename(arquivo)} tem ${mb} MB e passa do teto de 32 MB — o Terminus não abre.`,
    );
  }
  return fs.readFile(arquivo, "utf8");
}

//* Grava um arquivo de texto no disco.
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
function validarNome(nome: unknown): string {
  //! ⚠️ O `typeof` VEM PRIMEIRO, e é a árvore **A10** consertada em 24/08. Antes, a
  //!   assinatura prometia `string` da ponte até aqui — e **declaração de tipo não confere
  //!   nada em runtime**: a carga do IPC chega crua. Com `42` a tela recebia
  //!   `"nome.trim is not a function"`; com `null`, `"Cannot read properties of null"`.
  //!   Falhava em segurança (nada era criado), mas um erro interno de JavaScript, com o nome
  //!   de uma variável nossa dentro, chegava à cara de quem usa.
  //! POR QUE `typeof` E NÃO `recusarEntrada`, que já existe e diz esta mesma frase: aquela
  //!   peneira também recusa o que começa com `-`, porque **caminho** com traço vira opção
  //!   do programa que o recebe. Nome de arquivo NÃO é caminho — `-x.txt` é legítimo e
  //!   funciona hoje. Reusar a peneira do caminho aqui herdaria uma recusa que ninguém
  //!   decidiu, e a árvore recusou essa opção por escrito.
  //! A trava de verdade é a assinatura `unknown`: com ela o `tsc` COBRA a conferência de
  //!   quem chamar, em vez de confiar. É o mesmo desenho de `dir` e `antigo` (árvore A3).
  if (typeof nome !== "string") throw new Error("O nome não é válido.");
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

//* Cria um arquivo vazio dentro da pasta aberta.
export async function criarArquivo(raiz: string, dir: string, nome: unknown): Promise<string> {
  const alvo = path.join(dir, validarNome(nome));
  dentroDe(raiz, alvo);
  // 'wx' falha se existir — melhor do que checar antes e apagar o arquivo de
  // alguém que apareceu no meio.
  const fh = await fs.open(alvo, "wx");
  await fh.close();
  return alvo;
}

//* Cria uma pasta dentro da pasta aberta.
export async function criarPasta(raiz: string, dir: string, nome: unknown): Promise<string> {
  const alvo = path.join(dir, validarNome(nome));
  dentroDe(raiz, alvo);
  await fs.mkdir(alvo);
  return alvo;
}

//* Renomeia (ou move) um arquivo ou pasta dentro do projeto.
export async function renomear(raiz: string, antigo: string, nome: unknown): Promise<string> {
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
