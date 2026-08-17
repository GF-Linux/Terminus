import { contextBridge, ipcRenderer } from "electron";
import type {
  EstadoAparencia,
  EventoExecucao,
  NoArquivo,
  PluginNvim,
  ProjetoAberto,
  RespostaComando,
  Resultado,
} from "../compartilhado/tipos.js";

//? PONTE PARA A INTERFACE — Decisão sobre a única porta para o sistema 29/07/2026
//!
//! 1. Tudo que a tela consegue fazer no computador está listado NESTE arquivo.
//!    Se não está aqui, a interface não faz.
//! 2. `contextIsolation` ligado e `nodeIntegration` desligado: a interface não
//!    tem `require`, nem `fs`, nem `child_process`.
//! 3. Cada item aqui é decisão de segurança, não conveniência. Acrescentar um
//!    é aumentar o que um defeito na tela consegue alcançar.
//! 4. `comando()` executa o que a pessoa digitou, e isso já foi proibido aqui.
//!    A troca foi consciente: ferramenta onde não se instala biblioteca não
//!    serve para aprender.
//! 5. O que segura a linha: não há shell (`shell: false`, argumentos separados
//!    em `triagem-de-comando.ts`), um processo por vez, e nada de IA alcança
//!    esta porta. Se um dia algo sugerir comando na tela, o botão que executa é
//!    decisão nova, não detalhe.
const api = {
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

  parar: (): void => ipcRenderer.send("exec:parar"),
  rodando: (): Promise<boolean> => ipcRenderer.invoke("exec:rodando"),

  /**
   * A linha de comando (ADR 0020). A saída chega pelo mesmo `aoExecutar` de
   * sempre; o retorno traz só o que a interface precisa saber na hora: a pasta
   * (que o `cd` muda), se ficou algo rodando, e a nota de uma reescrita.
   */
  comando: (linha: string): Promise<Resultado<RespostaComando>> =>
    ipcRenderer.invoke("exec:comando", linha),
  pastaDoComando: (): Promise<Resultado<string>> => ipcRenderer.invoke("exec:pasta"),
  historicoDeComandos: (): Promise<Resultado<string[]>> => ipcRenderer.invoke("exec:historico"),
  esquecerComandos: (): Promise<Resultado<void>> => ipcRenderer.invoke("exec:esquecerHistorico"),
  aoExecutar: (ouvinte: (e: EventoExecucao) => void): (() => void) => {
    const wrap = (_: unknown, evento: EventoExecucao): void => ouvinte(evento);
    ipcRenderer.on("exec:evento", wrap);
    return () => ipcRenderer.off("exec:evento", wrap);
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

  /**
   * O motor de edição (ADR 0025): o `nvim` de verdade, rodando por PTY no
   * processo principal. Esta ponte só transporta bytes — teclado sobe, ANSI
   * desce — e não interpreta nada. O canal de controle (`:edit`, `:w`) é o
   * socket msgpack-RPC, não esta superfície.
   */
  neovim: {
    iniciar: (cwd: string, cols: number, rows: number): void =>
      ipcRenderer.send("neovim:iniciar", cwd, cols, rows),
    enviar: (dados: string): void => ipcRenderer.send("neovim:enviar", dados),
    /** Abre um arquivo no Neovim e entra em modo de escrita (por RPC). Com
     *  `linha`, o cursor já para no lugar — é o traceback clicável. */
    abrir: (caminho: string, linha?: number): Promise<Resultado<void>> =>
      ipcRenderer.invoke("neovim:abrir", caminho, linha),
    /** Aponta o diretório de trabalho do Neovim para a pasta dada. */
    cd: (pasta: string): void => ipcRenderer.send("neovim:cd", pasta),
    /** Os plugins instalados, perguntados ao lazy.nvim — alimenta o painel lateral. */
    plugins: (): Promise<Resultado<PluginNvim[]>> => ipcRenderer.invoke("neovim:plugins"),
    redimensionar: (cols: number, rows: number): void =>
      ipcRenderer.send("neovim:redimensionar", cols, rows),
    parar: (): void => ipcRenderer.send("neovim:parar"),
    /** Saída crua do Neovim rumo ao xterm. Devolve como cancelar a assinatura. */
    aoSaida: (ouvinte: (dados: string) => void): (() => void) => {
      const wrap = (_: unknown, dados: string): void => ouvinte(dados);
      ipcRenderer.on("neovim:saida", wrap);
      return () => ipcRenderer.off("neovim:saida", wrap);
    },
    aoEncerrar: (ouvinte: (codigo: number) => void): (() => void) => {
      const wrap = (_: unknown, codigo: number): void => ouvinte(codigo);
      ipcRenderer.on("neovim:encerrou", wrap);
      return () => ipcRenderer.off("neovim:encerrou", wrap);
    },
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

export type ApiTerminus = typeof api;

contextBridge.exposeInMainWorld("terminus", api);
