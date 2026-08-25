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
//! LER NAO E CONFINADO A PASTA ABERTA. A justificativa escrita aqui ate 24/08/2026 era o
//!   traceback clicavel: "abre o quadro dentro da biblioteca, e o F12 vai a definicao la
//!   tambem; fechar aqui quebraria o salto do traceback".
//! O que se protege e o unico segredo que existe: o `config.json` do Terminus.
//? ⚠️ ⚠️ AQUELA JUSTIFICATIVA NUNCA FOI VERDADE, e isto foi MEDIDO em 24/08/2026 — nao
//?   deduzido. O traceback clicavel esta VIVO e ligado em producao, e ele NUNCA passou por
//?   aqui. A cadeia real, conferida arquivo por arquivo:
//?     `interface/tela-do-terminal.ts:146` liga o quadro pelo registerLinkProvider do xterm
//?       -> `interface/nucleo-da-casca.ts:64`  aoAbrirQuadro -> abrirArquivo(arquivo, linha)
//?       -> `interface/nucleo-da-casca.ts:80`  api.neovim.abrir(caminho, linha)
//?       -> canal `neovim:abrir`, que TEM chamador e continua inteiro.
//?   O salto do traceback abre o arquivo NO NEOVIM, com o cursor na linha; ele nunca leu
//?   bytes por `arquivo:ler`. Entao a leitura larga estava justificada por um recurso que
//?   ela nao servia — e o recurso segue funcionando sem ela.
//? ⚠️ POR ISSO O CANAL SAIU (arvore A5, opcao (a), decisao da cabeca em 24/08): nao porque a
//?   feature morreu, mas porque o canal nunca foi o caminho dela. `lerParaEditor` continua
//?   existindo e NENHUM codigo de producao a chama — so `tests/`, com 10 assercoes. Ela nao
//?   foi apagada junto porque a cabeca decidiu os CANAIS, nao as funcoes: e a arvore A15.
//? ⚠️ A QUEM FOR RESSUSCITA-LA: a leitura larga esta hoje SEM justificativa escrita. Reexpo-la
//?   e aumentar alcance sem razao — e a porta (`porta/ponte-para-a-interface.ts`, item 3) diz
//?   que cada item dela e decisao de seguranca, nao conveniencia. Escreva a razao primeiro.
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
