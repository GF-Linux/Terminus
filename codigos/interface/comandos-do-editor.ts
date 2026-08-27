import * as monaco from "monaco-editor";
import { avisar } from "./nucleo-da-casca.js";
import { editorAtual } from "./editor-monaco.js";
import { arquivoAtivo, fecharAba, gravarAtivo } from "./estado-do-editor.js";
import { linguagemDoArquivo } from "../dominio/linguagem-do-arquivo.js";
import { alternarCopilotPara } from "./preferencias-do-copilot.js";

//? OS COMANDOS — três, e só três, porque o resto já é do Monaco
//!
//! ⚠️ ESTE ARQUIVO SUBSTITUI O `sistema/janela/atalhos-da-casca.ts`, QUE MORREU.
//! Aquele existia por UMA razão, escrita nele: *"O LazyVim mapeia `<C-s>` como
//! `<Esc>:w`, que grava e joga a pessoa para fora do modo de escrita."* Sem
//! Neovim não há modo de escrita para sair — e Ctrl+Z, Ctrl+Shift+Z, Ctrl+F,
//! Ctrl+H, Ctrl+D, Alt+↑↓ e a paleta viraram **nativos**, com a conduta do
//! VSCode, sem uma linha nossa.
//!
//! ⚠️ E ISTO FECHA A A19 (tracker §21.3, aberta desde 25/08): o `main` não
//! intercepta mais `Ctrl+\``, porque não há mais um segundo terminal dentro do
//! editor para ele abrir. A tecla volta a fazer o que o tooltip do painel
//! sempre prometeu.
//!
//! O que sobra aqui é o que o Monaco NÃO pode saber: que existe disco.

//* Liga os comandos que a casca é dona.
export function ligarComandosDoEditor(): void {
  const editor = editorAtual();
  if (!editor) return;

  //! Ctrl+S: o Monaco tem a tecla, mas não tem para onde gravar.
  //! `addCommand` e não `addAction`: isto não deve aparecer na paleta como uma
  //!   entrada nossa — é a tecla que todo mundo já conhece, não um recurso novo.
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    void gravarAtivo().then((erro) => {
      if (erro) avisar(erro);
    });
  });

  //! Ctrl+W fecha a aba. Fica FORA do Electron de propósito: registrado no
  //!   editor, ele só vale quando o foco está no texto — com o foco no terminal
  //!   a mesma tecla continua sendo do shell, que é onde ela significa outra
  //!   coisa.
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => {
    const alvo = arquivoAtivo();
    if (alvo) fecharAba(alvo.caminho);
  });

  //! Ctrl+Shift+S não existe: "gravar tudo" pediria decidir o que fazer quando
  //!   um dos arquivos falha, e essa decisão não foi tomada. Melhor não ter o
  //!   atalho do que tê-lo gravando metade e calando o resto.

  //? OS COMANDOS DA SUGESTÃO INLINE — itens 3 e 6 da comparação com o VSCode
  //!
  //! ⚠️ OS COMANDOS JÁ EXISTEM NO EDITOR — medido: quinze deles no pacote construído,
  //! `trigger`, `snooze`, `cancelSnooze`, `showNext`, `showPrevious`, `acceptNextWord`…
  //! **Nada disto é escrito aqui.** O que faltava era uma TECLA e um lugar de onde chamar:
  //! comando sem gesto é comando que não existe para quem usa.

  //! ITEM 3 — pedir a sugestão de propósito. `Ctrl+Alt+Espaço` porque `Ctrl+Espaço` já é
  //!   do autocomplete de linguagem, e as duas caixas não podem disputar a mesma tecla.
  //!   Este é o gesto que vira `triggerKind: Invoke` e traz ALTERNATIVAS (item 2).
  editor.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.Space,
    () => void editor.getAction("editor.action.inlineSuggest.trigger")?.run(),
  );

  //! ITEM 6 — adiar. Cada acionada soma cinco minutos, como no VSCode; `Shift` cancela.
  //!   Existe para o caso concreto de escrever texto (não código) sem o fantasma no meio.
  editor.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyZ,
    () => void editor.getAction("editor.action.inlineSuggest.snooze")?.run(),
  );
  editor.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ,
    () => void editor.getAction("editor.action.inlineSuggest.cancelSnooze")?.run(),
  );

  //! ITEM 7 — ligar/desligar o Copilot NA LINGUAGEM do arquivo aberto. A preferência é da
  //!   tela e sobrevive à sessão (ver `preferencias-do-copilot.ts`).
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyC, () => {
    const alvo = arquivoAtivo();
    if (!alvo) return;
    const linguagem = linguagemDoArquivo(alvo.caminho);
    const ligado = alternarCopilotPara(linguagem);
    avisar(`Copilot ${ligado ? "ligado" : "desligado"} para ${linguagem}`);
  });
}
