import * as monaco from "monaco-editor";
import { linguagemDoArquivo } from "../dominio/linguagem-do-arquivo.js";
import { api } from "./base-da-tela.js";
import { copilotLigadoPara } from "./preferencias-do-copilot.js";

//? A SUGESTÃO INLINE — o provedor, e por que ele é TÃO curto
//!
//! 1. O VSCode não define protocolo de rede para sugestão inline. O que ele
//!    define é o REGISTRO: `registerInlineCompletionItemProvider`. Dentro do
//!    VSCode esse registro atravessa o RPC do host de extensão
//!    (`$registerInlineCompletionsSupport` → `$provideInlineCompletions`) até
//!    chegar em `languageFeaturesService.inlineCompletionsProvider`.
//! 2. Aqui não há host de extensão: `monaco.languages.registerInlineCompletions
//!    Provider` escreve NO MESMO REGISTRO, direto. Medido: o
//!    `standaloneLanguages.js:507` do pacote chama exatamente
//!    `languageFeaturesService.inlineCompletionsProvider.register`.
//! 3. Por isso este arquivo tem uma dúzia de linhas de trabalho e o resto é
//!    razão escrita: **quem desenha o texto fantasma, decide o atraso, aceita
//!    por palavra e por linha, e cancela ao digitar é o PRÓPRIO Monaco** — a
//!    contribuição `editor.contrib.inlineCompletionsController`, a mesma que o
//!    VSCode 1.134 desta máquina carrega. Nós só respondemos o que ele pergunta.

/** Quanto esperar a pessoa parar de digitar antes de perguntar ao Copilot. */
//! O Monaco tem debounce próprio, mas ele é do EDITOR. Este é do PROVEDOR, e o
//!   campo existe na API justamente para o provedor dizer o que o backend dele
//!   aguenta. 120 ms é a folga de uma tecla; abaixo disso a viagem até o
//!   servidor começa antes de a palavra existir.
const ATRASO_MS = 120;

//? A ATIVIDADE — o que a bolinha da barra de estado mostra
//!
//! Pedido da cabeça: *"deixe a cor verde piscando na bolinha quando o copilot estiver
//! ligado e carregando uma sugestão, ajuda a saber"*. E ajuda mesmo: sem isto, o silêncio
//! de "ainda estou pensando" e o de "não tenho nada" são o MESMO silêncio — e a primeira
//! sugestão da sessão leva segundos, porque o servidor está aquecendo.
//! ⚠️ CONTADOR, e não bandeira: o editor cancela e refaz o pedido a cada tecla, então
//!   chegam vários pedidos sobrepostos. Uma bandeira booleana seria apagada pelo primeiro
//!   que terminasse, e a bolinha pararia de piscar com dois ainda em voo.

let pedidosEmVoo = 0;
const ouvintesDeAtividade = new Set<(pedindo: boolean) => void>();

//* Assina o "está pedindo agora?". Devolve como cancelar.
export function aoMudarAtividade(ouvinte: (pedindo: boolean) => void): () => void {
  ouvintesDeAtividade.add(ouvinte);
  return () => ouvintesDeAtividade.delete(ouvinte);
}

function anunciarAtividade(): void {
  const pedindo = pedidosEmVoo > 0;
  for (const o of ouvintesDeAtividade) o(pedindo);
}

