//* O caso de uso de ESCREVER. `gravar` é confinado AQUI: realpath + guarda, contra as
//*   raízes que o dono conhece. Criar/renomear conferem nome e continência na infra
//*   (`dentroDe`), contra a raiz que o CHAMADOR enviar — herdado assim; ver A3.

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

//* Cria arquivo sob a raiz recebida — continência conferida na infra, sem realpath.
export function criarArquivoNoProjeto(raiz: string, dir: string, nome: string): Promise<string> {
  return criarArquivo(raiz, dir, nome);
}

//* Cria pasta sob a raiz recebida — continência conferida na infra, sem realpath.
export function criarPastaNoProjeto(raiz: string, dir: string, nome: string): Promise<string> {
  return criarPasta(raiz, dir, nome);
}

//* Renomeia sob a raiz recebida — continência conferida na infra, sem realpath.
export function renomearNoProjeto(raiz: string, antigo: string, nome: string): Promise<string> {
  return renomear(raiz, antigo, nome);
}
