/**
 * O reprodutor do papel de parede animado (ADR 0011).
 *
 * ## O problema, medido
 *
 * GIF de papel de parede quase nunca é um loop fechado: o último quadro não
 * casa com o primeiro, e a cada volta a tela dá um tranco. No GIF que o autor
 * estava usando, a diferença média por canal entre o último quadro e o primeiro
 * é **11,2**, contra **3,3** entre dois quadros vizinhos — o salto da emenda é
 * 3,4 vezes maior que o movimento normal da animação.
 *
 * Isso quer dizer que **a emenda está no arquivo, não no reprodutor**. Nenhum
 * decodificador conserta; o que se faz é mascarar. É o que este arquivo faz.
 *
 * ## Como
 *
 * Em vez de deixar o `<img>` rodar o GIF sozinho, os quadros são decodificados
 * pelo `ImageDecoder` e desenhados num canvas, o que dá controle sobre a ordem e
 * sobre a mistura entre eles. Três modos:
 *
 *   seco       a volta crua, como o navegador faz. Só serve para GIF que já é
 *              loop fechado — aí não há emenda a esconder.
 *   crossfade  o fim se dissolve no começo. A linha do tempo encurta na largura
 *              da janela de mistura, e os quadros da cauda entram desaparecendo
 *              por cima dos da cabeça. É a costura de loop de sempre, a mesma
 *              que se faz em vídeo.
 *   vai-e-vem  toca de trás para a frente ao chegar no fim. Não existe emenda
 *              porque não existe volta — em compensação o movimento inverte, o
 *              que entrega o truque se houver algo caindo ou andando na cena.
 *
 * Como o fundo é sempre escurecido e quase sempre desfocado (ADR 0010), os
 * quadros são reduzidos na decodificação: nitidez que ninguém vê não vale a
 * memória que custa.
 */

export type Junta = "seco" | "crossfade" | "vaivem";

/**
 * Os bytes de uma `data:` URL, decodificados à mão.
 *
 * Sem `fetch`: a política de segurança da casca é `default-src 'self'`, e ela
 * vale para `connect-src` também — buscar a própria `data:` URL é bloqueado.
 * Afrouxar a política para carregar papel de parede seria trocar segurança por
 * conveniência; `atob` resolve sem tocar nela.
 */
function bytesDaDataUrl(url: string): { dados: Uint8Array; tipo: string } {
  const virgula = url.indexOf(",");
  const tipo = url.slice(5, url.indexOf(";"));
  const binario = atob(url.slice(virgula + 1));
  const dados = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) dados[i] = binario.charCodeAt(i);
  return { dados, tipo };
}

/** Teto de largura do canvas. Acima disso é nitidez que o véu come. */
const LARGURA_MAXIMA = 1280;
/** Teto de quadros decodificados, para um GIF gigante não comer a memória. */
const MAX_QUADROS = 400;

interface Quadro {
  imagem: ImageBitmap;
  /** Duração em milissegundos. */
  duracao: number;
}

export class FundoAnimado {
  private quadros: Quadro[] = [];
  private tela: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private pedido = 0;
  private junta: Junta = "crossfade";
  /** Quantos quadros a mistura ocupa. Calculado a partir da duração real. */
  private janela = 0;

