//! O orquestrador da casca.
//!
//! Não desenha nada: importa os painéis, liga os eventos aos botões e às teclas,
//! e roda a partida. Quem procura COMO um painel funciona vai no arquivo dele.

import {
  $, abrirArquivo, alternarPainel, api, avisar, definirPainel, estado,
  ligarDivisor, shell, terminal,
} from "./nucleo-da-casca.js";
import { aparencia } from "./aparencia-da-casca.js";
import { definirDoca, doca, ligarDivisorTerminal } from "./doca-do-terminal.js";
import {
  alternarLateral, definirLateral, definirLateralAberta, definirPainelLateral,
  lateralAberta, painelLateral,
} from "./barra-lateral.js";
import {
  abrirMenu, abrirPaleta, abrirRecente, alternarPasta, atualizarArvore,
  atualizarRecentes, comecarNovo, comecarRenomear, desenharArvore, escolherProjeto,
  excluir, fecharMenu, paleta,
} from "./arvore-de-arquivos.js";
// Importado pelo efeito: o módulo do fluxo liga os próprios botões ao carregar
// (ADR 0027). `detectarFluxo` é o que a partida chama depois de abrir a pasta.
import { detectarFluxo } from "./fluxo-de-projeto.js";


$("act").addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-p]");
  if (!b) return;
  const alvo = b.dataset["p"]!;

  // No ícone já aberto, o clique fecha — é como se alterna a lateral sem tirar
  // a mão do mouse.
  if (alvo === painelLateral && lateralAberta) {
    definirLateralAberta(false);
    return;
  }
  definirPainelLateral(alvo);
  definirLateralAberta(true);
  definirLateral(alvo);
});

$("sideAcoes").addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-acao]");
  if (!b) return;
  switch (b.dataset["acao"]) {
    case "novo-arquivo":
      comecarNovo("arquivo");
      break;
    case "nova-pasta":
      comecarNovo("pasta");
      break;
    case "atualizar":
      void atualizarArvore();
      break;
    case "abrir-pasta":
      void escolherProjeto();
      break;
  }
});

$("lateral").addEventListener("click", (ev) => {
  const alvo = ev.target as HTMLElement;

  const recente = alvo.closest<HTMLElement>("[data-recente]");
  if (recente) return void abrirRecente(recente.dataset["recente"]!);
  const esquecer = alvo.closest<HTMLElement>("[data-esquecer]");
  if (esquecer) {
    return void api.esquecerPasta(esquecer.dataset["esquecer"]!).then((r) => {
      if (r.ok) estado.recentes = r.valor;
      desenharArvore();
    });
  }

  const pasta = alvo.closest<HTMLElement>("[data-pasta]");
  if (pasta) return void alternarPasta(pasta.dataset["pasta"]!);
  const arq = alvo.closest<HTMLElement>("[data-arquivo]");
  if (arq) {
    estado.pastaAlvo = null;
    return void abrirArquivo(arq.dataset["arquivo"]!);
  }
});

$("lateral").addEventListener("contextmenu", (ev) => {
  const no = (ev.target as HTMLElement).closest<HTMLElement>("[data-no]");
  if (!estado.projeto) return;
  ev.preventDefault();
  if (no) {
    const caminho = no.dataset["no"]!;
    abrirMenu(ev.clientX, ev.clientY, caminho, no.hasAttribute("data-pasta"));
  } else {
    // Clique no vazio da lateral: o alvo é a raiz do estado.projeto.
    abrirMenu(ev.clientX, ev.clientY, estado.projeto.raiz, true);
  }
});

