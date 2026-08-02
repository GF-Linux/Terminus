import type { Cromatograma } from "../../shared/tipos.js";

/**
 * Desenho do cromatograma.
 *
 * É aqui que a ADR 0005 cobra a promessa: a casca é monocromática **para que**
 * as quatro bases sejam as cores mais fortes da tela. Este é o único lugar do
 * aplicativo com cor saturada, e é cor que significa dado.
 *
 * Canvas, não SVG: são quatro séries de milhares de pontos e a rolagem é
 * horizontal e contínua. SVG criaria dezenas de milhares de nós.
 */

const CORES: Record<string, string> = {
  A: "#3fc46b",
  C: "#4d96ff",
  G: "#e9b949",
  T: "#f0574f",
};

/**
 * O fundo do desenho sai do CSS, não de uma constante: desde a ADR 0010 o tema
 * da casca pode mudar, e um canvas pintado com `#181818` fixo apareceria como um
 * retângulo de cor errada dentro do painel.
 */
function fundoAtual(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#181818";
}

const REGUA = "#f0f0f013";
const FRACO = "#f0f0f05c";
const FORTE = "#f0f0f0";

/** Phred abaixo disto é leitura ruim — o mesmo corte que o EasyContig usa. */
const PHRED_RUIM = 20;

interface Medidas {
  /** Pixels por amostra. Controla o zoom horizontal. */
  escala: number;
  alturaTracos: number;
  faixaBases: number;
  faixaQualidade: number;
}

const PADRAO: Medidas = {
  escala: 2.2,
  alturaTracos: 220,
  faixaBases: 22,
  faixaQualidade: 34,
};

export class VistaCromatograma {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly rolagem: HTMLElement;
  private dados: Cromatograma | null = null;
  private medidas: Medidas = { ...PADRAO };
  private maximo = 1;

  constructor(private readonly host: HTMLElement) {
    this.host.classList.add("cromatograma");
    this.host.innerHTML = `
      <div class="cabecalho"><span class="titulo"></span><span class="resumo"></span></div>
      <div class="rolagem"><canvas></canvas></div>
      <div class="rodape">
        <span class="legenda"></span>
        <span class="zoom">
          <button data-z="-">−</button><span class="nivel"></span><button data-z="+">+</button>
        </span>
      </div>
      <div class="falhou oculto"></div>`;

    this.rolagem = this.host.querySelector(".rolagem")!;
    this.canvas = this.host.querySelector("canvas")!;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d indisponível");
    this.ctx = ctx;

    this.host.querySelector(".legenda")!.innerHTML = (["A", "C", "G", "T"] as const)
      .map((b) => `<i style="background:${CORES[b]}"></i>${b}`)
      .join("");

    this.host.querySelector(".zoom")!.addEventListener("click", (ev) => {
      const alvo = (ev.target as HTMLElement).closest<HTMLElement>("[data-z]");
      if (!alvo) return;
      this.ampliar(alvo.dataset["z"] === "+" ? 1.5 : 1 / 1.5);
    });

    // Ctrl+roda amplia, como em qualquer visualizador; a roda sozinha anda no
    // eixo do dado.
    //
    // A casca não pinta barra de rolagem em lugar nenhum, então a roda é o
    // caminho principal para andar na corrida: qualquer eixo dela — vertical do
    // mouse, horizontal do trackpad — vira deslocamento para o lado, porque
    // aqui não existe "para baixo" a percorrer.
    this.rolagem.addEventListener(
      "wheel",
      (ev) => {
        if (ev.ctrlKey) {
          ev.preventDefault();
          this.ampliar(ev.deltaY < 0 ? 1.15 : 1 / 1.15);
          return;
        }
        const bruto = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
        if (!bruto) return;
        // deltaMode 1 conta linhas, não pixels — sem converter, a roda de um
        // mouse comum andaria três pixels por clique.
        const passo = ev.deltaMode === 1 ? bruto * 16 : bruto;
        ev.preventDefault();
        this.rolagem.scrollLeft += passo;
      },
      { passive: false },
    );

    // Arrastar o traço com o mouse, como se pega um mapa. Sem barra visível,
    // esta é a outra forma óbvia de percorrer a corrida; no toque o próprio
    // navegador já arrasta, então só o mouse é tratado aqui.
    this.rolagem.addEventListener("pointerdown", (ev) => {
      if (ev.pointerType !== "mouse" || ev.button !== 0) return;
      const partida = ev.clientX;
      const rolado = this.rolagem.scrollLeft;
      let arrastou = false;

      const mover = (e: PointerEvent): void => {
        const andou = e.clientX - partida;
        // Alguns pixels de folga: um clique com a mão trêmula não deve sair
        // andando com a vista.
        if (!arrastou && Math.abs(andou) < 3) return;
        arrastou = true;
        this.rolagem.classList.add("arrastando");
        this.rolagem.scrollLeft = rolado - andou;
      };
      const soltar = (): void => {
        this.rolagem.classList.remove("arrastando");
        this.rolagem.removeEventListener("pointermove", mover);
        this.rolagem.removeEventListener("pointerup", soltar);
        this.rolagem.removeEventListener("pointercancel", soltar);
      };

      this.rolagem.setPointerCapture(ev.pointerId);
      this.rolagem.addEventListener("pointermove", mover);
      this.rolagem.addEventListener("pointerup", soltar);
      this.rolagem.addEventListener("pointercancel", soltar);
    });

    // Só se pinta a janela visível — 8 mil pixels de traço a cada quadro seria
    // desperdício. A contrapartida é que **rolar precisa repintar**: sem isto,
    // arrastar para a direita mostra vazio.
    this.rolagem.addEventListener("scroll", () => this.agendar(), { passive: true });
    new ResizeObserver(() => this.agendar()).observe(this.rolagem);
    // Trocar de tema muda o fundo do canvas; repinta.
    window.addEventListener("bancada:tema", () => this.agendar());
  }

