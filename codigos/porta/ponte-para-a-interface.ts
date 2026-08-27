import { contextBridge, ipcRenderer } from "electron";
import type {
  AberturaDoNvim,
  ComoRodar,
  EstadoAparencia,
  EdicaoSeguinte,
  EstadoCopilot,
  EstadoServidor,
  ExtensaoDoVscode,
  Fluxo,
  NoArquivo,
  ProjetoAberto,
  ProjetoNovo,
  Resultado,
  SugestaoInline,
} from "../compartilhado/tipos.js";

//? A PORTA PARA A INTERFACE — Decisão sobre a única passagem renderer/main 29/07/2026
//!
//! 1. Tudo que a tela consegue fazer no computador está listado NESTE arquivo.
//!    Se não está aqui, a interface não faz.
//! 2. `contextIsolation` ligado e `nodeIntegration` desligado: a interface não
//!    tem `require`, nem `fs`, nem `child_process`.
//! 3. Cada item aqui é decisão de segurança, não conveniência. Acrescentar um
//!    é aumentar o que um defeito na tela consegue alcançar.
//! 4. `shell.enviar()` manda tecla para um SHELL DE VERDADE (19/08). Isto é a
//!    maior superfície deste arquivo, e a mudança foi decidida com o autor:
//!    o terminal do Terminus passa a ter o mesmo alcance que o Konsole tem.
//! 5. **O que segurava a linha antes não segura mais, e é bom dizer o que era.**
//!    Até 18/08 não havia shell: a linha digitada era quebrada em programa e
//!    argumentos (`triagem-de-comando.ts`, apagado), `|`, `>`, `&&` e `;` eram
//!    recusados, e programa interativo também. Aquilo NÃO era política de
//!    segurança — era consequência de não haver PTY, e estava escrito como se
//!    fosse tranca. A tranca de verdade sempre foi outra, e continua de pé:
//!    **nada de IA alcança esta porta**. Nenhum modelo escreve aqui, nem sugere
//!    comando com botão que executa. Se um dia isso for proposto, é decisão
//!    nova e escrita, não detalhe de implementação.
//! 6. O que a pessoa digita no terminal é o que a pessoa digitaria no Konsole,
//!    com a mesma conta e as mesmas permissões. Confiná-lo seria fingir que o
//!    Terminus sabe melhor que o dono da máquina o que ele quis rodar — que é a
//!    frase que a ADR 0020 já tinha escrito, e agora vale por inteiro.
//! 7. ⚠️ **ESTA PORTA ENCOLHEU EM 24/08/2026** — decisão da cabeça (árvore A5, opção
//!    (a), `docs/tracker.md` §8). Saíram daqui `ler()` e `gravar()`, e do main
//!    saíram os canais `arquivo:ler` e `arquivo:gravar`. Estavam vivos e
//!    registrados desde que o produto existe, **sem nenhum chamador na tela**.
//!    ⚠️ **E o motivo que o código dava para eles era falso — medido, não suposto.**
//!    `servicos/leitura-de-arquivo.ts` justificava a leitura irrestrita pelo
//!    traceback clicável. O traceback clicável **está vivo e ligado**, e nunca
//!    passou por aqui: ele vai por `neovim:abrir`, que abre o arquivo no Neovim
//!    com o cursor na linha (`interface/nucleo-da-casca.ts:64` e `:80`). Ou seja,
//!    o canal que lia **qualquer arquivo do disco** era justificado por um recurso
//!    que ele não servia. Pelo item 3 acima, cada item desta porta é decisão de
//!    segurança — e um item sem uso e sem razão verdadeira é alcance que só um
//!    renderer comprometido aproveita. **Não foi faxina, e não foi feature
//!    abandonada: foi um item que nunca teve dono.** Se um dia a tela precisar ler
//!    ou gravar arquivo direto, isto volta como decisão nova, com a razão escrita
//!    antes. Os canais de ESCRITA CONFINADA (`arquivo:criar`, `pasta:criar`,
//!    `caminho:renomear`) não foram tocados: 38 canais viraram 36, e só estes dois.
const api = {
  escolherProjeto: (): Promise<Resultado<ProjetoAberto | null>> =>
    ipcRenderer.invoke("projeto:escolher"),
  abrirProjeto: (raiz: string): Promise<Resultado<ProjetoAberto>> =>
    ipcRenderer.invoke("projeto:abrir", raiz),
  /** Abre uma pasta já conhecida (um recente), sem passar pelo diálogo. */
  entrarNaPasta: (raiz: string): Promise<Resultado<ProjetoAberto>> =>
    ipcRenderer.invoke("projeto:entrar", raiz),
  /** Larga a pasta aberta: o main volta ao estado de não ter nenhuma.
   *  Sem isto, "Fechar pasta" era só da tela — a pasta seguia gravável e seguia
   *  "protegida" contra exclusão depois de fechada (árvore A7, consertada em 24/08). */
  fecharPasta: (): Promise<Resultado<void>> => ipcRenderer.invoke("projeto:fechar"),
  /** Pastas de corrida já abertas, da mais recente para a mais antiga. */
  pastasRecentes: (): Promise<Resultado<string[]>> => ipcRenderer.invoke("projeto:recentes"),
  esquecerPasta: (raiz: string): Promise<Resultado<string[]>> =>
    ipcRenderer.invoke("projeto:esquecer", raiz),
  /** Pasta da linha de comando ou, na falta dela, a última que ficou aberta. */
  projetoInicial: (): Promise<Resultado<ProjetoAberto | null>> =>
    ipcRenderer.invoke("projeto:inicial"),
  /** Botão de fluxo (ADR 0027): cria a pasta do molde e já a deixa aberta.
   *  `null` quando a pessoa cancelou o diálogo de onde criar. */
  novoProjeto: (fluxo: Fluxo): Promise<Resultado<ProjetoNovo | null>> =>
    ipcRenderer.invoke("projeto:novo", fluxo),
  /** Botão Rodar (ADR 0030): a linha que roda esta pasta, ou a frase do que
   *  falta. NÃO executa — quem executa é a linha de comando de sempre. */
  comoRodar: (raiz: string, fluxo: Fluxo): Promise<Resultado<ComoRodar>> =>
    ipcRenderer.invoke("projeto:como-rodar", raiz, fluxo),
  listar: (dir: string): Promise<Resultado<NoArquivo[]>> => ipcRenderer.invoke("projeto:listar", dir),
  /** Todos os arquivos do projeto, em caminho relativo — alimenta o Ctrl+P. */
  arquivosDoProjeto: (raiz: string): Promise<Resultado<string[]>> =>
    ipcRenderer.invoke("projeto:arquivos", raiz),

  criarArquivo: (raiz: string, dir: string, nome: string): Promise<Resultado<string>> =>
    ipcRenderer.invoke("arquivo:criar", raiz, dir, nome),
  criarPasta: (raiz: string, dir: string, nome: string): Promise<Resultado<string>> =>
    ipcRenderer.invoke("pasta:criar", raiz, dir, nome),
  renomear: (raiz: string, antigo: string, nome: string): Promise<Resultado<string>> =>
    ipcRenderer.invoke("caminho:renomear", raiz, antigo, nome),
  /** `false` quando o usuário cancelou a confirmação. */
  excluir: (alvo: string): Promise<Resultado<boolean>> =>
    ipcRenderer.invoke("caminho:excluir", alvo),

  /** Wallpaper e tema (ADR 0010). A imagem chega em `data:` URL. */
  aparencia: {
    estado: (): Promise<Resultado<EstadoAparencia>> => ipcRenderer.invoke("aparencia:estado"),
    definir: (parcial: Partial<EstadoAparencia>): Promise<Resultado<EstadoAparencia>> =>
      ipcRenderer.invoke("aparencia:definir", parcial),
    escolher: (): Promise<Resultado<EstadoAparencia | null>> =>
      ipcRenderer.invoke("aparencia:escolher"),
    tirar: (): Promise<Resultado<EstadoAparencia>> => ipcRenderer.invoke("aparencia:tirar"),
  },

  /** As extensões que a pessoa já usa no VSCode. Leitura de UMA pasta conhecida
   *  (`~/.vscode/extensions`), sem rede e sem escrita — o painel não instala nada. */
  extensoes: {
    listar: (): Promise<Resultado<ExtensaoDoVscode[]>> => ipcRenderer.invoke("extensoes:listar"),
  },

  /** A tela de abertura do Neovim da pessoa, lida do `dashboard.lua` dela: o logotipo,
   *  as cores daquela tela e a ficha da máquina. Leitura, sem rede e sem escrita. */
  telaDeAbertura: (): Promise<Resultado<AberturaDoNvim>> => ipcRenderer.invoke("abertura:tela"),

  /** Ler para o editor e gravar do editor — os dois canais que o Monaco exige.
   *
   *  `ler` devolve TEXTO, não bytes: o serviço recusa binário, recusa o
   *  `config.json` do Terminus e recusa caminho vazio ou com `\0`. `gravar`
   *  passa pelo mesmo `confinado()` dos outros modos de escrita — sem pasta
   *  aberta, nada é gravável, e isso é de propósito. */
  lerArquivo: (arquivo: string): Promise<Resultado<string>> =>
    ipcRenderer.invoke("arquivo:ler", arquivo),
  gravarArquivo: (arquivo: string, conteudo: string): Promise<Resultado<void>> =>
    ipcRenderer.invoke("arquivo:gravar", arquivo, conteudo),

  /**
   * Os servidores de linguagem (ramo B1 da planta de 26/08).
   *
   * É o que dá a Python e a C# o que TypeScript e JSON já tinham de graça:
   * diagnóstico na linha, completar que conhece o projeto, ir-para-definição.
   *
   * ⚠️ Esta superfície transporta **mensagem crua do protocolo**, e é o item mais
   * largo desta porta. A razão de ele existir assim: a tradução LSP↔editor é do
   * `monaco-languageclient`, que roda na TELA; quem não pode rodar na tela é o
   * `child_process`, que abre o servidor. Estreitar aqui significaria reimplementar
   * o protocolo dos dois lados — e aí a porta ficaria estreita e o produto, errado.
   * O que a mensagem alcança continua limitado ao que o servidor faz: ele lê a
   * pasta do projeto, e nada mais.
   */
  lsp: {
    iniciar: (linguagem: string, raiz: string): Promise<Resultado<EstadoServidor>> =>
      ipcRenderer.invoke("lsp:iniciar", linguagem, raiz),
    estado: (linguagem: string): Promise<Resultado<EstadoServidor>> =>
      ipcRenderer.invoke("lsp:estado", linguagem),
    /** Diz ao servidor qual é o projeto. Só o Roslyn precisa — os outros descobrem
     *  pela raiz que já vai no `initialize`. Devolve a frase do que foi feito, ou
     *  `null` quando aquela linguagem não pede nada. */
    abrirProjeto: (linguagem: string, raiz: string): Promise<Resultado<string | null>> =>
      ipcRenderer.invoke("lsp:abrir-projeto", linguagem, raiz),
    enviar: (linguagem: string, mensagem: unknown): void =>
      ipcRenderer.send("lsp:enviar", linguagem, mensagem),
    /** As mensagens que o servidor manda por conta própria. Devolve como cancelar. */
    aoReceber: (ouvinte: (linguagem: string, mensagem: unknown) => void): (() => void) => {
      const wrap = (_: unknown, linguagem: string, mensagem: unknown): void =>
        ouvinte(linguagem, mensagem);
      ipcRenderer.on("lsp:mensagem", wrap);
      return () => ipcRenderer.off("lsp:mensagem", wrap);
    },
  },

  /**
   * A sugestão inline (planta de 26/08): o Copilot por LSP, no processo principal.
   *
   * ⚠️ **É o único item desta porta que sai da máquina.** O trecho aberto viaja
   * para a GitHub a cada pausa de digitação, e é por isso que ele tem entrada
   * própria em vez de se esconder dentro de outra: quem lê esta lista tem de
   * ver, numa olhada, o que atravessa a fronteira.
   *
   * A tela não fala com a rede — o CSP da página é `default-src 'self'`, e não
   * é para deixar de ser. Quem sai daqui é o `main`.
   */
  copilot: {
    sugerir: (pedido: {
      caminho: string;
      linguagem: string;
      texto: string;
      linha: number;
      coluna: number;
      /** `true` quando a pessoa PEDIU a sugestão, em vez de ela vir digitando.
       *  Só o pedido explícito devolve alternativas para ciclar. */
      invocado?: boolean;
    }): Promise<Resultado<SugestaoInline[]>> => ipcRenderer.invoke("copilot:sugerir", pedido),
    /** As MESMAS edições que o editor acabou de aplicar, em delta. É delas que o NES vive:
     *  sem histórico de edição o servidor recusa com `activeDocumentHasNoEdits`. */
    editou: (pedido: {
      caminho: string;
      mudancas: {
        range: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
        rangeLength: number;
        text: string;
      }[];
    }): void => ipcRenderer.send("copilot:editou", pedido),
    /** A **edição seguinte** (NES): onde vai a próxima mudança. Os `problemas` são os erros
     *  que o servidor de linguagem apontou — é por eles que vem a CORREÇÃO. */
    edicaoSeguinte: (pedido: {
      caminho: string;
      linguagem: string;
      texto: string;
      linha: number;
      coluna: number;
      problemas: {
        severidade: "error" | "warning";
        mensagem: string;
        inicio: { linha: number; coluna: number };
        fim: { linha: number; coluna: number };
      }[];
    }): Promise<Resultado<EdicaoSeguinte[]>> =>
      ipcRenderer.invoke("copilot:edicao-seguinte", pedido),
    /** Como o Copilot está. `pronto: false` é estado comum, não erro. */
    estado: (): Promise<Resultado<EstadoCopilot>> => ipcRenderer.invoke("copilot:estado"),
    /** Devolve ao Copilot o que ele pediu no `command` da sugestão aceita. */
    aceitou: (comando: { command: string; arguments?: unknown[] }): void =>
      ipcRenderer.send("copilot:aceitou", comando),
    /** Uma aba abriu: o Copilot passa a conhecer este arquivo como CONTEXTO dos
     *  outros, sem que ninguém peça sugestão nele. É o que a documentação do
     *  VSCode chama de "related files open" — e sem isto, ter arquivos abertos
     *  não ajudava nada aqui, porque o servidor não sabia que existiam. */
    acompanhar: (pedido: { caminho: string; linguagem: string; texto: string }): void =>
      ipcRenderer.send("copilot:acompanhar", pedido),
    /** A aba fechou: o servidor não precisa mais deste documento. */
    fechou: (caminho: string): void => ipcRenderer.send("copilot:fechou", caminho),
  },

  /**
   * O terminal da casca (19/08): um shell de verdade, num pseudo-terminal.
   *
   * Era simétrico ao `neovim` que morava acima — as duas telas do mesmo
   * desenho: teclado sobe, ANSI desce, e esta porta não interpreta nada do que
   * passa. Quem interpreta é o bash, do outro lado.
   */
  shell: {
    iniciar: (cwd: string, cols: number, rows: number): void =>
      ipcRenderer.send("shell:iniciar", cwd, cols, rows),
    enviar: (dados: string): void => ipcRenderer.send("shell:enviar", dados),
    redimensionar: (cols: number, rows: number): void =>
      ipcRenderer.send("shell:redimensionar", cols, rows),
    /** A pasta em que o shell está AGORA, lida do sistema. */
    //? CANAL DORMENTE (A6, 24/08/2026): **nenhum código do renderer chama isto** —
    //?   mesma busca larga da `neovim:parar`. E, como lá, a peça está viva: quem usa
    //?   `pastaDoShell` é o próprio main, dentro de `abrirNoKonsole`, para saber onde
    //?   abrir o Konsole de verdade. FICA e fica REGISTRADO (cabeça, 24/08). Enquanto
    //?   fica, entrega a pasta corrente do shell a qualquer código do renderer.
    //?   Árvore no tracker §8, A6.
    pasta: (): Promise<Resultado<string>> => ipcRenderer.invoke("shell:pasta"),
    /**
     * Escreve uma linha no terminal, como se a pessoa a tivesse digitado.
     *
     * Os dois chamadores são botões da tela: o **Rodar** (ADR 0030) e o **`cd`
     * de quando se abre outra pasta**. `false` quer dizer que havia programa na
     * frente e a linha NÃO foi escrita — sem isso o texto entraria dentro do
     * programa que está rodando, que pode ser um `sudo` esperando senha.
     */
    linha: (texto: string): Promise<Resultado<boolean>> =>
      ipcRenderer.invoke("shell:linha", texto),
    /** O mesmo, para a pasta: o caminho é protegido no lado do sistema. */
    irPara: (pasta: string): Promise<Resultado<boolean>> =>
      ipcRenderer.invoke("shell:ir-para", pasta),
    /**
     * O botão ↗: abre o **Konsole de verdade**, na pasta em que este shell está.
     *
     * Substitui a segunda janela do Electron da ADR 0031. O pedido do autor era
     * "trocar o terminal do Terminus pelo Konsole"; embutir o Konsole nesta
     * janela não é possível (KPart é Qt, a sessão é Wayland, e não há XEmbed —
     * medido em `motor-do-shell-pty.ts`). Então o Konsole entra inteiro, como
     * janela do sistema, e quem fica embutido é um terminal equivalente.
     */
    emKonsole: (): Promise<Resultado<string>> => ipcRenderer.invoke("shell:konsole"),
    /** Bytes crus do shell rumo ao xterm. Devolve como cancelar a assinatura. */
    aoSaida: (ouvinte: (dados: string) => void): (() => void) => {
      const wrap = (_: unknown, dados: string): void => ouvinte(dados);
      ipcRenderer.on("shell:saida", wrap);
      return () => ipcRenderer.off("shell:saida", wrap);
    },
    aoEncerrar: (ouvinte: (codigo: number) => void): (() => void) => {
      const wrap = (_: unknown, codigo: number): void => ouvinte(codigo);
      ipcRenderer.on("shell:encerrou", wrap);
      return () => ipcRenderer.off("shell:encerrou", wrap);
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
