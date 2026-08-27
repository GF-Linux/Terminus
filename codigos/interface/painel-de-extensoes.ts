import type { ExtensaoDoVscode } from "../compartilhado/tipos.js";
import { $, api } from "./base-da-tela.js";
import { esc } from "./nucleo-da-casca.js";

//? O PAINEL DE EXTENSÕES — o sucessor do "Plugins do Neovim" que morreu em 26/08
//!
//! 1. Ele mostra **o que a pessoa já usa no VSCode** — dado que está no disco, em
//!    `~/.vscode/extensions/`. Não é um mercado, não baixa nada, não escreve nada.
//! 2. ⚠️ **A DIVISÃO POR TIPO É O RECURSO**, não a lista. Uma extensão do VSCode roda num
//!    host de extensão, e há dois tipos: as que declaram `browser` rodam no mesmo lugar que
//!    o editor (e são as que este produto saberia carregar); as que só declaram `main`
//!    precisam de um processo Node com a API completa do VSCode, que aqui não existe.
//!    Sem essa marca, a lista prometeria o que não pode cumprir — e a pergunta seguinte
//!    seria *"por que essa não funciona?"*, respondida tarde.
//! 3. O painel antigo listava plugins do lazy.nvim e o clique abria a pasta. Este mantém o
//!    gesto: o clique **abre a pasta da extensão no Explorer**, que é o que dá para fazer
//!    hoje sem prometer instalação.

/** O que cada tipo significa, em uma linha, para quem lê a lista. */
//! A frase é da tela, não do log: ela responde "e daí?" para quem não sabe o que é um host
//!   de extensão — que é quase todo mundo, inclusive quem escreve código há anos.
const EXPLICACAO: Record<ExtensaoDoVscode["tipo"], { rotulo: string; frase: string }> = {
  declarativa: {
    rotulo: "sem código",
    frase: "tema, idioma ou gramática — não roda nada, é só configuração",
  },
  web: {
    rotulo: "carregável",
    frase: "declara `browser`: roda no mesmo lugar que o editor",
  },
  desktop: {
    rotulo: "só no VSCode",
    frase: "declara só `main`: precisa do host de extensão do VSCode, que o Terminus não tem",
  },
};

/** A ordem em que os grupos aparecem: do que dá para o que não dá. */
//! Do possível para o impossível, e não alfabética: quem abre este painel quer saber
//!   **o que dá**, e enterrar isso no meio da lista faz a resposta parecer inexistente.
const ORDEM: ExtensaoDoVscode["tipo"][] = ["declarativa", "web", "desktop"];

let cache: ExtensaoDoVscode[] | null = null;

//* Desenha a lista na lateral.
export async function desenharExtensoes(): Promise<void> {
  const corpo = $("lateral");
  corpo.innerHTML = `<p class="dim" style="padding:8px 12px">lendo as extensões do VSCode…</p>`;

  //! Uma leitura por sessão: a pasta não muda enquanto o Terminus está aberto, e reler a
  //!   cada troca de painel custaria dezenove arquivos por clique.
  //! `lista` local, e não `cache` direto: entre o `await` acima e o uso abaixo o TypeScript
  //!   não pode garantir que ninguém trocou o cache — e ele está certo, porque outro clique
  //!   no ícone pode ter rodado esta mesma função nesse meio-tempo.
  cache ??= await (async () => {
    const r = await api.extensoes.listar();
    return r.ok ? r.valor : [];
  })();
  const lista = cache;

  if (lista.length === 0) {
    //! Lista vazia NÃO é "nenhuma extensão": pode ser VSCode não instalado. A frase diz as
    //!   duas coisas, porque quem lê precisa saber se procura ali ou noutro lugar.
    corpo.innerHTML =
      `<p class="dim" style="padding:8px 12px">Nada em <code>~/.vscode/extensions</code> —` +
      ` ou o VSCode não está instalado nesta máquina.</p>`;
    return;
  }

  const grupos = ORDEM.map((tipo) => ({ tipo, itens: lista.filter((e) => e.tipo === tipo) })).filter(
    (g) => g.itens.length > 0,
  );

  corpo.innerHTML = grupos
    .map(
      (g) => `
      <div class="grpExt">
        <div class="hdExt">${esc(EXPLICACAO[g.tipo].rotulo)} <span class="n">${g.itens.length}</span></div>
        <div class="frExt">${esc(EXPLICACAO[g.tipo].frase)}</div>
        ${g.itens
          .map(
            (e) => `
          <div class="ext" data-ext="${esc(e.pasta)}" title="${esc(e.id)} ${esc(e.versao)}\n${esc(e.descricao)}">
            <span class="nm">${esc(e.rotulo)}</span>
            <span class="v">${esc(e.versao)}</span>
          </div>`,
          )
          .join("")}
      </div>`,
    )
    .join("");
}

//* Liga o clique: abrir a pasta da extensão no Explorer.
//! UM ouvinte na lateral, e não um por item: a lista é redesenhada a cada troca de painel, e
//!   ouvinte por item vazaria em cada redesenho. É o mesmo desenho das abas.
export function ligarExtensoes(): void {
  $("lateral").addEventListener("click", (ev) => {
    const pasta = (ev.target as HTMLElement).closest("[data-ext]")?.getAttribute("data-ext");
    if (pasta) void api.entrarNaPasta(pasta);
  });
}
