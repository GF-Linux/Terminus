import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

//? KITS EMBUTIDOS — Decisão sobre o que "vem junto" com o Terminus 17/08/2026
//!
//! 1. O objetivo do Terminus é ser ponte para quem tem dificuldade com o
//!    LazyVim. Uma ponte que exige configurar o LazyVim primeiro não é ponte.
//! 2. Por isso as funções prontas — a `caixa` hoje, e o que vier — moram NESTE
//!    repositório, em `kits/`, e não na configuração local de uma máquina só.
//!    Antes disso elas existiam só no computador do autor: sumiriam com ele, e
//!    ninguém que instalasse o Terminus as teria.
//! 3. É LIGAÇÃO (symlink), não cópia. Assim atualizar o Terminus atualiza as
//!    funções, sem ninguém precisar copiar arquivo de novo.
//!
//? O QUE ISTO ESCREVE NA MÁQUINA DE QUEM USA, E O QUE NÃO ESCREVE
//!
//! 4. Escreve SÓ dentro de `~/.config/nvim/snippets/<linguagem>/`, e só arquivos
//!    com nome começando em `terminus-`. Nada mais é criado, alterado ou lido.
//! 5. Um arquivo que já existe e NÃO é ligação nossa é deixado em paz: quem
//!    escreveu um snippet próprio com esse nome ganha dele, não do Terminus.
//! 6. Não há passo de instalação: acontece na abertura, e é silencioso quando
//!    não muda nada. Instalação que a pessoa precisa lembrar de rodar é uma
//!    forma de não vir junto.

/** Pasta do kit no repositório -> filetype do Neovim. */
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

async function ehNossaLigacao(alvo: string): Promise<boolean> {
  try {
    const st = await fs.lstat(alvo);
    return st.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Deixa as funções do Terminus disponíveis no editor.
 *
 * `raizApp` é a raiz do repositório/pacote, de onde sai a pasta `kits/`.
 */
export async function ligarKits(raizApp: string): Promise<ResumoDosKits> {
  const origem = path.join(raizApp, "kits");
  const destinoBase = path.join(homedir(), ".config", "nvim", "snippets");
  const resumo: ResumoDosKits = { ligados: 0, respeitados: [], erro: null };

  try {
    await fs.access(origem);
  } catch {
    //! Sem a pasta `kits/` não há o que ligar, e isso não é erro: é um Terminus
    //! rodando de um lugar que não tem os kits (um empacotamento parcial).
    return resumo;
  }

  for (const [pasta, filetype] of Object.entries(LINGUAGENS)) {
    const de = path.join(origem, pasta);
    let arquivos: string[];
    try {
      arquivos = (await fs.readdir(de)).filter((a) => a.endsWith(".json"));
    } catch {
      continue;
    }

    const para = path.join(destinoBase, filetype);
    await fs.mkdir(para, { recursive: true });

    for (const arquivo of arquivos) {
      const alvo = path.join(para, PREFIXO + arquivo);
      const fonte = path.join(de, arquivo);

      try {
        const jaExiste = await fs.lstat(alvo).then(() => true).catch(() => false);
        if (jaExiste && !(await ehNossaLigacao(alvo))) {
          resumo.respeitados.push(path.join(filetype, PREFIXO + arquivo));
          continue;
        }
        //! Refaz a ligação sempre: se o Terminus mudou de pasta, a antiga aponta
        //! para o vazio e o editor deixaria de achar as funções em silêncio.
        if (jaExiste) await fs.unlink(alvo);
        await fs.symlink(fonte, alvo);
        resumo.ligados += 1;
      } catch (err) {
        resumo.erro = err instanceof Error ? err.message : String(err);
      }
    }
  }

  return resumo;
}
