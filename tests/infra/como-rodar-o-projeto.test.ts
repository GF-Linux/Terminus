//? COMO RODAR C# — a rede do contrato entre o molde-solução e o botão Rodar 25/08/2026
//!
//! 1. Em 25/08 o molde de C# virou uma SOLUÇÃO (comum/ + saida/ + uma pasta por
//!    programa), e o Rodar ganhou a regra que a entende: `dotnet run --project`.
//!    O molde e o Rodar são dois arquivos que precisam concordar sem se ver — e
//!    esta suíte é onde o acordo fica escrito de forma que quebra faz barulho.
//! 2. As fixtures são pastas de verdade com .csproj de MENTIRA: a regra decide
//!    lendo o disco (`<OutputType>Exe`), não rodando o dotnet — então a suíte
//!    prova a decisão sem precisar do SDK instalado, e roda em qualquer máquina.
//! 3. O caso "vários programas" é USO ESPERADO, não defeito: a frase tem que
//!    entregar a linha pronta com as pastas pelo nome. É o que faz "poder criar
//!    vários programas" ser verdade também no botão, e não só no disco.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import * as path from "node:path";
import { arquivoCom, pastaNova } from "../apoio/casa-de-teste.ts";
import { comoRodar } from "../../codigos/sistema/infra/como-rodar-o-projeto.ts";

const EXE = `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>`;
const BIBLIOTECA = `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><Nullable>enable</Nullable></PropertyGroup></Project>`;

describe("C# com projeto na raiz — o jeito antigo continua valendo", () => {
  test("um .csproj na raiz roda com dotnet run, sem --project", async () => {
    const raiz = pastaNova("cs-raiz");
    arquivoCom(path.join(raiz, "app.csproj"), EXE);
    arquivoCom(path.join(raiz, "Program.cs"), "");
    assert.equal((await comoRodar(raiz, "csharp")).linha, "dotnet run");
  });
});

describe("C# com solução na raiz — o molde de 25/08", () => {
  test("um programa executável: a linha aponta a pasta dele, e a biblioteca fica de fora", async () => {
    const raiz = pastaNova("cs-solucao");
    arquivoCom(path.join(raiz, "projeto.slnx"), "<Solution/>");
    arquivoCom(path.join(raiz, "comum", "comum.csproj"), BIBLIOTECA);
    arquivoCom(path.join(raiz, "programa1", "programa1.csproj"), EXE);
    const r = await comoRodar(raiz, "csharp");
    assert.equal(r.linha, "dotnet run --project programa1");
    //! O porquê nomeia a solução E a pasta: é a frase que ensina o comando.
    assert.match(r.porque, /projeto\.slnx/);
    assert.match(r.porque, /programa1/);
  });

  //! `.sln` é a solução ANTIGA, vinda de fora — o molde gera .slnx, mas a regra
  //!   não pode deixar de reconhecer quem chegou do VSCode de ontem.
  test("vários programas: a frase lista as pastas e entrega a linha pronta", async () => {
    const raiz = pastaNova("cs-varios");
    arquivoCom(path.join(raiz, "projeto.sln"), "");
    arquivoCom(path.join(raiz, "programa1", "programa1.csproj"), EXE);
    arquivoCom(path.join(raiz, "programa2", "programa2.csproj"), EXE);
    await assert.rejects(
      () => comoRodar(raiz, "csharp"),
      /2 programas: programa1, programa2[\s\S]*dotnet run --project/,
    );
  });

  test("solução só com biblioteca: a frase diz como nasce o primeiro programa", async () => {
    const raiz = pastaNova("cs-so-biblioteca");
    arquivoCom(path.join(raiz, "projeto.slnx"), "<Solution/>");
    arquivoCom(path.join(raiz, "comum", "comum.csproj"), BIBLIOTECA);
    await assert.rejects(() => comoRodar(raiz, "csharp"), /dotnet new console -o programa1/);
  });
});

describe("C# sem projeto nenhum — o .NET roda o arquivo", () => {
  test("um único .cs vai direto na linha", async () => {
    const raiz = pastaNova("cs-arquivo");
    arquivoCom(path.join(raiz, "conta.cs"), "");
    assert.equal((await comoRodar(raiz, "csharp")).linha, "dotnet run conta.cs");
  });

  test("obj/ sem projeto é sobra de compilação, e a frase diz isso", async () => {
    const raiz = pastaNova("cs-sobra");
    arquivoCom(path.join(raiz, "conta.cs"), "");
    mkdirSync(path.join(raiz, "obj"));
    await assert.rejects(() => comoRodar(raiz, "csharp"), /sobra de uma compilação/);
  });
});
