//? LOCALIZAR O SERVIDOR DE LINGUAGEM — a decisao que acontece antes de subir processo
//!
//! ⚠️ ESTES TESTES NAO SOBEM SERVIDOR E NAO TOCAM REDE. So a LOCALIZACAO e testada,
//! porque so ela e decisao nossa: o que o pyright responde e do pyright, e suite que
//! depende de servidor externo reprova por ambiente (§12·4e). A prova de que o
//! diagnostico chega na tela foi execucao direta com captura, registrada no diario.
//! O `HOME` ja chega redirecionado pelo `gancho-de-modulos`, entao a casa desta suite
//! nao tem o Mason do LazyVim — e "nao achei" e o caso natural aqui.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { localizarServidorDeLinguagem } from "../../codigos/sistema/motores/motor-servidor-de-linguagem.ts";

test("sem servidor nenhum, nao acha — e DIZ onde procurou", () => {
  const r = localizarServidorDeLinguagem("python");
  assert.equal(r.comando, null);
  //! A lista e a parte que importa: e ela que vira a frase da barra de estado, e e o que
  //!   separa "o editor esta burro" de "falta instalar o pyright".
  assert.ok(r.procurados.some((p) => p.includes("mason/bin/pyright-langserver")));
  assert.ok(r.procurados.some((p) => p.includes("basedpyright-langserver")),
    "o segundo binario tambem tem de ter sido procurado");
});

test("acha no Mason quando ele existe, com os argumentos da linguagem", () => {
  const dir = path.join(process.env["HOME"] ?? "", ".local/share/nvim/mason/bin");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "pyright-langserver"), "");

  const r = localizarServidorDeLinguagem("python");
  assert.equal(r.comando, path.join(dir, "pyright-langserver"));
  assert.deepEqual(r.argumentos, ["--stdio"]);
});

test("o C# leva os argumentos que o Roslyn exige, e nao os do Python", () => {
  const dir = path.join(process.env["HOME"] ?? "", ".local/share/nvim/mason/bin");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "roslyn-language-server"), "");

  const r = localizarServidorDeLinguagem("csharp");
  //! `--autoLoadProjects` NAO e enfeite: sem ele o Roslyn espera que o cliente lhe entregue
  //!   a solucao por um pedido proprio, e o arquivo aberto fica sem projeto — o sintoma e
  //!   "completa `System.` e mais nada".
  assert.ok(r.argumentos.includes("--autoLoadProjects"));
  assert.ok(r.argumentos.includes("--stdio"));
});

test("linguagem que o Terminus nao conhece nao inventa servidor", () => {
  const r = localizarServidorDeLinguagem("rust");
  assert.equal(r.comando, null);
  //! Lista VAZIA, e nao uma lista de lugares onde nunca houve nada: quem le a frase
  //!   precisa distinguir "procurei e nao achei" de "nem sei o que procurar".
  assert.deepEqual(r.procurados, []);
});

test("a variavel de ambiente GANHA do Mason", () => {
  const dir = path.join(process.env["HOME"] ?? "", ".local/share/nvim/mason/bin");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "pyright-langserver"), "");
  const meu = path.join(process.env["HOME"] ?? "", "meu-pyright");
  writeFileSync(meu, "");

  process.env["TERMINUS_LSP_PYRIGHT_LANGSERVER"] = meu;
  try {
    assert.equal(localizarServidorDeLinguagem("python").comando, meu);
  } finally {
    delete process.env["TERMINUS_LSP_PYRIGHT_LANGSERVER"];
  }
});
