//* Os sete canais de projeto: escolher, entrar, fechar, recentes, esquecer, inicial, novo.

import { ipcMain, type BrowserWindow } from "electron";
import { ehFluxoConhecido } from "../../dominio/fluxo-conhecido.js";
import {
  abrirPastaInicial,
  entrarNaPasta,
  escolherPastaEEntrar,
  esquecerRecente,
  fecharPasta,
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
  //! `projeto:fechar` é o conserto da **A7** (24/08/2026, opção (a) da árvore, decidida pela
  //!   cabeça). Até ele existir, "Fechar pasta" era só do renderer e o main nunca ficava
  //!   sabendo: a pasta seguia gravável pelos quatro canais de escrita e seguia "protegida"
  //!   contra exclusão, com a recusa afirmando que ela estava ABERTA.
  //! ⚠️ É ELE QUE LEVA A CONTAGEM DE CANAIS DE 37 A 38 — número re-declarado com a causa
  //!   ANTES de o canal existir (tracker §13.8), porque 37 era prova de conduta preservada.
  ipcMain.handle("projeto:fechar", seguro(() => fecharPasta()));
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
