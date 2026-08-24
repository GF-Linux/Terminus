//* O caso de uso de LER: abrir o projeto, listar, e entregar texto ao editor.

import * as path from "node:path";
import type { NoArquivo, ProjetoAberto } from "../../compartilhado/tipos.js";
import { resolverParaLeitura } from "../infra/resolucao-de-caminho.js";
import {
  abrirProjeto,
  ehTexto,
  lerArquivo,
  listar,
  listarTudo,
} from "../infra/arquivos-do-projeto.js";
import { PASTA_CONFIG } from "../motores/configuracao-salva.js";

//* Abre a pasta e devolve a arvore dela.
//! Tambem serve de "atualizar" para a arvore, e e chamado a cada criacao de
//!   arquivo — por isso ele NAO liga nada: religar o servidor aqui reindexaria o
//!   projeto inteiro a cada toque.
export function abrirParaTela(raiz: string): Promise<ProjetoAberto> {
  return abrirProjeto(raiz);
}

//* Lista uma pasta.
export function listarPasta(dir: string): Promise<NoArquivo[]> {
  return listar(dir);
}

//* Lista o projeto inteiro, para a busca por nome.
export function listarProjeto(raiz: string): Promise<string[]> {
  return listarTudo(raiz);
}

//* Entrega o conteudo de um arquivo ao editor, com as duas recusas que valem.
//! LER NAO E CONFINADO A PASTA ABERTA, e e de proposito: o traceback clicavel
//!   abre o quadro dentro da biblioteca, e o `F12` vai a definicao la tambem.
//!   Fechar aqui quebraria o salto do traceback.
//! O que se protege e o unico segredo que existe: o `config.json` do Terminus.
export function lerParaEditor(arquivo: unknown): Promise<string> {
  if (typeof arquivo !== "string" || arquivo.length === 0 || arquivo.includes("\0")) {
    throw new Error("O arquivo não é válido.");
  }
  const alvo = resolverParaLeitura(arquivo);
  if (alvo === path.resolve(path.join(PASTA_CONFIG, "config.json"))) {
    throw new Error("config.json é a configuração do Terminus — não abre no editor.");
  }
  if (!ehTexto(alvo)) {
    throw new Error(`${path.basename(alvo)} não é arquivo de texto — o Terminus não sabe abrir.`);
  }
  return lerArquivo(alvo);
}
