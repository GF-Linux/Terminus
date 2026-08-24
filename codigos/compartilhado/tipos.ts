//? TIPOS COMPARTILHADOS — Decisão sobre o que atravessa a porta 29/07/2026
//!
//! 1. É o único arquivo importado pelos três reinos (sistema, porta, interface).
//! 2. Nada aqui pode depender de `electron`, de `node:*` ou do DOM. Só
//!    descreve a FORMA dos dados que atravessam a porta de IPC.
/** Um nó da árvore de arquivos do projeto aberto. */
export interface NoArquivo {
  nome: string;
  caminho: string;
  tipo: "arquivo" | "pasta";
  /** Só em pastas; carregado sob demanda, `null` enquanto não foi expandido. */
  filhos: NoArquivo[] | null;
}

export interface ProjetoAberto {
  raiz: string;
  nome: string;
  filhos: NoArquivo[];
}

/**
 * A linguagem do trabalho aberto (ADR 0027).
 *
 * Existe porque o botão de fluxo precisa dizer para o Terminus o que está sendo
 * escrito — e não só criar arquivo e sumir. É o que a barra de título mostra.
 */
export type Fluxo = "cpp" | "python" | "csharp";

/** O que volta do botão Rodar (ADR 0030): a linha, e por que é essa. */
export interface ComoRodar {
  linha: string;
  porque: string;
}

/** O que volta de "Novo projeto": a pasta já aberta e o arquivo para editar. */
export interface ProjetoNovo {
  projeto: ProjetoAberto;
  /** Caminho absoluto do `main.cpp` / `main.py` — a casca já abre este. */
  principal: string;
  fluxo: Fluxo;
}

//! `EventoExecucao` e `RespostaComando` saíram (19/08). Descreviam a saída de um
//! comando rodado por canos e a resposta de uma linha triada — as duas coisas
//! deixaram de existir quando o terminal virou um shell com PTY. O que atravessa
//! a porta agora são bytes crus, que não precisam de forma.

/** Resultado de qualquer operação que pode falhar por culpa do ambiente. */
export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

/* ----------------------------- language server ---------------------------- */

/* ------------------------------ texto fantasma ---------------------------- */

/* ------------------------------ aparência --------------------------------- */

/** Wallpaper e tema (ADR 0010). `imagem` é `data:` URL, ou null. */
export interface EstadoAparencia {
  wallpaper: string | null;
  imagem: string | null;
  escurecer: number;
  desfoque: number;
  /** "seco" | "crossfade" | "vaivem" — como esconder a volta do loop. */
  junta: string;
  tema: string;
  gerado: Record<string, string> | null;
  /** Preenchido pela interface: a imagem é animada e o reprodutor a assumiu. */
  animado?: boolean;
  /** Zoom da janela inteira, como fator. 1 é o tamanho natural. */
  zoom: number;
}

/**
 * Um plugin do Neovim, como o lazy.nvim o descreve (ADR 0025).
 *
 * Alimenta o painel lateral que substituiu o "Extensions": o Neovim tem plugin
 * demais para quem está começando descobrir sozinho, e `:Lazy` é uma tela dentro
 * do editor. Na lateral a lista fica clicável, como numa IDE.
 */
export interface PluginNvim {
  nome: string;
  url: string;
  dir: string;
  carregado: boolean;
}
