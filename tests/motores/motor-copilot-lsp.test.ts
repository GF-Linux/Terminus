//? LOCALIZAR O SERVIDOR DO COPILOT — a decisao que acontece ANTES de qualquer rede
//!
//! 1. O `@github/copilot-language-server` tem 114 MB desempacotados (binario de toda
//!    plataforma), contra 2,8 MB do fonte inteiro deste app. Por isso o Terminus NAO o
//!    empacota: ele PROCURA, e diz o que falta quando nao acha — a mesma conduta que o
//!    `como-rodar-o-projeto.ts` ja tem para o SDK do .NET.
//! 2. ⚠️ ESTES TESTES NAO TOCAM A REDE E NAO SOBEM PROCESSO. So a LOCALIZACAO e testada,
//!    porque so ela e decisao nossa: o que o Copilot responde e do Copilot, e suite que
//!    depende de rede reprova por ambiente (§12·4e). A prova de que o servidor responde de
//!    verdade foi execucao direta, registrada no `docs/diario.md` de 26/08.
//! 3. O `HOME` ja chega redirecionado pelo `gancho-de-modulos` — entao a casa desta suite
//!    NAO tem o copilot.lua do LazyVim, e o caso "nao achei" e o caso natural aqui.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { comoExecutar, localizarServidor } from "../../codigos/sistema/motores/motor-copilot-lsp.ts";
import { pastaNova } from "../apoio/casa-de-teste.ts";

test("sem servidor nenhum, nao acha — e DIZ onde procurou", () => {
  delete process.env["COPILOT_LANGUAGE_SERVER"];
  const r = localizarServidor();

  assert.equal(r.achado, null);
  //! A lista de lugares e a parte que importa: recusa que nao diz o que falta obriga quem
  //!   le a adivinhar, e e ela que vira a frase da barra de estado.
  assert.ok(r.procurados.length >= 2, "tem de listar mais de um lugar");
  assert.ok(
    r.procurados.some((p) => p.includes("copilot.lua")),
    "o pacote do LazyVim tem de estar entre os lugares procurados",
  );
});

test("a variavel de ambiente GANHA de tudo — quem a exportou quis aquele", () => {
  const casa = pastaNova("copilot-variavel");
  const meu = path.join(casa, "servidor-proprio");
  writeFileSync(meu, "");
  process.env["COPILOT_LANGUAGE_SERVER"] = meu;
  try {
    const r = localizarServidor();
    assert.equal(r.achado?.caminho, meu);
    //! `direto` e nao `node`: quem aponta um caminho proprio pode estar apontando um
    //!   binario, e rodar `node <binario>` falharia de um jeito confuso.
    assert.equal(r.achado?.comoRodar, "direto");
    assert.equal(r.procurados[0], meu, "a variavel tem de ser o PRIMEIRO lugar procurado");
  } finally {
    delete process.env["COPILOT_LANGUAGE_SERVER"];
  }
});

test("variavel apontando para o que nao existe NAO ganha — o proximo lugar ainda vale", () => {
  const casa = pastaNova("copilot-variavel-morta");
  process.env["COPILOT_LANGUAGE_SERVER"] = path.join(casa, "nao-existe");
  try {
    const r = localizarServidor();
    //! Existir e o criterio, nao ser o primeiro da lista. Variavel velha no `.bashrc`
    //!   apontando para um caminho que sumiu nao pode desligar o Copilot em silencio.
    assert.equal(r.achado, null, "com a variavel morta e nada instalado, nao ha o que achar");
    assert.equal(r.procurados.length, 3, "a variavel morta continua LISTADA no que se procurou");
  } finally {
    delete process.env["COPILOT_LANGUAGE_SERVER"];
  }
});

