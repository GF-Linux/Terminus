//? LINGUAGEM DO ARQUIVO — o que o editor precisa saber ANTES de criar o modelo
//!
//! O Monaco colore, indenta e completa por um `id de linguagem`, e ele so o
//! descobre sozinho se a gente entregar o nome do arquivo junto. Esta e a
//! decisao, e ela e pura: entra um caminho, sai uma string. Nao le disco, nao
//! importa o Monaco, e por isso roda em milissegundos sem subir navegador.

import { test } from "node:test";
import assert from "node:assert/strict";
import { linguagemDoArquivo } from "../../codigos/dominio/linguagem-do-arquivo.ts";

test("os tres fluxos que o Terminus molda sao os que mais importam", () => {
  assert.equal(linguagemDoArquivo("/casa/projeto/main.py"), "python");
  assert.equal(linguagemDoArquivo("/casa/projeto/Program.cs"), "csharp");
  assert.equal(linguagemDoArquivo("/casa/projeto/main.cpp"), "cpp");
});

test("decide pelo NOME INTEIRO quando o arquivo nao tem extensao", () => {
  assert.equal(linguagemDoArquivo("/casa/projeto/Dockerfile"), "dockerfile");
  assert.equal(linguagemDoArquivo("/casa/projeto/Makefile"), "makefile");
});

//! O nome inteiro ganha da extensao de proposito: `.gitignore` e um arquivo
//!   cujo NOME comeca com ponto, nao um arquivo com extensao "gitignore".
test("nome que comeca com ponto nao e extensao", () => {
  assert.equal(linguagemDoArquivo("/casa/projeto/.gitignore"), "ignore");
  assert.equal(linguagemDoArquivo("/casa/projeto/.env"), "plaintext");
});

test("a caixa da extensao nao decide nada", () => {
  assert.equal(linguagemDoArquivo("/casa/LEIA.MD"), "markdown");
  assert.equal(linguagemDoArquivo("/casa/Foto.PY"), "python");
});

//! O caminho pode ter ponto em pasta: `~/.config/nvim/init.lua`. Quem decide e
//!   o ultimo segmento, nunca a string inteira.
test("ponto na PASTA nao vira extensao do arquivo", () => {
  assert.equal(linguagemDoArquivo("/casa/.config/nvim/init.lua"), "lua");
  assert.equal(linguagemDoArquivo("/casa/pasta.velha/notas.md"), "markdown");
});

test("o que nao conhece vira texto puro, nunca undefined", () => {
  assert.equal(linguagemDoArquivo("/casa/dados.xyzabc"), "plaintext");
  assert.equal(linguagemDoArquivo("/casa/sem-extensao-nenhuma"), "plaintext");
});

//! A carga vem do IPC e do clique na arvore; nenhum dos dois garante string.
test("entrada que nem e string vira texto puro, e nao estoura", () => {
  assert.equal(linguagemDoArquivo(""), "plaintext");
  assert.equal(linguagemDoArquivo(undefined as unknown as string), "plaintext");
  assert.equal(linguagemDoArquivo(null as unknown as string), "plaintext");
  assert.equal(linguagemDoArquivo(42 as unknown as string), "plaintext");
});

test("caminho do Windows tambem tem ultimo segmento", () => {
  assert.equal(linguagemDoArquivo("C:\\casa\\projeto\\main.ts"), "typescript");
});
