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
  EdicaoSugerida,
  EstadoMascote,
  EstadoTrilha,
  ExercicioTrilha,
  EventoExecucao,
  FalaMascote,
  LugarNoCodigo,
  NoArquivo,
  ProjetoAberto,
  RespostaComando,
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
 * conveniência.
 *
 * **Até a ADR 0020 este comentário dizia "não acrescentar um executar comando
 * arbitrário", e agora `comando()` é exatamente isso.** A troca foi consciente e
 * está registrada: uma IDE onde não se instala biblioteca não serve para estudar,
 * que é o propósito declarado desta. O que a linha tirou de garantia e o que
 * ficou de pé:
 *
 * - **caiu:** a interface deixou de estar limitada a rodar `.py` de dentro da
 *   pasta aberta. Quem controla o renderizador controla o que o usuário
 *   controla no terminal.
 * - **fica de pé:** não há shell, então nada de texto é reinterpretado
 *   (`shell: false`, argumentos separados em `comando.ts`); um processo por vez;
 *   e nenhum recurso de IA alcança esta porta — o fantasma, a Fern e o Copilot
 *   falam por canais próprios que só trocam texto, e **nada do que eles
 *   respondem chega aqui sem alguém digitar e apertar Enter**.
 *
 * Esta última linha é a que precisa continuar verdadeira. Se um dia algo sugerir
 * comando na tela, o botão que executa é uma decisão nova, não um detalhe.
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

  /**
   * O terminal do chat (ADR 0022) — a linha que mora no painel da Fern, para
   * chamar o `verboo` sem sair de lá. Canal próprio (`chat:*`) e **lugar de
   * processo próprio**: o que roda aqui não desabilita o ▶ do editor.
   *
   * Note o que **não** existe: nenhum caminho da conversa dela para cá. O que
   * roda aqui é o que a pessoa digitou, e a saída não volta para a API dela.
   */
  chat: {
    comando: (linha: string): Promise<Resultado<RespostaComando>> =>
      ipcRenderer.invoke("chat:comando", linha),
    parar: (): void => ipcRenderer.send("chat:parar"),
    aoExecutar: (ouvinte: (e: EventoExecucao) => void): (() => void) => {
      const wrap = (_: unknown, evento: EventoExecucao): void => ouvinte(evento);
      ipcRenderer.on("chat:evento", wrap);
      return () => ipcRenderer.off("chat:evento", wrap);
    },
  },

  copilot: {
    /** Se o Copilot esta autenticado, e com qual conta. */
    estado: (): Promise<Resultado<{ entrou: boolean; usuario: string | null }>> =>
      ipcRenderer.invoke("copilot:estado"),
  },
  lsp: {
    abrir: (arquivo: string, texto: string): void => ipcRenderer.send("lsp:abrir", arquivo, texto),
    mudar: (arquivo: string, versao: number, texto: string): void =>
      ipcRenderer.send("lsp:mudar", arquivo, versao, texto),
    fechar: (arquivo: string): void => ipcRenderer.send("lsp:fechar", arquivo),
    /** Qual aba está na frente — `null` quando não há nenhuma, ou quando a que
     *  está na frente não é Python. Separado do `abrir` porque trocar de aba não
     *  abre nada, e era exatamente essa distinção que faltava. */
    focar: (arquivo: string | null): void => ipcRenderer.send("lsp:focar", arquivo),
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
    /**
     * A correção do que já está escrito (ADR 0025). Devolve **intervalos a
     * substituir**, e não texto a inserir — é a única coisa nesta ponte capaz
     * de trocar caractere que a pessoa já digitou. Por isso ela chega como
     * proposta na tela, e só vira código quando alguém aperta a tecla.
     */
    corrigir: (texto: string, cursor: number): Promise<Resultado<EdicaoSugerida[]>> =>
      ipcRenderer.invoke("fantasma:corrigir", texto, cursor),
    edicaoAceita: (): void => ipcRenderer.send("fantasma:edicaoAceita"),
    edicaoRecusada: (): void => ipcRenderer.send("fantasma:edicaoRecusada"),
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
