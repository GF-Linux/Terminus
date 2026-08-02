import type { EstadoDoMascote, EstadoMascote, FalaMascote } from "../../shared/tipos.js";

/**
 * O mascote (ADR 0008).
 *
 * **Pessoal, não profissional.** Não analisa nada, não abre arquivo, não opina
 * sobre o código. Ele mora num canto da área de escrita, reage ao que acontece
 * e conversa quando chamado.
 *
 * Duas fontes de comportamento, e a separação entre elas é a regra do projeto:
 *
 * 1. **Reação** — local, sem rede. O aplicativo avisa "rodou", "deu erro",
 *    "gravou", e ele troca de cara e solta uma frase de uma lista escrita aqui.
 *    Nada disso sai da máquina: nome de arquivo de corrida costuma ser
 *    identificação de amostra.
 * 2. **Conversa** — sai da máquina, e só quando ligada. Vai a fala digitada e o
 *    miniMD (que o processo principal injeta); não vai nada da sessão.
 */

const ESTADOS: EstadoMascote[] = ["parado", "piscando", "feliz", "preocupado", "pensando"];

/** O que ele diz em cada situação. Sorteado, para não virar papagaio. */
const FALAS: Record<string, string[]> = {
  rodando: ["rodando…", "vamos ver", "cruzando os dedos"],
  ok: ["passou!", "saiu limpo", "deu certo"],
  erro: ["deu ruim", "olha o traceback", "quase"],
  gravou: ["gravado", "salvo"],
  cromatograma: ["que traço bonito", "olha os picos"],
  ocioso: ["ainda aqui", "tô de olho", "…"],
  chegou: ["oi", "bora?"],
};

const sortear = (lista: string[]): string => lista[Math.floor(Math.random() * lista.length)]!;

/** Quanto tempo sem nada acontecer até ele dar sinal de vida. */
const OCIOSO_MS = 8 * 60 * 1000;

export type EventoMascote = keyof typeof FALAS;

export class Mascote {
  private readonly raiz: HTMLElement;
  private readonly figura: HTMLElement;
  private readonly balao: HTMLElement;
  private readonly conversa: HTMLElement;
  private readonly lista: HTMLElement;
  private readonly painelMemoria: HTMLElement;
  private readonly campo: HTMLTextAreaElement;

  private quadros: Partial<Record<EstadoMascote, string>> = {};
  private estado: EstadoDoMascote | null = null;
  private falas: FalaMascote[] = [];
  private esperando = false;

  private volta: number | undefined;
  private some: number | undefined;
  private pisca: number | undefined;
  private relogioOcioso: number | undefined;

