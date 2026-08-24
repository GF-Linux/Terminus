//* Fixtures em disco para a rede de `servicos/`: pastas e arquivos de verdade, dentro da
//*   casa temporária que o gancho criou.

import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import type { BrowserWindow } from "electron";

//* A casa temporária deste processo de teste — a que o gancho pôs em `HOME`.
//! Lida por `os.homedir()`, e não da variável, porque é assim que o código sob teste a
//!   lê: se as duas leituras divergirem um dia, a fixture cai no mesmo lugar que o código.
export function casa(): string {
  return homedir();
}

//* Uma pasta nova e vazia dentro da casa, já no caminho REAL (sem link no meio).
//! `realpathSync` NÃO é enfeite: a guarda de escrita compara caminho JÁ RESOLVIDO, e em
//!   sistema onde `/tmp` é link (macOS aponta para `/private/tmp`) a fixture entraria com
//!   um nome e sairia da guarda com outro. O teste falharia sem nenhum defeito no código
//!   — e um vermelho que não é defeito ensina a suíte a ser ignorada.
export function pastaNova(prefixo: string): string {
  return realpathSync(mkdtempSync(path.join(casa(), `${prefixo}-`)));
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
