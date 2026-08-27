//? A ABERTURA DE PROJETO DO ROSLYN — o defeito de campo de 26/08/2026
//!
//! ⚠️ RELATO: *"testei escrevendo diversos erros e o codigo nao acusou os erros"*. Medido no
//! app: Python dava 5 sublinhados e C# dava ZERO, com o servidor **de pe**.
//! CAUSA: o Roslyn nao descobre o projeto sozinho. Ele espera `solution/open` (ou
//! `project/open`), e sem isso fica de pe analisando nada. O `--autoLoadProjects` NAO basta —
//! ele ja estava na linha de comando desde a corrida 12.
//! A FONTE DA VERDADE esta nesta maquina: `nvim-lspconfig/lsp/roslyn_ls.lua`, que e o que faz
//! o Roslyn funcionar no Neovim da cabeca. Estes testes travam o gesto que copiei dela.

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { aberturaDeProjeto } from "../../codigos/sistema/motores/motor-servidor-de-linguagem.ts";
import { pastaNova } from "../apoio/casa-de-teste.ts";

test("com solucao na raiz, manda solution/open", () => {
  const raiz = pastaNova("roslyn-solucao");
  writeFileSync(path.join(raiz, "prova.slnx"), "");
  writeFileSync(path.join(raiz, "programa1.csproj"), "");

  const r = aberturaDeProjeto("csharp", raiz);
  assert.equal(r?.metodo, "solution/open");
  //! A SOLUCAO GANHA DO PROJETO mesmo havendo `.csproj` ao lado: a solucao conhece todos os
  //!   projetos dela, e abrir os `.csproj` soltos faria o Roslyn tratar como independentes o
  //!   que se referencia. E exatamente o desenho que o molde de C# desta casa cria.
  assert.ok(String(r?.params["solution"]).endsWith("prova.slnx"));
});

//! `.sln` continua reconhecido: o .NET 10 nao gera mais, mas pasta vinda de antes tem.
test("o .sln antigo tambem e solucao", () => {
  const raiz = pastaNova("roslyn-sln-antigo");
  writeFileSync(path.join(raiz, "velho.sln"), "");
  assert.equal(aberturaDeProjeto("csharp", raiz)?.metodo, "solution/open");
});

test("sem solucao, manda project/open com os .csproj da raiz", () => {
  const raiz = pastaNova("roslyn-projetos");
  writeFileSync(path.join(raiz, "um.csproj"), "");
  writeFileSync(path.join(raiz, "dois.csproj"), "");

  const r = aberturaDeProjeto("csharp", raiz);
  assert.equal(r?.metodo, "project/open");
  assert.equal((r?.params["projects"] as string[]).length, 2);
});

//! ⚠️ Arquivo `.cs` SOLTO e o caso que gerou o relato de campo — e a resposta certa e `null`,
//!   nao uma notificacao vazia: o Roslyn nao tem o que analisar, e quem chama precisa saber
//!   disso para poder DIZER, em vez de deixar a tela em silencio.
test("pasta sem projeto nenhum devolve null — ha o que dizer, nao o que mandar", () => {
  const raiz = pastaNova("roslyn-solto");
  writeFileSync(path.join(raiz, "Program.cs"), "class P {}");
  assert.equal(aberturaDeProjeto("csharp", raiz), null);
});

test("linguagem que nao e C# nao manda nada — pyright acha a raiz sozinho", () => {
  const raiz = pastaNova("roslyn-python");
  writeFileSync(path.join(raiz, "prova.slnx"), "");
  assert.equal(aberturaDeProjeto("python", raiz), null);
});

test("sem raiz aberta nao ha projeto para abrir", () => {
  assert.equal(aberturaDeProjeto("csharp", ""), null);
});

//! Pasta que sumiu entre abrir e perguntar nao pode ESTOURAR: quem chama esta no meio de
//!   abrir um arquivo, e um erro aqui viraria caixa de erro em cima de quem so clicou.
test("pasta que nao existe devolve null, e nao estoura", () => {
  assert.equal(aberturaDeProjeto("csharp", "/caminho/que/nunca/existiu"), null);
});
