//! Núcleo da casca — o que TODOS os painéis usam.
//!
//! Existe para o resto poder ser cortado em arquivos por assunto. Quem mexe num
//! painel não precisa ler isto; quem mexe aqui mexe em todo mundo.

import type { NoArquivo, ProjetoAberto, Resultado } from "../compartilhado/tipos.js";
import { montarEditor } from "./editor-monaco.js";
import { desenharTelaInicial } from "./tela-inicial.js";
import { abrirNoEditor, sincronizarTelaVazia } from "./estado-do-editor.js";
import { ligarEdicaoSeguinte } from "./edicao-seguinte.js";
import { ligarSugestaoInline } from "./sugestao-inline.js";
import { TerminalSaida } from "./tela-do-terminal.js";

//! `$` e `api` mudaram de casa para `base-da-tela.ts`, que é o que a janela do
//! terminal solto também usa (ADR 0031). Ficam reexportados aqui para nenhum
//! import antigo precisar mudar — este arquivo continua sendo a porta da casca.
export { $, api } from "./base-da-tela.js";
import { $, api } from "./base-da-tela.js";


//! `esc` MUDOU DE CASA em 26/08 e é reexportado daqui: ele era deste arquivo, e a tela
//!   inicial (`tela-inicial.ts`) precisava dele — mas o núcleo IMPORTA a tela inicial, e
//!   importá-lo de volta fechou um CICLO que o M2 do portão pegou na hora.
//! Ele foi para `base-da-tela.ts`, que é onde `$` e `api` já moram: utilitário de base, sem
//!   dependência de ninguém. A reexportação existe para nenhum import antigo precisar mudar.
export { esc } from "./base-da-tela.js";


//* O estado que mais de um painel lê e escreve.
//* É um objeto, e não variáveis soltas, porque módulo de JavaScript não deixa
//* quem importa trocar o valor de uma variável — só o conteúdo de um objeto.
export const estado: {
  projeto: ProjetoAberto | null;
  pastaAlvo: string | null;
  renomeando: { modo: "arquivo" | "pasta" | "renomear"; dir: string; alvo?: string } | null;
  recentes: string[];
} = { projeto: null, pastaAlvo: null, renomeando: null, recentes: [] };

//* As pastas abertas na árvore, por caminho absoluto, com o que há dentro.
export const expandidas = new Map<string, NoArquivo[]>();

//* O MONACO é o editor: nasce aqui, ocupando a área de escrita.
//! ⚠️ ATÉ 25/08 ESTA LINHA SUBIA O NEOVIM. Duas coisas mudaram de natureza:
//!   1. O editor nasce SEM ARQUIVO. O Neovim desenhava o próprio painel de
//!      abertura, e por isso a tela vazia da casca (`#vazio`) ficava escondida
//!      para sempre. Agora ela volta a ter função: sem pasta aberta, é ela que
//!      aparece — e o editor só ganha modelo quando alguém abre um arquivo.
//!   2. O editor não é mais um processo. Não há socket, não há PTY, não há
//!      segundo programa para morrer junto com a janela.
document.body.classList.add("motor-monaco");
const hostEditor = document.createElement("div");
hostEditor.id = "editorHost";
$("stage").appendChild(hostEditor);
//! O host nasce AGORA, síncrono — quem procura `#editorHost` o encontra desde o
//!   primeiro instante. O editor DENTRO dele chega depois, porque os serviços do
//!   VSCode sobem de forma assíncrona (ver `editor-monaco.ts`).
sincronizarTelaVazia();

//* Sobe o editor. A partida espera por isto antes de ligar abas e comandos.
//! ⚠️ POR QUE ISTO NÃO É UM `await` NO TOPO DO MÓDULO: `nucleo-da-casca` é
//!   importado por quase toda a casca, e um `await` de topo aqui atrasaria a
//!   avaliação de todos eles — a árvore, o terminal e a barra passariam a
//!   esperar por um serviço que nada tem a ver com eles. Quem espera é só quem
//!   precisa: a partida, antes de ligar o que depende do editor.
export async function subirEditor(): Promise<void> {
  await montarEditor(hostEditor);

  //! ⚠️ A SUGESTÃO INLINE É LIGADA AQUI, E NÃO NA CARGA DO MÓDULO — e a ordem
  //!   custou uma tela morta para eu achar. `registerInlineCompletionsProvider`
  //!   pede o `ILanguageFeaturesService`, e no modo standalone **pedir um serviço
  //!   INICIALIZA todos eles com os padrões**. Rodando na carga do módulo, ele
  //!   inicializava antes do nosso `initialize()`, que então estourava com
  //!   *"Services are already initialized"* — e o renderer morria sem uma linha
  //!   no log do main.
  //! A regra que fica: **depois do `initialize()`, nada antes.** Vale para todo
  //!   `monaco.*` que registre ou consulte serviço.
  ligarSugestaoInline();
  //! E a edição seguinte, no mesmo instante e pela mesma razão: depois do `initialize`.
  ligarEdicaoSeguinte();
}


