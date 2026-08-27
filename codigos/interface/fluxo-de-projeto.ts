//? FLUXO DE PROJETO — Decisão sobre o botão que corta o "New Project" 17/08/2026
//!
//! 1. O botão faz DUAS coisas, e é de propósito que sejam o mesmo botão:
//!    a) começa um projeto (a pasta e os arquivos que fazem o código rodar);
//!    b) DIZ ao Terminus, e a quem olha a barra, qual linguagem está aberta.
//! 2. São a mesma pergunta feita duas vezes. No VSCode a pessoa escolhe a
//!    linguagem no assistente, e depois o editor descobre de novo pela extensão
//!    do arquivo. Aqui a resposta é dada uma vez e fica na tela.
//! 3. O rótulo nunca some. Chip sem texto vira enfeite, e a metade "que
//!    linguagem é esta pasta" deixa de ser respondida.

import type { Fluxo } from "../compartilhado/tipos.js";
import { $, abrirArquivo, abrirPainel, api, estado, terminal } from "./nucleo-da-casca.js";
import { assumirProjeto } from "./arvore-de-arquivos.js";

const NOME: Record<Fluxo, string> = { cpp: "C++", python: "Python", csharp: "C#" };

let fluxoAtual: Fluxo | null = null;

//* A linguagem que a casca considera aberta agora. `null` = ainda não se sabe.
export function fluxo(): Fluxo | null {
  return fluxoAtual;
}

//* Escreve o estado no chip da barra. É a única coisa que pinta o botão.
export function definirFluxo(novo: Fluxo | null): void {
  fluxoAtual = novo;
  $("rotuloFluxo").textContent = novo ? NOME[novo] : "Fluxo";
  $("btFluxo").classList.toggle("marcado", novo !== null);
  $("btFluxo").title = novo
    ? `Trabalhando em ${NOME[novo]} — clique para começar outro projeto`
    : "Linguagem do trabalho — clique para começar um projeto";

  //! Rodar depende das DUAS coisas: saber a linguagem e ter pasta. Sem pasta não
  //! há o que olhar para decidir a linha.
  const podeRodar = novo !== null && estado.projeto !== null;
  ($("btRodar") as HTMLButtonElement).disabled = !podeRodar;
  $("btRodar").title = podeRodar
    ? `Rodar este projeto ${NOME[novo!]}`
    : "Abra uma pasta e marque a linguagem para poder rodar";
}

/**
 * Descobre a linguagem da pasta aberta pelo que ela tem dentro.
 *
 * Sem arquivo de marca (um `.terminus` na raiz), de propósito: obrigaria toda
 * pasta vinda de fora a ganhar um arquivo do editor só para ser reconhecida. A
 * contagem de extensões responde também para projeto que nunca passou por aqui.
 */
export async function detectarFluxo(): Promise<void> {
  if (!estado.projeto) return definirFluxo(null);

  const r = await api.arquivosDoProjeto(estado.projeto.raiz);
  if (!r.ok) return definirFluxo(null);

  const conta: Record<Fluxo, number> = { cpp: 0, python: 0, csharp: 0 };
  for (const a of r.valor) {
    const ponto = a.lastIndexOf(".");
    const ext = ponto < 0 ? "" : a.slice(ponto).toLowerCase();
    if (ext === ".cpp" || ext === ".cc" || ext === ".cxx" || ext === ".hpp" || ext === ".hh") conta.cpp++;
    else if (ext === ".py") conta.python++;
    //! O `.csproj` pesa como se fosse muitos arquivos, e não como um. Numa pasta
    //! C# quase todo `.cs` vive dentro de um projeto, e o projeto é a prova mais
    //! forte do que a pasta é — mais forte do que contar arquivo por arquivo.
    else if (ext === ".cs") conta.csharp++;
    else if (ext === ".csproj" || ext === ".sln" || ext === ".slnx") conta.csharp += 100;
  }

  //! Empate entre C++ e Python vai para C++: quase todo projeto C++ tem um
  //! script Python de apoio, e quase nenhum projeto Python tem um .cpp por
  //! acaso. A ordem abaixo é essa regra escrita.
  const ordem: Fluxo[] = ["csharp", "cpp", "python"];
  let vencedor: Fluxo | null = null;
  for (const f of ordem) {
    if (conta[f] > 0 && (vencedor === null || conta[f] > conta[vencedor])) vencedor = f;
  }
  definirFluxo(vencedor);
}

/* ------------------------------- o menu ---------------------------------- */

function fecharMenuFluxo(): void {
  $("menuFluxo").classList.add("oculto");
}

