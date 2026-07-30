import { contextBridge, ipcRenderer } from "electron";
import type {
  AvisoDeArquivo,
  Catalogo,
  EstadoFantasma,
  EventoExecucao,
  LugarNoCodigo,
  NoArquivo,
  ProjetoAberto,
  Resultado,
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
  /** Pasta passada na linha de comando, se houver. */
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

  rodar: (arquivo: string): void => ipcRenderer.send("exec:rodar", arquivo),
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
