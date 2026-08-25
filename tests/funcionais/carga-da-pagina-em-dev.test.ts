//? CARGA DA PÁGINA EM DEV — a perna P6, e por que ela não pergunta ao domínio 24/08/2026
//!
//! 1. O DEFEITO QUE A FEZ NASCER, achado em campo pela cabeça: `npm run dev` abria a janela
//!    TODA PRETA. Em `dev` o renderer é servido por HTTP, e a config declara `root: codigos`
//!    com a entrada em `interface/pagina.html` — a página NÃO fica na raiz do servidor. A
//!    janela carregava a raiz. Medido três vezes: `GET /` → 404 e 0 bytes;
//!    `GET /interface/pagina.html` → 200 e 7075 bytes.
//! 2. POR QUE ELA CAPTURA DO `loadURL` EM VEZ DE CHAMAR A FUNÇÃO DE DOMÍNIO: um teste que
//!    perguntasse o endereço direto ao domínio passaria **mesmo que `janela-principal.ts`
//!    nunca chamasse o domínio**. O defeito de hoje é uma LIGAÇÃO errada, não uma conta
//!    errada — a rede tem de morder onde dói. Aqui quem responde é a `criarJanela()` de
//!    verdade, com o `electron` dublado, e o teste faz `GET` no que ELA mandou carregar.
//! 3. HEADLESS DE PROPÓSITO: sobe só o servidor HTTP. Nada de tela, nada de GPU, nada de
//!    `xvfb` — o `BrowserWindow` é o duble, que recorda em vez de desenhar.
//! 4. O SERVIDOR SOBE PELO MESMO PAR DE FUNÇÕES que o `electron-vite dev` usa por dentro
//!    (`resolveConfig` + `vite.createServer` — `electron-vite/dist/chunks/lib-t2ExBjL5.mjs:58`).
//!    Copiar a config à mão aqui criaria uma segunda fonte da verdade que diverge da real.
//! 5. CUSTO MEDIDO ANTES DE ESCOLHER A FORMA: 274 ms e 269 ms em duas corridas, contra os
//!    6,5 s da P1 inteira. Perna cara que ninguém roda é pior que perna nenhuma.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "electron-vite";
import { createServer, type ViteDevServer } from "vite";
import { criarJanela } from "../../codigos/sistema/janela/janela-principal.ts";
import { controle, reiniciarDuble } from "../apoio/electron-duble.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let servidor: ViteDevServer | null = null;
let baseDoServidor = "";
const RENDERER_URL = "ELECTRON_RENDERER_URL";

before(async () => {
  //! O `electron.vite.config.ts` monta os caminhos com `resolve("codigos")`, e `resolve`
  //!   conta a partir do `process.cwd()` — não da pasta do arquivo de config. Sem esta
  //!   linha o teste passaria a depender de ONDE alguém o invocou.
  process.chdir(RAIZ);
  const config = await resolveConfig({ root: RAIZ }, "serve", "development");
  const doRenderer = config.config?.renderer;
  assert.ok(doRenderer, "o electron.vite.config.ts precisa declarar o bloco `renderer`");
  servidor = await createServer(doRenderer);
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  assert.ok(endereco !== null && typeof endereco === "object", "o servidor de dev não abriu porta");
  //! A porta é LIDA, nunca suposta: o Vite anda para a próxima quando a 5173 está ocupada,
  //!   e um teste que cravasse 5173 quebraria na máquina de quem está com o dev aberto.
  baseDoServidor = `http://localhost:${endereco.port}`;
});

after(async () => {
  await servidor?.close();
  delete process.env[RENDERER_URL];
});

test("a URL que a janela carrega em dev SERVE a pagina", async () => {
  reiniciarDuble();
  process.env[RENDERER_URL] = baseDoServidor;

  criarJanela();

  const carregado = controle.carregado;
  assert.ok(carregado, "a janela nao mandou carregar nada");
  assert.equal(carregado.tipo, "url", "com servidor de dev de pe, a carga tem de ser por URL");

  const resposta = await fetch(carregado.valor);
  const corpo = Buffer.from(await resposta.arrayBuffer());

  assert.equal(resposta.status, 200, `${carregado.valor} respondeu ${resposta.status}`);
  assert.ok(corpo.length > 0, `${carregado.valor} respondeu 200 com corpo VAZIO`);
  //! A marca prova que é A PÁGINA, e não um 200 qualquer: `casca-principal` é a entrada de
  //!   módulo do renderer, e só aparece se o Vite resolveu a página a partir da raiz certa.
  assert.match(corpo.toString("utf8"), /casca-principal/, "o corpo servido nao e a pagina do Terminus");
});

test("sem servidor de dev, a janela carrega o ARQUIVO do renderer construido", () => {
  reiniciarDuble();
  delete process.env[RENDERER_URL];

  criarJanela();

  const carregado = controle.carregado;
  assert.ok(carregado, "a janela nao mandou carregar nada");
  assert.equal(carregado.tipo, "arquivo", "sem servidor de dev, a carga tem de ser por arquivo");
  //! Trava o regime do build, que é o que HOJE funciona — para o conserto do regime de dev
  //!   não o quebrar de lado (§12·3: a conduta que já existe é preservada).
  assert.ok(
    carregado.valor.endsWith(path.join("renderer", "interface", "pagina.html")),
    `o arquivo carregado foi ${carregado.valor}`,
  );
});
