//? ESCRITA CONFINADA — Decisão sobre quem diz onde se pode escrever 24/08/2026
//!
//! 1. Os QUATRO caminhos de escrita — gravar, criar arquivo, criar pasta, renomear —
//!    passam pelo MESMO confinamento: `confinado()`, que peneira o texto, desfaz o link
//!    e confere contra as raízes que o DONO conhece.
//! 2. Até 24/08 só `gravar` fazia isso. `criar` e `renomear` conferiam continência por
//!    comparação de TEXTO, na infra, contra a raiz que o CHAMADOR enviava — e o chamador
//!    é o renderer. Um renderer comprometido mandava uma raiz arbitrária e escrevia fora
//!    da pasta aberta; e um atalho dentro da pasta não era desfeito.
//! 3. A raiz do renderer deixou de ser usada. Os três serviços agora derivam a raiz de
//!    `raizesDeEscrita()`, que é do lado do main. A ponte continua RECEBENDO a raiz pelo
//!    IPC (a interface não mudou) e a IGNORA — está escrito lá, no parâmetro.
//! 4. ⚠️ O QUE ISTO ALARGA, e está declarado em vez de escondido: a pasta aberta por
//!    ATALHO já recusava `gravar` (árvore **A9**) e passa a recusar `criar`/`renomear`
//!    também. É a mesma limitação, agora nos quatro caminhos — o preço de uniformizar
//!    antes de consertar a A9.

import * as path from "node:path";
import { dentroDaRaiz } from "../../dominio/guarda-de-caminho.js";
import { recusarEntrada } from "../../dominio/entrada-recusada.js";
import { criarArquivo, criarPasta, gravarArquivo, renomear } from "../infra/arquivos-do-projeto.js";
import { resolverReal } from "../infra/resolucao-de-caminho.js";
import { raizesDeEscrita } from "./abertura-de-projeto.js";

//* Resolve um caminho e exige que ele caia dentro das raizes permitidas.
//! AS TRES ETAPAS moram em tres lugares agora, e a ordem entre elas E a regra:
//!   1. `dominio/entrada-recusada` peneira o texto ANTES de resolver — depois de
//!      resolver, `-c` ja virou um caminho dentro da raiz e passaria;
//!   2. `infra/resolucao-de-caminho` desfaz o link simbolico, senao um atalho no
//!      projeto apontando para `~/.bashrc` passaria na comparacao de nome;
//!   3. `dominio/guarda-de-caminho` decide, sobre o caminho ja real.
//! So a etapa 2 toca o disco — e e por isso que so ela ficou em `sistema/`.
export function confinado(alvo: unknown, raizes: string[], oQue = "caminho"): string {
  const texto = recusarEntrada(alvo, oQue);
  const real = resolverReal(texto);
  if (dentroDaRaiz(real, raizes)) return real;
  throw new Error(
    `"${path.basename(path.resolve(texto))}" está fora da pasta aberta — o Terminus não mexe em arquivo de fora.`,
  );
}

//* Grava um arquivo, exigindo que ele esteja dentro da pasta aberta.
export function gravarConfinado(arquivo: unknown, conteudo: unknown): Promise<void> {
  if (typeof conteudo !== "string") throw new Error("Conteúdo inválido.");
  return gravarArquivo(confinado(arquivo, raizesDeEscrita(), "arquivo"), conteudo);
}

//! `dir` e `antigo` chegam como `unknown` pelo mesmo motivo que em `gravarConfinado`: a
//!   carga do IPC chega crua, e quem peneira é `confinado()`. Tipá-los `string` seria
//!   afirmar sobre o que o renderer manda uma coisa que ninguém conferiu.
//! A infra confere continência DE NOVO, e é defesa em profundidade de propósito (§7·D5) —
//!   mas agora sobre o caminho já REAL e contra a raiz do DONO, que é a mesma que
//!   `confinado()` acabou de usar. Duas guardas que discordam são piores que uma.
//! `raizes[0]` sem conferir vazio não é descuido: `confinado()` acima estoura quando a
//!   lista está vazia — sem pasta aberta, NADA passa. E a lista tem no máximo um item,
//!   travado pelo teste "a pasta aberta é a ÚNICA raiz de escrita".

//* Cria arquivo dentro da pasta aberta — raiz do DONO, com realpath.
export function criarArquivoNoProjeto(dir: unknown, nome: string): Promise<string> {
  const raizes = raizesDeEscrita();
  return criarArquivo(raizes[0], confinado(dir, raizes, "pasta"), nome);
}

//* Cria pasta dentro da pasta aberta — raiz do DONO, com realpath.
export function criarPastaNoProjeto(dir: unknown, nome: string): Promise<string> {
  const raizes = raizesDeEscrita();
  return criarPasta(raizes[0], confinado(dir, raizes, "pasta"), nome);
}

//* Renomeia dentro da pasta aberta — raiz do DONO, com realpath.
export function renomearNoProjeto(antigo: unknown, nome: string): Promise<string> {
  const raizes = raizesDeEscrita();
  return renomear(raizes[0], confinado(antigo, raizes, "caminho"), nome);
}
