import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Fluxo } from "../compartilhado/tipos.js";

//! `execFile`, e não `exec`: sem shell, os argumentos vão separados. O caminho da
//! pasta vem de um diálogo e pode ter espaço, aspas e cifrão — pelo shell isso
//! vira comando, e aqui vira só um nome de pasta.
const execArquivo = promisify(execFile);

//? MOLDE DE PROJETO — Decisão sobre cortar o "New Project" do VSCode 17/08/2026
//!
//! 1. No VSCode começar um console app é: New Project > Console App > escolher
//!    onde > nomear > esperar o gerador. Cinco paradas para chegar num
//!    `main` que imprime uma linha.
//! 2. Aqui são duas: escolher a linguagem e dizer onde. O resto o molde faz.
//! 3. O molde NÃO é um gerador de arquitetura. Ele cria o mínimo que faz o
//!    arquivo compilar e rodar, e mais nada — projeto de verdade cresce do
//!    trabalho, não de uma pasta cheia de esqueleto que ninguém leu.
//! 4. Cada arquivo escrito aqui tem que ter uma razão que se responde em uma
//!    linha. Se não tem, não entra.

//* O nome que a pessoa lê. A chave é o que o código usa.
export const NOME_DO_FLUXO: Record<Fluxo, string> = {
  cpp: "C++",
  python: "Python",
  csharp: "C#",
};

/** O arquivo que o Terminus abre no editor logo depois de criar o projeto. */
const PRINCIPAL: Record<Fluxo, string> = {
  cpp: "main.cpp",
  python: "main.py",
  csharp: "Program.cs",
};

//! `compile_flags.txt` é o arquivo mais importante desta pasta, e é o que
//! ninguém lembra de criar. Sem ele o clangd não sabe que o projeto é C++20 e
//! sublinha `<ranges>`, `std::format` e afins como se não existissem — erro que
//! não é erro, no arquivo de quem está começando. O `compile_commands.json` do
//! CMake resolveria o mesmo, e exige CMake instalado; este resolve com um
//! arquivo de três linhas.
function moldeCpp(nome: string): Record<string, string> {
  return {
    "main.cpp": `#include <iostream>
#include <string>

int main() {
    std::string nome = "${nome}";
    std::cout << "ola, " << nome << "\\n";
    return 0;
}
`,

    "compile_flags.txt": `-std=c++20
-Wall
-Wextra
`,

    //! Makefile e não CMake: o "make" já está em qualquer Linux, o CMake é mais
    //! uma instalação antes da primeira linha de código. Quando o projeto pedir
    //! CMake, o projeto vai dizer.
    Makefile: `# Espaço+r no Terminus já compila e roda o arquivo aberto.
# Este Makefile é para quando o projeto passar de um arquivo só.

CXX      := g++
CXXFLAGS := -std=c++20 -O2 -Wall -Wextra
ALVO     := ${nome}
FONTES   := $(wildcard *.cpp)

$(ALVO): $(FONTES)
\t$(CXX) $(CXXFLAGS) $(FONTES) -o $(ALVO)

rodar: $(ALVO)
\t./$(ALVO)

limpar:
\trm -f $(ALVO)

.PHONY: rodar limpar
`,

    ".gitignore": `${nome}
*.o
`,
  };
}

function moldePython(nome: string): Record<string, string> {
  return {
    "main.py": `def main() -> None:
    print("ola, ${nome}")


if __name__ == "__main__":
    main()
`,

    //! Vazio de propósito, com o cabeçalho dizendo para que serve. Um arquivo de
    //! dependências que já nasce com biblioteca dentro ensina a instalar coisa
    //! que ninguém pediu.
    "requisitos.txt": `# uma biblioteca por linha, instala com:
#   pip install -r requisitos.txt
`,

    ".gitignore": `__pycache__/
*.pyc
.venv/
`,
  };
}

//? C# NÃO TEM MOLDE ESCRITO AQUI, E É DE PROPÓSITO
//!
//! 1. Um `.csproj` escrito à mão precisa dizer a versão do .NET
//!    (`<TargetFramework>net10.0</TargetFramework>`). Chumbar esse número aqui é
//!    combinar com o SDK de HOJE — na próxima versão o molde nasce quebrado, e
//!    quebra em quem instalou o Terminus, não em quem o escreveu.
//! 2. O `dotnet new console` é o gerador da própria ferramenta: ele sabe a
//!    versão instalada, e continua sabendo depois de qualquer atualização.
//! 3. Então C# é o único que chama um programa de fora. Se o `dotnet` não estiver
//!    na máquina, a frase tem que dizer isso — e não "ENOENT".
async function moldeCsharp(destino: string): Promise<void> {
  try {
    await execArquivo("dotnet", ["new", "console", "-o", destino], { timeout: 120_000 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("O .NET não está nesta máquina — instale o SDK para criar projeto C#.");
    }
    throw err;
  }

  //! O `dotnet new console` não deixa .gitignore. Sem ele, o primeiro `git add`
  //! leva `bin/` e `obj/` junto, que são saída de compilação.
  await fs.writeFile(path.join(destino, ".gitignore"), "bin/\nobj/\n", "utf8");
}

/**
 * Cria a pasta do projeto e escreve os arquivos do molde.
 *
 * Devolve o caminho do arquivo principal, que é o que a casca abre no editor —
 * criar a pasta e deixar a pessoa procurando onde clicar seria devolver o
 * problema que o botão veio resolver.
 */
export async function criarProjeto(destino: string, fluxo: Fluxo): Promise<string> {
  const nome = path.basename(destino);
  if (!nome || nome.includes("\0")) throw new Error("O nome da pasta não é válido.");

  //! `mkdir` sem `recursive` é de propósito: com ele, apontar para uma pasta que
  //! já existe seguiria em frente e escreveria por cima do trabalho de alguém.
  //! O EEXIST vira frase porque a original ("EEXIST: file already exists,
  //! mkdir ...") não diz a quem lê o que fazer em seguida.
  try {
    await fs.mkdir(destino);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Já existe "${nome}" nesse lugar — escolha outro nome.`);
    }
    throw err;
  }

  if (fluxo === "csharp") {
    await moldeCsharp(destino);
  } else {
    const arquivos = fluxo === "cpp" ? moldeCpp(nome) : moldePython(nome);
    for (const [arquivo, conteudo] of Object.entries(arquivos)) {
      await fs.writeFile(path.join(destino, arquivo), conteudo, "utf8");
    }
  }

  return path.join(destino, PRINCIPAL[fluxo]);
}
