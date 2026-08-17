//! O orquestrador da casca.
//!
//! Não desenha nada: importa os painéis, liga os eventos aos botões e às teclas,
//! e roda a partida. Quem procura COMO um painel funciona vai no arquivo dele.

import {
  $, abrirArquivo, alternarPainel, api, avisar, definirPainel, estado,
  ligarDivisor, terminal,
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
import {
  definirHistorico, definirRodando, ligarLinhaDeComando, sincronizarPastaCmd,
} from "./linha-de-comando.js";

// A linha de comando não conhece mais a casca (ADR 0031): recebe a tela onde
// escrever e um jeito de perguntar qual pasta está aberta. É a primeira coisa
// feita, antes de qualquer clique poder chegar nela.
ligarLinhaDeComando(terminal, () => estado.projeto);
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

// O terminal em janela própria (ADR 0031). Com ele solto, o painel daqui fecha:
// duas cópias do mesmo terminal na tela ao mesmo tempo só confundem qual é a que
// recebe o que se digita.
$("btSoltarTerminal").addEventListener("click", () => api.terminal.soltar());
api.terminal.aoMudar((solto) => {
  $("btSoltarTerminal").classList.toggle("on", solto);
  definirPainel(!solto);
  if (solto) avisar("terminal aberto em janela própria — feche a janela para trazer de volta");
});

$("btParar").addEventListener("click", () => api.parar());
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
  definirRodando(false);

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

  // A linha de comando precisa saber onde está antes de alguém digitar, e o
  // histórico é lido do config.json — não do localStorage, ver `config.ts`.
  await sincronizarPastaCmd();
  const h = await api.historicoDeComandos();
  if (h.ok) definirHistorico(h.valor);


  // O ambiente do laboratório saiu da
  // barra de estado com a virada da ADR 0025: o Terminus não é mais a IDE do
  // laboratório, e essas versões eram informação de lá.
}

void iniciar();