test("acha o pacote do LazyVim quando ele existe, e roda por node", () => {
  const casa = pastaNova("copilot-lazyvim");
  //! O `HOME` do gancho aponta para a casa da suite; monto o caminho que o motor procura.
  const dir = path.join(
    process.env["HOME"] ?? casa,
    ".local/share/nvim/lazy/copilot.lua/copilot/js",
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "language-server.js"), "");

  const r = localizarServidor();
  assert.equal(r.achado?.caminho, path.join(dir, "language-server.js"));
  //! `node` e nao `direto`: e um `.js`, e executa-lo direto dependeria de shebang e do bit
  //!   de execucao, que o pacote nao promete.
  assert.equal(r.achado?.comoRodar, "node");
});

//? COMO O SERVIDOR E EXECUTADO — o defeito de campo de 26/08/2026
//!
//! ⚠️ RELATO: *"inline completions -> nao sugere nada"*. O servidor era ACHADO e morria no
//! aperto de mao. Causa: `process.execPath` DENTRO DO ELECTRON e o binario do Electron, e
//! `electron language-server.js` sobe um segundo aplicativo em vez de rodar o script.
//! ⚠️ A prova anterior nao pegou porque rodou num `node` puro, onde `execPath` E o node —
//! passou pelo motivo errado. Estes testes travam a DECISAO, que e o que da para travar
//! sem subir Electron.

//! ⚠️ ESTES DOIS TESTES JA FORAM REESCRITOS UMA VEZ, NA MESMA CORRIDA, e o motivo importa:
//! a primeira versao travava `comando === process.execPath` — a conduta do primeiro
//! conserto. Ela estava ERRADA, e o portao pegou. O `ELECTRON_RUN_AS_NODE` fazia o
//! servidor rodar, e ele morria dizendo *"Node.js 22.13 is required to run GitHub Copilot
//! but found 20.18.3"*: o Electron 33 embute o Node 20, e o Copilot exige 22.
//! A conduta certa e PREFERIR O NODE DO SISTEMA. Amarrar o Copilot a versao de Node que o
//! Electron carrega faria atualizar o editor quebrar a sugestao, e vice-versa.

test("script .js roda pelo NODE DO SISTEMA quando ele existe", () => {
  const r = comoExecutar({ caminho: "/x/language-server.js", comoRodar: "node" });
  //! O `node` do PATH — e nao `process.execPath`, que dentro do Electron e o Electron.
  assert.ok(r.comando.endsWith("/node"), `esperava um node do sistema, veio ${r.comando}`);
  assert.deepEqual(r.argumentos, ["/x/language-server.js", "--stdio"]);
  //! Com o node de verdade a variavel NAO faz falta — e por-la seria dizer ao node que ele
  //!   e um Electron fingindo ser node.
  assert.equal(r.ambiente["ELECTRON_RUN_AS_NODE"], undefined);
});

test("sem node no sistema, cai para o executavel proprio COM a variavel", () => {
  const path0 = process.env["PATH"];
  //! PATH vazio = nao ha node em lugar nenhum. E o caso de quem instalou o Terminus
  //!   empacotado e nao tem Node avulso na maquina.
  process.env["PATH"] = "";
  try {
    const r = comoExecutar({ caminho: "/x/language-server.js", comoRodar: "node" });
    assert.equal(r.comando, process.execPath);
    //! ⚠️ AQUI a variavel e obrigatoria: sem ela o binario do Electron sobe um SEGUNDO
    //!   APLICATIVO em vez de rodar o script, e morre sem dizer por que.
    assert.equal(r.ambiente["ELECTRON_RUN_AS_NODE"], "1");
    //! E o RESTO do ambiente sobrevive: o servidor precisa do HOME para achar a sessao do
    //!   GitHub. Trocar o ambiente inteiro por uma variavel so quebraria a autenticacao.
    assert.equal(r.ambiente["HOME"], process.env["HOME"]);
  } finally {
    process.env["PATH"] = path0;
  }
});

test("binario proprio roda direto, e NAO ganha a variavel", () => {
  const r = comoExecutar({ caminho: "/usr/bin/copilot-language-server", comoRodar: "direto" });
  assert.equal(r.comando, "/usr/bin/copilot-language-server");
  assert.deepEqual(r.argumentos, ["--stdio"]);
  assert.equal(r.ambiente["ELECTRON_RUN_AS_NODE"], undefined);
});