function abrirMenuFluxo(): void {
  const menu = $("menuFluxo");
  menu.innerHTML = `
    <button data-f="novo-cpp">Novo projeto C++<span class="atalho">console</span></button>
    <button data-f="novo-python">Novo projeto Python<span class="atalho">console</span></button>
    <button data-f="novo-csharp">Novo projeto C#<span class="atalho">solução</span></button>
    <hr>
    <button data-f="marcar-cpp">Marcar esta pasta como C++</button>
    <button data-f="marcar-python">Marcar esta pasta como Python</button>
    <button data-f="marcar-csharp">Marcar esta pasta como C#</button>`;
  menu.classList.remove("oculto");

  // Ancorado no botão, e medido só depois de visível — escondido a medida sai
  // zerada e o menu nasceria fora da janela.
  const b = $("btFluxo").getBoundingClientRect();
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(b.left, window.innerWidth - r.width - 8)}px`;
  menu.style.top = `${b.bottom + 4}px`;
}

//* Cria a pasta do molde, abre o projeto e põe o arquivo principal no editor.
async function novoProjeto(escolhido: Fluxo): Promise<void> {
  const r = await api.novoProjeto(escolhido);
  if (!r.ok) {
    terminal.erro(`${r.erro}\r\n`);
    return;
  }
  if (!r.valor) return; //* cancelou o diálogo — nada aconteceu, nada a dizer.

  //! Passa pelo mesmo funil de sempre: árvore, recentes, pasta do terminal e o
  //! `cd` do Neovim. Abrir a pasta "por fora" aqui deixaria o terminal digitando
  //! dentro do projeto anterior — o engano mais fácil de cometer e o mais
  //! difícil de notar.
  await assumirProjeto(r.valor.projeto);
  //? ⚠️ `api.neovim.cd(...)` saiu daqui em 26/08/2026 com o motor. O Monaco não tem
  //?   diretório de trabalho, e o arquivo novo é aberto por caminho absoluto logo abaixo.

  //! Depois do funil, e não antes: `assumirProjeto` dispara a troca de pasta, e
  //! a troca de pasta manda o chip se redetectar pelas extensões. Marcar antes
  //! seria sobrescrito pela detecção.
  definirFluxo(r.valor.fluxo);
  terminal.nota(`projeto ${NOME[escolhido]} criado em ${r.valor.projeto.raiz}`);
  await abrirArquivo(r.valor.principal);
}

//* A pasta aberta mudou: o chip volta a perguntar ao disco o que ela é.
window.addEventListener("terminus:projeto-trocou", () => void detectarFluxo());

/* ------------------------------- o Rodar --------------------------------- */

//? POR QUE O BOTÃO NÃO EXECUTA NADA SOZINHO
//!
//! 1. Ele pergunta ao sistema QUAL é a linha, e depois a manda pela mesma porta
//!    da linha de comando — como se tivesse sido digitada.
//! 2. Assim o que aparece na tela é exatamente o que rodou. Um botão que executa
//!    por baixo mostra um resultado sem mostrar a causa, e quem está aprendendo
//!    fica sem o comando para repetir depois no terminal do sistema.
//! 3. A seta ↑ também recebe a linha, pelo mesmo motivo.
async function rodarProjeto(): Promise<void> {
  if (!estado.projeto || fluxoAtual === null) return;

  const r = await api.comoRodar(estado.projeto.raiz, fluxoAtual);
  abrirPainel();

  //! O erro aqui não é falha do programa: é a frase que diz o que FALTA na pasta
  //! (sem projeto, sem arquivo, vários candidatos). Vai como nota, e não em
  //! vermelho, porque não quebrou nada — só não dá para adivinhar.
  if (!r.ok) {
    terminal.nota(r.erro);
    return;
  }

  terminal.nota(r.valor.porque);
  //! A linha é ESCRITA no terminal, e não executada por fora: desde 19/08 o
  //! terminal é um shell de verdade, então o botão faz o que a mão faria —
  //! digita e aperta Enter. O bash ecoa a linha sozinho, e ela entra no
  //! histórico dele, alcançável pela seta ↑ depois.
  const enviada = await api.shell.linha(r.valor.linha);
  if (enviada.ok && !enviada.valor) {
    terminal.nota("o terminal está ocupado — pare o que está rodando e aperte Rodar de novo");
  }
  terminal.focar();
}

$("btRodar").addEventListener("click", () => void rodarProjeto());

$("btFluxo").addEventListener("click", (ev) => {
  ev.stopPropagation();
  if ($("menuFluxo").classList.contains("oculto")) abrirMenuFluxo();
  else fecharMenuFluxo();
});

$("menuFluxo").addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-f]");
  if (!b) return;
  fecharMenuFluxo();

  switch (b.dataset["f"]) {
    case "novo-cpp":
      void novoProjeto("cpp");
      break;
    case "novo-python":
      void novoProjeto("python");
      break;
    case "novo-csharp":
      void novoProjeto("csharp");
      break;
    //! Marcar só troca o rótulo, e não escreve nada em disco. É a saída para a
    //! pasta que a contagem de extensões leu errado — biblioteca C++ com muito
    //! script de apoio, projeto Python com uma extensão em C.
    case "marcar-cpp":
      definirFluxo("cpp");
      break;
    case "marcar-python":
      definirFluxo("python");
      break;
    case "marcar-csharp":
      definirFluxo("csharp");
      break;
  }
});

window.addEventListener("click", (ev) => {
  if (!(ev.target as HTMLElement).closest("#menuFluxo, #btFluxo")) fecharMenuFluxo();
});
window.addEventListener("blur", fecharMenuFluxo);
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") fecharMenuFluxo();
});
