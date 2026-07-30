import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { EventoExecucao, Resultado } from "../shared/tipos.js";
import { detectarVersoes } from "./ambiente.js";
import { carregarCatalogo } from "./catalogo.js";
import { estaRodando, pararScript, rodarScript } from "./execucao.js";
import {
  abrirProjeto,
  criarArquivo,
  criarPasta,
  ehTexto,
  gravarArquivo,
  lerArquivo,
  listar,
  renomear,
} from "./projeto.js";

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));

/** Raiz do repositório/pacote — onde vivem data/ e tools/. Em `out/main/` o
 *  caminho sobe dois níveis; empacotado, sobe a partir de resources. */
const RAIZ_APP = app.isPackaged
  ? process.resourcesPath
  : path.resolve(__dirname_, "..", "..");

let janela: BrowserWindow | null = null;

/**
 * Pasta passada na linha de comando: `bancada ~/corridas/18S`.
 *
 * Em desenvolvimento o Electron recebe o script como primeiro argumento, então o
 * candidato é o segundo; empacotado, é o primeiro. Só vale se for pasta que
 * existe — argumento inválido não deve impedir a janela de abrir.
 */
function pastaDaLinhaDeComando(): string | null {
  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  for (const a of args) {
    if (a.startsWith("-")) continue;
    const alvo = path.resolve(a);
    try {
      if (statSync(alvo).isDirectory()) return alvo;
    } catch {
      /* não é caminho válido; segue */
    }
  }
  return null;
}

function criarJanela(): void {
  janela = new BrowserWindow({
    width: 1340,
    height: 820,
    minWidth: 1000,
    minHeight: 620,
    show: false,
    // Casca própria: a barra de título é desenhada pela Bancada (ADR 0003).
    frame: false,
    // #141414 é o fundo da casca no Cursor Dark — evita o flash branco antes
    // do primeiro quadro.
    backgroundColor: "#141414",
    webPreferences: {
      // .mjs, não .js: o electron-vite emite o preload como ESM, e o Electron só
      // aceita preload ESM pela extensão do arquivo (e com sandbox desligado).
      preload: path.join(__dirname_, "..", "preload", "index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  janela.once("ready-to-show", () => janela?.show());

  // Nenhum link abre dentro da janela do aplicativo: documentação vai para o
  // navegador do sistema.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const avisarEstado = (): void => {
    janela?.webContents.send("janela:estado", janela.isMaximized());
  };
  janela.on("maximize", avisarEstado);
  janela.on("unmaximize", avisarEstado);

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void janela.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void janela.loadFile(path.join(__dirname_, "..", "renderer", "index.html"));
  }
}

/** Embrulha um handler para que uma exceção vire erro exibível, não uma
 *  promessa rejeitada silenciosa do outro lado da ponte. */
function seguro<A extends unknown[], T>(
  fn: (...args: A) => Promise<T> | T,
): (...args: A) => Promise<Resultado<T>> {
  return async (...args: A) => {
    try {
      return { ok: true, valor: await fn(...args) };
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : String(err) };
    }
  };
}

function registrarPonte(): void {
  ipcMain.handle("catalogo:carregar", seguro(() => carregarCatalogo(RAIZ_APP)));
  ipcMain.handle("ambiente:versoes", seguro(() => detectarVersoes()));

  ipcMain.handle(
    "projeto:escolher",
    seguro(async () => {
      if (!janela) throw new Error("Janela não disponível.");
      const r = await dialog.showOpenDialog(janela, {
        title: "Abrir pasta da corrida",
        properties: ["openDirectory"],
      });
      if (r.canceled || !r.filePaths[0]) return null;
      return abrirProjeto(r.filePaths[0]);
    }),
  );

  ipcMain.handle("projeto:abrir", seguro((_e, raiz: string) => abrirProjeto(raiz)));
  ipcMain.handle(
    "projeto:inicial",
    seguro(async () => {
      const pasta = pastaDaLinhaDeComando();
      return pasta ? await abrirProjeto(pasta) : null;
    }),
  );
  ipcMain.handle("projeto:listar", seguro((_e, dir: string) => listar(dir)));

  ipcMain.handle(
    "arquivo:ler",
    seguro((_e, arquivo: string) => {
      if (!ehTexto(arquivo)) {
        throw new Error(
          `${path.basename(arquivo)} não é arquivo de texto. ` +
            "Cromatograma (.ab1) ainda não tem visualizador nesta versão.",
        );
      }
      return lerArquivo(arquivo);
    }),
  );

  ipcMain.handle(
    "arquivo:gravar",
    seguro((_e, arquivo: string, conteudo: string) => gravarArquivo(arquivo, conteudo)),
  );

  ipcMain.handle(
    "arquivo:criar",
    seguro((_e, raiz: string, dir: string, nome: string) => criarArquivo(raiz, dir, nome)),
  );
  ipcMain.handle(
    "pasta:criar",
    seguro((_e, raiz: string, dir: string, nome: string) => criarPasta(raiz, dir, nome)),
  );
  ipcMain.handle(
    "caminho:renomear",
    seguro((_e, raiz: string, antigo: string, nome: string) => renomear(raiz, antigo, nome)),
  );

  ipcMain.handle(
    "caminho:excluir",
    seguro(async (_e, alvo: string) => {
      if (!janela) throw new Error("Janela não disponível.");
      const nome = path.basename(alvo);
      const r = await dialog.showMessageBox(janela, {
        type: "warning",
        buttons: ["Mover para a lixeira", "Cancelar"],
        defaultId: 1,
        cancelId: 1,
        message: `Excluir "${nome}"?`,
        detail: "Vai para a lixeira do sistema — dá para recuperar de lá.",
      });
      if (r.response !== 0) return false;
      // Lixeira, não `unlink`. Numa pasta de corrida pode haver .ab1 insubstituível;
      // apagar de vez a partir de um clique errado não é reversível.
      await shell.trashItem(alvo);
      return true;
    }),
  );

  ipcMain.handle("exec:rodando", () => estaRodando());
  ipcMain.on("exec:rodar", (e, arquivo: string) => {
    rodarScript(arquivo, (evento: EventoExecucao) => e.sender.send("exec:evento", evento));
  });
  ipcMain.on("exec:parar", () => pararScript());

  ipcMain.on("janela:minimizar", () => janela?.minimize());
  ipcMain.on("janela:alternar-maximo", () =>
    janela?.isMaximized() ? janela.unmaximize() : janela?.maximize(),
  );
  ipcMain.on("janela:fechar", () => janela?.close());
}

void app.whenReady().then(() => {
  registrarPonte();
  criarJanela();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on("window-all-closed", () => {
  pararScript();
  if (process.platform !== "darwin") app.quit();
});
