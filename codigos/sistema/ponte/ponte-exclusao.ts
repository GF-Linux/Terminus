//* O canal de excluir — sozinho, porque é o único que apaga.

import { app, ipcMain, type BrowserWindow } from "electron";
import { excluirCaminho } from "../servicos/exclusao-de-caminho.js";
import { exigirJanela } from "./janela-exigida.js";
import { respostaSegura as seguro } from "./resposta-segura.js";

//* Liga o canal de exclusão.
//! REGISTRADOR PRÓPRIO PARA UM CANAL SÓ, e é de propósito: excluir é a única
//!   operação irreversível do Terminus. Misturado com criar e renomear, ele
//!   herdaria a vizinhança de coisas banais — e é justamente o que não se quer
//!   ao procurar, depois, quem apagou o quê.
//! `app.getPath("home")` chega ao serviço por parâmetro: quem sabe onde é a casa
//!   é o Electron, e o serviço não precisa conhecê-lo para decidir.
export function registrarExclusao(janelaViva: () => BrowserWindow | null): void {
  ipcMain.handle(
    "caminho:excluir",
    seguro((_e, alvo: string) =>
      excluirCaminho(alvo, exigirJanela(janelaViva), app.getPath("home")),
    ),
  );
}
