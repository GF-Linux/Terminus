//? AS EXTENSOES DO VSCODE — o painel que substituiu o "Plugins do Neovim"
//!
//! O valor deste modulo nao e LISTAR: e dizer, para cada extensao, se o Terminus saberia
//! carrega-la. Uma extensao do VSCode roda num host de extensao, e ha dois tipos: as que
//! declaram `browser` rodam no mesmo lugar que o editor; as que so declaram `main` precisam
//! de um processo Node com a API completa do VSCode, que este produto nao tem.
//! Sem essa marca, a lista prometeria o que nao pode cumprir.
//! O `HOME` ja chega redirecionado pelo `gancho-de-modulos`, entao a casa desta suite nao tem
//! o VSCode da cabeca — o que a torna o lugar certo para montar os casos a mao.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { listarExtensoesDoVscode } from "../../codigos/sistema/infra/extensoes-do-vscode.ts";

function extensao(nome: string, manifesto: Record<string, unknown>, nls?: Record<string, unknown>): void {
  const dir = path.join(process.env["HOME"] ?? "", ".vscode", "extensions", nome);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifesto));
  if (nls) writeFileSync(path.join(dir, "package.nls.json"), JSON.stringify(nls));
}

test("classifica pelos TRES tipos, e a classificacao e lida do manifesto", () => {
  extensao("a-web", { name: "web", publisher: "p", displayName: "Com browser", browser: "./x.js" });
  extensao("b-desk", { name: "desk", publisher: "p", displayName: "So main", main: "./x.js" });
  extensao("c-tema", { name: "tema", publisher: "p", displayName: "Um tema" });

  const por = Object.fromEntries(listarExtensoesDoVscode().map((e) => [e.rotulo, e.tipo]));
  //! `browser` GANHA de `main` quando os dois existem — e e o caso comum das extensoes
  //!   modernas, que publicam as duas variantes no mesmo pacote.
  assert.equal(por["Com browser"], "web");
  assert.equal(por["So main"], "desktop");
  //! Sem codigo nenhum e o terceiro estado, e nao "desktop por seguranca": tema e pacote de
  //!   idioma sao justamente os que carregariam mais facil.
  assert.equal(por["Um tema"], "declarativa");
});

test("browser ganha de main quando o pacote traz os dois", () => {
  extensao("d-ambos", { name: "ambos", publisher: "p", displayName: "Os dois", browser: "./b.js", main: "./m.js" });
  const achada = listarExtensoesDoVscode().find((e) => e.rotulo === "Os dois");
  assert.equal(achada?.tipo, "web");
});

//! ⚠️ ESTE E O CASO QUE APARECEU NA PRIMEIRA EXECUCAO REAL: o C# Dev Kit mostrava
//!   `%extension.title%` na lista. Extensao traduzivel poe um marcador no manifesto e o
//!   texto num arquivo ao lado — o que deveria ajudar a reconhecer virava ruido.
test("resolve o marcador de traducao pelo package.nls.json", () => {
  extensao(
    "e-nls",
    { name: "nls", publisher: "p", displayName: "%extension.title%", description: "%extension.desc%" },
    { "extension.title": "Kit de Verdade", "extension.desc": "faz coisas" },
  );
  const achada = listarExtensoesDoVscode().find((e) => e.id === "p.nls");
  assert.equal(achada?.rotulo, "Kit de Verdade");
  assert.equal(achada?.descricao, "faz coisas");
});

test("marcador SEM traducao vira texto legivel, nunca o marcador cru", () => {
  extensao("f-sem-nls", { name: "semnls", publisher: "p", displayName: "%extension.title%" });
  const achada = listarExtensoesDoVscode().find((e) => e.id === "p.semnls");
  //! "extension title" ainda diz mais que "%extension.title%".
  assert.equal(achada?.rotulo, "extension title");
});

//! A pasta tem `extensions.json` e restos de instalacao pela metade. Um deles nao pode
//!   derrubar a lista inteira — o sintoma seria "nenhuma extensao" numa maquina cheia delas.
test("manifesto quebrado nao derruba a lista", () => {
  const dir = path.join(process.env["HOME"] ?? "", ".vscode", "extensions", "g-quebrada");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "package.json"), "{ isto nao e json");
  extensao("h-boa", { name: "boa", publisher: "p", displayName: "Sobrevivi" });

  assert.ok(listarExtensoesDoVscode().some((e) => e.rotulo === "Sobrevivi"));
});

test("sem VSCode instalado a lista e vazia, e isso nao e erro", () => {
  //! `HOME` proprio desta asercao: sem a pasta, a resposta certa e `[]`, nao uma excecao.
  const home = process.env["HOME"];
  process.env["HOME"] = path.join(home ?? "", "casa-sem-vscode");
  try {
    assert.deepEqual(listarExtensoesDoVscode(), []);
  } finally {
    process.env["HOME"] = home;
  }
});
