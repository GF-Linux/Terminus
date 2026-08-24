//* Os seis canais de projeto: escolher, entrar, recentes, esquecer, inicial, novo.

import { ipcMain, type BrowserWindow } from "electron";
import { ehFluxoConhecido } from "../../dominio/fluxo-conhecido.js";
import {
  abrirPastaInicial,
  entrarNaPasta,
  escolherPastaEEntrar,
  esquecerRecente,
  listarRecentes,
} from "../servicos/abertura-de-projeto.js";
import { escolherECriar } from "../servicos/criacao-de-projeto.js";
import { exigirJanela } from "./janela-exigida.js";
import { respostaSegura as seguro } from "./resposta-segura.js";

//* Liga os canais de projeto. A janela chega injetada (ramo A1).
export function registrarProjeto(janelaViva: () => BrowserWindow | null): void {
  ipcMain.handle("projeto:escolher", seguro(() => escolherPastaEEntrar(exigirJanela(janelaViva))));

  //! `projeto:entrar` abre um recente sem passar pelo diálogo.
  ipcMain.handle("projeto:entrar", seguro((_e, raiz: string) => entrarNaPasta(raiz)));
  ipcMain.handle("projeto:recentes", seguro(() => listarRecentes()));
  ipcMain.handle("projeto:esquecer", seguro((_e, raiz: string) => esquecerRecente(raiz)));
  ipcMain.handle("projeto:inicial", seguro(() => abrirPastaInicial()));

  /**
   * O botão de fluxo (ADR 0027): escolher a linguagem e dizer onde, e a pasta
   * nasce pronta com o arquivo principal aberto.
   */
  ipcMain.handle(
    "projeto:novo",
    seguro((_e, fluxo: unknown) => {
      if (!ehFluxoConhecido(fluxo)) throw new Error("Fluxo desconhecido.");
      return escolherECriar(exigirJanela(janelaViva), fluxo);
    }),
  );
}
