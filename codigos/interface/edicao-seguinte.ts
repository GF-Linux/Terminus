import * as monaco from "monaco-editor";
import {
  faixaParaOEditor,
  faixaParaOProtocolo,
  posicaoParaOProtocolo,
} from "../dominio/faixa-do-editor.js";
import { linguagemDoArquivo } from "../dominio/linguagem-do-arquivo.js";
import { api } from "./base-da-tela.js";
import { copilotLigadoPara } from "./preferencias-do-copilot.js";

//? A EDIÇÃO SEGUINTE (NES) — a seta na calha e o salto por Tab
//!
//! Diferente da sugestão inline, que completa onde o cursor está, esta prevê **onde vai a
//! próxima mudança** — noutro ponto do arquivo. Quem desenha a seta, o salto (`Tab`) e a
//! visão lado a lado é o próprio editor, quando o item vem com `isInlineEdit: true`.
//!
//! ⚠️ ESTE ARQUIVO JÁ FOI ESCRITO, DECLARADO IMPOSSÍVEL E APAGADO — e as duas conclusões
//! estavam erradas. O que faltava não era permissão da conta nem o formato de prompt do
//! `xtab`: eram três coisas de protocolo, todas do lado do cliente, e todas visíveis no log
//! do servidor com `COPILOT_AGENT_VERBOSE=1`. Estão descritas em `motor-copilot-lsp.ts`.
//! Fica registrado porque o caro não foi implementar — foi concluir duas vezes que não dava.

/** Quanto esperar depois da última tecla antes de perguntar. */
//! Bem mais folgado que o da sugestão inline (120 ms): a edição seguinte é sobre uma mudança
//!   que TERMINOU, não sobre a palavra sendo escrita. Perguntar cedo gasta uma viagem para um
//!   estado que a pessoa ainda vai mudar.
const ATRASO_MS = 600;

/** Traduz os marcadores do editor para o que o Copilot entende. */
//! ⚠️ SÓ ERRO E AVISO ATRAVESSAM: o validador do servidor aceita `"error"` e `"warning"` e
//!   recusa o resto — não é escolha nossa. É por esta lista que ele propõe a CORREÇÃO do que
//!   o pyright ou o Roslyn apontaram: o `nextEditSuggestions.fixes` da documentação.
function problemasDoModelo(modelo: monaco.editor.ITextModel): {
  severidade: "error" | "warning";
  mensagem: string;
  inicio: { linha: number; coluna: number };
  fim: { linha: number; coluna: number };
}[] {
  return monaco.editor
    .getModelMarkers({ resource: modelo.uri })
    .filter(
      (m) =>
        m.severity === monaco.MarkerSeverity.Error ||
        m.severity === monaco.MarkerSeverity.Warning,
    )
    .map((m) => {
      const f = faixaParaOProtocolo(m);
      return {
        severidade:
          m.severity === monaco.MarkerSeverity.Error ? ("error" as const) : ("warning" as const),
        mensagem: m.message,
        inicio: { linha: f.start.line, coluna: f.start.character },
        fim: { linha: f.end.line, coluna: f.end.character },
      };
    });
}

//* Liga a edição seguinte ao editor. Uma vez por sessão.
export function ligarEdicaoSeguinte(): monaco.IDisposable {
  return monaco.languages.registerInlineCompletionsProvider("*", {
    debounceDelayMs: ATRASO_MS,

    async provideInlineCompletions(modelo, posicao, _contexto, cancelamento) {
      if (modelo.uri.scheme !== "file") return { items: [] };

      const caminho = modelo.uri.fsPath;
      const linguagem = linguagemDoArquivo(caminho);
      if (!copilotLigadoPara(linguagem)) return { items: [] };

      const p = posicaoParaOProtocolo(posicao);
      const r = await api.copilot.edicaoSeguinte({
        caminho,
        linguagem,
        texto: modelo.getValue(),
        linha: p.line,
        coluna: p.character,
        problemas: problemasDoModelo(modelo),
      });

      if (cancelamento.isCancellationRequested || !r.ok) return { items: [] };

      return {
        items: r.valor.map((e) => ({
          insertText: e.text,
          range: monaco.Range.lift(faixaParaOEditor(e.range)),
          //! ⚠️ É ESTA LINHA que muda o desenho: com `isInlineEdit`, o editor deixa de pôr
          //!   texto fantasma no cursor e passa a desenhar **seta na calha** no lugar da
          //!   edição, com salto por `Tab` e comparação lado a lado. Sem ela, uma edição a
          //!   trinta linhas de distância apareceria como fantasma em cima do cursor.
          isInlineEdit: true,
          _copilot: e.command,
        })) as monaco.languages.InlineCompletion[],
      };
    },

    handleEndOfLifetime(_lista, item, motivo) {
      if (motivo.kind !== monaco.languages.InlineCompletionEndOfLifeReasonKind.Accepted) return;
      const comando = (item as { _copilot?: { command: string; arguments?: unknown[] } })._copilot;
      //! O comando aqui é `didAcceptNextEditSuggestionItem`, e NÃO o de completar: são
      //!   contadores diferentes do lado do Copilot, e devolver o errado ensina errado.
      if (comando) api.copilot.aceitou(comando);
    },

    disposeInlineCompletions() {
      /* sem recurso próprio a liberar */
    },

    //! Quando as DUAS têm algo a dizer no mesmo instante, a sugestão inline ganha: ela é
    //!   sobre o que a mão está escrevendo agora; a edição seguinte é sobre outro lugar, e
    //!   roubar a vez dela puxaria o olho para longe.
    groupId: "terminus-edicao-seguinte",
    yieldsToGroupIds: ["terminus-sugestao-inline"],
  });
}
