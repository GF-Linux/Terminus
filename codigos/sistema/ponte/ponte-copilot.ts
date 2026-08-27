//* Os dois canais da sugestão inline: pedir uma, e perguntar como o Copilot está.

import { ipcMain } from "electron";
import {
  aceitou,
  acompanharDocumento,
  estadoCopilot,
  editarDocumento,
  fecharDocumento,
  pedirEdicaoSeguinte,
  sugerir,
} from "../motores/motor-copilot-lsp.js";
import { respostaSegura as seguro } from "./resposta-segura.js";

//* Liga os canais do Copilot.
//! DOIS CANAIS E DUAS NOTIFICAÇÕES, e a divisão não é arbitrária: `sugerir` e
//!   `estado` são PERGUNTAS (a tela espera resposta), enquanto `aceitou` e
//!   `fechou` são AVISOS — a tela não tem o que fazer com a resposta, e esperar
//!   por ela só atrasaria a tecla seguinte.
//! ESTE REGISTRADOR IMPORTA UM MÓDULO DE `sistema/` (o motor). Teto do E2 = 2. ✔
export function registrarCopilot(): void {
  //! `invoke` e não `send`: o provedor do Monaco DEVOLVE uma promessa ao editor,
  //!   e é o editor que decide quanto esperar e quando cancelar.
  ipcMain.handle(
    "copilot:sugerir",
    seguro(async (_e, pedido: unknown) => {
      //! A carga chega crua do renderer. Checar a FORMA aqui é o trabalho deste
      //!   registrador — o motor recebe tipos, não esperança.
      const p = pedido as Record<string, unknown> | null;
      if (
        !p ||
        typeof p.caminho !== "string" ||
        typeof p.linguagem !== "string" ||
        typeof p.texto !== "string" ||
        typeof p.linha !== "number" ||
        typeof p.coluna !== "number"
      ) {
        throw new Error("Pedido de sugestão inválido.");
      }
      return sugerir({
        caminho: p.caminho,
        linguagem: p.linguagem,
        texto: p.texto,
        linha: p.linha,
        coluna: p.coluna,
        invocado: p.invocado === true,
      });
    }),
  );

  //! ⚠️ CANAL PRÓPRIO para a edição seguinte: são duas perguntas com ritmos diferentes — a
  //!   sugestão vem a cada pausa de digitação; a edição seguinte, depois de uma mudança
  //!   assentar. Misturá-las pagaria o custo da mais cara a cada tecla.
  ipcMain.handle(
    "copilot:edicao-seguinte",
    seguro((_e, pedido: unknown) => {
      const p = pedido as Record<string, unknown> | null;
      if (
        !p ||
        typeof p.caminho !== "string" ||
        typeof p.linguagem !== "string" ||
        typeof p.texto !== "string" ||
        typeof p.linha !== "number" ||
        typeof p.coluna !== "number"
      ) {
        throw new Error("Pedido de edição seguinte inválido.");
      }
      return pedirEdicaoSeguinte({
        caminho: p.caminho,
        linguagem: p.linguagem,
        texto: p.texto,
        linha: p.linha,
        coluna: p.coluna,
        problemas: Array.isArray(p.problemas) ? (p.problemas as never[]) : [],
      });
    }),
  );

  //! ⚠️ AVISO, e não pergunta: chega a cada tecla. E é o canal de que o NES depende — sem os
  //!   deltas o servidor não tem histórico e recusa com `activeDocumentHasNoEdits`.
  ipcMain.on("copilot:editou", (_e, pedido: unknown) => {
    const p = pedido as Record<string, unknown> | null;
    if (p && typeof p.caminho === "string" && Array.isArray(p.mudancas)) {
      editarDocumento({ caminho: p.caminho, mudancas: p.mudancas as never[] });
    }
  });

  ipcMain.handle("copilot:estado", seguro(() => estadoCopilot()));

  //! O aceite é AVISO e não pergunta: a tecla que aceita a sugestão não pode
  //!   esperar a viagem até o servidor para o texto aparecer na tela.
  ipcMain.on("copilot:aceitou", (_e, comando: unknown) => {
    const c = comando as { command?: unknown; arguments?: unknown } | null;
    if (c && typeof c.command === "string") {
      aceitou({ command: c.command, arguments: Array.isArray(c.arguments) ? c.arguments : [] });
    }
  });

  //! AVISO e não pergunta: a aba já apareceu na tela; o servidor pode saber depois.
  ipcMain.on("copilot:acompanhar", (_e, pedido: unknown) => {
    const p = pedido as Record<string, unknown> | null;
    if (
      p &&
      typeof p.caminho === "string" &&
      typeof p.linguagem === "string" &&
      typeof p.texto === "string"
    ) {
      void acompanharDocumento({ caminho: p.caminho, linguagem: p.linguagem, texto: p.texto });
    }
  });

  ipcMain.on("copilot:fechou", (_e, caminho: unknown) => {
    if (typeof caminho === "string") fecharDocumento(caminho);
  });
}
