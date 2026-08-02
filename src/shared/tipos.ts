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

/* ------------------------------- cromatograma ----------------------------- */

/** Saída de `tools/ler_ab1.py`. */
export interface Cromatograma {
  arquivo: string;
  amostra: string;
  /** Qual canal DATA é qual base, tipicamente "GATC". */
  ordem_canais: string;
  sequencia: string;
  qualidade: number[];
  /** Índice de amostra onde cada base foi chamada, já reescalado. */
  picos: number[];
  tracos: Record<"A" | "C" | "G" | "T", number[]>;
  n_amostras: number;
  fator_reducao: number;
  resumo: {
    bases: number;
    phred_medio: number | null;
    phred_min: number | null;
    phred_max: number | null;
    bases_boas: number;
    ambiguas: number;
  };
}

/* ------------------------------ texto fantasma ---------------------------- */

export interface ConfigFantasma {
  endpoint: string;
  modelo: string;
  ligado: boolean;
}

/* -------------------------------- trilha ---------------------------------- */

/** A roupa do enunciado. O conceito é o mesmo em todas (ADR 0015). */
export type Vestimenta = "neutro" | "sequências" | "clínica" | "campo" | "laboratório";

export interface ExercicioTrilha {
  id: string;
  /** Assinatura que a correção vai chamar, ex. `conta(itens, alvo)`. */
  funcao: string;
  /** O contrato em uma frase. */
  contrato: string;
  /** Enunciado por vestimenta. */
  enunciados: Record<string, string>;
}

export interface TopicoTrilha {
  id: string;
  titulo: string;
  semana: number;
  entrega: string;
  abertura: string;
  conceitos: string[];
  recursos: { nome: string; url: string }[];
  exercicios: ExercicioTrilha[];
}

/**
 * Quantas vezes o exercício foi feito, quando foi a última e em que roupas.
 *
 * Não é "concluído": repetir é o método, não fracasso (ADR 0016).
 */
export interface RegistroTrilha {
  vezes: number;
  ultima: string;
  roupas: string[];
}

export interface EstadoTrilha {
  topicos: TopicoTrilha[];
  /** Chave `topico/exercicio` → registro das passagens. */
  feito: Record<string, RegistroTrilha>;
  vestimenta: Vestimenta;
}

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
}

/* ------------------------------- mascote ---------------------------------- */

/** Os estados que o mascote sabe mostrar. Cada um é um quadro de sprite. */
export type EstadoMascote = "parado" | "piscando" | "feliz" | "preocupado" | "pensando";

/** Uma fala da conversa. `mascote` é o que o modelo respondeu. */
export interface FalaMascote {
  quem: "autor" | "mascote";
  texto: string;
}

/** Um arquivo da memória do mascote, para a tela de auditoria (ADR 0009). */
export interface ArquivoDeMemoria {
  nome: string;
  caminho: string;
  /** "perfil", "nota" ou "diário". */
  tipo: string;
  bytes: number;
  alterado: number;
}

/** O que o mascote respondeu, mais o que ele mexeu na memória ao responder. */
export interface RespostaMascote {
  texto: string;
  /** Frases como "guardado no diário de 2026-08-01", para a interface avisar. */
  memoria: string[];
}

export interface EstadoDoMascote {
  /** Há chave configurada — a mesma do texto fantasma. */
  temChave: boolean;
  /** A conversa está ligada. Vem desligada. */
  ligado: boolean;
  endpoint: string;
  modelo: string;
  nome: string;
  /** O miniMD existe e será o contexto da conversa. */
  temContexto: boolean;
  /** Caminho do miniMD, para a tela poder dizer o que ele lê. */
  arquivoContexto: string;
  /** Pasta onde moram os quadros do sprite. */
  pastaSprite: string;
  /** Quais quadros foram achados no disco. */
  quadros: EstadoMascote[];
}

/** O que a tela de configurações mostra. Nunca inclui a chave. */
export interface EstadoFantasma {
  configurado: boolean;
  ligado: boolean;
  endpoint: string | null;
  modelo: string | null;
  /** Se `false`, a chave está em texto puro no disco — e a tela avisa. */
  chaveiroDisponivel: boolean;
  chaveEmTextoPuro: boolean;
  arquivo: string;
}
