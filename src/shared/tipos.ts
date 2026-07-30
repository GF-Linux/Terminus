/**
 * Tipos compartilhados entre o processo principal, o preload e a interface.
 *
 * Este é o único arquivo importado pelos três lados. Nada aqui pode depender de
 * `electron`, de `node:*` ou do DOM — só descrever a forma dos dados que
 * atravessam a ponte de IPC.
 */

/** Uma função/classe do Biopython, já verificada contra a instalação real. */
export interface EntradaCatalogo {
  /** Caminho pontilhado, ex. "Bio.SeqIO.parse". */
  path: string;
  kind: "function" | "class" | "module" | string;
  /** Assinatura real lida por introspecção; null quando o Python não expõe uma. */
  signature: string | null;
  /** Primeira linha do docstring real. */
  doc: string;
  /** Texto do aviso de depreciação, ou null se não houver. */
  deprecated: string | null;
  /** Código para inserir no editor. */
  snippet: string;
  /** Observação de curadoria (armadilhas, equivalente atual, etc.). */
  note: string | null;
}

/** Um agrupamento por tarefa — o que se quer fazer, não em que módulo mora. */
export interface TarefaCatalogo {
  id: string;
  title: string;
  why: string;
  entries: EntradaCatalogo[];
}

export interface Catalogo {
  biopython_version: string;
  python_version: string;
  task_count: number;
  entry_count: number;
  generated_by: string;
  tasks: TarefaCatalogo[];
}

/** Versões detectadas nesta máquina. "?" quando não foi possível detectar. */
export interface Versoes {
  python: string;
  biopython: string;
  blast: string;
  tracy: string;
}

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

/** Eventos que o processo principal empurra para a interface. */
export type EventoExecucao =
  | { tipo: "saida"; texto: string }
  | { tipo: "erro"; texto: string }
  | { tipo: "fim"; codigo: number | null; sinal: string | null }
  | { tipo: "falha"; mensagem: string };

/** Resultado de qualquer operação que pode falhar por culpa do ambiente. */
export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

/* ----------------------------- language server ---------------------------- */

/** Um aviso do pyright. Linhas e colunas são 0-based, como no protocolo LSP. */
export interface Diagnostico {
  linhaInicio: number;
  colunaInicio: number;
  linhaFim: number;
  colunaFim: number;
  gravidade: "error" | "warning" | "info" | "hint";
  mensagem: string;
  codigo: string | null;
}

/** Diagnósticos de um arquivo, como chegam do processo principal. */
export interface AvisoDeArquivo {
  arquivo: string;
  diagnosticos: Diagnostico[];
}

export interface SugestaoLsp {
  rotulo: string;
  detalhe: string | null;
  tipo: string;
  documentacao: string | null;
  inserir: string;
}

/** Onde uma definição mora. Linha e coluna 0-based. */
export interface LugarNoCodigo {
  arquivo: string;
  linha: number;
  coluna: number;
}
