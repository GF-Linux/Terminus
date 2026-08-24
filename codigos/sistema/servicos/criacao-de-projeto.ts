//* O caso de uso de criar projeto novo: escolher onde, moldar a pasta, entrar nela.

import type { BrowserWindow } from "electron";
import { homedir } from "node:os";
import * as path from "node:path";
import type { Fluxo, ProjetoAberto } from "../../compartilhado/tipos.js";
import { criarProjeto, NOME_DO_FLUXO } from "../infra/molde-de-projeto.js";
import { escolherOndeSalvar } from "../janela/dialogos-do-sistema.js";
import { ultimaPasta } from "../motores/configuracao-salva.js";
import { entrarNaPasta } from "./abertura-de-projeto.js";

export interface ProjetoNovo {
  projeto: ProjetoAberto;
  principal: string;
  fluxo: Fluxo;
}

//* O botao de fluxo (ADR 0027): escolher a linguagem e dizer onde, e a pasta
//* nasce pronta com o arquivo principal aberto.
//! `showSaveDialog` e nao `showOpenDialog`: o dialogo de salvar ja pergunta ONDE
//!   e COM QUE NOME de uma vez, que sao as duas coisas que faltam. Com o de
//!   abrir seria escolher a pasta-mae numa tela e digitar o nome em outra.
export async function escolherECriar(
  janela: BrowserWindow,
  fluxo: Fluxo,
): Promise<ProjetoNovo | null> {
  const onde = await escolherOndeSalvar(
    janela,
    `Novo projeto ${NOME_DO_FLUXO[fluxo]}`,
    "Criar aqui",
    path.join(ultimaPasta() ?? homedir(), `projeto-${fluxo}`),
  );
  if (!onde) return null;

  const principal = await criarProjeto(onde, fluxo);
  const projeto = await entrarNaPasta(onde);
  return { projeto, principal, fluxo };
}
