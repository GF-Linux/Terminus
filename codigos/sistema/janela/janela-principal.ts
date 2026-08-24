//* Cria a janela do Terminus, sem moldura, e liga o que é dela.

import { app, BrowserWindow, nativeImage, shell } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { pararShell } from "../motores/motor-do-shell-pty.js";
import { pararNeovim } from "../motores/motor-neovim-pty.js";
import { resetarControle } from "../motores/controle-neovim-rpc.js";
import { definirJanela } from "./janela-viva.js";
import { ligarAtalhosNeovim } from "./atalhos-da-casca.js";
import { ligarZoom } from "./zoom-da-janela.js";

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));

/** Raiz do repositório/pacote — onde vivem media/ e kits/. Em `out/main/` o
 *  caminho sobe dois níveis; empacotado, sobe a partir de resources. */
//! Mora aqui porque é esta peça que carrega arquivo de dentro do pacote — o
//!   ícone e a página. A partida a reexporta para achar os kits.
export const RAIZ_APP = app.isPackaged
  ? process.resourcesPath
  : path.resolve(__dirname_, "..", "..");

//* Cria a janela, registra-a como a janela viva, e liga os atalhos dela.
export function criarJanela(): void {
  const janela = new BrowserWindow({
    width: 1340,
    height: 820,
    minWidth: 1000,
    minHeight: 620,
    show: false,
    //! O ícone da janela (e, no X11, o da barra de tarefas). PNG e não SVG: o
    //!   Electron não lê SVG aqui. Gerado da marca em `media/icon.svg` (ADR 0014).
    icon: path.join(RAIZ_APP, "media", "icon.png"),
    //! Casca própria: a barra de título é desenhada pelo Terminus (ADR 0003).
    frame: false,
    //! O fundo da casca na paleta Jared-Linux — evita o flash branco antes do
    //!   primeiro quadro.
    backgroundColor: "#14161f",
    webPreferences: {
      //! .mjs, não .js: o electron-vite emite o preload como ESM, e o Electron só
      //!   aceita preload ESM pela extensão do arquivo (e com sandbox desligado).
      preload: path.join(__dirname_, "..", "preload", "index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  definirJanela(janela);

  ligarZoom(janela);
  ligarAtalhosNeovim(janela);

  //! A opção `icon:` do construtor não bastou nesta máquina (a propriedade
  //!   _NET_WM_ICON ficava vazia). Setar explicitamente resolve, e o aviso no
  //!   console diz se o arquivo sumiu — ícone faltando é o tipo de coisa que se
  //!   descobre tarde, olhando a barra de tarefas.
  const marca = nativeImage.createFromPath(path.join(RAIZ_APP, "media", "icon.png"));
  if (marca.isEmpty()) console.warn("ícone não carregou: media/icon.png");
  else janela.setIcon(marca);

  janela.once("ready-to-show", () => janela.show());

  //! O Neovim morre com a janela que o mostrava. Sem isto ele seguiria vivo até o
  //!   `window-all-closed`, escrevendo para uma interface que já não existe.
  janela.on("closed", () => {
    definirJanela(null);
    pararNeovim();
    resetarControle();
    //! E o shell do terminal também (19/08). Ele é um painel desta janela, não
    //!   um programa separado: deixado vivo, ficaria um bash órfão escrevendo para
    //!   uma interface que já não existe. O Konsole aberto pelo botão ↗ é o
    //!   oposto — aquele é do sistema, e não morre com o Terminus.
    pararShell();
  });

  //! Nenhum link abre dentro da janela do aplicativo: documentação vai para o
  //!   navegador do sistema.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const avisarEstado = (): void => {
    janela.webContents.send("janela:estado", janela.isMaximized());
  };
  janela.on("maximize", avisarEstado);
  janela.on("unmaximize", avisarEstado);

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void janela.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void janela.loadFile(path.join(__dirname_, "..", "renderer", "interface", "pagina.html"));
  }
}