  /** Junta vários pedidos de repintura num quadro só. */
  private quadroPendente = 0;
  private agendar(): void {
    if (this.quadroPendente) return;
    this.quadroPendente = requestAnimationFrame(() => {
      this.quadroPendente = 0;
      this.desenhar();
    });
  }

  private ampliar(fator: number): void {
    // O ponto sob o centro da vista tem de continuar sob o centro depois do
    // zoom, senão ampliar joga o usuário para outro trecho da corrida.
    const centro = (this.rolagem.scrollLeft + this.rolagem.clientWidth / 2) / this.medidas.escala;
    this.medidas.escala = Math.min(12, Math.max(0.35, this.medidas.escala * fator));
    this.desenhar();
    this.rolagem.scrollLeft = centro * this.medidas.escala - this.rolagem.clientWidth / 2;
  }

  mostrar(dados: Cromatograma): void {
    this.dados = dados;
    this.host.classList.remove("comFalha");
    this.host.querySelector(".falhou")!.classList.add("oculto");
    this.maximo = Math.max(
      1,
      ...(["A", "C", "G", "T"] as const).flatMap((b) => [Math.max(...dados.tracos[b])]),
    );

    const r = dados.resumo;
    this.host.querySelector(".titulo")!.textContent = dados.amostra;
    this.host.querySelector(".resumo")!.textContent =
      `${r.bases} bases · ${r.bases_boas} com Phred ≥ ${PHRED_RUIM}` +
      (r.phred_medio !== null ? ` · média ${r.phred_medio}` : "") +
      (r.ambiguas > 0 ? ` · ${r.ambiguas} ambíguas` : "") +
      (dados.fator_reducao > 1 ? ` · reduzido ${dados.fator_reducao}×` : "");

    this.rolagem.scrollLeft = 0;
    this.desenhar();
  }

  /** Leva a vista até uma base, centralizando-a. Usado pela busca por posição. */
  irParaBase(indice: number): void {
    const d = this.dados;
    if (!d || indice < 0 || indice >= d.picos.length) return;
    const x = d.picos[indice]! * this.medidas.escala;
    this.rolagem.scrollLeft = x - this.rolagem.clientWidth / 2;
  }

  private desenhar(): void {
    const d = this.dados;
    if (!d) return;

    const m = this.medidas;
    // Os traços ocupam a altura que houver: o cromatograma é o conteúdo da
    // tela, não um gráfico encaixado num canto dela. Com altura fixa sobrava um
    // vazio grande embaixo, e um pico raso ficava indistinguível do fundo.
    // O piso é 90 e não 120 porque o cromatograma virou uma faixa de altura
    // arrastável (ADR 0006): um piso alto demais fazia o desenho ultrapassar a
    // janela e nascer com barra de rolagem VERTICAL — que é justamente o que
    // não faz sentido aqui, já que a leitura é para o lado. A altura mínima do
    // painel, no CSS, é casada com este piso.
    const disponivel = this.rolagem.clientHeight - m.faixaBases - m.faixaQualidade - 2;
    m.alturaTracos = Math.max(90, disponivel);

    const altura = m.alturaTracos + m.faixaBases + m.faixaQualidade;
    const largura = Math.max(this.rolagem.clientWidth, Math.ceil(d.tracos.A.length * m.escala));

    // devicePixelRatio: sem isto o traço fica borrado na tela do Deck.
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.ceil(largura * dpr);
    this.canvas.height = Math.ceil(altura * dpr);
    this.canvas.style.width = `${largura}px`;
    this.canvas.style.height = `${altura}px`;

    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = fundoAtual();
    c.fillRect(0, 0, largura, altura);

    this.desenharQualidade(largura);
    this.desenharTracos(largura);
    this.desenharBases();

    this.host.querySelector(".nivel")!.textContent = `${m.escala.toFixed(1)}×`;
  }