//? O BOTÃO ↗ — Decisão de 19/08: ele abre o KONSOLE
//!
//! 1. Era a segunda janela do Electron da ADR 0031: uma cópia da nossa própria
//!    tela do terminal, com a nossa linha de comando e os nossos limites.
//! 2. O pedido do autor era o contrário disso — trocar o terminal do Terminus
//!    pelo Konsole. Embutir o Konsole nesta janela não é possível (o KPart é Qt
//!    e a sessão é Wayland; medido em `motor-do-shell-pty.ts`), mas ABRIR o
//!    Konsole de verdade é, e é melhor que a cópia: ele tem as abas, o perfil e
//!    os atalhos que a pessoa já configurou.
//! 3. Abre na pasta em que o terminal embutido está AGORA, não na raiz do
//!    projeto. Continuar de onde se estava é o ponto de sair para outra janela.
$("btSoltarTerminal").addEventListener("click", () => {
  void api.shell.emKonsole().then((r) => {
    if (r.ok) avisar(`Konsole aberto em ${r.valor}`);
    //! O `konsole` pode não existir na máquina. Dizer isso é melhor do que um
    //! botão que não faz nada e não explica.
    else avisar(`não consegui abrir o Konsole: ${r.erro}`);
  });
});

$("btLimpar").addEventListener("click", () => terminal.limpar());
$("btFecharPainel").addEventListener("click", () => definirPainel(false));
$("btPainel").addEventListener("click", () => alternarPainel());
// A marca do dono, à direita da barra: abre no navegador do sistema, porque o
// `setWindowOpenHandler` da janela recusa abrir link aqui dentro.
$("linkGithub").addEventListener("click", (ev) => {
  ev.preventDefault();
  window.open(`https://github.com/${$("nomeGithub").textContent?.trim() ?? ""}`, "_blank");
});


// Atalhos globais, nos mesmos gestos do VSCodium — é o que a mão já sabe.
window.addEventListener("keydown", (ev) => {
  const mod = ev.ctrlKey || ev.metaKey;

  // Com a paleta aberta ela é quem manda: o teclado inteiro pertence à busca,
  // e um Ctrl+N daqui criaria arquivo por trás dela.
  if (paleta.aberta) {
    if (mod && ev.key.toLowerCase() === "p") {
      ev.preventDefault();
      paleta.fechar();
    }
    return;
  }

  // F5 roda o projeto, que é o gesto que a mão já tem de qualquer IDE. É o mesmo
  // caminho do botão Rodar da barra — um só lugar decide a linha (ADR 0030).
  if (ev.key === "F5") {
    ev.preventDefault();
    $("btRodar").click();
    return;
  }

  if (mod && ev.key === "`") {
    ev.preventDefault();
    alternarPainel();
    return;
  }
  if (mod && ev.key.toLowerCase() === "b") {
    ev.preventDefault();
    alternarLateral();
    return;
  }
  if (mod && ev.key.toLowerCase() === "p") {
    ev.preventDefault();
    void abrirPaleta();
    return;
  }
  if (mod && ev.key.toLowerCase() === "n") {
    ev.preventDefault();
    comecarNovo("arquivo");
    return;
  }
  if (ev.key === "Escape") fecharMenu();

  // F2 e Delete valem sobre a linha da árvore que está com o foco. Dentro do
  // editor, Delete apaga texto — roubar isso apagaria arquivo por engano.
  const linha = document.activeElement?.closest<HTMLElement>("#lateral [data-no]");
  const selecionado = linha?.dataset["no"];
  if (!selecionado) return;

  if (ev.key === "F2") {
    ev.preventDefault();
    comecarRenomear(selecionado);
  } else if (ev.key === "Delete") {
    ev.preventDefault();
    void excluir(selecionado);
  }
});

$("btFechar").addEventListener("click", () => api.janela.fechar());
$("btMinimizar").addEventListener("click", () => api.janela.minimizar());
$("btMaximizar").addEventListener("click", () => api.janela.alternarMaximo());


/* ============================ partida ============================ */

