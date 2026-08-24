//? REGISTRA TUDO — os handlers de ipcMain, e nada alem deles 23/08/2026
//!
//! 1. Este arquivo era `janela-principal.ts`, com 707 linhas e CINCO papeis:
//!    partida do app, ciclo da janela, a guarda de caminho, o caso de uso e os
//!    37 handlers. Sobraram os handlers.
//! 2. A JANELA CHEGA INJETADA (`janelaViva`), nao importada — ramo A1. Um
//!    registrador que importa a janela nao pode ser lido sem o Electron junto.
//! 3. O handler NAO FAZ TRABALHO: ele confere a forma do que chegou pelo IPC e
//!    delega. Quem chama infra, motor e persistencia na ordem certa e
//!    `sistema/servicos/` — foi para la que a orquestracao foi.
//! 4. Os 37 canais continuam 37, com os mesmos nomes e as mesmas cargas: a
//!    interface nao sabe que houve refatoracao (§12·3).

import { app, type BrowserWindow, ipcMain } from "electron";
import type { Fluxo } from "../../compartilhado/tipos.js";
import { ehFluxoConhecido } from "../../dominio/fluxo-conhecido.js";
import { comoRodar } from "../infra/como-rodar-o-projeto.js";
import { escolherImagem } from "../janela/dialogos-do-sistema.js";
import {
  gravarAparencia,
  guardarWallpaper,
  lerAparencia,
  lerWallpaper,
  tirarWallpaper,
} from "../motores/configuracao-salva.js";
import {
  abrirNoKonsole,
  enviarAoShell,
  iniciarShell,
  linhaDeCd,
  mandarLinha,
  pastaDoShell,
  redimensionarShell,
} from "../motores/motor-do-shell-pty.js";
import {
  enviarNeovim,
  iniciarNeovim,
  pararNeovim,
  redimensionarNeovim,
} from "../motores/motor-neovim-pty.js";
import {
  abrirNoNeovim,
  cdNeovim,
  pluginsNeovim,
  resetarControle,
} from "../motores/controle-neovim-rpc.js";
import {
  entrarNaPasta,
  escolherPastaEEntrar,
  esquecerRecente,
  abrirPastaInicial,
  listarRecentes,
} from "../servicos/abertura-de-projeto.js";
import { escolherECriar } from "../servicos/criacao-de-projeto.js";
import { excluirCaminho } from "../servicos/exclusao-de-caminho.js";
import {
  criarArquivoNoProjeto,
  criarPastaNoProjeto,
  gravarConfinado,
  renomearNoProjeto,
} from "../servicos/escrita-confinada.js";
import {
  abrirParaTela,
  lerParaEditor,
  listarPasta,
  listarProjeto,
} from "../servicos/leitura-de-arquivo.js";
import { respostaSegura as seguro } from "./resposta-segura.js";

