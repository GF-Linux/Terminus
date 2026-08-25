//? ENDERECO DA PAGINA — a janela preta do `npm run dev`, e o fato que faltava 24/08/2026
//!
//! 1. O DEFEITO: `npm run dev` abria a janela TODA PRETA desde que o produto existe. Em
//!    `dev` o renderer e servido por HTTP, e o `electron.vite.config.ts` declara
//!    `root: codigos` com a entrada em `interface/pagina.html` — entao a pagina NAO fica na
//!    raiz do servidor. A janela carregava a raiz: `GET /` devolve 404 e 0 bytes, enquanto
//!    `GET /interface/pagina.html` devolve 200 e 7075. Medido tres vezes, por tres caminhos.
//! 2. POR QUE O CONSERTO E' AQUI E NAO NA CONFIG: a pergunta foi medida antes de escolher a
//!    forma. O electron-vite monta `ELECTRON_RENDERER_URL` como
//!    `${protocol}//${host}:${port}` (dist/chunks/lib-t2ExBjL5.mjs:67) — ORIGEM PURA, sem
//!    caminho, e sem opcao de configuracao que acrescente um. Logo o caminho tem de ser
//!    composto por nos.
//! 3. POR QUE UM MODULO DE DOMINIO, e nao duas linhas na janela: "onde mora a pagina" e' um
//!    fato so, e ele valia para DOIS regimes de carga que o diziam separado — a entrada da
//!    config e o `loadFile` do build — e para um TERCEIRO que nao o dizia em lugar nenhum,
//!    que e o de dev. Fato repetido e' fato que diverge; aqui ele tem um nome so.
//! 4. Sem I/O e sem `electron`, como o §1.3 exige do dominio: isto so faz conta de caminho.

import * as path from "node:path";

/** Onde a pagina mora, contado da RAIZ DO RENDERER — a mesma em `dev` e no build. */
//! Privado de proposito: os dois unicos usuarios sao as duas funcoes abaixo. Exporta-lo
//!   abriria superficie publica que ninguem pediu.
const PAGINA_NO_RENDERER = ["interface", "pagina.html"];

//* O endereco da pagina no servidor de dev, a partir da base que o electron-vite publica.
//! POR QUE `new URL` E NAO CONCATENAR: ele preserva hospedeiro e porta — que VARIAM, porque
//!   o Vite anda para a proxima porta quando a 5173 esta ocupada — e absorve a barra do fim
//!   sem duplicar. Medido nas duas formas de base: com e sem barra, o resultado e' o mesmo.
export function paginaNoServidorDeDev(baseDoServidor: string): string {
  return new URL(PAGINA_NO_RENDERER.join("/"), baseDoServidor).href;
}

//* O caminho da pagina em disco, a partir da pasta do main construido (`out/main`).
//! O renderer e' pasta IRMA do main dentro de `out/`, entao sobe um nivel e desce no outro.
export function paginaNoDisco(pastaDoMain: string): string {
  return path.join(pastaDoMain, "..", "renderer", ...PAGINA_NO_RENDERER);
}
