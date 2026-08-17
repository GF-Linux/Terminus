/**
 * Abertura rápida (Ctrl+P).
 *
 * Numa pasta de corrida com dezenas de arquivos a árvore vira rolagem; aqui se
 * digita parte do nome e abre. O casamento é por **subsequência**, não por
 * substring: `mgc` encontra `medir_gc.py`, que é como a mão de quem já conhece
 * o projeto digita.
 */

export interface ItemPaleta {
  /** Caminho relativo à raiz — é o que se mostra e o que se casa. */
  rel: string;
  /** Caminho absoluto, devolvido na escolha. */
  abs: string;
}

interface Pontuado {
  item: ItemPaleta;
  pontos: number;
  /** Índices casados dentro de `rel`, para destacar na lista. */
  marcas: number[];
}

/**
 * Casa `busca` contra `alvo` como subsequência e pontua.
 *
 * A pontuação privilegia, nesta ordem: caracteres consecutivos, começo de
 * palavra (depois de `_`, `-`, `.` ou `/`) e casamento dentro do nome do
 * arquivo em vez da pasta. Sem isso, `gc` acharia primeiro
 * `dados/legacy/x.txt` em vez de `medir_gc.py`.
 */
export function casar(busca: string, alvo: string): { pontos: number; marcas: number[] } | null {
  if (!busca) return { pontos: 0, marcas: [] };

  const b = busca.toLowerCase();
  const a = alvo.toLowerCase();
  const inicioNome = alvo.lastIndexOf("/") + 1;

  const marcas: number[] = [];
  let pontos = 0;
  let i = 0;
  let anterior = -2;

  for (const ch of b) {
    if (ch === " ") continue;
    const at = a.indexOf(ch, i);
    if (at === -1) return null;

    marcas.push(at);
    pontos += 1;
    if (at === anterior + 1) pontos += 6; // consecutivo
    const antes = at > 0 ? alvo[at - 1]! : "/";
    if ("/_-. ".includes(antes)) pontos += 4; // começo de palavra
    if (at >= inicioNome) pontos += 3; // está no nome, não na pasta

    anterior = at;
    i = at + 1;
  }

  // Caminho curto desempata: entre dois casamentos iguais, o mais raso ganha.
  pontos -= alvo.length * 0.05;
  return { pontos, marcas };
}

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Reescreve o texto com os caracteres casados destacados. */
function destacar(texto: string, marcas: number[]): string {
  if (marcas.length === 0) return esc(texto);
  const marcado = new Set(marcas);
  let saida = "";
  for (let i = 0; i < texto.length; i++) {
    const c = esc(texto[i]!);
    saida += marcado.has(i) ? `<b>${c}</b>` : c;
  }
  return saida;
}

const LIMITE_EXIBIDO = 50;

export class Paleta {
  private readonly host: HTMLElement;
  private readonly entrada: HTMLInputElement;
  private readonly lista: HTMLElement;
  private itens: ItemPaleta[] = [];
  private visiveis: Pontuado[] = [];
  private cursor = 0;

  constructor(private readonly aoEscolher: (item: ItemPaleta) => void) {
    this.host = document.createElement("div");
    this.host.className = "paleta oculto";
    this.host.innerHTML = `
      <div class="caixa">
        <input class="busca" spellcheck="false" placeholder="Abrir arquivo por nome…">
        <div class="lista"></div>
      </div>`;
    document.body.appendChild(this.host);

    this.entrada = this.host.querySelector(".busca")!;
    this.lista = this.host.querySelector(".lista")!;

    this.entrada.addEventListener("input", () => {
      this.cursor = 0;
      this.filtrar();
    });
    this.entrada.addEventListener("keydown", (ev) => this.tecla(ev));
    // Clicar fora fecha. O clique num item é tratado antes, no mousedown, para
    // não perder o alvo quando o campo perde o foco.
    this.host.addEventListener("mousedown", (ev) => {
      const li = (ev.target as HTMLElement).closest<HTMLElement>("[data-i]");
      if (li) {
        ev.preventDefault();
        this.escolher(Number(li.dataset["i"]));
      } else if (!(ev.target as HTMLElement).closest(".caixa")) {
        this.fechar();
      }
    });
  }

  get aberta(): boolean {
    return !this.host.classList.contains("oculto");
  }

  abrir(itens: ItemPaleta[]): void {
    this.itens = itens;
    this.entrada.value = "";
    this.cursor = 0;
    this.host.classList.remove("oculto");
    this.filtrar();
    this.entrada.focus();
  }

  fechar(): void {
    this.host.classList.add("oculto");
  }

  private tecla(ev: KeyboardEvent): void {
    switch (ev.key) {
      case "Escape":
        ev.preventDefault();
        this.fechar();
        break;
      case "ArrowDown":
        ev.preventDefault();
        this.mover(1);
        break;
      case "ArrowUp":
        ev.preventDefault();
        this.mover(-1);
        break;
      case "Enter":
        ev.preventDefault();
        this.escolher(this.cursor);
        break;
    }
  }

  private mover(passo: number): void {
    if (this.visiveis.length === 0) return;
    // Circular: descer no último volta ao primeiro, como no VSCodium.
    this.cursor = (this.cursor + passo + this.visiveis.length) % this.visiveis.length;
    this.desenhar();
  }

  private escolher(i: number): void {
    const alvo = this.visiveis[i];
    if (!alvo) return;
    this.fechar();
    this.aoEscolher(alvo.item);
  }

  private filtrar(): void {
    const busca = this.entrada.value.trim();
    const pontuados: Pontuado[] = [];

    for (const item of this.itens) {
      const r = casar(busca, item.rel);
      if (r) pontuados.push({ item, pontos: r.pontos, marcas: r.marcas });
    }

    pontuados.sort((a, b) => b.pontos - a.pontos || a.item.rel.localeCompare(b.item.rel, "pt-BR"));
    this.visiveis = pontuados.slice(0, LIMITE_EXIBIDO);
    this.desenhar();
  }

  private desenhar(): void {
    if (this.visiveis.length === 0) {
      this.lista.innerHTML = `<div class="vazia">Nenhum arquivo com esse nome.</div>`;
      return;
    }

    this.lista.innerHTML = this.visiveis
      .map((v, i) => {
        // O nome vem primeiro e destacado; a pasta vai depois, apagada — é o
        // nome que se procura, a pasta só desempata entre homônimos.
        const inicio = v.item.rel.lastIndexOf("/") + 1;
        const nome = v.item.rel.slice(inicio);
        const pasta = inicio > 0 ? v.item.rel.slice(0, inicio - 1) : "";
        const marcasNome = v.marcas.filter((m) => m >= inicio).map((m) => m - inicio);
        const marcasPasta = v.marcas.filter((m) => m < inicio);

        return `<div class="item${i === this.cursor ? " on" : ""}" data-i="${i}">
            <span class="n">${destacar(nome, marcasNome)}</span>
            ${pasta ? `<span class="p">${destacar(pasta, marcasPasta)}</span>` : ""}
          </div>`;
      })
      .join("");

    this.lista.querySelector(".item.on")?.scrollIntoView({ block: "nearest" });
  }
}
