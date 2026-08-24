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
