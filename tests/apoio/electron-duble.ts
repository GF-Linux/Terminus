//? DUBLE DO ELECTRON — Decisão sobre como a rede de `servicos/` roda sem Electron 24/08/2026
//!
//! 1. O PROBLEMA, medido antes de escolher a solução: `import { app } from "electron"`
//!    devolve `SyntaxError: Named export 'app' not found`. O pacote `electron` é CJS e
//!    resolve para uma STRING com o caminho do binário. Todo módulo no fecho de
//!    `servicos/` morre no LINK, antes de rodar uma linha.
//! 2. `servicos/` é a camada de CASO DE USO (§1.3): ela existe para "chamar infra+motor+
//!    persistência na ordem certa". O que a rede precisa travar é a ORDEM e a DECISÃO —
//!    não o comportamento do `dialog` do sistema. Por isso o duble é honesto aqui: ele
//!    substitui o mundo de fora, que é justamente o que o caso de uso orquestra.
//! 3. `chamadas` é o instrumento que torna a ORDEM observável. `entrarNaPasta` promete,
//!    no comentário dela, que "a leitura da pasta vem PRIMEIRO" — sem registro de ordem,
//!    essa promessa não é conferível.
//! 4. AS SEIS PORTAS SÃO AS DO PROCESSO PRINCIPAL, e a ausência das outras é deliberada:
//!    `contextBridge` e `ipcRenderer` (o preload) NÃO estão aqui. Um teste que carregar
//!    o preload tem de quebrar alto, e não rodar contra um faz-de-conta silencioso.

/** O que o teste manda o mundo de fora responder, e o que o mundo de fora recebeu. */
export interface ControleDoDuble {
  /** A resposta de `showOpenDialog`. `null` = a pessoa cancelou. */
  pastaEscolhida: string | null;
  /** A resposta de `showSaveDialog`. `null` = a pessoa cancelou. */
  ondeSalvar: string | null;
  /** A resposta da caixa de exclusão: `0` confirma, `1` cancela (`cancelId` é 1). */
  respostaDaCaixa: number;
  /** Muda o `RAIZ_APP` de `janela-principal.ts`, que lê isto no carregamento. */
  empacotado: boolean;
  /** Tudo que o duble recebeu, na ordem em que recebeu. É a prova da ORDEM. */
  chamadas: string[];
  /** O que a janela mandou carregar por último — `null` se ninguém mandou nada.
   *  `url` é o regime de `dev` (`loadURL`); `arquivo` é o do build (`loadFile`). */
  carregado: { tipo: "url" | "arquivo"; valor: string } | null;
}

export const controle: ControleDoDuble = {
  pastaEscolhida: null,
  ondeSalvar: null,
  respostaDaCaixa: 1,
  empacotado: false,
  chamadas: [],
  carregado: null,
};

//* Devolve o duble ao estado de fábrica. Chamado no `beforeEach` de cada suíte.
//! Existe porque `node --test` isola por ARQUIVO, não por teste: dentro de um mesmo
//!   arquivo os testes dividem esta instância, e resto de um teste anterior viraria
//!   verde emprestado no seguinte.
export function reiniciarDuble(): void {
  controle.pastaEscolhida = null;
  controle.ondeSalvar = null;
  controle.respostaDaCaixa = 1;
  controle.empacotado = false;
  controle.chamadas = [];
  controle.carregado = null;
}

export const app = {
  get isPackaged(): boolean {
    return controle.empacotado;
  },
  getPath(_nome: string): string {
    return process.env["HOME"] ?? "/tmp";
  },
};