//? O TERMINAL DA CASCA — um shell de verdade (19/08)
//!
//! 1. Era uma tela só: o processo principal rodava o comando por canos comuns e
//!    mandava o texto. Programa nenhum acendia a cor, porque todos perguntam
//!    `isatty` e recebiam "não". Era esse o relato — cor no Konsole, nenhuma
//!    aqui.
//! 2. Agora tem PTY atrás, e por isso as três ligações abaixo existem: o que se
//!    digita SOBE para o shell, a medida da tela é avisada a ele, e o clique num
//!    quadro de traceback continua abrindo o arquivo na linha do erro.
//! 3. As três são a mesma forma que a `vista-do-neovim.ts` já usava. Duas telas,
//!    um desenho só.
export const terminal = new TerminalSaida($("term"), {
  aoAbrirQuadro: ({ arquivo, linha }) => void abrirArquivo(arquivo, linha),
  aoDigitar: (dados) => shell.aoDigitar(dados),
  aoRedimensionar: (cols, rows) => api.shell.redimensionar(cols, rows),
});

//* Para onde vai a tecla digitada no terminal.
//! É um objeto, e não uma função exportada, pelo mesmo motivo do `estado` acima:
//!   quem importa uma função não consegue trocá-la. A partida troca isto para
//!   que, com o shell morto (`exit`, Ctrl+D), a tecla seguinte abra outro em vez
//!   de sumir num processo que não existe mais.
export const shell = {
  aoDigitar: (dados: string): void => api.shell.enviar(dados),
};

//* Abre um arquivo no editor, com o cursor na linha se ela vier.
//* É o caminho único: clique na árvore, Ctrl+P e traceback chegam todos aqui.
//! CONTINUA SENDO UM SÓ, e é o que faz a troca de motor não espalhar: os três
//!   gestos chamavam esta função antes e chamam depois. O que mudou foi o corpo.
//! O erro continua indo para o TERMINAL, e não para uma caixa: é a conduta que
//!   esta casca já tinha, e o §12·3 manda preservá-la mesmo trocando o motor.
export async function abrirArquivo(caminho: string, linha?: number): Promise<void> {
  const erro = await abrirNoEditor(caminho, linha, estado.projeto?.raiz ?? "");
  if (erro) {
    terminal.erro(`${erro}\r\n`);
    abrirPainel();
  }
}

//* Mostra ou esconde o painel do terminal, junto com o divisor dele.
export function definirPainel(aberto: boolean): void {
  $("painel").classList.toggle("oculto", !aberto);
  $("divTerm").classList.toggle("oculto", !aberto);
  $("btPainel").classList.toggle("on", aberto);
  if (aberto) terminal.reajustar();
}

//* Abre o painel SEM roubar o foco — é chamado sozinho quando aparece saída, e
//* roubar o cursor no meio de uma frase seria pior que não mostrar.
export function abrirPainel(): void {
  definirPainel(true);
}

//* Desembrulha um Resultado da porta, mostrando o erro no terminal em vez de
//* sumir com ele em silêncio.
export function ou<T>(r: Resultado<T>, aoFalhar: T): T {
  if (r.ok) return r.valor;
  terminal.erro(`${r.erro}\r\n`);
  abrirPainel();
  return aoFalhar;
}

//* Abre e fecha o painel do terminal, e ao ABRIR põe o cursor DENTRO dele —
//* quem aperta o atalho vai digitar.
//! O foco vai para o xterm, e não para um campo abaixo dele: desde 19/08 é o
//!   próprio terminal que recebe a digitação, como no Konsole.
export function alternarPainel(): void {
  const abrindo = $("painel").classList.contains("oculto");
  definirPainel(abrindo);
  if (abrindo) terminal.focar();
}

