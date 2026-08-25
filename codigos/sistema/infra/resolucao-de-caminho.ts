//* Transforma um caminho de texto no caminho REAL do disco (resolve symlink).

import { existsSync, realpathSync } from "node:fs";
import * as path from "node:path";

//* Devolve o caminho real de `alvo`, mesmo quando o arquivo ainda nao existe.
//! POR QUE RESOLVE O LINK: sem isso, um atalho dentro do projeto apontando para
//!   `~/.bashrc` passaria na comparacao de texto da guarda — o nome estaria
//!   dentro da raiz, e a escrita cairia fora dela.
//! POR QUE O RAMO DO "NAO EXISTE": gravar arquivo NOVO e caso normal, e
//!   `realpathSync` estoura em caminho inexistente. Entao resolve-se a PASTA que
//!   vai receber (essa existe) e cola-se o nome — o link no meio do caminho
//!   continua sendo desfeito, que e o que a guarda precisa.
//! Esta peca vive na infra, e nao no dominio, porque ela TOCA O DISCO. O dominio
//!   recebe o resultado dela ja pronto e so decide (§1.3).
export function resolverReal(alvo: string): string {
  const abs = path.resolve(alvo);
  try {
    return existsSync(abs)
      ? realpathSync(abs)
      : path.join(realpathSync(path.dirname(abs)), path.basename(abs));
  } catch {
    throw new Error(`${path.basename(abs)}: a pasta de destino não existe.`);
  }
}

//* Resolve um caminho para LEITURA: link desfeito, mas sem exigir que exista.
//! POR QUE NAO REUSA `resolverReal`: aquele ESTOURA quando a pasta de destino
//!   nao existe, porque quem grava precisa saber disso na hora. Quem le nao —
//!   um caminho inexistente segue adiante e o erro chega depois, na leitura,
//!   com a mensagem do sistema de arquivos, que diz mais.
//! A conduta e a que o handler `arquivo:ler` tinha ate 24/08/2026: existsSync ? realpath : abs.
//? ⚠️ AQUELE HANDLER NAO EXISTE MAIS — a A5(a) removeu o canal `arquivo:ler` em 24/08/2026,
//?   por decisao da cabeca, porque nenhuma tela o chamava. A frase acima fica porque explica
//?   DE ONDE veio esta regra, e isso continua verdadeiro. O que mudou e' que o unico chamador
//?   de `resolverParaLeitura` hoje e' `lerParaEditor`, que so `tests/` alcanca (arvore A15).
export function resolverParaLeitura(alvo: string): string {
  const abs = path.resolve(alvo);
  return existsSync(abs) ? realpathSync(abs) : abs;
}
