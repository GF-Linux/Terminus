//* Diz se a lixeira do sistema alcanca um caminho.

import { statSync } from "node:fs";

//* Compara o dispositivo do alvo com o do disco de casa.
//! POR QUE ISTO EXISTE: o `shell.trashItem` do Electron MENTE. Fora do disco de
//!   casa ele apaga de vez e devolve sucesso — e a tela prometia recuperacao
//!   para um arquivo que ja tinha ido embora. Numa pasta de corrida pode haver
//!   arquivo que nao se refaz.
//! `casa` chega por parametro em vez de ser lido aqui: quem sabe onde e a casa
//!   e o Electron, e esta peca nao precisa conhece-lo para responder.
export function aLixeiraAlcanca(alvo: string, casa: string): boolean {
  try {
    return statSync(alvo).dev === statSync(casa).dev;
  } catch {
    return false;
  }
}
