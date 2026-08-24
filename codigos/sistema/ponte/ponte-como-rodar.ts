//* O canal do botão Rodar: que linha roda o que está nesta pasta.

import { ipcMain } from "electron";
import { ehFluxoConhecido } from "../../dominio/fluxo-conhecido.js";
import { comoRodar } from "../infra/como-rodar-o-projeto.js";
import { respostaSegura as seguro } from "./resposta-segura.js";

/**
 * O botão Rodar (ADR 0030).
 *
 * Não executa nada — devolve a linha, e quem a executa é o mesmo caminho da
 * linha de comando. Assim o que aparece na tela é exatamente o que rodou, e o
 * histórico da seta-para-cima recebe a linha como se tivesse sido digitada.
 */
export function registrarComoRodar(): void {
  ipcMain.handle(
    "projeto:como-rodar",
    seguro((_e, raiz: unknown, fluxo: unknown) => {
      if (typeof raiz !== "string" || raiz.length === 0) throw new Error("Sem pasta aberta.");
      if (!ehFluxoConhecido(fluxo)) {
        throw new Error("Marque a linguagem no botão de fluxo primeiro.");
      }
      return comoRodar(raiz, fluxo);
    }),
  );
}
