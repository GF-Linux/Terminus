import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

import { diagnosticosDoArquivo, precisaRelintar } from "./servidor.js";

/**
 * O erro escrito **na linha**, e não escondido atrás do mouse.
 *
 * ## Por que isto existe
 *
 * Comparando dois prints do autor em 08/08, o mesmo arquivo com os mesmos erros:
 *
 *   VS Code    `return dict`   **Expected indented block**
 *   Bancada    `return dict`   (bolinha na margem, rabisco embaixo, silêncio)
 *
 * O pyright da Bancada já sabia tudo — o print dela tinha seis erros marcados.
 * Ele só não **dizia**. Para ler a mensagem era preciso descobrir que existe
 * hover, levar o mouse até lá e esperar. Num ambiente cujo valor declarado é
 * didático (ver `_overview` do projeto), "tem algo errado aqui, adivinhe o quê"
 * está mais perto do silêncio do que do aviso.
 *
 * **E isto não depende do Copilot.** A mensagem já chega na máquina, de graça,
 * pelo servidor que a Bancada carrega desde 29/07. Foi a diferença mais barata
 * de todas as que os prints revelaram, e a única que não passa por rede.
 *
 * ## As decisões pequenas
 *
 * - **Uma linha, uma mensagem.** Havendo várias, ganha a mais grave, e um
 *   `+2` diz que há mais — a lista inteira continua no hover, que não sumiu.
 * - **Cortada em 90 caracteres.** Mensagem de type checker sabe ser um
 *   parágrafo, e um parágrafo empurrando a linha para fora da tela troca um
 *   problema por outro.
 * - **`side` alto de propósito.** O texto fantasma também é um widget no fim da
 *   linha, com `side: 1`. Um número maior põe o recado **depois** dele, e a
 *   leitura fica na ordem certa (o que se propõe, depois o que está errado) sem
 *   este módulo precisar saber que o fantasma existe.
 */

/** Mensagem de type checker sabe ser um parágrafo. */
const LIMITE = 90;

const PESO: Record<string, number> = { error: 0, warning: 1, info: 2 };
const peso = (g: string): number => PESO[g] ?? 2;

class Recado extends WidgetType {
  constructor(
    private readonly texto: string,
    private readonly gravidade: string,
  ) {
    super();
  }

  override eq(outro: Recado): boolean {
    return outro.texto === this.texto && outro.gravidade === this.gravidade;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = `cm-recado cm-recado-${this.gravidade}`;
    el.textContent = this.texto;
    return el;
  }

  /** É aviso, não conteúdo: clique e seleção pertencem ao código. */
  override ignoreEvent(): boolean {
    return true;
  }
}

export interface RecadoDeLinha {
  /** Número da linha, 1-based, como o CodeMirror conta. */
  linha: number;
  texto: string;
  gravidade: string;
}

/**
 * De uma lista de diagnósticos para **um recado por linha**, já cortado e
 * contado. Sem `EditorView` de propósito: é a parte que pode errar (escolher a
 * gravidade errada, contar errado, cortar no lugar errado) e é a parte que dá
 * para verificar sem tela — ver `verificar-recados.mjs`.
 */
export function recadosDe(
  doc: { lineAt: (pos: number) => { number: number }; length: number },
  diagnosticos: readonly { from: number; message: string; severity?: string }[],
): RecadoDeLinha[] {
  const porLinha = new Map<number, { texto: string; gravidade: string; quantos: number }>();

  for (const d of diagnosticos) {
    if (d.from > doc.length) continue;
    const numero = doc.lineAt(d.from).number;
    const gravidade = d.severity ?? "info";
    // O hover recebe `mensagem\n(código)`; aqui cabe só a primeira linha.
    const cru = d.message.split("\n")[0]!.trim();
    const texto = cru.length > LIMITE ? `${cru.slice(0, LIMITE - 1)}…` : cru;

    const atual = porLinha.get(numero);
    if (!atual) {
      porLinha.set(numero, { texto, gravidade, quantos: 1 });
      continue;
    }
    atual.quantos += 1;
    // A mais grave fala; as outras viram contagem.
    if (peso(gravidade) < peso(atual.gravidade)) {
      atual.texto = texto;
      atual.gravidade = gravidade;
    }
  }

  return [...porLinha]
    .sort((a, b) => a[0] - b[0])
    .map(([linha, r]) => ({
      linha,
      gravidade: r.gravidade,
      texto: r.quantos > 1 ? `${r.texto}  +${r.quantos - 1}` : r.texto,
    }));
}

function calcular(view: EditorView): DecorationSet {
  const marcas = recadosDe(view.state.doc, diagnosticosDoArquivo(view)).map((r) =>
    Decoration.widget({ widget: new Recado(r.texto, r.gravidade), side: 100 }).range(
      view.state.doc.line(r.linha).to,
    ),
  );
  return Decoration.set(marcas);
}

export const recadosNaLinha: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = calcular(view);
    }

    update(u: ViewUpdate): void {
      // `precisaRelintar` é o mesmo sinal que o `linter` usa: diagnóstico no LSP
      // é notificação, chega quando o servidor termina de pensar. Sem ele o
      // recado só apareceria na tecla seguinte, e sumiria tarde de uma linha já
      // consertada.
      if (u.docChanged || u.viewportChanged || precisaRelintar(u)) {
        this.decorations = calcular(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
