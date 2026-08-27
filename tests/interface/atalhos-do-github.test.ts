import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { comandoGit } from "../../codigos/interface/atalhos-do-github.ts";

describe("comandoGit", () => {
  test("monta os atalhos sem argumentos", () => {
    assert.equal(comandoGit("status"), "git status");
    assert.equal(comandoGit("add"), "git add .");
    assert.equal(comandoGit("push"), "git push");
    assert.equal(comandoGit("pull"), "git pull");
  });

  test("protege URL de clone e mensagem de commit como argumentos únicos", () => {
    assert.equal(
      comandoGit("clone", "https://github.com/GF-Linux/Terminus.git; echo indevido"),
      "git clone -- 'https://github.com/GF-Linux/Terminus.git; echo indevido'",
    );
    assert.equal(
      comandoGit("commit", "corrige o botão 'GitHub'"),
      "git commit -m 'corrige o botão '\\''GitHub'\\'''",
    );
  });

  test("recusa argumentos ausentes ou em múltiplas linhas", () => {
    assert.throws(() => comandoGit("clone"), /URL do repositório é obrigatório/);
    assert.throws(() => comandoGit("commit", "primeira\nsegunda"), /quebra de linha/);
  });
});
