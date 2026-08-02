import { contextBridge, ipcRenderer } from "electron";
import type {
  ArquivoDeMemoria,
  AvisoDeArquivo,
  Catalogo,
  Cromatograma,
  EstadoAparencia,
  EstadoDoMascote,
  EstadoFantasma,
  EdicaoExtra,
  EstadoMascote,
  EstadoTrilha,
  ExercicioTrilha,
  EventoExecucao,
  FalaMascote,
  LugarNoCodigo,
  NoArquivo,
  ProjetoAberto,
  RespostaMascote,
  Resultado,
  Vestimenta,
  SugestaoLsp,
  Versoes,
} from "../shared/tipos.js";

/**
 * A única superfície que a interface enxerga do sistema.
 *
 * `contextIsolation` está ligado e `nodeIntegration` desligado: o renderizador
 * não tem `require`, não tem `fs` e não tem `child_process`. Tudo o que ele pode
 * fazer está listado abaixo — e cada item aqui é uma decisão de segurança, não
 * conveniência. Não acrescentar um "executar comando arbitrário".
 */
const api = {
  catalogo: (): Promise<Resultado<Catalogo>> => ipcRenderer.invoke("catalogo:carregar"),
  versoes: (): Promise<Resultado<Versoes>> => ipcRenderer.invoke("ambiente:versoes"),

  escolherProjeto: (): Promise<Resultado<ProjetoAberto | null>> =>
    ipcRenderer.invoke("projeto:escolher"),
  abrirProjeto: (raiz: string): Promise<Resultado<ProjetoAberto>> =>
    ipcRenderer.invoke("projeto:abrir", raiz),
  /** Abre uma pasta já conhecida (um recente), sem passar pelo diálogo. */
  entrarNaPasta: (raiz: string): Promise<Resultado<ProjetoAberto>> =>
    ipcRenderer.invoke("projeto:entrar", raiz),
  /** Pastas de corrida já abertas, da mais recente para a mais antiga. */
  pastasRecentes: (): Promise<Resultado<string[]>> => ipcRenderer.invoke("projeto:recentes"),
  esquecerPasta: (raiz: string): Promise<Resultado<string[]>> =>
    ipcRenderer.invoke("projeto:esquecer", raiz),
  /** Pasta da linha de comando ou, na falta dela, a última que ficou aberta. */
  projetoInicial: (): Promise<Resultado<ProjetoAberto | null>> =>
    ipcRenderer.invoke("projeto:inicial"),
  listar: (dir: string): Promise<Resultado<NoArquivo[]>> => ipcRenderer.invoke("projeto:listar", dir),
  /** Todos os arquivos do projeto, em caminho relativo — alimenta o Ctrl+P. */
  arquivosDoProjeto: (raiz: string): Promise<Resultado<string[]>> =>
    ipcRenderer.invoke("projeto:arquivos", raiz),

  ler: (arquivo: string): Promise<Resultado<string>> => ipcRenderer.invoke("arquivo:ler", arquivo),
  gravar: (arquivo: string, conteudo: string): Promise<Resultado<void>> =>
    ipcRenderer.invoke("arquivo:gravar", arquivo, conteudo),

  criarArquivo: (raiz: string, dir: string, nome: string): Promise<Resultado<string>> =>
    ipcRenderer.invoke("arquivo:criar", raiz, dir, nome),
  criarPasta: (raiz: string, dir: string, nome: string): Promise<Resultado<string>> =>
    ipcRenderer.invoke("pasta:criar", raiz, dir, nome),
  renomear: (raiz: string, antigo: string, nome: string): Promise<Resultado<string>> =>
    ipcRenderer.invoke("caminho:renomear", raiz, antigo, nome),
  /** `false` quando o usuário cancelou a confirmação. */
  excluir: (alvo: string): Promise<Resultado<boolean>> =>
    ipcRenderer.invoke("caminho:excluir", alvo),

  rodar: (arquivo: string, extras: string[] = []): void =>
    ipcRenderer.send("exec:rodar", arquivo, extras),
  parar: (): void => ipcRenderer.send("exec:parar"),
  rodando: (): Promise<boolean> => ipcRenderer.invoke("exec:rodando"),
  aoExecutar: (ouvinte: (e: EventoExecucao) => void): (() => void) => {
    const wrap = (_: unknown, evento: EventoExecucao): void => ouvinte(evento);
    ipcRenderer.on("exec:evento", wrap);
    return () => ipcRenderer.off("exec:evento", wrap);
  },

  lsp: {
    abrir: (arquivo: string, texto: string): void => ipcRenderer.send("lsp:abrir", arquivo, texto),
    mudar: (arquivo: string, versao: number, texto: string): void =>
      ipcRenderer.send("lsp:mudar", arquivo, versao, texto),
    fechar: (arquivo: string): void => ipcRenderer.send("lsp:fechar", arquivo),
    completar: (a: string, l: number, c: number): Promise<Resultado<SugestaoLsp[]>> =>
      ipcRenderer.invoke("lsp:completar", a, l, c),
    /** O `import` que falta para a sugestão de índice `i`, perguntado na aceitação. */
    resolver: (i: number): Promise<Resultado<EdicaoExtra[]>> =>
      ipcRenderer.invoke("lsp:resolver", i),
    hover: (a: string, l: number, c: number): Promise<Resultado<string | null>> =>
      ipcRenderer.invoke("lsp:hover", a, l, c),
    definicao: (a: string, l: number, c: number): Promise<Resultado<LugarNoCodigo | null>> =>
      ipcRenderer.invoke("lsp:definicao", a, l, c),
    aoDiagnosticar: (ouvinte: (a: AvisoDeArquivo) => void): void => {
      ipcRenderer.on("lsp:diagnosticos", (_, aviso: AvisoDeArquivo) => ouvinte(aviso));
    },
    aoFalhar: (ouvinte: (motivo: string) => void): void => {
      ipcRenderer.on("lsp:falhou", (_, motivo: string) => ouvinte(motivo));
    },
  },

  /** Lê um .ab1 e devolve os traços para o cromatograma. */
  cromatograma: (arquivo: string): Promise<Resultado<Cromatograma>> =>
    ipcRenderer.invoke("cromatograma:ler", arquivo),

  fantasma: {
    estado: (): Promise<Resultado<EstadoFantasma>> => ipcRenderer.invoke("fantasma:estado"),
    ligar: (ligado: boolean): Promise<Resultado<EstadoFantasma>> =>
      ipcRenderer.invoke("fantasma:ligar", ligado),
    importarDoTwinny: (): Promise<Resultado<EstadoFantasma>> =>
      ipcRenderer.invoke("fantasma:importar"),
    esquecer: (): Promise<Resultado<EstadoFantasma>> => ipcRenderer.invoke("fantasma:esquecer"),
    sugerir: (texto: string, cursor: number): Promise<Resultado<string | null>> =>
      ipcRenderer.invoke("fantasma:sugerir", texto, cursor),
    cancelar: (): void => ipcRenderer.send("fantasma:cancelar"),
  },

  /**
   * O mascote (ADR 0008). Note o que **não** está aqui: nada que leve arquivo,
   * caminho ou código para a conversa. A interface manda as falas e recebe a
   * resposta; o miniMD que serve de contexto é lido no processo principal e
   * nunca passa por esta ponte.
   */
  mascote: {
    estado: (): Promise<Resultado<EstadoDoMascote>> => ipcRenderer.invoke("mascote:estado"),
    quadros: (): Promise<Resultado<Partial<Record<EstadoMascote, string>>>> =>
      ipcRenderer.invoke("mascote:quadros"),
    ligar: (ligado: boolean): Promise<Resultado<EstadoDoMascote>> =>
      ipcRenderer.invoke("mascote:ligar", ligado),
    nomear: (nome: string): Promise<Resultado<EstadoDoMascote>> =>
      ipcRenderer.invoke("mascote:nomear", nome),
    conversar: (falas: FalaMascote[]): Promise<Resultado<RespostaMascote>> =>
      ipcRenderer.invoke("mascote:conversar", falas),
    cancelar: (): void => ipcRenderer.send("mascote:cancelar"),
    /** A memória dela: listar para auditar, apagar o que não deveria estar lá. */
    memoria: (): Promise<Resultado<{ pasta: string; arquivos: ArquivoDeMemoria[] }>> =>
      ipcRenderer.invoke("memoria:listar"),
    esquecerArquivo: (caminho: string): Promise<Resultado<void>> =>
      ipcRenderer.invoke("memoria:apagar", caminho),
    /** Fecha o laço: destila a conversa no perfil. */
    destilar: (falas: FalaMascote[]): Promise<Resultado<boolean>> =>
      ipcRenderer.invoke("memoria:destilar", falas),
  },

  /** A trilha de estudo (ADR 0015). */
  trilha: {
    ler: (fase?: string): Promise<Resultado<EstadoTrilha>> =>
      ipcRenderer.invoke("trilha:ler", fase),
    vestimenta: (v: Vestimenta): Promise<Resultado<EstadoTrilha>> =>
      ipcRenderer.invoke("trilha:vestimenta", v),
    marcar: (chave: string, vestimenta: string): Promise<Resultado<EstadoTrilha>> =>
      ipcRenderer.invoke("trilha:marcar", chave, vestimenta),
    esquecer: (chave: string): Promise<Resultado<EstadoTrilha>> =>
      ipcRenderer.invoke("trilha:esquecer", chave),
    refazer: (entrada: {
      raizProjeto: string;
      topico: string;
      exercicio: ExercicioTrilha;
      vestimenta: string;
      enunciado: string;
    }): Promise<Resultado<{ caminho: string; novo: boolean; guardado: string | null }>> =>
      ipcRenderer.invoke("trilha:refazer", entrada),
    praticar: (entrada: {
      raizProjeto: string;
      topico: string;
      exercicio: ExercicioTrilha;
      vestimenta: string;
      enunciado: string;
    }): Promise<Resultado<{ caminho: string; novo: boolean }>> =>
      ipcRenderer.invoke("trilha:praticar", entrada),
    verificar: (
      exercicio: string,
      arquivo: string,
    ): Promise<Resultado<{ verificador: string; teste: string; arquivo: string }>> =>
      ipcRenderer.invoke("trilha:verificar", exercicio, arquivo),
  },

  /** Wallpaper e tema (ADR 0010). A imagem chega em `data:` URL. */
  aparencia: {
    estado: (): Promise<Resultado<EstadoAparencia>> => ipcRenderer.invoke("aparencia:estado"),
    definir: (parcial: Partial<EstadoAparencia>): Promise<Resultado<EstadoAparencia>> =>
      ipcRenderer.invoke("aparencia:definir", parcial),
    escolher: (): Promise<Resultado<EstadoAparencia | null>> =>
      ipcRenderer.invoke("aparencia:escolher"),
    tirar: (): Promise<Resultado<EstadoAparencia>> => ipcRenderer.invoke("aparencia:tirar"),
  },

  janela: {
    minimizar: (): void => ipcRenderer.send("janela:minimizar"),
    alternarMaximo: (): void => ipcRenderer.send("janela:alternar-maximo"),
    fechar: (): void => ipcRenderer.send("janela:fechar"),
    aoMudarEstado: (ouvinte: (maximizada: boolean) => void): void => {
      ipcRenderer.on("janela:estado", (_, max: boolean) => ouvinte(max));
    },
  },
} as const;

export type ApiBancada = typeof api;

contextBridge.exposeInMainWorld("bancada", api);
