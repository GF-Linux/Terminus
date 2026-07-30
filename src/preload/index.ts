import { contextBridge, ipcRenderer } from "electron";
import type {
  Catalogo,
  EventoExecucao,
  NoArquivo,
  ProjetoAberto,
  Resultado,
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

  ler: (arquivo: string): Promise<Resultado<string>> => ipcRenderer.invoke("arquivo:ler", arquivo),
  gravar: (arquivo: string, conteudo: string): Promise<Resultado<void>> =>
    ipcRenderer.invoke("arquivo:gravar", arquivo, conteudo),

  rodar: (arquivo: string): void => ipcRenderer.send("exec:rodar", arquivo),
  parar: (): void => ipcRenderer.send("exec:parar"),
  rodando: (): Promise<boolean> => ipcRenderer.invoke("exec:rodando"),
  aoExecutar: (ouvinte: (e: EventoExecucao) => void): (() => void) => {
    const wrap = (_: unknown, evento: EventoExecucao): void => ouvinte(evento);
    ipcRenderer.on("exec:evento", wrap);
    return () => ipcRenderer.off("exec:evento", wrap);
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