  constructor(private readonly host: HTMLElement) {
    // Janela escondida não desenha: o Deck é uma máquina a bateria, e ninguém
    // precisa de 25 quadros por segundo atrás de uma janela minimizada.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.parar();
      else if (this.quadros.length) this.tocar();
    });
  }

  parar(): void {
    if (this.pedido) cancelAnimationFrame(this.pedido);
    this.pedido = 0;
  }

  limpar(): void {
    this.parar();
    for (const q of this.quadros) q.imagem.close();
    this.quadros = [];
    this.tela?.remove();
    this.tela = null;
    this.ctx = null;
  }

  /**
   * Troca o modo **agora**, reiniciando a volta.
   *
   * A primeira versão só recalculava a janela e deixava o ciclo em curso
   * terminar — e a medição pela tela mostrou o efeito: trocar de modo parecia
   * não fazer nada por vários segundos (saindo do vai-e-vem, que tem quase o
   * dobro de passos, chegava a quatro segundos). Quem clica num botão de
   * aparência espera ver a diferença enquanto ainda está olhando.
   */
  definirJunta(junta: Junta): void {
    if (junta === this.junta) return;
    this.junta = junta;
    this.calcularJanela();
    if (this.quadros.length) this.tocar();
  }

  /**
   * Tenta assumir a imagem. Devolve `false` quando ela não é animada ou é
   * grande demais — e aí quem desenha é o CSS, como antes.
   */
  async assumir(dataUrl: string, junta: Junta): Promise<boolean> {
    this.limpar();
    this.junta = junta;

    if (typeof ImageDecoder === "undefined") return false;

    const { dados, tipo } = bytesDaDataUrl(dataUrl);

    let decodificador: ImageDecoder;
    try {
      decodificador = new ImageDecoder({ data: dados, type: tipo });
      await decodificador.tracks.ready;
    } catch {
      return false;
    }

    const trilha = decodificador.tracks.selectedTrack;
    if (!trilha?.animated || trilha.frameCount < 2) {
      decodificador.close();
      return false;
    }
    if (trilha.frameCount > MAX_QUADROS) {
      decodificador.close();
      return false;
    }

    // Decodifica o primeiro para saber o tamanho e a escala de redução.
    const primeiro = await decodificador.decode({ frameIndex: 0 });
    const larguraCheia = primeiro.image.displayWidth;
    const alturaCheia = primeiro.image.displayHeight;
    const escala = Math.min(1, LARGURA_MAXIMA / larguraCheia);
    const largura = Math.round(larguraCheia * escala);
    const altura = Math.round(alturaCheia * escala);

    for (let i = 0; i < trilha.frameCount; i++) {
      const { image } = i === 0 ? primeiro : await decodificador.decode({ frameIndex: i });
      const bitmap = await createImageBitmap(image, {
        resizeWidth: largura,
        resizeHeight: altura,
        resizeQuality: "medium",
      });
      // `duration` vem em microssegundos; GIF sem duração cai em 100 ms, que é
      // o padrão histórico do formato.
      this.quadros.push({ imagem: bitmap, duracao: (image.duration ?? 100_000) / 1000 });
      image.close();
    }
    decodificador.close();

    this.tela = document.createElement("canvas");
    this.tela.width = largura;
    this.tela.height = altura;
    this.tela.className = "fundoAnimado";
    this.host.append(this.tela);
    this.ctx = this.tela.getContext("2d");

    this.calcularJanela();
    this.tocar();
    return true;
  }

  /**
   * A janela de mistura: cerca de meio segundo, limitada a um quarto da
   * animação. Meio segundo é o que some sem ser percebido; um quarto impede
   * que uma animação curta vire uma dissolução permanente.
   */
  private calcularJanela(): void {
    if (this.junta !== "crossfade" || this.quadros.length < 6) {
      this.janela = 0;
    } else {
      let ms = 0;
      let n = 0;
      for (let i = this.quadros.length - 1; i >= 0 && ms < 500; i--) {
        ms += this.quadros[i]!.duracao;
        n++;
      }
      this.janela = Math.max(2, Math.min(n, Math.floor(this.quadros.length / 4)));
    }
    this.publicar();
  }

  /** Deixa o estado do reprodutor legível no próprio elemento — dá para conferir
   *  o que está tocando sem instrumentar nada. */
  private publicar(): void {
    // Prefixo `fundo`: `data-junta` sozinho colidia com o atributo dos botões de
    // Configurações, e um `querySelector("[data-junta=…]")` pegava este elemento
    // em vez do botão. Nome de atributo é espaço compartilhado.
    this.host.dataset["fundoJunta"] = this.junta;
    this.host.dataset["fundoJanela"] = String(this.janela);
    this.host.dataset["fundoQuadros"] = String(this.quadros.length);
  }

  /** A ordem em que os quadros são mostrados, já com o modo aplicado. */
  private roteiro(): number[] {
    const n = this.quadros.length;
    if (this.junta === "vaivem") {
      const ida = [...Array(n).keys()];
      const volta = ida.slice(1, -1).reverse();
      return [...ida, ...volta];
    }
    // No crossfade a linha do tempo encurta: a cauda deixa de ter vez própria e
    // passa a entrar por cima da cabeça.
    return [...Array(n - this.janela).keys()];
  }

  private tocar(): void {
    this.parar();
    const ctx = this.ctx;
    const tela = this.tela;
    if (!ctx || !tela || !this.quadros.length) return;

    let ordem = this.roteiro();
    let passo = 0;
    let inicioDoQuadro = performance.now();

    const desenhar = (agora: number): void => {
      const indice = ordem[passo % ordem.length]!;
      const quadro = this.quadros[indice]!;

      ctx.clearRect(0, 0, tela.width, tela.height);
      ctx.globalAlpha = 1;
      ctx.drawImage(quadro.imagem, 0, 0, tela.width, tela.height);

      // A cauda entra por cima da cabeça, desaparecendo: é isto que esconde o
      // tranco da volta.
      if (this.junta === "crossfade" && this.janela > 0 && passo % ordem.length < this.janela) {
        const k = passo % ordem.length;
        const cauda = this.quadros[ordem.length + k];
        if (cauda) {
          ctx.globalAlpha = (this.janela - k) / (this.janela + 1);
          ctx.drawImage(cauda.imagem, 0, 0, tela.width, tela.height);
          ctx.globalAlpha = 1;
        }
      }

      if (agora - inicioDoQuadro >= quadro.duracao) {
        inicioDoQuadro = agora;
        passo++;
        // Trocar de modo no meio não pode esperar a volta inteira.
        if (passo % ordem.length === 0) ordem = this.roteiro();
      }
      this.pedido = requestAnimationFrame(desenhar);
    };

    this.pedido = requestAnimationFrame(desenhar);
  }
}
