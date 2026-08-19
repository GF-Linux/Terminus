import { promises as fs } from "node:fs";
import path from "node:path";
import type { ComoRodar, Fluxo } from "../compartilhado/tipos.js";

//? COMO RODAR O PROJETO — Decisão sobre o botão que substitui o dotnet build 17/08/2026
//!
//! 1. O caso que originou: `dotnet build` numa pasta com um `.cs` solto responde
//!    "MSBUILD : error MSB1003: Especifique um arquivo de solução ou de projeto".
//!    Isso NÃO é erro de compilação — é o dotnet dizendo que não há projeto ali.
//!    Quem está começando lê "error" e procura o defeito no próprio código.
//! 2. E não precisava de `build` nenhum: o `dotnet run` compila sozinho antes de
//!    rodar. Dois comandos onde bastava um, e o primeiro deles falha.
//! 3. Então este arquivo responde UMA pergunta: "nesta pasta, qual é a linha que
//!    roda o que está aqui?". Quem pergunta é o botão Rodar; quem responde é o
//!    disco, não um palpite.
//! 4. Quando não dá para responder, a resposta é uma FRASE dizendo o que falta,
//!    e não uma linha que vai falhar depois.

//! Só a raiz, e só arquivos. Descer nas subpastas faria o `obj/` do dotnet e o
//! `__pycache__` do Python entrarem na contagem, e o botão diria "muitos
//! arquivos" numa pasta que tem um só.
async function arquivosDaRaiz(raiz: string): Promise<string[]> {
  const itens = await fs.readdir(raiz, { withFileTypes: true });
  return itens.filter((e) => e.isFile()).map((e) => e.name);
}

async function temPasta(raiz: string, nome: string): Promise<boolean> {
  try {
    return (await fs.stat(path.join(raiz, nome))).isDirectory();
  } catch {
    return false;
  }
}

//? C#
//!
//! O `dotnet` responde a duas perguntas diferentes, e passar a errada dá erro nas
//! duas direções:
//!   - com projeto: `dotnet run` roda O PROJETO, e passar o arquivo dá erro;
//!   - sem projeto: o .NET 10 roda O ARQUIVO, e não passar nada dá o MSB1003.
//! Por isso a escolha é olhando o disco.
async function csharp(arquivos: string[]): Promise<ComoRodar> {
  const projeto = arquivos.find((a) => /\.(cs|fs)proj$/i.test(a) || /\.sln$/i.test(a));
  if (projeto) {
    return {
      linha: "dotnet run",
      porque: `${projeto} é o projeto desta pasta — o dotnet compila e roda ele inteiro.`,
    };
  }

  const cs = arquivos.filter((a) => /\.cs$/i.test(a));
  if (cs.length === 1) {
    return {
      linha: `dotnet run ${cs[0]}`,
      porque: `sem projeto na pasta, o .NET roda o arquivo direto — e ${cs[0]} é o único .cs aqui.`,
    };
  }
  if (cs.length === 0) {
    throw new Error("Não achei arquivo .cs nesta pasta.");
  }
  //! Vários .cs e nenhum projeto: o dotnet não tem como saber qual é o principal,
  //! e adivinhar aqui seria rodar o arquivo errado em silêncio.
  throw new Error(
    `Há ${cs.length} arquivos .cs e nenhum projeto nesta pasta, então o dotnet não ` +
      `sabe qual é o principal. Use o botão de fluxo > Novo projeto C# para criar um.`,
  );
}

async function python(arquivos: string[]): Promise<ComoRodar> {
  if (arquivos.includes("main.py")) {
    return { linha: "python3 main.py", porque: "main.py é a porta de entrada por convenção." };
  }
  const py = arquivos.filter((a) => /\.py$/i.test(a));
  if (py.length === 1) {
    return { linha: `python3 ${py[0]}`, porque: `${py[0]} é o único .py da pasta.` };
  }
  if (py.length === 0) throw new Error("Não achei arquivo .py nesta pasta.");
  throw new Error(
    `Há ${py.length} arquivos .py e nenhum main.py, então não dá para saber qual é ` +
      `o principal. Abra o arquivo e use Espaço+r no editor, que roda o que está aberto.`,
  );
}