async function iniciar(): Promise<void> {
  definirLateral("explorer");

  // Papel de parede e tema antes de qualquer desenho: trocar de tema depois da
  // primeira pintura faria a tela piscar na cor errada na abertura.
  await aparencia.carregar();

  // A lateral abre fechada se foi assim que ficou da última vez.
  definirLateralAberta(localStorage.getItem("terminus.lateralAberta") !== "0");

  ligarDivisor({
    divisor: $("divLateral"),
    painel: $("side"),
    eixo: "largura",
    borda: "inicio",
    padrao: 250,
    min: 170,
    max: () => window.innerWidth - 520,
    chave: "terminus.larguraLateral",
  });

  // Os dois painéis da ADR 0006. O teto deixa sempre um pedaço utilizável de
  // editor: um painel que pode engolir a tela inteira recria o problema que
  // esta mudança veio resolver.
  // O divisor do terminal é ciente da doca (ADR 0025); os botões do cabeçalho
  // trocam a posição, e a doca salva é aplicada agora.
  ligarDivisorTerminal();
  $("btDocaBaixo").addEventListener("click", () => definirDoca("baixo"));
  $("btDocaDireita").addEventListener("click", () => definirDoca("direita"));
  $("btDocaEsquerda").addEventListener("click", () => definirDoca("esquerda"));
  definirDoca(doca);
  
  // `terminus ~/estado.projeto` já abre a pasta; sem argumento, volta a última
  // pasta aberta. Os estado.recentes vêm junto para a tela vazia não nascer sem eles.
  await atualizarRecentes();
  const inicial = await api.projetoInicial();
  if (inicial.ok && inicial.valor) {
    estado.projeto = inicial.valor;
    terminal.nota(`pasta aberta: ${inicial.valor.raiz}`);
  } else if (!inicial.ok) {
    // A pasta lembrada existe mas não abriu (permissão, disco removido). O
    // Explorer já mostra a tela vazia; sem uma palavra, ela pareceria só
    // esquecimento. O painel **não** abre sozinho: é partida do aplicativo,
    // não resultado de algo que a pessoa pediu agora.
    terminal.erro(`não reabri a última pasta: ${inicial.erro}\r\n`);
    avisar("não consegui reabrir a última pasta");
  }
  desenharArvore();

  // O Neovim nasceu na home; aponta ele para a corrida aberta (ADR 0025).
  if (estado.projeto) api.neovim.cd(estado.projeto.raiz);

  // O chip da barra responde "que linguagem é esta pasta" já na abertura, sem
  // esperar alguém clicar (ADR 0027).
  void detectarFluxo();

  //? A PARTIDA DO SHELL (19/08)
  //!
  //! 1. Por ÚLTIMO, e depois de `definirDoca`: o shell nasce com o número de
  //!    colunas e linhas da tela, e antes da doca ser aplicada a tela ainda não
  //!    tem a medida final. Nascer torto significaria a primeira tela do bash
  //!    quebrada, que é a primeira coisa que a pessoa vê.
  //! 2. Na pasta aberta, ou na home quando não há pasta — a mesma regra que o
  //!    Neovim segue logo acima.
  //! 3. O histórico não é lido de lugar nenhum: quem guarda é o bash, no
  //!    `.bash_history`, o MESMO que o Konsole usa. Antes havia uma lista nossa
  //!    no `config.json`, e duas listas de "o que eu já digitei" é pior que uma.
  api.shell.aoSaida((d) => terminal.escrever(d));

  const subirShell = (): void => {
    shell.aoDigitar = (dados) => api.shell.enviar(dados);
    api.shell.iniciar(estado.projeto?.raiz ?? "", terminal.cols, terminal.rows);
  };

  //! `exit` e Ctrl+D fecham o shell, e isso é legítimo — o Konsole fecharia a
  //! aba. Aqui a "aba" é a janela do editor inteiro, que não pode fechar junto.
  //! Sem recado o terminal ficaria mudo e pareceria travado; com um recado que
  //! não diz como voltar, ficaria inútil. Então a tecla seguinte abre outro, que
  //! é o gesto que já está na mão de quem acabou de apertar alguma coisa.
  api.shell.aoEncerrar(() => {
    shell.aoDigitar = () => {
      terminal.nota("abrindo outro terminal…");
      subirShell();
    };
    terminal.nota("o terminal foi encerrado — aperte qualquer tecla para abrir outro");
  });

  subirShell();

  // O ambiente do laboratório saiu da
  // barra de estado com a virada da ADR 0025: o Terminus não é mais a IDE do
  // laboratório, e essas versões eram informação de lá.
}

void iniciar();

