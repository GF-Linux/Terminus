//* A partida do Terminus: registra as pontes, liga os kits e abre a janela.

import { app, BrowserWindow } from "electron";
import { ligarKits } from "../infra/kits-embutidos.js";
import { limparHistoricoAntigo } from "../motores/configuracao-salva.js";
import { pararShell } from "../motores/motor-do-shell-pty.js";
import { pararCopilot } from "../motores/motor-copilot-lsp.js";
import { registrarPonte } from "../ponte/registra-tudo.js";
import { criarJanela, RAIZ_APP } from "./janela-principal.js";
import { janelaViva } from "./janela-viva.js";

void app.whenReady().then(() => {
  //! A janela chega ao registrador INJETADA, não importada (ramo A1). É o que
  //!   permite ao registrador ser lido — e testado — sem conhecer o Electron.
  registrarPonte(janelaViva);

  //! O histórico da linha de comando mudou de dono (19/08): quem guarda agora é
  //!   o bash. O que já estava no `config.json` é apagado na primeira abertura —
  //!   comando é dado sensível, e dado sensível esquecido num campo que ninguém
  //!   mais lê é o pior dos dois mundos.
  const antigos = limparHistoricoAntigo();
  if (antigos > 0) console.log(`histórico antigo da linha de comando apagado (${antigos} linhas)`);

  //! As funções embutidas ficam disponíveis no editor antes de a janela abrir
  //!   (ADR 0036). Falhar aqui NÃO impede o Terminus de subir: sem os kits ele
  //!   continua sendo um editor inteiro, e travar a abertura por causa de um
  //!   atalho de escrita seria trocar o essencial pelo acessório.
  void ligarKits(RAIZ_APP).then((r) => {
    if (r.erro) console.error("kits embutidos:", r.erro);
    for (const nome of r.respeitados) {
      console.warn(`kit não instalado, já existe arquivo seu em ${nome}`);
    }
  });

  criarJanela();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on("window-all-closed", () => {
  pararShell();
  pararCopilot();
  if (process.platform !== "darwin") app.quit();
});
