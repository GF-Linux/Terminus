//* Os dois canais dos servidores de linguagem, mais o fio de volta.

import { ipcMain } from "electron";
import {
  aberturaDeProjeto,
  enviarAoServidor,
  estadoDoServidor,
  iniciarServidorDeLinguagem,
} from "../motores/motor-servidor-de-linguagem.js";
import type { MensagemLsp } from "../motores/canal-lsp.js";
import { respostaSegura as seguro } from "./resposta-segura.js";

//* Liga os canais do LSP.
//! ESTE REGISTRADOR IMPORTA UM MÓDULO DE `sistema/` (o motor). Teto do E2 = 2. ✔
//!   O `canal-lsp` entra só como TIPO, e tipo não é acoplamento em tempo de
//!   execução — ele some no `tsc`.
export function registrarLsp(): void {
  //! `iniciar` é PERGUNTA (a tela precisa saber se subiu, para dizer na barra),
  //!   mas o fio de VOLTA é evento: as mensagens do servidor chegam quando ele
  //!   quiser — diagnóstico aparece muito depois do arquivo abrir.
  ipcMain.handle(
    "lsp:iniciar",
    seguro((e, linguagem: unknown, raiz: unknown) => {
      if (typeof linguagem !== "string" || typeof raiz !== "string") {
        throw new Error("Pedido de servidor inválido.");
      }
      //! A MESMA guarda do `ponte-neovim` que morreu, pela mesma razão medida:
      //!   fechar a janela destrói a `WebContents`, e o servidor de linguagem
      //!   continua vivo por alguns milissegundos ainda mandando mensagem. O
      //!   `send` para objeto destruído lança, e no main isso vira caixa de erro
      //!   em cima de quem já mandou fechar.
      const alvo = e.sender;
      return iniciarServidorDeLinguagem(linguagem, raiz, (mensagem) => {
        if (!alvo.isDestroyed()) alvo.send("lsp:mensagem", linguagem, mensagem);
      });
    }),
  );

  //! ⚠️ ABRIR O PROJETO É UM PASSO À PARTE, e ele existe por causa do Roslyn: ele não
  //!   descobre a solução sozinho no arranque, e sem `solution/open` fica de pé analisando
  //!   nada — o defeito de campo *"escrevi erros e o código não acusou"*.
  //! Devolve a FRASE do que fez (ou do que faltou), para a tela poder dizer.
  ipcMain.handle(
    "lsp:abrir-projeto",
    seguro((_e, linguagem: unknown, raiz: unknown) => {
      if (typeof linguagem !== "string" || typeof raiz !== "string") {
        throw new Error("Pedido de abertura inválido.");
      }
      const abertura = aberturaDeProjeto(linguagem, raiz);
      if (!abertura) return null;
      //! Notificação: `method` + `params`, sem `id` — o Roslyn não responde a isto.
      enviarAoServidor(linguagem, {
        jsonrpc: "2.0",
        method: abertura.metodo,
        params: abertura.params,
      });
      return `${abertura.metodo} enviado`;
    }),
  );

  ipcMain.handle(
    "lsp:estado",
    seguro((_e, linguagem: unknown) => {
      if (typeof linguagem !== "string") throw new Error("Linguagem inválida.");
      return estadoDoServidor(linguagem);
    }),
  );

  //! `on` e não `handle`: a tela manda `didChange` a cada tecla, e esperar
  //!   resposta de ida e volta a cada letra atrasaria a digitação.
  ipcMain.on("lsp:enviar", (_e, linguagem: unknown, mensagem: unknown) => {
    if (typeof linguagem === "string" && mensagem && typeof mensagem === "object") {
      enviarAoServidor(linguagem, mensagem as MensagemLsp);
    }
  });
}
