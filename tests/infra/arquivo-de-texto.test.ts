//? O QUE O EDITOR ACEITA ABRIR — o defeito de campo de 26/08/2026
//!
//! ⚠️ RELATO: *"Arquivo Csharp nao e lido"*. Medido, o defeito era MUITO maior que o
//! relato: `Program.cs`, `app.ts`, `main.cpp`, `kit.lua`, `pagina.html`, `estilo.css`,
//! `roda.sh`, `projeto.csproj`, `Dockerfile` e `.gitignore` — **dez de catorze** — eram
//! recusados. Abriam so `.py`, `.md`, `.json`, `.txt` e os formatos de laboratorio
//! (`.fasta`, `.fa`, `.fastq`).
//!
//! A CAUSA: `ehTexto` era uma LISTA BRANCA de 14 extensoes, herdada da Bancada (o
//! projeto de bioinformatica que o Terminus substituiu). Ela nunca doeu porque o canal
//! que a usava — `arquivo:ler` — **nao tinha chamador**: quem abria arquivo era o Neovim,
//! que lia o disco por conta propria. Quando o editor virou o Monaco e o canal
//! ressuscitou (26/08), a lista virou o portao de TUDO — e ela so conhecia a bancada.
//!
//! ⚠️ E ela CONTRADIZIA o proprio dominio: `dominio/linguagem-do-arquivo.ts` sabe que
//! `.cs` e csharp, que `Dockerfile` e dockerfile e que `.gitignore` e ignore — e a infra
//! recusava os tres. Duas peças da mesma casa discordando, com a infra ganhando.
//!
//! A REGRA INVERTEU: texto e o PADRAO; binario e que precisa ser reconhecido. E, como
//! extensao mente, o conteudo tem a ultima palavra.

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { ehTexto } from "../../codigos/sistema/infra/arquivos-do-projeto.ts";
import { pastaNova } from "../apoio/casa-de-teste.ts";

const casa = pastaNova("arquivo-de-texto");
function arquivo(nome: string, conteudo: Buffer | string): string {
  const alvo = path.join(casa, nome);
  writeFileSync(alvo, conteudo);
  return alvo;
}

test("o relato: C# ABRE — e com ele o resto do que este editor edita", () => {
  for (const nome of ["Program.cs", "projeto.csproj", "app.ts", "main.cpp", "cabecalho.h",
                      "kit.lua", "pagina.html", "estilo.css", "roda.sh", "notas.md",
                      "script.py", "dados.json", "config.toml"]) {
    assert.equal(ehTexto(arquivo(nome, "conteudo\n")), true, `${nome} tinha de abrir`);
  }
});

//! Os nomes sem extensao sao os que a lista branca nunca poderia cobrir, e sao os mesmos
//!   que o `dominio/linguagem-do-arquivo.ts` ja sabia colorir. As duas peças voltam a
//!   concordar.
test("nome sem extensao abre — e e o que o dominio ja dizia", () => {
  for (const nome of ["Dockerfile", "Makefile", ".gitignore", ".bashrc", "LICENSE"]) {
    assert.equal(ehTexto(arquivo(nome, "linha\n")), true, `${nome} tinha de abrir`);
  }
});

test("binario conhecido pela extensao continua RECUSADO", () => {
  for (const nome of ["foto.png", "icone.ico", "video.mp4", "pacote.zip", "lib.so", "fonte.woff2"]) {
    assert.equal(ehTexto(arquivo(nome, "qualquer coisa")), false, `${nome} nao devia abrir`);
  }
});

//! ⚠️ A EXTENSAO MENTE, e este e o caso que so o conteudo pega: um binario com nome de
//!   texto. Sem esta conferencia, abrir um `.txt` que e na verdade um executavel mostraria
//!   lixo na tela — e pior, o modelo do Monaco tentaria colorir megabytes de ruido.
test("conteudo binario com nome de texto e RECUSADO", () => {
  const comNulo = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x00, 0x01, 0x00, 0x00]);
  assert.equal(ehTexto(arquivo("mentiroso.txt", comNulo)), false);
  assert.equal(ehTexto(arquivo("mentiroso.py", comNulo)), false);
});

//! O caso inverso do de cima: arquivo vazio nao tem byte nenhum para delatar, e recusa-lo
//!   impediria criar arquivo pela arvore e abri-lo em seguida — que e o gesto mais comum.
test("arquivo vazio abre", () => {
  assert.equal(ehTexto(arquivo("novo.cs", "")), true);
});

//! UTF-8 com acento tem bytes altos, e um leitor ingenuo de "e binario?" os confundiria
//!   com ruido. Este projeto e todo escrito em portugues — errar aqui seria recusar o
//!   proprio codigo-fonte.
test("acento nao e binario", () => {
  assert.equal(ehTexto(arquivo("acentos.cs", "// coração, ação, não\n")), true);
});

//! Caminho que nao existe nao pode ESTOURAR: `ehTexto` e chamado antes de ler, e um erro
//!   aqui viraria caixa de erro em vez da frase "o arquivo sumiu" que o leitor ja da.
test("caminho que nao existe nao estoura — devolve false", () => {
  assert.equal(ehTexto(path.join(casa, "nunca-existiu.cs")), false);
});
