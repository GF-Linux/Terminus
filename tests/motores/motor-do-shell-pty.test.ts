//? MOTOR DO SHELL — a rede que trava a conduta do botão ↗ 24/08/2026
//!
//! 1. ESTA SUÍTE EXISTE POR CAUSA DE UM BURACO DECLARADO. A A2 consertou o botão do
//!    Konsole em 24/08 e a prova foi uma **sonda de uso único**, que morreu com a sessão.
//!    O fechamento daquela corrida escreveu, com todas as letras: *"se alguém devolver
//!    `abrirNoKonsole` ao retorno síncrono amanhã, o portão fica verde e ninguém sabe"*.
//!    O primeiro teste abaixo é o "alguém sabe".
//! 2. O DEFEITO QUE ELA TRAVA: `spawn` não avisa do programa ausente de forma síncrona —
//!    o ENOENT chega pelo evento `error`, depois de a resposta já ter ido. Era assim que
//!    a tela dizia "Konsole aberto em ..." numa máquina sem Konsole nenhum.
//! 3. POR QUE UM KONSOLE FALSO NO RAMO DE SUCESSO: com o `konsole` de verdade no PATH,
//!    rodar a suíte abriria uma janela na área de trabalho de quem roda. O falso é um
//!    script que sai limpo — prova que o caminho de sucesso resolve, sem invadir a tela.
//! 4. O PTY VIVO FICA DE FORA, e está declarado no tracker §10.1: nenhum teste aqui sobe
//!    shell de verdade. Subir um arrisca deixar processo órfão — foi o erro nº 1 do
//!    despacho 1 — e a P5 já liga o programa inteiro.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { casa } from "../apoio/casa-de-teste.ts";
import {
  abrirNoKonsole,
  linhaDeCd,
  mandarLinha,
  pastaDoShell,
  shellEstaOcioso,
} from "../../codigos/sistema/motores/motor-do-shell-pty.ts";

const PATH_ORIGINAL = process.env["PATH"];
let pastaVazia: string;
let pastaComFalso: string;

before(() => {
  //! Uma pasta sem NADA dentro: é o que faz `spawn("konsole")` cair em ENOENT sem
  //!   depender de a máquina de quem roda ter ou não o Konsole instalado.
  pastaVazia = path.join(casa(), "path-sem-konsole");
  mkdirSync(pastaVazia, { recursive: true });

  pastaComFalso = path.join(casa(), "path-com-konsole");
  mkdirSync(pastaComFalso, { recursive: true });
  const falso = path.join(pastaComFalso, "konsole");
  writeFileSync(falso, "#!/bin/sh\nexit 0\n", "utf8");
  chmodSync(falso, 0o755);
});

describe("abrirNoKonsole — a conduta que a A2 consertou", () => {
  test("RECUSA, com a frase da tela, quando não há konsole na máquina", async () => {
    process.env["PATH"] = pastaVazia;
    //! `rejects`, e não "devolve algo falso": o ponto da A2 é que a promessa **não
    //!   resolve** quando o programa não existe. Um retorno síncrono passaria em
    //!   qualquer asserção sobre o valor — e passava, era esse o defeito.
    await assert.rejects(
      () => abrirNoKonsole(),
      (erro: Error) => {
        assert.match(erro.message, /konsole` não está instalado nesta máquina/);
        return true;
      },
    );
    process.env["PATH"] = PATH_ORIGINAL;
  });

  test("resolve com a pasta quando o konsole existe", async () => {
    process.env["PATH"] = pastaComFalso;
    const onde = await abrirNoKonsole();
    //! Sem shell de pé, `pastaDoShell()` devolve a casa — e é contra ela que se compara,
    //!   nunca contra um literal montado à mão.
    assert.equal(onde, casa());
    process.env["PATH"] = PATH_ORIGINAL;
  });
});

describe("linhaDeCd — o caminho não pode virar comando", () => {
  test("uma pasta chamada `; rm -rf ~` fica dentro das aspas, inerte", () => {
    const linha = linhaDeCd("/casa/; rm -rf ~");
    assert.equal(linha, "cd '/casa/; rm -rf ~'");
  });

  test("a aspa simples no nome fecha, escapa e reabre", () => {
    //! É a única sequência que encerra uma aspa simples no bash: `'\''`. Sem ela, uma
    //!   pasta com apóstrofo quebraria a linha ao meio e o resto viraria comando.
    assert.equal(linhaDeCd("/casa/o'brien"), "cd '/casa/o'\\''brien'");
  });
});

describe("sem shell de pé, as respostas são as honestas", () => {
  test("pastaDoShell devolve a casa", () => {
    assert.equal(pastaDoShell(), casa());
  });

  test("shellEstaOcioso é false — 'não sei' vale ocupado", () => {
    //! O custo de errar para ocupado é um aviso na tela; para o outro lado é texto
    //!   digitado dentro do programa alheio que estiver na frente.
    assert.equal(shellEstaOcioso(), false);
  });

  test("mandarLinha recusa em vez de escrever no vazio", () => {
    assert.equal(mandarLinha("echo oi"), false);
  });
});