//* Liga o Copilot ao editor. Uma vez por sessão.
//! `"*"` e não uma lista de linguagens: o Copilot não é servidor de linguagem —
//!   ele sugere sobre texto, e restringir aqui só criaria uma segunda lista para
//!   divergir da do `dominio/linguagem-do-arquivo`.
export function ligarSugestaoInline(): monaco.IDisposable {
  return monaco.languages.registerInlineCompletionsProvider("*", {
    debounceDelayMs: ATRASO_MS,

    async provideInlineCompletions(modelo, posicao, contexto, cancelamento) {
      //! Modelo sem `uri` de arquivo é o buraco silencioso deste caminho: o
      //!   Monaco cria modelos internos (a caixa de busca, o peek) e pedir
      //!   sugestão para eles mandaria um caminho de mentira ao servidor.
      if (modelo.uri.scheme !== "file") return { items: [] };

      //! ⚠️ ITEM 7 DA COMPARAÇÃO: a pessoa pode desligar o Copilot para uma linguagem
      //!   (o que a documentação chama de `github.copilot.enable` por linguagem). Sem
      //!   isto, o único desligar era global.
      const caminho = modelo.uri.fsPath;
      const linguagem = linguagemDoArquivo(caminho);
      if (!copilotLigadoPara(linguagem)) return { items: [] };

      //! ⚠️ ITEM 2 DA COMPARAÇÃO: o `triggerKind` ATRAVESSA agora. Antes mandávamos
      //!   sempre `2` (Automatic), e o protocolo diz que só o `1` (Invoke) devolve
      //!   **várias** sugestões — então `showNext`/`showPrevious` e a barra de
      //!   alternativas não tinham o que ciclar. Digitando continua Automatic (uma só,
      //!   barata); pedindo de propósito (Ctrl+Alt+Espaço, item 3) vira Invoke.
      pedidosEmVoo += 1;
      anunciarAtividade();
      //! `try/finally` e não decremento no fim: o pedido pode falhar, e um contador que só
      //!   desce no caminho feliz fica preso em "pedindo" para sempre — a bolinha piscaria
      //!   sem parar, dizendo o contrário do que aconteceu.
      let r;
      try {
        r = await api.copilot.sugerir({
          caminho,
          linguagem,
          texto: modelo.getValue(),
          invocado: contexto.triggerKind === monaco.languages.InlineCompletionTriggerKind.Explicit,
        //! O LSP conta linha e coluna a partir de ZERO; o Monaco, a partir de
        //!   UM. Errar isto por um faz a sugestão vir uma linha acima, o que se
        //!   parece com "o Copilot está ruim" e não com um defeito.
          linha: posicao.lineNumber - 1,
          coluna: posicao.column - 1,
        });
      } finally {
        pedidosEmVoo -= 1;
        anunciarAtividade();
      }

      //! ⚠️ Checado DEPOIS da viagem, e é o ponto 1 da lista de riscos da planta:
      //!   entre pedir e responder a pessoa continuou digitando. Devolver aqui
      //!   uma sugestão para a posição de antes é pior que não sugerir — ela
      //!   aparece já errada e a pessoa aprende a ignorar o fantasma.
      if (cancelamento.isCancellationRequested || !r.ok) return { items: [] };

      return {
        items: r.valor.map((s) => ({
          insertText: s.insertText,
          //! O `range` do LSP é meia-aberto e conta de zero; o do Monaco conta
          //!   de um. Sem `range` o Monaco usa "a palavra na posição", que não é
          //!   o que o Copilot quis substituir.
          range: s.range
            ? new monaco.Range(
                s.range.start.line + 1,
                s.range.start.character + 1,
                s.range.end.line + 1,
                s.range.end.character + 1,
              )
            : undefined,
          //! Guardado no item para o aceite saber o que devolver. NÃO vai no
          //!   campo `command` do Monaco de propósito: lá dentro ele viraria um
          //!   comando do editor, e `github.copilot.didAcceptCompletionItem`
          //!   não existe neste editor — o Monaco tentaria executá-lo e falharia
          //!   toda vez que alguém aceitasse uma sugestão.
          _copilot: s.command,
        })) as monaco.languages.InlineCompletion[],
      };
    },

    //! É AQUI que o Copilot fica sabendo o que serviu — e é como ele para de
    //!   repetir o que já foi recusado. Sem devolver isto, a sugestão de hoje é
    //!   a mesma de amanhã.
    //! O grupo a que a edição seguinte cede a vez (ver `edicao-seguinte.ts`).
    groupId: "terminus-sugestao-inline",

    handleItemDidShow() {
      /* nada a fazer: quem conta exibição é o servidor, na hora do aceite */
    },

    //! ⚠️ ITEM 1 DA COMPARAÇÃO — aceitar por PALAVRA ou por LINHA (`Ctrl+→`).
    //! O comando já existia no editor e funcionava; o que faltava era **este gancho**, e
    //! sem ele o Copilot nunca ficava sabendo. O efeito prático: ele repetia inteira uma
    //! sugestão de que a pessoa tinha aproveitado só metade.
    //! ⚠️ O LIMITE, dito: o servidor desta máquina expõe `didAcceptCompletionItem` e não
    //! um comando de aceite PARCIAL (medido na lista de `executeCommandProvider`). Então
    //! o aceite parcial é contado como aceite — que é melhor que silêncio, e é o que o
    //! protocolo permite hoje.
    handlePartialAccept(_lista, item, _aceitos, _info) {
      const comando = (item as { _copilot?: { command: string; arguments?: unknown[] } })._copilot;
      if (comando) api.copilot.aceitou(comando);
    },

    handleEndOfLifetime(_lista, item, motivo) {
      //! O `kind` é ENUM, não string — o compilador pegou isto, e é bom que
      //!   tenha: comparar com `"accepted"` daria sempre falso e o Copilot nunca
      //!   ficaria sabendo de um aceite. Falha silenciosa perfeita.
      if (motivo.kind !== monaco.languages.InlineCompletionEndOfLifeReasonKind.Accepted) return;
      const comando = (item as { _copilot?: { command: string; arguments?: unknown[] } })._copilot;
      if (comando) api.copilot.aceitou(comando);
    },

    //! Obrigatório na interface. Não há nada a liberar: a lista é um objeto
    //!   comum, e o documento no servidor é fechado pelo `estado-do-editor`
    //!   quando a ABA fecha — que é o momento certo, não este.
    disposeInlineCompletions() {
      /* sem recurso próprio a liberar */
    },
  });
}
