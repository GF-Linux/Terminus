//* Os sete canais do terminal: bytes sobem, bytes descem, ninguem interpreta.

import { ipcMain } from "electron";
import {
  abrirNoKonsole,
  enviarAoShell,
  iniciarShell,
  linhaDeCd,
  mandarLinha,
  pastaDoShell,
  redimensionarShell,
} from "../motores/motor-do-shell-pty.js";
import { respostaSegura as seguro } from "./resposta-segura.js";

//* Liga os canais do terminal da casca.
export function registrarShell(): void {
  /**
   * O terminal da casca — um shell de verdade, em pseudo-terminal (19/08).
   *
   * **O que estava aqui antes, e por que saiu.** Havia `exec:comando`, que
   * recebia a linha digitada, passava pela `triagem-de-comando.ts` (que
   * recusava `|`, `>`, `&&`, `;` e programa interativo), quebrava em programa +
   * argumentos e rodava com `shell: false` e canos comuns. Aquilo tinha um
   * defeito de origem: **sem PTY, programa nenhum acende a cor**, porque todos
   * checam `isatty` e recebem "não". Foi esse o relato do autor — cor no
   * Konsole, nenhuma aqui.
   *
   * Aquele desenho nasceu no SteamOS, que não compilava módulo nativo. A trava
   * acabou: o `node-pty` já roda o Neovim neste mesmo aplicativo desde a ADR
   * 0025. Então o terminal vira o que o Konsole é, e esta porta fica com o
   * mesmo formato da do Neovim: teclado sobe, bytes descem, ninguém interpreta.
   *
   * O histórico de comandos também saiu do `config.json`: quem guarda histórico
   * agora é o bash, no `.bash_history`, compartilhado com o Konsole. Duas
   * listas separadas de "o que eu já digitei" seria pior que uma.
   */
  ipcMain.on("shell:iniciar", (e, cwd: unknown, cols: unknown, rows: unknown) => {
    /**
     * Só manda para a interface se ela ainda existir.
     *
     * Mesma proteção do Neovim, pelo mesmo motivo medido lá: fechar a janela
     * destrói a `WebContents`, mas o PTY segue vivo por alguns milissegundos e
     * ainda emite bytes. O `send` para um objeto destruído lança, e no processo
     * principal isso vira caixa de erro em cima de quem já mandou fechar.
     */
    const alvo = e.sender;
    const mandar = (canal: string, carga: unknown): void => {
      if (!alvo.isDestroyed()) alvo.send(canal, carga);
    };

    iniciarShell({
      cwd: typeof cwd === "string" ? cwd : "",
      cols: typeof cols === "number" ? cols : 80,
      rows: typeof rows === "number" ? rows : 24,
      aoSaida: (d) => mandar("shell:saida", d),
      aoSair: (c) => mandar("shell:encerrou", c),
    });
  });

  ipcMain.on("shell:enviar", (_e, dados: unknown) => {
    if (typeof dados === "string") enviarAoShell(dados);
  });
  ipcMain.on("shell:redimensionar", (_e, cols: unknown, rows: unknown) => {
    if (typeof cols === "number" && typeof rows === "number") redimensionarShell(cols, rows);
  });
  ipcMain.handle(
    "shell:pasta",
    seguro(() => pastaDoShell()),
  );

  //? As duas linhas que o Terminus escreve em nome da pessoa
  //!
  //! São o botão Rodar e o `cd` de quando se abre outra pasta — e nada além.
  //! Toda outra tecla que chega ao shell veio do teclado, por `shell:enviar`.
  //! `mandarLinha` recusa quando há programa na frente (medido pelo `tpgid`),
  //! e o `false` sobe até a tela: melhor dizer "o terminal está ocupado" do que
  //! entregar a linha para dentro de um `sudo` que espera senha.
  ipcMain.handle(
    "shell:linha",
    seguro((_e, texto: unknown) => {
      if (typeof texto !== "string") throw new Error("Linha inválida.");
      if (/[\n\r\0]/.test(texto)) throw new Error("A linha não pode ter quebra de linha.");
      return mandarLinha(texto);
    }),
  );
  ipcMain.handle(
    "shell:ir-para",
    seguro((_e, pasta: unknown) => {
      if (typeof pasta !== "string") throw new Error("Pasta inválida.");
      return mandarLinha(linhaDeCd(pasta));
    }),
  );

  /**
   * O botão ↗ do cabeçalho: abre o **Konsole**, na pasta em que o shell está.
   *
   * Substitui a segunda janela do Electron da ADR 0031, que era uma cópia da
   * nossa própria tela. O pedido do autor foi trocar o terminal do Terminus
   * pelo Konsole; como o Konsole não pode ser embutido nesta janela (KPart é
   * Qt, a sessão é Wayland, e não existe XEmbed — medido), ele entra por aqui,
   * inteiro e de verdade.
   *
   * `detached` e os canos soltos: sem isso o Konsole seria filho do Terminus e
   * morreria junto com ele. Uma janela de terminal que fecha quando o editor
   * fecha não é o Konsole do sistema — é a segunda janela de novo, com outro
   * nome.
   */
  ipcMain.handle(
    "shell:konsole",
    seguro(() => abrirNoKonsole()),
  );
}
