//* Fixtures em disco para a rede de `servicos/`: pastas e arquivos de verdade, dentro da
//*   casa temporária que o gancho criou.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import type { BrowserWindow } from "electron";

//* A casa temporária deste processo de teste — a que o gancho pôs em `HOME`.
//! Lida por `os.homedir()`, e não da variável, porque é assim que o código sob teste a
//!   lê: se as duas leituras divergirem um dia, a fixture cai no mesmo lugar que o código.
export function casa(): string {
  return homedir();
}

//* Uma pasta nova e vazia dentro da casa. Devolve o caminho REAL (sem link no meio).
//! `realpathSync` não é preciso aqui porque a casa já veio de `mkdtempSync` — mas em
//!   macOS `/tmp` é link para `/private/tmp`, e por isso o teste que compara caminho
//!   compara sempre contra `path.resolve` do que ESTA função devolveu, nunca contra
//!   um literal montado à mão.
export function pastaNova(prefixo: string): string {
  return mkdtempSync(path.join(casa(), `${prefixo}-`));
}

//* Cria um arquivo com conteúdo, criando as pastas do caminho se faltarem.
export function arquivoCom(destino: string, conteudo: string): string {
  mkdirSync(path.dirname(destino), { recursive: true });
  writeFileSync(destino, conteudo, "utf8");
  return destino;
}

//! O `BrowserWindow` só atravessa `servicos/` para chegar ao `dialog`, que aqui é duble.
//!   O tipo vem do `electron` DE VERDADE (import de tipo, apagado no runtime), então o
//!   `tsc` continua conferindo as assinaturas contra a produção.
export const janelaDeTeste: BrowserWindow = {} as unknown as BrowserWindow;
