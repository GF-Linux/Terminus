//? KITS EMBUTIDOS — a rede dos quatro casos de ligação, e da promessa do leia-me 24/08/2026
//!
//! 1. O item 5 do cabeçalho de `kits-embutidos.ts` e o `README:178-179` prometem a mesma
//!    coisa: *"um arquivo que já existe e NÃO é ligação nossa é deixado em paz"*. A A4 é
//!    essa promessa não sendo cumprida — e esta suíte é o que a torna conferível.
//! 2. OS QUATRO CASOS são os que a árvore A4 mediu em fixture, e agora moram aqui:
//!       nossa, apontando para a cópia que roda .......... REFAZ
//!       alheia, com o nosso prefixo ..................... RESPEITA
//!       nossa, apontando para uma cópia ANTERIOR ........ REFAZ
//!       nossa, e a cópia antiga sumiu (PENDURADA) ....... REFAZ
//!    A quarta é a que mais importa: é o caso que o comentário de `ligarUm` diz que a
//!    refeitura existe para consertar — *"se o Terminus mudou de pasta, a antiga aponta
//!    para o vazio e o editor deixaria de achar o kit em silêncio"*.
//! 3. O teste passa por `ligarKits`, e não pelo predicado privado: o que interessa é a
//!    CONDUTA — o que sobrevive no disco de quem usa —, não o valor de uma função interna.
//! 4. Escreve em `~/.config/nvim` de verdade, e é seguro porque o gancho redireciona `HOME`
//!    antes de tudo. Sem isso esta suíte mexeria na configuração do Neovim de quem roda.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { casa, pastaNova } from "../apoio/casa-de-teste.ts";
import { ligarKits } from "../../codigos/sistema/infra/kits-embutidos.ts";

const raizApp = pastaNova("app-que-roda");
const copiaAntiga = pastaNova("app-anterior");
const pastaDoUsuario = pastaNova("coisas-do-usuario");

const KITS = ["basico", "do-usuario", "velha", "pendurada"];
const funcoesAgora = path.join(raizApp, "kits", "funcoes", "python");
const funcoesAntes = path.join(copiaAntiga, "kits", "funcoes", "python");
const destino = path.join(casa(), ".config", "nvim", "snippets", "python");
const doUsuario = path.join(pastaDoUsuario, "meu-snippet.json");

let resumo: Awaited<ReturnType<typeof ligarKits>>;

before(async () => {
  mkdirSync(funcoesAgora, { recursive: true });
  mkdirSync(funcoesAntes, { recursive: true });
  mkdirSync(destino, { recursive: true });
  for (const k of KITS) {
    writeFileSync(path.join(funcoesAgora, `${k}.json`), "{}");
    writeFileSync(path.join(funcoesAntes, `${k}.json`), "{}");
  }
  //! Um arquivo de verdade do usuário, fora de qualquer `kits/` — é para onde a ligação
  //!   alheia aponta. Ela tem o NOSSO prefixo no nome, que é o que engana o predicado.
  writeFileSync(doUsuario, '{"meu":"trabalho"}');

  symlinkSync(path.join(funcoesAgora, "basico.json"), path.join(destino, "terminus-basico.json"));
  symlinkSync(doUsuario, path.join(destino, "terminus-do-usuario.json"));
  symlinkSync(path.join(funcoesAntes, "velha.json"), path.join(destino, "terminus-velha.json"));
  //! PENDURADA: aponta para dentro de um `kits/` que nunca existiu. `symlink` aceita alvo
  //!   inexistente de propósito — é exatamente o estado que se quer reproduzir.
  symlinkSync(
    path.join(casa(), "app-que-sumiu", "kits", "funcoes", "python", "pendurada.json"),
    path.join(destino, "terminus-pendurada.json"),
  );

  resumo = await ligarKits(raizApp);
});

describe("A4(b) · quem é 'nosso' — pelo LUGAR, ou pela FORMA do caminho", () => {
  test("a ligação ALHEIA é respeitada, e segue apontando para o trabalho da pessoa", () => {
    assert.deepEqual(resumo.respeitados, [path.join("snippets", "python", "terminus-do-usuario.json")]);
    assert.equal(readlinkSync(path.join(destino, "terminus-do-usuario.json")), doUsuario);
  });

  test("a nossa ligação ATUAL é refeita para a cópia que roda", () => {
    assert.equal(
      readlinkSync(path.join(destino, "terminus-basico.json")),
      path.join(funcoesAgora, "basico.json"),
    );
  });

  test("a nossa ligação VELHA aponta para a cópia nova, não para a anterior", () => {
    //! Sem isto, quem move o Terminus de pasta fica com os kits da cópia velha em
    //!   silêncio — e "silêncio" é o modo de falha que este arquivo inteiro combate.
    assert.equal(
      readlinkSync(path.join(destino, "terminus-velha.json")),
      path.join(funcoesAgora, "velha.json"),
    );
  });

  test("a ligação PENDURADA é consertada — o caso que a refeitura existe para resolver", () => {
    assert.equal(
      readlinkSync(path.join(destino, "terminus-pendurada.json")),
      path.join(funcoesAgora, "pendurada.json"),
    );
  });

  test("três refeitas, uma respeitada, nenhum erro", () => {
    assert.equal(resumo.ligados, 3);
    assert.equal(resumo.erro, null);
  });
});