  constructor(
    host: HTMLElement,
    private readonly aoAvisar: (texto: string) => void,
    /** Abre um arquivo da memória no editor da Bancada — é assim que se audita. */
    private readonly aoAbrirArquivo: (caminho: string) => void,
  ) {
    this.raiz = host;
    this.raiz.innerHTML = `
      <div class="balao oculto"></div>
      <div class="figura" role="button" tabindex="0" title="Clique para conversar"></div>
      <button class="dispensar" title="Dispensar (volta pela barra de estado)">✕</button>
      <div class="conversa oculto">
        <div class="cabecalho"><span class="nome">Mascote</span>
          <button class="verMemoria" title="O que ela guardou">memória</button>
          <button class="fecharConversa" title="Fechar">✕</button></div>
        <div class="falas"></div>
        <div class="memoria oculto"></div>
        <div class="entrada">
          <textarea rows="1" placeholder="conversar…" spellcheck="false"></textarea>
        </div>
        <div class="rodape"></div>
      </div>`;

    this.balao = this.raiz.querySelector(".balao")!;
    this.figura = this.raiz.querySelector(".figura")!;
    this.conversa = this.raiz.querySelector(".conversa")!;
    this.lista = this.raiz.querySelector(".falas")!;
    this.painelMemoria = this.raiz.querySelector(".memoria")!;
    this.campo = this.raiz.querySelector("textarea")!;

    this.raiz.querySelector(".verMemoria")!.addEventListener("click", () => {
      void this.alternarMemoria();
    });
    this.painelMemoria.addEventListener("click", (ev) => {
      const alvo = ev.target as HTMLElement;
      const abrir = alvo.closest<HTMLElement>("[data-abrir]");
      if (abrir) {
        this.aoAbrirArquivo(abrir.dataset["abrir"]!);
        this.conversa.classList.add("oculto");
        return;
      }
      const esquecer = alvo.closest<HTMLElement>("[data-esquecer]");
      if (esquecer) void this.esquecer(esquecer.dataset["esquecer"]!);
    });

    this.ligarArraste();

    this.figura.addEventListener("click", () => {
      if (!this.arrastou) this.alternarConversa();
    });
    this.figura.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        this.alternarConversa();
      }
    });
    this.raiz.querySelector(".dispensar")!.addEventListener("click", () => this.dispensar());
    this.raiz.querySelector(".fecharConversa")!.addEventListener("click", () => {
      this.conversa.classList.add("oculto");
      void this.destilar();
    });

    this.campo.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        void this.enviar();
      }
      // O Esc devolve o teclado ao editor — a conversa não pode virar armadilha.
      if (ev.key === "Escape") {
        ev.stopPropagation();
        this.conversa.classList.add("oculto");
        void this.destilar();
      }
    });
    // O campo cresce com o texto, até um teto: é recado, não redação.
    this.campo.addEventListener("input", () => {
      this.campo.style.height = "auto";
      this.campo.style.height = `${Math.min(96, this.campo.scrollHeight)}px`;
    });
  }

  /* ----------------------------- ciclo de vida ---------------------------- */

  async iniciar(api: typeof window.bancada): Promise<void> {
    this.api = api;
    const [estado, quadros] = await Promise.all([api.mascote.estado(), api.mascote.quadros()]);
    if (estado.ok) this.estado = estado.valor;
    if (quadros.ok) this.quadros = quadros.valor;

    this.raiz.querySelector(".nome")!.textContent = this.estado?.nome ?? "Mascote";
    this.desenharRodape();
    this.restaurarLugar();

    // Só aparece se não foi dispensado da última vez.
    this.definirVisivel(localStorage.getItem("bancada.mascoteVisivel") !== "0");
    this.mostrar("parado");
    this.piscarDeVezEmQuando();
    this.adiarOcioso();
    if (this.visivel) this.reagir("chegou");
  }

  private api!: typeof window.bancada;
  private visivel = true;

  definirVisivel(v: boolean): void {
    this.visivel = v;
    this.raiz.classList.toggle("oculto", !v);
    if (!v) this.conversa.classList.add("oculto");
    localStorage.setItem("bancada.mascoteVisivel", v ? "1" : "0");
  }

  alternar(): void {
    this.definirVisivel(!this.visivel);
  }

  estaVisivel(): boolean {
    return this.visivel;
  }

  private dispensar(): void {
    this.definirVisivel(false);
    this.aoAvisar("mascote dispensado — volta pelo botão na barra de estado");
  }

  /* -------------------------------- desenho ------------------------------- */

  /**
   * Troca o quadro. Sem sprite no disco, desenha o de reserva — um erlenmeyer
   * no traço do ícone da marca —, para o recurso existir antes da arte existir.
   */
  private mostrar(estado: EstadoMascote): void {
    const url = this.quadros[estado] ?? this.quadros["parado"];
    if (url) {
      this.figura.style.backgroundImage = `url("${url}")`;
      this.figura.classList.remove("reserva");
      this.figura.innerHTML = "";
    } else {
      this.figura.classList.add("reserva");
      this.figura.dataset["estado"] = estado;
      this.figura.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 3v5.2L5.2 14A3.9 3.9 0 008.5 20h7A3.9 3.9 0 0018.8 14L15 8.2V3"/>
          <path d="M7.6 3h8.8"/><path d="M6.4 14.6h11.2"/>
          <circle cx="10" cy="17" r="1.1"/><circle cx="14" cy="17.6" r=".9"/>
        </svg>`;
    }
  }

  /** Pisca a cada poucos segundos, se houver quadro de olho fechado. */
  private piscarDeVezEmQuando(): void {
    window.clearTimeout(this.pisca);
    this.pisca = window.setTimeout(
      () => {
        if (this.visivel && !this.esperando && this.quadros["piscando"]) {
          this.mostrar("piscando");
          window.setTimeout(() => this.mostrar("parado"), 140);
        }
        this.piscarDeVezEmQuando();
      },
      3000 + Math.random() * 5000,
    );
  }

  /* -------------------------------- reações ------------------------------- */

  /**
   * Reage a algo que aconteceu no aplicativo. **Local, sem rede.**
   *
   * Recebe só o tipo do evento — nunca o nome do arquivo, o caminho ou a
   * mensagem de erro. Quem quiser saber o que deu errado lê o terminal; o
   * mascote não é um canal a mais por onde dado de corrida escapa.
   */
  reagir(evento: EventoMascote): void {
    this.adiarOcioso();
    if (!this.visivel) return;

    const cara: Record<string, EstadoMascote> = {
      rodando: "pensando",
      ok: "feliz",
      erro: "preocupado",
      gravou: "feliz",
      cromatograma: "feliz",
      ocioso: "parado",
      chegou: "feliz",
    };
    this.mostrar(cara[evento] ?? "parado");
    this.dizer(sortear(FALAS[evento] ?? ["…"]));

    window.clearTimeout(this.volta);
    this.volta = window.setTimeout(() => this.mostrar("parado"), 2600);
  }

  /** Bolha curta que some sozinha. Não empilha: fala nova apaga a anterior. */
  private dizer(texto: string): void {
    this.balao.textContent = texto;
    this.balao.classList.remove("oculto");
    window.clearTimeout(this.some);
    this.some = window.setTimeout(() => this.balao.classList.add("oculto"), 3200);
  }

  private adiarOcioso(): void {
    window.clearTimeout(this.relogioOcioso);
    this.relogioOcioso = window.setTimeout(() => {
      if (this.visivel) this.dizer(sortear(FALAS["ocioso"]!));
      this.adiarOcioso();
    }, OCIOSO_MS);
  }

  /* -------------------------------- conversa ------------------------------ */

  private alternarConversa(): void {
    const fechada = this.conversa.classList.toggle("oculto");
    if (fechada) {
      void this.destilar();
      return;
    }
    this.balao.classList.add("oculto");
    this.painelMemoria.classList.add("oculto");
    this.lista.classList.remove("oculto");
    this.campo.focus();
  }

  private desenharRodape(): void {
    const e = this.estado;
    const rodape = this.raiz.querySelector(".rodape")!;
    if (!e) return;

    if (!e.temChave) {
      rodape.innerHTML = `<span class="dim">Sem chave configurada. A conversa usa a mesma
        chave do texto fantasma — importe em <b>Configurações</b>.</span>`;
      this.campo.disabled = true;
      return;
    }
    if (!e.ligado) {
      rodape.innerHTML = `<span class="dim">A conversa está desligada.</span>
        <button class="acao" data-m="ligar">Ligar</button>`;
      this.campo.disabled = true;
      rodape.querySelector("[data-m=ligar]")!.addEventListener("click", () => void this.ligar(true));
      return;
    }
    // Ligada, a frase que importa: o que sai daqui.
    rodape.innerHTML = `<span class="dim">Sai da máquina: o que você escrever e o
      resumo em <code>contexto.md</code>. Nada do que está aberto.</span>
      <button class="acao" data-m="desligar">Desligar</button>`;
    this.campo.disabled = false;
    rodape
      .querySelector("[data-m=desligar]")!
      .addEventListener("click", () => void this.ligar(false));
  }

  private async ligar(ligado: boolean): Promise<void> {
    const r = await this.api.mascote.ligar(ligado);
    if (r.ok) this.estado = r.valor;
    this.desenharRodape();
    if (ligado) this.campo.focus();
  }

  /**
   * Desenha a conversa.
   *
   * A classe da resposta é `resposta`, e **não** `mascote`: o widget inteiro já
   * é `.mascote`, e uma fala com essa classe herdava dele `position:fixed` e
   * `width:112px` — as respostas empilhavam umas por cima das outras no canto.
   * Só apareceu na captura de tela; a medição do DOM confirmou.
   */
  private desenharFalas(): void {
    this.lista.innerHTML =
      this.falas
        .map(
          (f) =>
            `<div class="fala ${f.quem === "autor" ? "autor" : "resposta"}"><span>${f.texto
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")}</span></div>`,
        )
        .join("") + (this.esperando ? `<div class="fala resposta pensando"><span>…</span></div>` : "");
    this.lista.scrollTop = this.lista.scrollHeight;
  }

  /* -------------------------------- memória ------------------------------- */

  /**
   * A tela de auditoria (ADR 0009).
   *
   * Lista o que ela guardou; clicar abre o arquivo **no editor da Bancada**,
   * onde ele lê, corrige e grava com `Ctrl+S` como qualquer outro arquivo. Não
   * existe editor de memória separado de propósito: memória que só se edita por
   * uma telinha própria é memória que ninguém edita.
   */
  private async alternarMemoria(): Promise<void> {
    if (!this.painelMemoria.classList.contains("oculto")) {
      this.painelMemoria.classList.add("oculto");
      this.lista.classList.remove("oculto");
      return;
    }

    const r = await this.api.mascote.memoria();
    this.lista.classList.add("oculto");
    this.painelMemoria.classList.remove("oculto");

    if (!r.ok) {
      this.painelMemoria.innerHTML = `<p class="vazia">${r.erro}</p>`;
      return;
    }
    const { arquivos } = r.valor;
    if (!arquivos.length) {
      this.painelMemoria.innerHTML = `<p class="vazia">Ela ainda não guardou nada.
        O que ela achar que vale a pena lembrar aparece aqui — e você edita.</p>`;
      return;
    }

    this.painelMemoria.innerHTML = arquivos
      .map(
        (a) => `<div class="arq">
           <button class="abrir" data-abrir="${a.caminho}" title="Abrir no editor">
             <span class="n">${a.nome.replace(/\.md$/, "")}</span>
             <span class="t">${a.tipo}</span>
           </button>
           <button class="x" data-esquecer="${a.caminho}" title="Esquecer isto">✕</button>
         </div>`,
      )
      .join("");
  }

  private async esquecer(caminho: string): Promise<void> {
    const nome = caminho.split("/").pop() ?? caminho;
    if (!confirm(`Esquecer "${nome}"? O arquivo é apagado.`)) return;
    const r = await this.api.mascote.esquecerArquivo(caminho);
    if (!r.ok) this.aoAvisar(r.erro);
    this.painelMemoria.classList.add("oculto");
    await this.alternarMemoria();
  }

  /**
   * Fecha o laço: ao fim da conversa, ela destila o que aprendeu no perfil.
   *
   * Roda depois, não durante — pensar sobre a conversa no meio dela atrapalha a
   * conversa. E só quando houve conversa de verdade: dois "oi" não mudam o que
   * ela sabe de alguém.
   */
  private async destilar(): Promise<void> {
    if (this.falas.length < 4 || this.falas.length === this.destiladoEm) return;
    this.destiladoEm = this.falas.length;
    const r = await this.api.mascote.destilar(this.falas);
    if (r.ok && r.valor) this.aoAvisar("a Fern atualizou o que sabe sobre você");
  }

  private destiladoEm = 0;

  private async enviar(): Promise<void> {
    const texto = this.campo.value.trim();
    if (!texto || this.esperando) return;

    this.falas.push({ quem: "autor", texto });
    this.campo.value = "";
    this.campo.style.height = "auto";
    this.esperando = true;
    this.mostrar("pensando");
    this.desenharFalas();

    const r = await this.api.mascote.conversar(this.falas);
    this.esperando = false;

    if (r.ok) {
      this.falas.push({ quem: "mascote", texto: r.valor.texto });
      // O que ela mexeu na memória aparece na barra de estado, não na conversa:
      // é recado do aplicativo, não fala dela.
      for (const efeito of r.valor.memoria) this.aoAvisar(`Fern: ${efeito}`);
      this.mostrar("feliz");
      window.clearTimeout(this.volta);
      this.volta = window.setTimeout(() => this.mostrar("parado"), 2000);
    } else {
      // O erro aparece na conversa, não no terminal: quem está conversando está
      // olhando para cá.
      this.falas.push({ quem: "mascote", texto: `(não consegui responder: ${r.erro})` });
      this.mostrar("preocupado");
    }
    this.desenharFalas();
    this.adiarOcioso();
  }

  /* --------------------------------- lugar -------------------------------- */

  private arrastou = false;

  private ligarArraste(): void {
    this.figura.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      const r = this.raiz.getBoundingClientRect();
      const dx = ev.clientX - r.left;
      const dy = ev.clientY - r.top;
      this.arrastou = false;
      this.figura.setPointerCapture(ev.pointerId);

      const mover = (e: PointerEvent): void => {
        if (!this.arrastou && Math.hypot(e.clientX - ev.clientX, e.clientY - ev.clientY) < 4) return;
        this.arrastou = true;
        this.raiz.classList.add("arrastando");
        this.porNoLugar(e.clientX - dx, e.clientY - dy);
      };
      const soltar = (): void => {
        this.raiz.classList.remove("arrastando");
        this.figura.removeEventListener("pointermove", mover);
        this.figura.removeEventListener("pointerup", soltar);
        this.figura.removeEventListener("pointercancel", soltar);
        if (this.arrastou) this.guardarLugar();
        // O clique dispara logo depois do soltar; zerar aqui abriria a conversa
        // ao fim de todo arraste.
        window.setTimeout(() => (this.arrastou = false), 0);
      };

      this.figura.addEventListener("pointermove", mover);
      this.figura.addEventListener("pointerup", soltar);
      this.figura.addEventListener("pointercancel", soltar);
    });
  }

  /** Mantém o mascote dentro da janela — inclusive depois de ela encolher. */
  private porNoLugar(x: number, y: number): void {
    const largura = this.raiz.offsetWidth;
    const altura = this.raiz.offsetHeight;
    const maxX = window.innerWidth - largura - 8;
    const maxY = window.innerHeight - altura - 30;
    this.raiz.style.left = `${Math.max(56, Math.min(maxX, x))}px`;
    this.raiz.style.top = `${Math.max(40, Math.min(maxY, y))}px`;
  }

  private guardarLugar(): void {
    localStorage.setItem(
      "bancada.mascoteLugar",
      JSON.stringify({ x: this.raiz.offsetLeft, y: this.raiz.offsetTop }),
    );
  }

  private restaurarLugar(): void {
    const guardado = localStorage.getItem("bancada.mascoteLugar");
    if (guardado) {
      try {
        const { x, y } = JSON.parse(guardado) as { x: number; y: number };
        this.porNoLugar(x, y);
        return;
      } catch {
        /* lugar corrompido: cai no canto padrão */
      }
    }
    // Canto de baixo à direita da área de escrita, longe das abas e da árvore.
    this.porNoLugar(window.innerWidth - 260, window.innerHeight - 240);
  }

  /** Chamado quando a janela muda de tamanho: ninguém pode ficar fora da tela. */
  reancorar(): void {
    this.porNoLugar(this.raiz.offsetLeft, this.raiz.offsetTop);
  }

  /** Recarrega sprite e configuração — depois de mexer em Configurações. */
  async recarregar(): Promise<void> {
    const [estado, quadros] = await Promise.all([
      this.api.mascote.estado(),
      this.api.mascote.quadros(),
    ]);
    if (estado.ok) this.estado = estado.valor;
    if (quadros.ok) this.quadros = quadros.valor;
    this.raiz.querySelector(".nome")!.textContent = this.estado?.nome ?? "Mascote";
    this.desenharRodape();
    this.mostrar("parado");
  }
}

export { ESTADOS as ESTADOS_DO_MASCOTE };
