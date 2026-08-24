//* O caso de uso de EXCLUIR: protege a pasta aberta e escolhe lixeira ou apagar.

import { shell, type BrowserWindow } from "electron";
import { rmSync } from "node:fs";
import * as path from "node:path";
import { ehPastaProtegida } from "../../dominio/protecao-da-pasta-aberta.js";
import { aLixeiraAlcanca } from "../infra/alcance-da-lixeira.js";
import { perguntarExclusao } from "../janela/dialogos-do-sistema.js";
import { pastaAberta } from "./abertura-de-projeto.js";

//* Recusa apagar a pasta aberta, ou qualquer pasta acima dela.
//! A trava fica AQUI, e nao so na tela: tela pode voltar a errar, e apagar a
//!   pasta aberta leva o trabalho do dia inteiro.
function protegerPastaDeTrabalho(alvo: string): void {
  if (!ehPastaProtegida(alvo, pastaAberta())) return;
  throw new Error(
    `"${path.basename(path.resolve(alvo))}" é a pasta de trabalho aberta (ou está acima dela). ` +
      "Para tirá-la do Terminus use Fechar pasta — excluir aqui apagaria o seu trabalho.",
  );
}

//* Pergunta e exclui. Devolve `false` quando a pessoa cancela.
//! LIXEIRA, NAO `unlink`: numa pasta de corrida pode haver arquivo
//!   insubstituivel, e apagar de vez a partir de um clique errado nao e
//!   reversivel. Quando a lixeira NAO alcanca o disco, o `rmSync` entra — mas so
//!   depois de a caixa ter dito, com todas as letras, que nao tem volta.
export async function excluirCaminho(
  alvo: string,
  janela: BrowserWindow,
  casa: string,
): Promise<boolean> {
  protegerPastaDeTrabalho(alvo);
  const nome = path.basename(alvo);
  const temLixeira = aLixeiraAlcanca(alvo, casa);

  if (!(await perguntarExclusao(janela, nome, temLixeira))) return false;

  if (temLixeira) await shell.trashItem(alvo);
  else rmSync(alvo, { recursive: true, force: true });
  return true;
}