export const dialog = {
  async showOpenDialog(): Promise<{ canceled: boolean; filePaths: string[] }> {
    controle.chamadas.push("dialog.showOpenDialog");
    const p = controle.pastaEscolhida;
    return p === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [p] };
  },
  async showSaveDialog(): Promise<{ canceled: boolean; filePath?: string }> {
    controle.chamadas.push("dialog.showSaveDialog");
    const p = controle.ondeSalvar;
    return p === null ? { canceled: true } : { canceled: false, filePath: p };
  },
  async showMessageBox(): Promise<{ response: number }> {
    controle.chamadas.push("dialog.showMessageBox");
    return { response: controle.respostaDaCaixa };
  },
};

export const shell = {
  //! NÃO apaga de verdade, e é o ponto do teste: se alguém trocar os dois ramos de
  //!   `excluirCaminho`, o arquivo do ramo da lixeira SOME — e some porque virou
  //!   `rmSync`. O duble que não apaga é o que deixa essa troca aparecer.
  async trashItem(alvo: string): Promise<void> {
    controle.chamadas.push(`shell.trashItem:${alvo}`);
  },
  async openPath(): Promise<string> {
    controle.chamadas.push("shell.openPath");
    return "";
  },
  openExternal(): Promise<void> {
    controle.chamadas.push("shell.openExternal");
    return Promise.resolve();
  },
};

//! O conteúdo da tela é mudo de propósito: `ligarZoom` e `ligarAtalhosNeovim`
//!   penduram ouvintes aqui, e um duble que os DISPARASSE estaria simulando o
//!   Chromium — que é o que ninguém consegue fazer honestamente fora dele.
class ConteudoDaTela {
  on(): void {}
  send(): void {}
  setWindowOpenHandler(): void {}
  setZoomFactor(): void {}
  getZoomFactor(): number {
    return 1;
  }
}

/** A janela que RECORDA em vez de desenhar. */
//! POR QUE ELA EXISTE, e ela nasceu para UMA pergunta (24/08): qual endereço a
//!   `criarJanela()` manda carregar. Perguntar isso à função de domínio direto
//!   não serve — passaria mesmo que `janela-principal.ts` nunca a chamasse, e o
//!   defeito que a fez nascer é exatamente uma LIGAÇÃO errada, não uma conta errada.
//! ⚠️ O LIMITE, no espírito do item 4 do cabeçalho: ela não desenha, não navega e
//!   **não dispara evento nenhum**. Quem registrar `once("ready-to-show")` aqui
//!   nunca é chamado de volta. Duble rico demais deixa teste passar contra
//!   faz-de-conta — este é raso porque a pergunta dele é rasa.
export class BrowserWindow {
  readonly webContents = new ConteudoDaTela();

  constructor(_opcoes?: unknown) {
    controle.chamadas.push("new BrowserWindow");
  }

  setIcon(): void {}
  once(): void {}
  on(): void {}
  show(): void {}
  isMaximized(): boolean {
    return false;
  }

  //! `loadURL` e `loadFile` são os DOIS regimes de carga do produto, e o duble
  //!   guarda qual deles foi usado — não só o valor. Trocar um pelo outro é um
  //!   defeito possível, e um registro que só guardasse a string não o veria.
  loadURL(endereco: string): Promise<void> {
    controle.carregado = { tipo: "url", valor: endereco };
    controle.chamadas.push(`janela.loadURL:${endereco}`);
    return Promise.resolve();
  }

  loadFile(caminho: string): Promise<void> {
    controle.carregado = { tipo: "arquivo", valor: caminho };
    controle.chamadas.push(`janela.loadFile:${caminho}`);
    return Promise.resolve();
  }
}

export const nativeImage = {
  //! `isEmpty()` responde `false` porque `media/icon.png` EXISTE de verdade — é a
  //!   simulação verdadeira. E responder `true` faria a produção chamar
  //!   `console.warn`, sujando a saída que a P1 exige limpa.
  createFromPath(): { isEmpty: () => boolean } {
    return { isEmpty: (): boolean => false };
  },
};

export const ipcMain = {
  handle(): void {},
  on(): void {},
};

export default { app, dialog, shell, BrowserWindow, nativeImage, ipcMain };
