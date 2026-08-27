import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Fluxo } from "../../compartilhado/tipos.js";

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
//! O de C# fica dentro de `programa1/` porque o molde é uma solução (ver o
//! bloco do C# abaixo): na raiz moram o .slnx e as pastas, nunca um Program.cs.
const PRINCIPAL: Record<Fluxo, string> = {
  cpp: "main.cpp",
  python: "main.py",
  csharp: path.join("programa1", "Program.cs"),
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

//? C# É UMA SOLUÇÃO, E QUEM ESCREVE OS PROJETOS É O dotnet — revisão de 25/08/2026
//!
//! 1. Um `.csproj` escrito à mão precisa dizer a versão do .NET
//!    (`<TargetFramework>net10.0</TargetFramework>`). Chumbar esse número aqui é
//!    combinar com o SDK de HOJE — na próxima versão o molde nasce quebrado, e
//!    quebra em quem instalou o Terminus, não em quem o escreveu. Por isso C# é
//!    o único que chama um programa de fora: o `dotnet new` sabe a versão
//!    instalada, e continua sabendo depois de qualquer atualização. (17/08)
//! 2. O QUE MUDOU em 25/08: o molde era UM console solto, e console solto
//!    aguenta UM programa — o segundo Program.cs na mesma pasta é erro de
//!    compilação (CS0017, dois Main). Agora o molde é uma SOLUÇÃO: cada
//!    programa mora na própria pasta com o próprio .csproj, e o segundo nasce
//!    repetindo o gesto (`dotnet new console -o programa2` + `dotnet sln add`),
//!    sem tocar no primeiro.
//! 3. `comum/` é a biblioteca da solução: o código que dois programas dividem
//!    mora ali, e `programa1` já nasce com a referência — usar a primeira
//!    função compartilhada não exige aprender referência entre projetos antes.
//! 4. `saida/` recolhe TODA a compilação (bin e obj de todos os projetos), via
//!    `ArtifactsPath` no Directory.Build.props. Um lugar só para olhar, uma
//!    linha só de .gitignore — e as pastas de código ficam só com código.
//! 5. A ORDEM dos passos não é estética: o .slnx vem primeiro porque é a
//!    chamada que descobre se o dotnet existe ANTES de qualquer arquivo nascer;
//!    os props vêm antes dos projetos porque o restore do `dotnet new` já
//!    compila — sem eles o primeiro obj/ nasceria fora de saida/, e fora do
//!    .gitignore.

//! Toda chamada ao dotnet passa por aqui: se ele não estiver na máquina, a
//! frase tem que dizer isso — e não "ENOENT".
async function dotnet(args: string[]): Promise<void> {
  try {
    await execArquivo("dotnet", args, { timeout: 120_000 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("O .NET não está nesta máquina — instale o SDK para criar projeto C#.");
    }
    throw err;
  }
}

//? ANIMAÇÃO NO TERMINAL — o que o molde passa a escrever no `comum/` (26/08/2026)
//!
//! 1. O pedido foi instalar o **Terminal.Gui** e ter um caminho fácil para
//!    animação, escrita e em ASCII. O pacote é NuGet (.NET) — ele não entra no
//!    Terminus, que é Electron; entra no MOLDE, e aí todo projeto C# nasce com ele.
//! 2. O pacote vai no `comum/`, não no `programa1/`: **PackageReference atravessa
//!    a referência de projeto** — medido, `using Terminal.Gui.App` compila no
//!    programa1 com o pacote declarado só no comum, 0 avisos. Uma declaração serve
//!    a todos os programas da solução, inclusive os que ainda não nasceram.
//! 3. `Animacao` usa **Console puro, não Terminal.Gui**, e é de propósito: escrever
//!    devagar e trocar quadro não precisa de uma tela TUI inteira. O Terminal.Gui
//!    fica para o aplicativo de tela cheia, e é o que a `TelaAnimada` mostra.
//! 4. A `TelaAnimada` usa `Application.Create()`, e **não** o `Application` estático:
//!    o estático está marcado obsoleto no 2.4.17 ("The legacy static Application
//!    object is going away") e emitia 4 avisos por build. Com a API nova, 0.

const ANIMACAO_CS = `namespace comum;

//? ANIMACAO NO TERMINAL — texto que aparece letra a letra, e quadros ASCII em sequencia
//!
//! 1. Usa Console puro, e nao o Terminal.Gui, DE PROPOSITO: animacao simples nao
//!    precisa de uma tela TUI inteira. O Terminal.Gui esta instalado no molde e
//!    serve para o aplicativo de tela cheia (janelas, botoes, menus); para
//!    escrever devagar e trocar quadro, Console basta e roda em qualquer lugar --
//!    inclusive dentro do painel do Terminus e de um \`dotnet run\` redirecionado.
//! 2. O desenho volta ao mesmo lugar com codigo ANSI (\`\\e[{n}A\` sobe n linhas),
//!    e nao com Console.SetCursorPosition: o ANSI funciona tambem quando a saida
//!    esta redirecionada, e e o mesmo que o Konsole e o xterm.js entendem.
//! 3. QUANDO A SAIDA NAO E UM TERMINAL (redirecionada para arquivo ou para outro
//!    programa), a animacao imprime os quadros um embaixo do outro em vez de
//!    apagar e redesenhar. Sem isso, um \`dotnet run > log.txt\` encheria o arquivo
//!    de lixo de escape. Medido: e o que torna esta classe testavel.

public class Animacao
{
    //! O relogio de toda a classe num lugar so. Trocar aqui muda tudo.
    private const int PausaPadrao = 80;

    private static bool Interativo => !Console.IsOutputRedirected;

    //* ── TEXTO ────────────────────────────────────────────────────────────────

    //* Escreve letra a letra, como maquina de escrever.
    //! Espaco nao gasta pausa: a frase sai no ritmo da fala, e nao aos trancos.
    public void Escrever(string texto, int msPorLetra = 25)
    {
        foreach (char letra in texto)
        {
            Console.Write(letra);
            if (letra != ' ' && msPorLetra > 0 && Interativo)
                Thread.Sleep(msPorLetra);
        }
        Console.WriteLine();
    }

    //* Escreve letra a letra, colorido.
    public void Escrever(string texto, ConsoleColor cor, int msPorLetra = 25)
    {
        Console.ForegroundColor = cor;
        Escrever(texto, msPorLetra);
        Console.ResetColor();
    }

    //* Faz o texto piscar no lugar, e o deixa aceso no fim.
    //! Termina SEMPRE aceso: piscar e enfeite, sumir com o recado nao e.
    public void Piscar(string texto, int vezes = 3, int ms = 250)
    {
        if (!Interativo)
        {
            Console.WriteLine(texto);
            return;
        }
        for (int i = 0; i < vezes; i++)
        {
            Console.Write($"\\r\\x1b[2K{texto}");
            Thread.Sleep(ms);
            Console.Write("\\r\\x1b[2K");
            Thread.Sleep(ms);
        }
        Console.WriteLine(texto);
    }

    //* O rodinha de "carregando", ao lado de um texto, por N segundos.
    public void Girar(string texto, double segundos = 2, int ms = 90)
    {
        string[] passos = ["|", "/", "-", "\\\\"];
        if (!Interativo)
        {
            Console.WriteLine($"{texto} ok");
            return;
        }
        int voltas = (int)(segundos * 1000 / ms);
        for (int i = 0; i < voltas; i++)
        {
            Console.Write($"\\r\\x1b[2K{texto} {passos[i % passos.Length]}");
            Thread.Sleep(ms);
        }
        Console.WriteLine($"\\r\\x1b[2K{texto} ok");
    }

    //* Uma barra de progresso, desenhada no lugar. Chame dentro do seu laco.
    //! Nao faz o laco por voce: quem sabe quanto ja andou e o seu codigo.
    public void Barra(int atual, int total, int largura = 30, string texto = "")
    {
        if (total <= 0)
            return;
        int cheio = (int)Math.Round((double)atual / total * largura);
        string desenho = new string('#', cheio) + new string('.', largura - cheio);
        int pct = (int)Math.Round((double)atual / total * 100);
        string linha = $"{texto}[{desenho}] {pct,3}%";
        if (Interativo)
            Console.Write($"\\r\\x1b[2K{linha}");
        else
            Console.WriteLine(linha);
        if (atual >= total && Interativo)
            Console.WriteLine();
    }

    //* Conta de um numero ao outro, no mesmo lugar.
    public void Contar(int de, int ate, int ms = 60, string molde = "{0}")
    {
        int passo = ate >= de ? 1 : -1;
        for (int n = de; passo > 0 ? n <= ate : n >= ate; n += passo)
        {
            string linha = string.Format(molde, n);
            if (Interativo)
            {
                Console.Write($"\\r\\x1b[2K{linha}");
                Thread.Sleep(ms);
            }
            else
            {
                Console.WriteLine(linha);
            }
        }
        if (Interativo)
            Console.WriteLine();
    }

    //* ── QUADROS ASCII ────────────────────────────────────────────────────────

    //* Roda uma lista de desenhos em sequencia, no mesmo lugar da tela.
    //! \`vezes = 0\` roda para sempre, ate alguem apertar uma tecla. A tecla e
    //!   consumida antes de sair, senao ela sobraria no proximo Console.ReadLine.
    public void Animar(string[] quadros, int ms = PausaPadrao, int vezes = 1)
    {
        if (quadros.Length == 0)
            return;

        if (!Interativo)
        {
            //! saida redirecionada: imprime em sequencia, sem apagar nada
            foreach (string q in quadros)
                Console.WriteLine(q);
            return;
        }

        Console.CursorVisible = false;
        try
        {
            for (int volta = 0; vezes == 0 || volta < vezes; volta++)
            {
                foreach (string quadro in quadros)
                {
                    string[] linhas = quadro.Replace("\\r\\n", "\\n").Split('\\n');
                    foreach (string l in linhas)
                        Console.WriteLine($"\\x1b[2K{l}");
                    Thread.Sleep(ms);

                    bool ultimo = vezes != 0 && volta == vezes - 1 && quadro == quadros[^1];
                    if (!ultimo)
                        Console.Write($"\\x1b[{linhas.Length}A"); // sobe e desenha por cima

                    if (vezes == 0 && Console.KeyAvailable)
                    {
                        Console.ReadKey(true);
                        return;
                    }
                }
            }
        }
        finally
        {
            Console.CursorVisible = true;
        }
    }

    //* Quebra um texto em quadros. E o jeito mais rapido de escrever uma animacao:
    //* desenhe os quadros um embaixo do outro, separados por uma linha de ---.
    public string[] Quadros(string tudo, string separador = "---")
    {
        var saida = new List<string>();
        var atual = new List<string>();
        foreach (string linha in tudo.Replace("\\r\\n", "\\n").Split('\\n'))
        {
            if (linha.Trim() == separador)
            {
                saida.Add(string.Join("\\n", atual));
                atual.Clear();
            }
            else
            {
                atual.Add(linha);
            }
        }
        saida.Add(string.Join("\\n", atual));
        //! quadro vazio (separador no comeco ou no fim) nao vira pausa em branco
        return saida.Where(q => q.Trim().Length > 0).ToArray();
    }

    //* Le os quadros de um arquivo .txt, com o mesmo separador.
    //!
    //! ⚠️ PROCURA EM DOIS LUGARES, e isto NAO e zelo — foi medido. Caminho
    //!   relativo resolve a partir da PASTA EM QUE VOCE RODOU, nao da pasta do
    //!   projeto: um \`dotnet run --project programa1\` de fora da pasta estoura com
    //!   \`DirectoryNotFoundException\` apontando para um lugar que ninguem escreveu.
    //!   Entao: tenta o caminho como veio, e depois ao lado do programa compilado
    //!   (que e onde o .txt de \`comum/quadros/\` cai, pelo Content do .csproj).
    //! A frase de erro nomeia OS DOIS lugares, porque "nao achei" sem dizer onde
    //!   procurou e o que faz a pessoa procurar no lugar errado.
    public string[] QuadrosDeArquivo(string caminho, string separador = "---")
    {
        string aoLado = Path.Combine(AppContext.BaseDirectory, caminho);
        string achado =
            File.Exists(caminho) ? caminho
            : File.Exists(aoLado) ? aoLado
            : throw new FileNotFoundException(
                $"Nao achei os quadros. Procurei em:\\n  {Path.GetFullPath(caminho)}\\n  {aoLado}\\n"
                + "Ponha o .txt em comum/quadros/ — de la ele viaja junto com o programa.");
        return Quadros(File.ReadAllText(achado), separador);
    }

    //* Todos os quadros com a mesma altura, para o desenho nao "pular" na tela.
    //! Sem isto, um quadro de 3 linhas seguido de um de 5 deixa duas linhas
    //!   velhas na tela -- o defeito mais comum de animacao ASCII feita a mao.
    public string[] Alinhar(string[] quadros)
    {
        int altura = quadros.Max(q => q.Split('\\n').Length);
        return quadros
            .Select(q =>
            {
                var linhas = q.Split('\\n').ToList();
                while (linhas.Count < altura)
                    linhas.Add("");
                return string.Join("\\n", linhas);
            })
            .ToArray();
    }
}
`;

const TELA_ANIMADA_CS = `using Terminal.Gui.App;
using Terminal.Gui.ViewBase;
using Terminal.Gui.Views;

namespace comum;

public class TelaAnimada
{
    public void Rodar(string[] quadros, int ms = 120)
    {
        using IApplication app = Application.Create();
        app.Init();
        using Window janela = new() { Title = "animacao (Esc para sair)" };
        Label tela = new() { X = Pos.Center(), Y = Pos.Center(), Text = quadros[0] };
        janela.Add(tela);
        int i = 0;
        app.AddTimeout(TimeSpan.FromMilliseconds(ms), () =>
        {
            i = (i + 1) % quadros.Length;
            tela.Text = quadros[i];
            return true;
        });
        app.Run(janela);
    }
}
`;

//! Três quadros de um boneco acenando: é o menor exemplo que mostra as duas
//! regras do formato — um `---` sozinho separa quadros, e a `Alinhar` iguala a
//! altura para o desenho não pular na tela.
const QUADROS_EXEMPLO = `  o
 /|\\
 / \\
---
  o
 /|\\
 | |
---
 \\o/
  |
 / \\
`;

//! O `.txt` precisa VIAJAR com o programa compilado. Sem isto a animação acha o
//! arquivo quando se roda de dentro da pasta e não acha quando se roda de fora —
//! medido, e a falha é um `DirectoryNotFoundException` apontando para um lugar
//! que ninguém escreveu. `LinkBase` preserva a subpasta dentro da saída.
const CONTENT_QUADROS = `
  <ItemGroup>
    <Content Include="quadros/**/*.txt" CopyToOutputDirectory="PreserveNewest" LinkBase="quadros" />
  </ItemGroup>

</Project>`;

async function moldeCsharp(destino: string): Promise<void> {
  //* No .NET 10 o `dotnet new sln` gera .slnx, com o nome da pasta de destino.
  await dotnet(["new", "sln", "-o", destino]);

  await fs.writeFile(
    path.join(destino, "Directory.Build.props"),
    `<Project>
  <!-- Toda compilação (bin e obj, de todos os projetos) sai em saida/. -->
  <PropertyGroup>
    <ArtifactsPath>$(MSBuildThisFileDirectory)saida</ArtifactsPath>
  </PropertyGroup>
</Project>
`,
    "utf8",
  );
  //! O `dotnet new` não deixa .gitignore. Sem ele, o primeiro `git add` leva a
  //! compilação inteira junto — e com o ArtifactsPath ela é UMA pasta.
  await fs.writeFile(path.join(destino, ".gitignore"), "saida/\n", "utf8");

  await dotnet(["new", "classlib", "-o", path.join(destino, "comum")]);
  await dotnet(["new", "console", "-o", path.join(destino, "programa1")]);
  await dotnet(["sln", destino, "add", path.join(destino, "comum"), path.join(destino, "programa1")]);
  await dotnet(["add", path.join(destino, "programa1"), "reference", path.join(destino, "comum")]);

  //* O Terminal.Gui e as duas classes de animação (ver o bloco acima).
  const comum = path.join(destino, "comum");
  await dotnet(["add", comum, "package", "Terminal.Gui"]);
  await fs.mkdir(path.join(comum, "quadros"));
  await fs.writeFile(path.join(comum, "Animacao.cs"), ANIMACAO_CS, "utf8");
  await fs.writeFile(path.join(comum, "TelaAnimada.cs"), TELA_ANIMADA_CS, "utf8");
  await fs.writeFile(path.join(comum, "quadros", "exemplo.txt"), QUADROS_EXEMPLO, "utf8");

  //! O `dotnet new classlib` escreve o .csproj; a linha que faz o .txt viajar é
  //! emendada aqui, e não por um .csproj escrito à mão — escrever o arquivo
  //! inteiro fixaria o TargetFramework de hoje, que é o que o item 1 do
  //! cabeçalho deste arquivo existe para não fazer.
  const csproj = path.join(comum, "comum.csproj");
  const texto = await fs.readFile(csproj, "utf8");
  await fs.writeFile(csproj, texto.replace("\n</Project>", CONTENT_QUADROS), "utf8");
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
