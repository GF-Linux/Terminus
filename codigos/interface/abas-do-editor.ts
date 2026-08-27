import { $ } from "./base-da-tela.js";
import { esc } from "./nucleo-da-casca.js";
import { abrirNoEditor, aoMudar, arquivoAtivo, estaSujo, fecharAba, listaAberta } from "./estado-do-editor.js";

//? AS ABAS — a metade do workbench que o Monaco não traz, e a casca precisa
//!
//! 1. O `monaco-editor` é o `vs/editor` do VSCode: ele edita UM modelo por vez e
//!    não sabe que existem outros. Abas são do *workbench*, e o workbench não
//!    vem no pacote.
//! 2. Elas não são enfeite: sem abas, abrir o segundo arquivo esconde o
//!    primeiro sem deixar rastro, e a pessoa perde o lugar onde estava. É a
//!    diferença entre um editor e uma janela de visualização.
//! 3. O `#abas` já existia no CSS desde a ADR 0025 — escondido pelo
//!    `.motor-neovim`, porque o Neovim desenhava as próprias. Agora ele tem
//!    morador de verdade.

/** O nome curto do arquivo, que é o que a aba mostra. */
//! Só o último segmento: o caminho inteiro numa aba a deixa do tamanho da tela.
//! O caminho completo vai no `title`, que é onde quem tem dúvida vai olhar.
function nomeCurto(caminho: string): string {
  return caminho.split(/[\\/]/).pop() ?? caminho;
}

//* Redesenha a fila de abas a partir do estado.
//! REDESENHA INTEIRA em vez de remendar: são poucas abas, o HTML é curto, e
//!   remendo incremental é onde nasce a aba fantasma que sobrou de um estado
//!   que já mudou. O mesmo desenho que a `arvore-de-arquivos` já usa.
function desenhar(): void {
  const faixa = $("abas");
  const lista = listaAberta();
  const ativo = arquivoAtivo();

  faixa.classList.toggle("oculto", lista.length === 0);
  faixa.innerHTML = lista
    .map((a) => {
      const atual = a.caminho === ativo?.caminho;
      //! O ponto de sujo ocupa o MESMO lugar do × de propósito: um troca pelo
      //!   outro ao passar o mouse, como no VSCode. Duas marcas lado a lado
      //!   fariam a aba pular de largura quando o arquivo é gravado.
      return `<span class="aba${atual ? " on" : ""}${estaSujo(a) ? " suja" : ""}"
        data-aba="${esc(a.caminho)}" title="${esc(a.caminho)}">
        <span class="nm">${esc(nomeCurto(a.caminho))}</span>
        <button class="x" data-fechar="${esc(a.caminho)}" title="Fechar">&#10005;</button>
      </span>`;
    })
    .join("");
}

//* Liga as abas: um despachante de clique para a faixa inteira.
//! UM ouvinte na faixa, e não um por aba: as abas são redesenhadas a cada
//!   tecla que muda a sujeira, e ouvinte por aba vazaria em cada redesenho.
export function ligarAbas(): void {
  const faixa = $("abas");

  faixa.addEventListener("click", (ev) => {
    const alvo = ev.target as HTMLElement;

    //! O × é conferido ANTES da aba porque ele está DENTRO dela: sem esta
    //!   ordem, fechar uma aba também a selecionaria no caminho.
    const fechar = alvo.closest("[data-fechar]")?.getAttribute("data-fechar");
    if (fechar) {
      ev.stopPropagation();
      fecharAba(fechar);
      return;
    }

    const abrir = alvo.closest("[data-aba]")?.getAttribute("data-aba");
    if (abrir) void abrirNoEditor(abrir);
  });

  //! Botão do meio fecha, como em todo navegador e no VSCode. `auxclick` e não
  //!   `mousedown`: assim o gesto ainda pode ser cancelado arrastando para fora.
  faixa.addEventListener("auxclick", (ev) => {
    if (ev.button !== 1) return;
    const alvo = (ev.target as HTMLElement).closest("[data-aba]")?.getAttribute("data-aba");
    if (alvo) {
      ev.preventDefault();
      fecharAba(alvo);
    }
  });

  aoMudar(desenhar);
  desenhar();
}