//* Recado de algo que aconteceu fora da vista. Vai para o terminal porque a
//* barra de estado não tem mais campo de recado — e nada pode ser engolido.
export function avisar(texto: string): void {
  terminal.nota(texto);
}

//* A marca da barra de título saiu: a barra é minimalista, e o sigilo já está
//* no ícone da janela e no papel de parede. Só a tela vazia mantém a figura.
//? ⚠️ A MARCA SAIU DA TELA INICIAL em 26/08 — ver `tela-inicial.ts`.
//! Ela anunciava uma AUSÊNCIA ("Nenhuma pasta aberta") na primeira coisa que se vê ao abrir
//! o aplicativo. No lugar entrou o tema do próprio kit da cabeça, que é boa-vinda e prova de
//! que o tema pegou. O ícone continua sendo o da JANELA (`janela-principal.ts`) — o que saiu
//! foi só o uso dele como cartaz de tela vazia.
//! `void`: a tela lê a ficha da máquina pela porta, e isso é assíncrono. A área nasce vazia
//!   e ganha o desenho um instante depois — que é o que o próprio Neovim faz.
void desenharTelaInicial();

/**
 * Torna um painel arrastável (ADR 0006).
 *
 * A medida vai no estilo do próprio painel e fica guardada no `localStorage`:
 * quem alarga o terminal uma vez está dizendo como trabalha, e reabrir o app
 * estreito de novo obrigaria a repetir o gesto todo dia.
 *
 * O limite superior é uma função e não um número porque a janela muda de
 * tamanho — o Deck troca de resolução ao ligar o HDMI, e uma largura gravada
 * num monitor grande deixaria o editor com nada na tela pequena.
 */
export function ligarDivisor(opcoes: {
  divisor: HTMLElement;
  painel: HTMLElement;
  eixo: "largura" | "altura";
  /** De que lado do painel está o divisor — muda o sinal do arraste. */
  borda?: "inicio" | "fim";
  padrao: number;
  min: number;
  max: () => number;
  chave: string;
  aoMudar?: () => void;
}): void {
  const { divisor, painel, eixo, padrao, min, max, chave, aoMudar } = opcoes;
  const borda = opcoes.borda ?? "fim";
  const prop = eixo === "largura" ? "width" : "height";

  const aplicar = (valor: number): void => {
    const teto = Math.max(min, max());
    painel.style[prop] = `${Math.round(Math.min(teto, Math.max(min, valor)))}px`;
    aoMudar?.();
  };

  const guardado = Number(localStorage.getItem(chave));
  if (Number.isFinite(guardado) && guardado > 0) aplicar(guardado);

  divisor.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    divisor.setPointerCapture(ev.pointerId);
    divisor.classList.add("arrastando");
    // Enquanto arrasta, o cursor manda em tudo: sem isto o ponteiro vira barra
    // de texto ao passar por cima do editor no meio do arraste.
    document.body.style.cursor = eixo === "largura" ? "ew-resize" : "ns-resize";

    const mover = (e: PointerEvent): void => {
      const r = painel.getBoundingClientRect();
      // A borda oposta à do divisor é o ponto fixo: a medida é a distância dela
      // até o ponteiro. Assim o divisor gruda no cursor mesmo quando o arraste
      // passa do limite e volta.
      aplicar(
        eixo === "largura"
          ? borda === "fim"
            ? r.right - e.clientX
            : e.clientX - r.left
          : r.bottom - e.clientY,
      );
    };
    const soltar = (): void => {
      divisor.classList.remove("arrastando");
      document.body.style.cursor = "";
      divisor.removeEventListener("pointermove", mover);
      divisor.removeEventListener("pointerup", soltar);
      divisor.removeEventListener("pointercancel", soltar);
      localStorage.setItem(chave, String(parseFloat(painel.style[prop]) || padrao));
    };

    divisor.addEventListener("pointermove", mover);
    divisor.addEventListener("pointerup", soltar);
    divisor.addEventListener("pointercancel", soltar);
  });

  // Duplo clique volta ao padrão: é a saída de quem arrastou demais e não
  // consegue mais pegar o divisor.
  divisor.addEventListener("dblclick", () => {
    aplicar(padrao);
    localStorage.setItem(chave, String(padrao));
  });
}