//? C++
//!
//! **Isto mudou em 19/08, e a mudança é consequência do terminal ter virado um
//! shell de verdade.** Antes estava escrito aqui que o botão não compilava por
//! conta própria porque "compilar e rodar são dois comandos, e o terminal roda um
//! programa por linha (sem shell, `&&` é recusado)". Aquilo era verdade, e
//! deixou de ser: agora o terminal é bash, e `&&` é bash.
//!
//! A regra continua sendo a mesma de sempre — **a linha que aparece na tela é a
//! linha que rodou** (ADR 0030). O que mudou é que agora dá para escrever a
//! linha inteira, com os dois passos à vista, em vez de mandar a pessoa para
//! outro caminho.
//!
//! O `make` continua ganhando quando existe: ele sabe o que já está compilado, e
//! recompilar tudo a cada Rodar é lento e some com a razão de haver um Makefile.
async function cpp(raiz: string, arquivos: string[]): Promise<ComoRodar> {
  const makefile = arquivos.find((a) => a === "Makefile" || a === "makefile");
  if (makefile) {
    const texto = await fs.readFile(path.join(raiz, makefile), "utf8");
    const alvo = ["rodar", "run"].find((a) => new RegExp(`^${a}:`, "m").test(texto));
    if (alvo) {
      return { linha: `make ${alvo}`, porque: `o ${makefile} tem o alvo "${alvo}", que compila e roda.` };
    }
    return { linha: "make", porque: `o ${makefile} não tem alvo "rodar"; isto só compila.` };
  }

  const cc = arquivos.filter((a) => /\.(cpp|cc|cxx)$/i.test(a));
  if (cc.length === 0) throw new Error("Não achei arquivo .cpp nesta pasta, nem Makefile.");
  if (cc.length > 1) {
    //! Vários `.cpp` sem Makefile: eles podem ser um programa só (que precisa de
    //! todos na mesma linha) ou vários programas independentes (que não). Não dá
    //! para saber olhando os nomes, e compilar o conjunto errado dá erro de
    //! ligação que não parece com o problema que é.
    throw new Error(
      `Há ${cc.length} arquivos .cpp e nenhum Makefile, então não dá para saber se ` +
        `são um programa só ou vários. Abra o arquivo e use Espaço+r no editor, que ` +
        `compila e roda o que está aberto.`,
    );
  }

  //! O binário vai para `/tmp`, e é o mesmo lugar que o `Espaço+r` do editor usa
  //! (ADR 0026) — assim os dois caminhos não deixam lixo diferente na pasta de
  //! quem está estudando. O nome sai do arquivo, para dois projetos abertos não
  //! sobrescreverem o binário um do outro.
  const nome = cc[0]!.replace(/\.(cpp|cc|cxx)$/i, "");
  const binario = `/tmp/terminus-${nome}`;
  return {
    linha: `g++ -std=c++17 -Wall -g ${cc[0]} -o ${binario} && ${binario}`,
    porque:
      `${cc[0]} é o único .cpp da pasta e não há Makefile — então a linha compila e ` +
      `roda, nesta ordem. O "&&" faz o programa só rodar se a compilação der certo.`,
  };
}

/**
 * Diz qual linha roda o que está nesta pasta, ou explica o que falta.
 *
 * O `fluxo` vem do chip da barra — é a linguagem que a casca considera aberta.
 * Sem ele não haveria como escolher a regra numa pasta com mais de uma
 * linguagem, que é o caso comum de projeto com script de apoio.
 */
export async function comoRodar(raiz: string, fluxo: Fluxo): Promise<ComoRodar> {
  const arquivos = await arquivosDaRaiz(raiz);

  //! Aviso antes da regra: uma pasta com `obj/` mas sem projeto é resto de uma
  //! compilação anterior, e confunde quem olha achando que já tem projeto.
  if (fluxo === "csharp" && !arquivos.some((a) => /\.(cs|fs)proj$|\.sln$/i.test(a))) {
    if (await temPasta(raiz, "obj")) {
      throw new Error(
        "Existe uma pasta obj/ aqui, mas nenhum .csproj — é sobra de uma compilação " +
          "antiga. Apague obj/ e bin/, ou crie um projeto pelo botão de fluxo.",
      );
    }
  }

  if (fluxo === "csharp") return csharp(arquivos);
  if (fluxo === "python") return python(arquivos);
  return cpp(raiz, arquivos);
}