//* Registra os 37 canais de IPC. A janela chega INJETADA (ramo A1).
export function registrarPonte(janelaViva: () => BrowserWindow | null): void {
  //! Quem abre dialogo precisa de uma janela de verdade, e a recusa tem de
  //!   chegar a tela como erro exibivel — por isso estoura com a mesma frase que
  //!   o monolito usava.
  const exigirJanela = (): BrowserWindow => {
    const janela = janelaViva();
    if (!janela) throw new Error("Janela não disponível.");
    return janela;
  };

  // ── projeto ────────────────────────────────────────────────────────────────
  ipcMain.handle("projeto:escolher", seguro(() => escolherPastaEEntrar(exigirJanela())));

  //! `projeto:entrar` abre um recente sem passar pelo dialogo.
  ipcMain.handle("projeto:entrar", seguro((_e, raiz: string) => entrarNaPasta(raiz)));
  ipcMain.handle("projeto:recentes", seguro(() => listarRecentes()));
  ipcMain.handle("projeto:esquecer", seguro((_e, raiz: string) => esquecerRecente(raiz)));

  //! `projeto:abrir` tambem serve de "atualizar" para a arvore, e e chamado a
  //!   cada criacao de arquivo — por isso ele nao liga nada.
  ipcMain.handle("projeto:abrir", seguro((_e, raiz: string) => abrirParaTela(raiz)));
  ipcMain.handle("projeto:inicial", seguro(() => abrirPastaInicial()));

  ipcMain.handle(
    "projeto:novo",
    seguro((_e, fluxo: Fluxo) => {
      if (!ehFluxoConhecido(fluxo)) throw new Error("Fluxo desconhecido.");
      return escolherECriar(exigirJanela(), fluxo);
    }),
  );

  /**
   * O botao Rodar (ADR 0030): que linha roda o que esta nesta pasta.
   *
   * Nao executa nada — devolve a linha, e quem a executa e o mesmo caminho da
   * linha de comando. Assim o que aparece na tela e exatamente o que rodou, e o
   * historico do seta-para-cima recebe a linha como se tivesse sido digitada.
   */
  ipcMain.handle(
    "projeto:como-rodar",
    seguro((_e, raiz: unknown, fluxo: unknown) => {
      if (typeof raiz !== "string" || raiz.length === 0) throw new Error("Sem pasta aberta.");
      if (!ehFluxoConhecido(fluxo)) {
        throw new Error("Marque a linguagem no botão de fluxo primeiro.");
      }
      return comoRodar(raiz, fluxo);
    }),
  );

  ipcMain.handle("projeto:listar", seguro((_e, dir: string) => listarPasta(dir)));
  ipcMain.handle("projeto:arquivos", seguro((_e, raiz: string) => listarProjeto(raiz)));

  // ── arquivo e pasta ────────────────────────────────────────────────────────
  ipcMain.handle("arquivo:ler", seguro((_e, arquivo: unknown) => lerParaEditor(arquivo)));
  ipcMain.handle(
    "arquivo:gravar",
    seguro((_e, arquivo: unknown, conteudo: unknown) => gravarConfinado(arquivo, conteudo)),
  );
  ipcMain.handle(
    "arquivo:criar",
    seguro((_e, raiz: string, dir: string, nome: string) => criarArquivoNoProjeto(raiz, dir, nome)),
  );
  ipcMain.handle(
    "pasta:criar",
    seguro((_e, raiz: string, dir: string, nome: string) => criarPastaNoProjeto(raiz, dir, nome)),
  );
  ipcMain.handle(
    "caminho:renomear",
    seguro((_e, raiz: string, antigo: string, nome: string) => renomearNoProjeto(raiz, antigo, nome)),
  );
  ipcMain.handle(
    "caminho:excluir",
    seguro((_e, alvo: string) => excluirCaminho(alvo, exigirJanela(), app.getPath("home"))),
  );

  // ── aparencia (ADR 0010) ───────────────────────────────────────────────────
  ipcMain.handle(
    "aparencia:estado",
    seguro(() => ({ ...lerAparencia(), imagem: lerWallpaper() })),
  );
  ipcMain.handle(
    "aparencia:definir",
    seguro((_e, parcial: Record<string, unknown>) => ({
      ...gravarAparencia(parcial),
      imagem: lerWallpaper(),
    })),
  );
  ipcMain.handle(
    "aparencia:escolher",
    seguro(async () => {
      const imagem = await escolherImagem(exigirJanela(), "Escolher papel de parede");
      if (!imagem) return null;
      return { ...guardarWallpaper(imagem), imagem: lerWallpaper() };
    }),
  );
  ipcMain.handle(
    "aparencia:tirar",
    seguro(() => ({ ...tirarWallpaper(), imagem: null })),
  );

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

  // O motor de edição (ADR 0025): o Neovim por PTY. A interface manda o tamanho
  // já ajustado à área; a saída volta pelo mesmo `sender`, e o processo é único.
  ipcMain.on("neovim:iniciar", (e, cwd: unknown, cols: unknown, rows: unknown) => {
    // Neovim novo, socket novo: a conexão de controle antiga aponta para um
    // socket morto e precisa recomeçar na próxima chamada.
    resetarControle();

    /**
     * Só manda para a interface se ela ainda existir.
     *
     * **Isto é a correção de um erro visto na tela ao fechar o aplicativo:**
     * `TypeError: Object has been destroyed`. Fechar a janela destrói a
     * `WebContents`, mas o PTY do Neovim continua vivo por alguns milissegundos e
     * ainda emite bytes — a sequência de saída dele, inclusive. O `send` para um
     * objeto destruído lança, e no processo principal isso vira caixa de erro em
     * cima do usuário, depois de ele já ter mandado fechar.
     */
    const alvo = e.sender;
    const mandar = (canal: string, carga: unknown): void => {
      if (!alvo.isDestroyed()) alvo.send(canal, carga);
    };

    iniciarNeovim({
      cwd: typeof cwd === "string" ? cwd : "",
      cols: typeof cols === "number" ? cols : 80,
      rows: typeof rows === "number" ? rows : 24,
      aoSaida: (d) => mandar("neovim:saida", d),
      aoSair: (c) => mandar("neovim:encerrou", c),
    });
  });

  // Abrir arquivo é da casca (ADR 0025): manda `edit` + `startinsert` por RPC,
  // então o clique no Explorer já deixa a pessoa escrevendo — sem a escapada por
  // teclas da Fatia 1, e sem depender do modo em que o cursor estava.
  ipcMain.handle(
    "neovim:abrir",
    seguro((_e, caminho: unknown, linha: unknown) => {
      if (typeof caminho !== "string") throw new Error("Caminho inválido.");
      return abrirNoNeovim(caminho, typeof linha === "number" ? linha : undefined);
    }),
  );
  ipcMain.on("neovim:cd", (_e, pasta: unknown) => {
    if (typeof pasta === "string") void cdNeovim(pasta).catch(() => {});
  });
  ipcMain.handle("neovim:plugins", seguro(() => pluginsNeovim()));
  ipcMain.on("neovim:enviar", (_e, dados: unknown) => {
    if (typeof dados === "string") enviarNeovim(dados);
  });
  ipcMain.on("neovim:redimensionar", (_e, cols: unknown, rows: unknown) => {
    if (typeof cols === "number" && typeof rows === "number") {
      redimensionarNeovim(cols, rows);
    }
  });
  ipcMain.on("neovim:parar", () => pararNeovim());

  ipcMain.on("janela:minimizar", () => janelaViva()?.minimize());
  ipcMain.on("janela:alternar-maximo", () => {
    const janela = janelaViva();
    if (!janela) return;
    if (janela.isMaximized()) janela.unmaximize();
    else janela.maximize();
  });
  ipcMain.on("janela:fechar", () => janelaViva()?.close());
}
