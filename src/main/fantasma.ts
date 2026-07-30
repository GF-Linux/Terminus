import { chaveDoFantasma, configDoFantasma } from "./config.js";

/**
 * Texto fantasma — completamento por IA, no formato FIM (fill-in-the-middle).
 *
 * Item 3 da ordem do P1.4, e o único que sai da máquina. O que se **herda** é o
 * motor: o mesmo endpoint e a mesma chave que o autor já usa com o Twinny no VS
 * Code. O que se **constrói** é só esta ponte — não um motor de completamento.
 *
 * FIM não é chat: manda-se o que vem antes (`prompt`) e o que vem depois
 * (`suffix`) do cursor, e o modelo devolve o miolo. Por isso a sugestão encaixa
 * no meio de uma linha em vez de só continuar o arquivo.
 */

/** Quanto de código acompanha cada pedido. */
const ANTES = 2400;
const DEPOIS = 800;

/**
 * Só uma requisição viva por vez. Digitar invalida a anterior: sem isto, uma
 * resposta lenta chegaria depois de o cursor ter andado e sugeriria no lugar
 * errado — e ainda se pagaria por ela.
 */
let emVoo: AbortController | null = null;

export interface PedidoFantasma {
  /** Texto inteiro do documento. */
  texto: string;
  /** Deslocamento do cursor. */
  cursor: number;
}

export function cancelarFantasma(): void {
  emVoo?.abort();
  emVoo = null;
}

export async function sugerir(pedido: PedidoFantasma): Promise<string | null> {
  const cfg = configDoFantasma();
  const chave = chaveDoFantasma();
  if (!cfg || !cfg.ligado || !chave) return null;

  cancelarFantasma();
  const controle = new AbortController();
  emVoo = controle;

  const prefixo = pedido.texto.slice(Math.max(0, pedido.cursor - ANTES), pedido.cursor);
  const sufixo = pedido.texto.slice(pedido.cursor, pedido.cursor + DEPOIS);

  try {
    const resposta = await fetch(cfg.endpoint, {
      method: "POST",
      signal: controle.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
      body: JSON.stringify({
        model: cfg.modelo,
        prompt: prefixo,
        suffix: sufixo,
        // Curto de propósito: sugestão de várias linhas atrapalha mais do que
        // ajuda quem está aprendendo a escrever a análise, e custa mais.
        max_tokens: 96,
        temperature: 0.1,
        stream: false,
        stop: ["\n\n", "\ndef ", "\nclass "],
      }),
    });

    if (!resposta.ok) {
      throw new Error(`${resposta.status} ${resposta.statusText}`);
    }

    const dados = (await resposta.json()) as { choices?: { text?: string }[] };
    const texto = dados.choices?.[0]?.text ?? "";
    // Sugestão só de espaço em branco não é sugestão.
    return texto.trim() ? texto : null;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return null;
    throw err;
  } finally {
    if (emVoo === controle) emVoo = null;
  }
}
