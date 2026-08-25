//? ENDERECO DA PAGINA — os dois regimes de carga, e o fato que eles PARTILHAM 24/08/2026
//!
//! 1. A pagina do renderer mora em UM lugar — `interface/pagina.html`, contado da raiz do
//!    renderer. Esse fato era dito em dois lugares que podiam divergir (a entrada do
//!    `electron.vite.config.ts` e o `loadFile` da janela) e em ZERO lugares no regime de
//!    `dev`, que e onde ele faltava e onde a janela abria preta.
//! 2. Por isso os dois regimes saem do MESMO nome aqui: quem mudar o lugar da pagina muda
//!    uma linha, e nao duas que alguem pode esquecer de casar.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { paginaNoServidorDeDev, paginaNoDisco } from "../../codigos/dominio/endereco-da-pagina.ts";

test("em dev, a pagina fica SOB a base do servidor — nunca na raiz dela", () => {
  assert.equal(
    paginaNoServidorDeDev("http://localhost:5173"),
    "http://localhost:5173/interface/pagina.html",
  );
});

test("base com barra no fim da o mesmo endereco", () => {
  assert.equal(
    paginaNoServidorDeDev("http://localhost:5173/"),
    "http://localhost:5173/interface/pagina.html",
  );
});

//! O Vite anda para a proxima porta quando a 5173 esta ocupada, e o `--host` troca o
//!   hospedeiro. Um composicao que cravasse qualquer um dos dois carregaria a janela errada.
test("o hospedeiro e a porta da base sao preservados", () => {
  assert.equal(
    paginaNoServidorDeDev("http://127.0.0.1:6174"),
    "http://127.0.0.1:6174/interface/pagina.html",
  );
});

test("no disco, a pagina fica na pasta IRMA do main construido", () => {
  assert.equal(
    paginaNoDisco(path.join("/app", "out", "main")),
    path.join("/app", "out", "renderer", "interface", "pagina.html"),
  );
});
