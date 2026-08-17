import type { EstadoAparencia } from "../../shared/tipos.js";
import { FundoAnimado, type Junta } from "./fundo.js";

/**
 * Wallpaper e tema (ADR 0010).
 *
 * O Terminus tem uma regra dura desde a ADR 0005: a casca é monocromática **para
 * que** o código seja o mais legível da tela. Papel de
 * parede é exatamente o tipo de coisa que quebra isso — então ele entra com três
 * limites, e os três são a decisão, não detalhe:
 *
 * 1. só aparece **atrás do editor**. Nunca atrás da
 *    árvore, do terminal ou das abas;
 * 2. nasce escurecido em 82 % e com um desfoque leve. Dá para clarear, mas o
 *    padrão protege o dado;
 * 3. o tema gerado a partir da imagem tem o brilho do fundo **preso** no escuro,
 *    e nunca toca nas quatro bases.
 */

/** As cores que um tema pode trocar. As bases A/C/G/T não estão aqui de propósito. */
const CHAVES = [
  "chrome",
  "bg",
  "line",
  "linehl",
  "fg",
  "fg74",
  "fg60",
  "fg52",
  "fg36",
  "hover",
  "sel",
  "input",
  "focus",
  "badge",
  "btn",
] as const;

type Paleta = Partial<Record<(typeof CHAVES)[number], string>>;

/**
 * Os temas de fábrica.
 *
 * Todos escuros, e não por gosto: o Neovim roda com fundo transparente por cima
 * deste, e um tema claro deixaria o realce do código ilegível.
 */
export const TEMAS: Record<string, { nome: string; paleta: Paleta }> = {
  "cursor-dark": { nome: "Cursor Dark", paleta: {} },
  ametista: {
    nome: "Ametista",
    paleta: {
      chrome: "#17131c",
      bg: "#1b1621",
      linehl: "#241d2c",
      line: "#f0eaf813",
      badge: "#c3a2e6",
      btn: "#a98ad1",
    },
  },
  carvao: {
    nome: "Carvão",
    paleta: {
      chrome: "#101010",
      bg: "#151515",
      linehl: "#1f1f1f",
      badge: "#9aa0a6",
      btn: "#8a9096",
    },
  },
};

export class Aparencia {
  private estado: EstadoAparencia | null = null;
  private readonly estilo: HTMLStyleElement;

  private readonly animado: FundoAnimado;

  constructor(
    private readonly fundo: HTMLElement,
    private readonly api: typeof window.terminus,
    /** Avisa a tela de Configurações quando se descobre que a imagem é animada. */
    private readonly aoMudar?: () => void,
  ) {
    this.estilo = document.createElement("style");
    this.estilo.id = "tema";
    document.head.append(this.estilo);
    this.animado = new FundoAnimado(fundo);
  }

  atual(): EstadoAparencia | null {
    return this.estado;
  }

  async carregar(): Promise<void> {
    const r = await this.api.aparencia.estado();
    if (r.ok) this.aplicar(r.valor);
  }

  async definir(parcial: Partial<EstadoAparencia>): Promise<void> {
    const r = await this.api.aparencia.definir(parcial);
    if (r.ok) this.aplicar(r.valor);
  }

  async escolherImagem(): Promise<boolean> {
    const r = await this.api.aparencia.escolher();
    if (!r.ok || !r.valor) return false;
    this.aplicar(r.valor);
    return true;
  }

  async tirarImagem(): Promise<void> {
    const r = await this.api.aparencia.tirar();
    if (r.ok) this.aplicar(r.valor);
  }

