//* O caso de uso de abrir pasta: quem é a raiz aberta, e o que acontece ao entrar.

import type { BrowserWindow } from "electron";
import { app } from "electron";
import * as path from "node:path";
import type { ProjetoAberto } from "../../compartilhado/tipos.js";
import { pastaInicial } from "../../dominio/escolha-da-pasta-inicial.js";
import { pastaPedidaNaLinha } from "../infra/argumentos-da-partida.js";
import { abrirProjeto } from "../infra/arquivos-do-projeto.js";
import { escolherPasta } from "../janela/dialogos-do-sistema.js";
import { RAIZ_APP } from "../janela/janela-principal.js";
import { cdNeovim } from "../motores/controle-neovim-rpc.js";
import { esquecerPasta, pastasRecentes, registrarPasta, ultimaPasta } from "../motores/configuracao-salva.js";

//! A pasta de trabalho aberta agora. Ela tem UM dono — este módulo — e quem
//!   precisa dela pergunta. Antes era variável solta no monólito, lida pela
//!   guarda e escrita pelo caso de uso, e era isso que prendia os dois juntos.
let raizAberta: string | null = null;

//* A única pasta em que o Terminus aceita ESCREVER: a que está aberta.
export function raizesDeEscrita(): string[] {
  return raizAberta ? [path.resolve(raizAberta)] : [];
}

//* A pasta aberta agora, ou `null`.
export function pastaAberta(): string | null {
  return raizAberta;
}

//* Assume uma pasta como projeto: registra nos recentes e aponta o Neovim.
//! A ORDEM É A REGRA, e é conduta a preservar: a leitura da pasta vem PRIMEIRO.
//!   Se ela não existe mais, o erro sobe e a pasta some da lista em vez de ser
//!   registrada de novo.
//! O `cd` do Neovim falha em silêncio de propósito: abrir a pasta não pode
//!   depender de o editor estar de pé.
export async function entrarNaPasta(raiz: string): Promise<ProjetoAberto> {
  const projeto = await abrirProjeto(raiz);
  raizAberta = raiz;
  void cdNeovim(raiz).catch(() => {});
  registrarPasta(raiz);
  return projeto;
}

//* Pergunta a pasta no diálogo e entra nela. `null` se a pessoa cancelar.
export async function escolherPastaEEntrar(janela: BrowserWindow): Promise<ProjetoAberto | null> {
  const pasta = await escolherPasta(janela, "Abrir pasta da corrida");
  return pasta ? entrarNaPasta(pasta) : null;
}

//* A pasta com que o Terminus sobe: a da linha de comando, ou a lembrada.
export async function abrirPastaInicial(): Promise<ProjetoAberto | null> {
  const pasta = pastaInicial(pastaPedidaNaLinha(RAIZ_APP, app.isPackaged), ultimaPasta() ?? null);
  return pasta ? entrarNaPasta(pasta) : null;
}

//* A lista de pastas recentes.
export function listarRecentes(): ReturnType<typeof pastasRecentes> {
  return pastasRecentes();
}

//* Tira uma pasta dos recentes e devolve a lista já sem ela.
export function esquecerRecente(raiz: string): ReturnType<typeof pastasRecentes> {
  esquecerPasta(raiz);
  return pastasRecentes();
}
