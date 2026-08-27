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
 * O que a sugestão inline traz do Copilot, já pronta para virar item do Monaco.
 *
 * É a forma que o `textDocument/inlineCompletion` do LSP devolve, e ela casa
 * quase um-a-um com a `InlineCompletion` do editor — por isso atravessa a porta
 * sem tradução no meio. O `range` sempre começa e termina na MESMA linha: é
 * exigência do Monaco, e o servidor já a respeita.
 */
export interface SugestaoInline {
  insertText: string;
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
  /** O que devolver ao Copilot quando a pessoa aceitar. É como ele aprende. */
  command?: { title?: string; command: string; arguments?: unknown[] };
}

/**
 * O que a barra de estado sabe dizer sobre o Copilot.
 *
 * `pronto: false` NÃO é erro — é estado, e é o mais comum de todos (servidor
 * ainda subindo, sessão expirada, binário ausente). O `detalhe` existe para a
 * barra dizer O QUE falta em vez de a sugestão simplesmente nunca aparecer.
 */
export interface EstadoCopilot {
  pronto: boolean;
  /** Onde o servidor foi achado, ou `null` quando não foi. */
  servidor: string | null;
  detalhe: string;
}

/**
 * O que a casca sabe dizer sobre um servidor de linguagem (ramo B1).
 *
 * `pronto: false` NÃO é erro — é o estado mais comum numa máquina que não tem
 * aquele servidor instalado. O `detalhe` existe para a barra dizer O QUE falta
 * em vez de o editor simplesmente ficar burro sem explicação.
 */
export interface EstadoServidor {
  linguagem: string;
  pronto: boolean;
  /** O binário que subiu, ou `null` quando não subiu nenhum. */
  comando: string | null;
  detalhe: string;
}

/**
 * Uma extensão instalada no VSCode desta máquina.
 *
 * O `tipo` é a informação que decide tudo, e ele é lido do `package.json`, não chutado:
 * `web` declara `browser` e roda no mesmo lugar que o editor; `desktop` só declara `main` e
 * precisa de um host de extensão em Node que este produto não tem; `declarativa` não tem
 * código nenhum — tema, pacote de idioma, gramática — e é a que carregaria mais fácil.
 */
export interface ExtensaoDoVscode {
  id: string;
  rotulo: string;
  versao: string;
  descricao: string;
  pasta: string;
  tipo: "web" | "desktop" | "declarativa";
}

/**
 * A tela de abertura do Neovim da cabeça, lida do `dashboard.lua` dela.
 *
 * `logotipo` são as linhas do `wordmark`; `cores` é a paleta própria dessa tela
 * (`ink`/`deep`/`tide`/`glow`/`mist`/`foam` — **não** a do `tema.lua`, que é outra);
 * `ficha` são os pares que o painel mostra, lidos das mesmas fontes que ele usa.
 */
export interface AberturaDoNvim {
  logotipo: string[];
  cores: Record<string, string>;
  ficha: [string, string][];
}

/**
 * Uma **edição seguinte** (NES): o Copilot dizendo ONDE vai a próxima mudança.
 *
 * Diferente da `SugestaoInline`, que completa onde o cursor está, esta aponta para outro
 * lugar do arquivo — e é isso que o editor mostra como seta na calha e salto por `Tab`.
 */
export interface EdicaoSeguinte {
  text: string;
  textDocument: { uri: string; version?: number };
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  command?: { title?: string; command: string; arguments?: unknown[] };
}