  private aplicar(estado: EstadoAparencia): void {
    const trocouImagem = estado.imagem !== this.estado?.imagem;
    // `animado` é descoberto aqui, não vem do disco: o processo principal não
    // sabe se a imagem é animada. Sem carregar o valor adiante, toda gravação o
    // apagava — e o controle da volta do loop sumia da tela depois do primeiro
    // clique, que foi como o defeito apareceu no teste.
    const animadoAntes = this.estado?.animado;
    this.estado = estado;
    if (!trocouImagem) this.estado.animado = animadoAntes;

    // wallpaper
    if (estado.imagem) {
      this.fundo.style.backgroundImage = `url("${estado.imagem}")`;
      // `scale` some com a borda clara que o desfoque deixaria aparecer.
      this.fundo.style.filter = estado.desfoque ? `blur(${estado.desfoque}px)` : "";
      this.fundo.style.transform = estado.desfoque ? "scale(1.06)" : "";
      this.fundo.classList.remove("oculto");
      this.fundo.parentElement?.style.setProperty("--veu", String(estado.escurecer));

      // Animado passa a ser desenhado quadro a quadro, para a volta do loop
      // poder ser mascarada (ADR 0011). Estático continua no CSS.
      if (trocouImagem) {
        void this.animado
          .assumir(estado.imagem, estado.junta as Junta)
          .catch(() => false)
          .then((assumiu) => {
            // Falhar aqui não é erro fatal: o CSS continua desenhando a imagem,
            // só sem controle sobre a volta do loop.
            this.fundo.classList.toggle("comCanvas", assumiu);
            if (this.estado) this.estado.animado = assumiu;
            this.aoMudar?.();
          });
      } else {
        this.animado.definirJunta(estado.junta as Junta);
      }
    } else {
      this.animado.limpar();
      this.fundo.classList.remove("comCanvas");
      this.fundo.classList.add("oculto");
      this.fundo.style.backgroundImage = "";
    }

    // tema
    const paleta =
      estado.tema === "gerado" && estado.gerado
        ? (estado.gerado as Paleta)
        : (TEMAS[estado.tema]?.paleta ?? {});
    const linhas = CHAVES.filter((k) => paleta[k]).map((k) => `  --${k}:${paleta[k]};`);
    this.estilo.textContent = linhas.length ? `:root{\n${linhas.join("\n")}\n}` : "";

    // O terminal pinta em canvas e lê a cor de fundo do CSS a cada desenho,
    // então basta avisar que a variável mudou.
    window.dispatchEvent(new CustomEvent("bancada:tema"));
  }

  /**
   * Extrai uma paleta da imagem.
   *
   * Método: reduz a 64×64 num canvas, agrupa as cores em baldes grosseiros e
   * pega duas coisas — a cor **escura** mais frequente, que vira o fundo, e a
   * mais saturada, que vira o acento. O resto é derivado por luminância.
   *
   * Os dois limites que fazem isto não estragar a leitura: o fundo é forçado
   * para baixo (luminância ≤ 0,10) e o acento para cima (≥ 0,45). Uma foto
   * clara não pode virar um editor claro, e um acento apagado não pode virar um
   * botão ilegível.
   */
  async gerarTema(): Promise<boolean> {
    const imagem = this.estado?.imagem;
    if (!imagem) return false;

    const img = new Image();
    img.src = imagem;
    await img.decode();

    const lado = 64;
    const tela = document.createElement("canvas");
    tela.width = lado;
    tela.height = lado;
    const ctx = tela.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, lado, lado);
    const { data } = ctx.getImageData(0, 0, lado, lado);

    const baldes = new Map<string, { r: number; g: number; b: number; n: number }>();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const chave = `${r >> 4}-${g >> 4}-${b >> 4}`;
      const balde = baldes.get(chave) ?? { r: 0, g: 0, b: 0, n: 0 };
      balde.r += r;
      balde.g += g;
      balde.b += b;
      balde.n += 1;
      baldes.set(chave, balde);
    }

    const cores = [...baldes.values()].map((b) => ({
      r: b.r / b.n,
      g: b.g / b.n,
      b: b.b / b.n,
      n: b.n,
    }));
    if (!cores.length) return false;

    const lum = (c: { r: number; g: number; b: number }): number =>
      (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
    const sat = (c: { r: number; g: number; b: number }): number => {
      const max = Math.max(c.r, c.g, c.b);
      const min = Math.min(c.r, c.g, c.b);
      return max === 0 ? 0 : (max - min) / max;
    };

    const escuras = cores.filter((c) => lum(c) < 0.35).sort((a, b) => b.n - a.n);
    const base = escuras[0] ?? cores.sort((a, b) => lum(a) - lum(b))[0]!;
    const acento = [...cores].sort((a, b) => sat(b) * b.n - sat(a) * a.n)[0]!;

    const puxar = (c: { r: number; g: number; b: number }, alvo: number): string => {
      const atual = Math.max(lum(c), 0.01);
      const fator = alvo / atual;
      const v = (x: number): number => Math.round(Math.min(255, Math.max(0, x * fator)));
      return `#${[v(c.r), v(c.g), v(c.b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    };

    const gerado: Paleta = {
      chrome: puxar(base, 0.055),
      bg: puxar(base, 0.085),
      linehl: puxar(base, 0.14),
      btn: puxar(acento, 0.55),
      badge: puxar(acento, 0.62),
    };

    await this.definir({ gerado: gerado as Record<string, string>, tema: "gerado" });
    return true;
  }
}
