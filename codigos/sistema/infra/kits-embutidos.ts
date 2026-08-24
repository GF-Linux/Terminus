import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
//! A pergunta "cai dentro?" ja existe no dominio, e a infra PODE importar dele (§1.3).
//!   Escrevi uma copia local antes de conferir, e ela nascia com o MESMO nome de outra
//!   funcao privada da mesma camada (`arquivos-do-projeto.ts:134`) e o contrario dela:
//!   aquela estoura, esta devolvia booleano. Dois `dentroDe` opostos em `sistema/infra/`
//!   e armadilha de leitura — e a terceira copia da mesma regra (§6·R4).
import { dentroDaRaiz } from "../../dominio/guarda-de-caminho.js";

//? KITS EMBUTIDOS — Decisão sobre o que "vem junto" com o Terminus 17/08/2026
//!
//! 1. O objetivo do Terminus é ser ponte para quem tem dificuldade com o
//!    LazyVim. Uma ponte que exige configurar o LazyVim primeiro não é ponte.
//! 2. Por isso o kit mora NESTE repositório, em `kits/`, e não na configuração
//!    local de uma máquina só. Antes disso ele existia só no computador do
//!    autor: sumiria com ele, e ninguém que instalasse o Terminus o teria.
//!
//!    kits/funcoes/<linguagem>/  as funções prontas (a `caixa`, e o que vier)
//!    kits/editor/               o comportamento do editor que o leia-me promete
//!
//! 2b. As DUAS metades não são a mesma coisa, e a diferença importa: função
//!     pronta fica inerte até alguém digitar o gatilho; arquivo do editor muda
//!     o comportamento de quem instalar, na hora. Por isso o segundo grupo é
//!     curto e cada peça dele está listada no leia-me — nada entra sem estar
//!     escrito lá.
//! 3. É LIGAÇÃO (symlink), não cópia. Assim atualizar o Terminus atualiza as
//!    funções, sem ninguém precisar copiar arquivo de novo.
//!
//? O QUE ISTO ESCREVE NA MÁQUINA DE QUEM USA, E O QUE NÃO ESCREVE
//!
//! 4. Escreve SÓ nestes dois lugares, e só arquivos com nome começando em
//!    `terminus-`. Nada mais é criado, alterado ou lido:
//!       ~/.config/nvim/snippets/<linguagem>/terminus-*.json
//!       ~/.config/nvim/lua/plugins/terminus-*.lua
//! 5. Um arquivo que já existe e NÃO é ligação nossa é deixado em paz: quem
//!    escreveu um snippet próprio com esse nome ganha dele, não do Terminus.
//! 6. Não há passo de instalação: acontece na abertura, e é silencioso quando
//!    não muda nada. Instalação que a pessoa precisa lembrar de rodar é uma
//!    forma de não vir junto.

/** Pasta em `kits/funcoes/` -> filetype do Neovim. */
const LINGUAGENS: Record<string, string> = {
  python: "python",
  //! A pasta chama `csharp` porque é o nome que a pessoa conhece; o Neovim
  //! chama o filetype de `cs`. O mapa existe para os dois nomes conviverem.
  csharp: "cs",
  cpp: "cpp",
  lua: "lua",
};

const PREFIXO = "terminus-";

export interface ResumoDosKits {
  /** Quantos arquivos de função ficaram disponíveis. */
  ligados: number;
  /** Nomes que já existiam e não eram nossos — respeitados, não sobrescritos. */
  respeitados: string[];
  erro: string | null;
}

//! A ligação é NOSSA por LUGAR ou por FORMA — A4(b), decidida pela cabeça em 24/08/2026.
//! POR QUE DUAS PERGUNTAS, e não só a primeira: a de LUGAR (o alvo cai dentro da `kits/`
//!   que está rodando agora) é exata, e é a que responde pela instalação normal. Mas ela
//!   sozinha erra os dois casos em que a cópia MUDOU DE PASTA: a ligação para a cópia
//!   anterior e a ligação PENDURADA, cuja cópia sumiu — e a pendurada é justamente o caso
//!   que `ligarUm` diz que a refeitura existe para consertar. A de FORMA cobre esses dois.
//! ⚠️ MEDIDO ANTES DE APLICAR, em fixture isolada com os quatro casos: só o LUGAR acerta
//!   2 de 4; LUGAR **ou** FORMA acerta 4 de 4. O plano original propunha só o lugar.
//! `readlink` e NÃO `realpath`: é o caminho GRAVADO na ligação que interessa, e é o único
//!   que ainda existe quando o destino sumiu. `realpath` estouraria justo na pendurada.
//! A FORMA de um caminho de kit: `…/kits/funcoes/…` ou `…/kits/editor/…`. É heurística, e
//!   por isso vem DEPOIS da pergunta exata — mas é heurística estreita: exige o segmento
//!   `kits` inteiro (uma pasta `meus-kits` não casa) seguido de uma das duas metades.
function temFormaDeKit(destino: string): boolean {
  const partes = destino.split(path.sep);
  const i = partes.lastIndexOf("kits");
  return i >= 0 && (partes[i + 1] === "funcoes" || partes[i + 1] === "editor");
}

