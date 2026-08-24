//* Lê a linha de comando e devolve a pasta que foi pedida ali.

import { statSync } from "node:fs";
import * as path from "node:path";

//* A pasta passada no comando: `terminus ~/projetos/x`. `null` se não houver.
//! POR QUE DESCARTA A RAIZ DO APP: em desenvolvimento o próprio diretório do
//!   aplicativo aparece entre os argumentos (`electron .`), e ele NÃO é pasta de
//!   corrida. Lido como se fosse, o repositório do Terminus abriria no lugar da
//!   pasta lembrada, e a memória de pasta nunca teria vez fora do pacote.
//! Só a PRIMEIRA ocorrência é descartada — quem passar o diretório de propósito
//!   continua sendo atendido.
//! `raizDoApp` e `empacotado` chegam por parâmetro em vez de serem lidos aqui:
//!   quem sabe se o app está empacotado é o Electron, e esta peça não precisa
//!   conhecê-lo para ler `process.argv`.
export function pastaPedidaNaLinha(raizDoApp: string, empacotado: boolean): string | null {
  const args = process.argv.slice(empacotado ? 1 : 2);
  let appJaVisto = empacotado;
  for (const a of args) {
    if (a.startsWith("-")) continue;
    const alvo = path.resolve(a);
    if (!appJaVisto && alvo === raizDoApp) {
      appJaVisto = true;
      continue;
    }
    try {
      if (statSync(alvo).isDirectory()) return alvo;
    } catch {
      /* não é caminho válido; segue */
    }
  }
  return null;
}