  /** Barras de Phred no rodapé: onde a leitura é ruim, a barra é baixa. */
  private desenharQualidade(largura: number): void {
    const d = this.dados!;
    const m = this.medidas;
    const base = m.alturaTracos + m.faixaBases + m.faixaQualidade;
    const c = this.ctx;

    for (let i = 0; i < d.qualidade.length; i++) {
      const q = d.qualidade[i]!;
      const x = (d.picos[i] ?? 0) * m.escala;
      if (x < -20 || x > largura + 20) continue;
      const h = (Math.min(q, 62) / 62) * (m.faixaQualidade - 6);
      // Cinza, não vermelho: a qualidade é contexto, não é o dado principal.
      // Quem grita é a altura da barra.
      c.fillStyle = q < PHRED_RUIM ? "#f0f0f026" : "#f0f0f01e";
      c.fillRect(x - Math.max(1, m.escala * 4) / 2, base - h, Math.max(1, m.escala * 4), h);
    }

    c.strokeStyle = REGUA;
    c.beginPath();
    c.moveTo(0, m.alturaTracos + m.faixaBases + 0.5);
    c.lineTo(largura, m.alturaTracos + m.faixaBases + 0.5);
    c.stroke();
  }

  private desenharTracos(largura: number): void {
    const d = this.dados!;
    const m = this.medidas;
    const c = this.ctx;
    const base = m.alturaTracos;

    // Régua horizontal discreta, para dar noção de altura relativa.
    c.strokeStyle = REGUA;
    for (const fracao of [0.25, 0.5, 0.75]) {
      const y = base - base * fracao + 0.5;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(largura, y);
      c.stroke();
    }

    const de = Math.max(0, Math.floor(this.rolagem.scrollLeft / m.escala) - 2);
    const ate = Math.min(
      d.tracos.A.length,
      Math.ceil((this.rolagem.scrollLeft + this.rolagem.clientWidth) / m.escala) + 2,
    );

    c.lineWidth = 1.3;
    c.lineJoin = "round";
    for (const b of ["A", "C", "G", "T"] as const) {
      const serie = d.tracos[b];
      c.strokeStyle = CORES[b]!;
      c.beginPath();
      for (let i = de; i < ate; i++) {
        const x = i * m.escala;
        const y = base - (serie[i]! / this.maximo) * (base - 8);
        if (i === de) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  }

  /** As letras, na cor da própria base, alinhadas ao pico que rotulam. */
  private desenharBases(): void {
    const d = this.dados!;
    const m = this.medidas;
    const c = this.ctx;
    const y = m.alturaTracos + m.faixaBases - 6;

    // Abaixo de certo zoom as letras se sobrepõem e viram borrão; some com
    // elas em vez de desenhar sujeira.
    const passo = m.escala * 12;
    if (passo < 7) return;

    c.font = `12px "IBM Plex Mono", ui-monospace, monospace`;
    c.textAlign = "center";
    c.textBaseline = "alphabetic";

    const de = Math.max(0, Math.floor(this.rolagem.scrollLeft / m.escala));
    const ate = Math.ceil((this.rolagem.scrollLeft + this.rolagem.clientWidth) / m.escala);

    for (let i = 0; i < d.sequencia.length; i++) {
      const p = d.picos[i];
      if (p === undefined || p < de || p > ate) continue;
      const letra = d.sequencia[i]!.toUpperCase();
      const ruim = (d.qualidade[i] ?? 99) < PHRED_RUIM;
      // Base ruim sai apagada; base ambígua (N) sai em cinza forte, porque não
      // tem cor de base para ter.
      c.fillStyle = CORES[letra] ?? FORTE;
      c.globalAlpha = ruim ? 0.4 : 1;
      c.fillText(letra, p * m.escala, y);
      c.globalAlpha = 1;
    }
  }

  /**
   * Um aviso por cima do desenho, quando a leitura falhou.
   *
   * Camada, não substituição do conteúdo: trocar o `innerHTML` do host levava
   * junto o canvas e os ouvintes do zoom e da rolagem, e o `.ab1` seguinte —
   * bom — não tinha mais onde ser desenhado. Com o painel em abas, abrir um
   * arquivo ruim e logo um bom é gesto de todo dia.
   */
  falhar(motivo: string): void {
    this.dados = null;
    const aviso = this.host.querySelector(".falhou")!;
    aviso.innerHTML = `<b>Não consegui ler o cromatograma</b>${escapar(motivo)}`;
    aviso.classList.remove("oculto");
    this.host.classList.add("comFalha");
  }

  /** Volta ao estado de painel vazio — usado ao fechar a última aba de `.ab1`. */
  limpar(): void {
    this.dados = null;
    this.host.classList.remove("comFalha");
    this.host.querySelector(".falhou")!.classList.add("oculto");
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.host.querySelector(".titulo")!.textContent = "";
    this.host.querySelector(".resumo")!.textContent = "";
  }
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export { CORES as CORES_DAS_BASES, FRACO as CINZA_FRACO };
