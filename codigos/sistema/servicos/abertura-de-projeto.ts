//* O caso de uso de abrir pasta: quem é a raiz aberta, e o que acontece ao entrar.

import type { BrowserWindow } from "electron";
import { app } from "electron";
import type { ProjetoAberto } from "../../compartilhado/tipos.js";
import { pastaInicial } from "../../dominio/escolha-da-pasta-inicial.js";
import { pastaPedidaNaLinha } from "../infra/argumentos-da-partida.js";
import { abrirProjeto } from "../infra/arquivos-do-projeto.js";
import { resolverParaLeitura } from "../infra/resolucao-de-caminho.js";
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
//! ELA DEVOLVE `raizAberta` CRU, e isso é o conserto da A9, não descuido. Até 24/08 esta
//!   linha era `path.resolve(raizAberta)` — resolvia o TEXTO e deixava o link de pé —
//!   enquanto `confinado()` resolvia o ALVO com realpath. Numa pasta aberta por ATALHO os
//!   dois lados falavam de lugares diferentes, e o que estava dentro era declarado fora.
//! A resolução mudou de lugar: mora em `entrarNaPasta`, na ENTRADA, e por isso `raizAberta`
//!   já chega aqui absoluta e real. Resolver de novo aqui não consertaria nada e criaria a
//!   segunda fonte da verdade que era justamente a doença — duas guardas que discordam são
//!   piores que uma.
export function raizesDeEscrita(): string[] {
  return raizAberta ? [raizAberta] : [];
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
//! A RAIZ É RESOLVIDA AQUI, NA ENTRADA — é o conserto da A9, decidido pela cabeça em
//!   24/08/2026, opção (a) da árvore. Uma pasta aberta por ATALHO entra como o atalho e
//!   passa a valer pelo lugar REAL, então TUDO o que vem depois — a guarda de escrita, a
//!   proteção contra excluir a pasta aberta, os recentes, o `cd` do Neovim e a árvore que a
//!   tela desenha — fala do mesmo lugar. Resolver num consumidor só deixaria os outros
//!   discordando dele, que é a forma exata do defeito que isto conserta.
//! `resolverParaLeitura` E NÃO `resolverReal`: abrir pasta é LEITURA, e o irmão estoura com
//!   mensagem própria quando o destino não existe. Aqui a pasta que sumiu precisa estourar
//!   em `abrirProjeto`, com a mensagem do sistema de arquivos e DEPOIS da leitura — é a
//!   ordem travada logo abaixo, e trocar o resolvedor a quebraria em silêncio.
export async function entrarNaPasta(pedida: string): Promise<ProjetoAberto> {
  const raiz = resolverParaLeitura(pedida);
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
