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
//? ⚠️ E NADA A DEVOLVE A `null` — achado em 24/08, árvore **A7** no tracker. Esta linha é o
//?   ÚNICO escritor no repositório, e só atribui valor não-nulo. O "Fechar pasta" da tela é
//?   só do renderer (`arvore-de-arquivos.ts:424`): não há canal que avise o main. Então,
//?   depois de fechar, esta pasta segue gravável e segue "protegida" contra exclusão — com
//?   a recusa dizendo que ela é a pasta ABERTA, que é frase falsa. Registrado, não consertado:
//?   consertar muda conduta e mexe na contagem de canais, e isso é da cabeça (§12·3a).
let raizAberta: string | null = null;

//* A única pasta em que o Terminus aceita ESCREVER: a que está aberta.
//? ⚠️ `path.resolve` E NÃO `realpath` — achado e medido em 24/08, árvore **A9** no tracker.
//?   `confinado()` resolve o ALVO com realpath; esta raiz vem sem. Numa pasta aberta por
//?   ATALHO os dois lados falam de lugares diferentes, e toda escrita dentro dela é recusada
//?   com "está fora da pasta aberta" — frase que contradiz o que a tela mostra. Medido em
//?   fixture: abrir `…/atalho` (link para `…/real`) e gravar dentro → RECUSOU.
//?   Registrado, não consertado: resolver aqui muda o caminho que a tela exibe, e isso é
//?   decisão de interface, da cabeça (§12·3a).
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