async function ehNossaLigacao(alvo: string, origem: string): Promise<boolean> {
  try {
    const st = await fs.lstat(alvo);
    if (!st.isSymbolicLink()) return false;
    const gravado = await fs.readlink(alvo);
    const apontaPara = path.resolve(path.dirname(alvo), gravado);
    return dentroDaRaiz(apontaPara, [origem]) || temFormaDeKit(apontaPara);
  } catch {
    return false;
  }
}

/**
 * Liga um arquivo do kit no lugar dele, e diz o que aconteceu.
 *
 * Devolve `"ligado"`, `"respeitado"` (já existe um arquivo que não é nosso) ou
 * a mensagem do erro.
 */
async function ligarUm(
  fonte: string,
  alvo: string,
  origem: string,
): Promise<"ligado" | "respeitado" | string> {
  const jaExiste = await fs.lstat(alvo).then(() => true).catch(() => false);
  if (jaExiste && !(await ehNossaLigacao(alvo, origem))) return "respeitado";
  try {
    //! Refaz a ligação sempre: se o Terminus mudou de pasta, a antiga aponta
    //! para o vazio e o editor deixaria de achar o kit em silêncio.
    if (jaExiste) await fs.unlink(alvo);
    await fs.symlink(fonte, alvo);
    return "ligado";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function listar(dir: string, extensao: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter((a) => a.endsWith(extensao));
  } catch {
    return [];
  }
}

/**
 * Deixa o kit do Terminus disponível no editor.
 *
 * `raizApp` é a raiz do repositório/pacote, de onde sai a pasta `kits/`.
 */
export async function ligarKits(raizApp: string): Promise<ResumoDosKits> {
  const origem = path.join(raizApp, "kits");
  const nvim = path.join(homedir(), ".config", "nvim");
  const resumo: ResumoDosKits = { ligados: 0, respeitados: [], erro: null };

  try {
    await fs.access(origem);
  } catch {
    //! Sem a pasta `kits/` não há o que ligar, e isso não é erro: é um Terminus
    //! rodando de um lugar que não tem os kits (um empacotamento parcial).
    return resumo;
  }

  const anotar = (r: string, nome: string): void => {
    if (r === "ligado") resumo.ligados += 1;
    else if (r === "respeitado") resumo.respeitados.push(nome);
    else resumo.erro = r;
  };

  //* As funções prontas, uma pasta por linguagem.
  for (const [pasta, filetype] of Object.entries(LINGUAGENS)) {
    const de = path.join(origem, "funcoes", pasta);
    const arquivos = await listar(de, ".json");
    if (arquivos.length === 0) continue;

    const para = path.join(nvim, "snippets", filetype);
    await fs.mkdir(para, { recursive: true });
    for (const arquivo of arquivos) {
      anotar(
        await ligarUm(path.join(de, arquivo), path.join(para, PREFIXO + arquivo), origem),
        path.join("snippets", filetype, PREFIXO + arquivo),
      );
    }
  }

  //* O comportamento do editor.
  //! Vai para a MESMA pasta de plugins da pessoa, com o prefixo `terminus-`.
  //! Não é uma pasta separada porque o lazy.nvim lê só esta — pasta própria
  //! seria um arquivo que ninguém carrega.
  const deEditor = path.join(origem, "editor");
  const paraEditor = path.join(nvim, "lua", "plugins");
  const luas = await listar(deEditor, ".lua");
  if (luas.length > 0) {
    await fs.mkdir(paraEditor, { recursive: true });
    for (const arquivo of luas) {
      anotar(
        await ligarUm(path.join(deEditor, arquivo), path.join(paraEditor, PREFIXO + arquivo), origem),
        path.join("lua/plugins", PREFIXO + arquivo),
      );
    }
  }

  return resumo;
}
