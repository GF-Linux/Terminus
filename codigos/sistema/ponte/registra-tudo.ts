//? REGISTRA TUDO — os handlers de ipcMain, e nada alem deles 23/08/2026
//!
//! 1. Este arquivo era `janela-principal.ts`, com 707 linhas e CINCO papeis:
//!    partida do app, ciclo da janela, a guarda de caminho, o caso de uso e os
//!    37 handlers. Os tres primeiros ja sairam; o caso de uso sai na fatia 5 e
//!    os handlers se dividem em oito na fatia 6.
//! 2. A JANELA CHEGA INJETADA (`janelaViva`), nao importada — ramo A1. Um
//!    registrador que importa a janela nao pode ser lido sem o Electron junto.
//! 3. Os quatro dialogos nativos sairam para `janela/dialogos-do-sistema` — ramo
//!    A3. O registrador pede; quem conhece o `dialog` do Electron e a camada de
//!    janela.

import { app, type BrowserWindow, ipcMain, shell } from "electron";
import { existsSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import type { Fluxo, ProjetoAberto, Resultado } from "../../compartilhado/tipos.js";
import { dentroDaRaiz } from "../../dominio/guarda-de-caminho.js";
import { recusarEntrada } from "../../dominio/entrada-recusada.js";
import { ehPastaProtegida } from "../../dominio/protecao-da-pasta-aberta.js";
import { resolverReal } from "../infra/resolucao-de-caminho.js";
import { aLixeiraAlcanca } from "../infra/alcance-da-lixeira.js";
import { pastaPedidaNaLinha } from "../infra/argumentos-da-partida.js";
import { RAIZ_APP } from "../janela/janela-principal.js";
import {
  escolherImagem,
  escolherOndeSalvar,
  escolherPasta,
  perguntarExclusao,
} from "../janela/dialogos-do-sistema.js";
import {
  esquecerPasta,
  gravarAparencia,
  guardarWallpaper,
  lerAparencia,
  lerWallpaper,
  tirarWallpaper,
  pastasRecentes,
  PASTA_CONFIG,
  registrarPasta,
  ultimaPasta,
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
  abrirProjeto,
  criarArquivo,
  criarPasta,
  ehTexto,
  gravarArquivo,
  lerArquivo,
  listar,
  listarTudo,
  renomear,
} from "../infra/arquivos-do-projeto.js";
import { criarProjeto, NOME_DO_FLUXO } from "../infra/molde-de-projeto.js";
import { comoRodar } from "../infra/como-rodar-o-projeto.js";

let raizAberta: string | null = null;

//* Assume uma pasta como projeto: registra nos recentes e aponta o Neovim.
async function entrarNaPasta(raiz: string): Promise<ProjetoAberto> {
  // A leitura da pasta vem primeiro: se ela não existe mais, o erro sobe e a
  // pasta some da lista em vez de ser registrada de novo.
  const projeto = await abrirProjeto(raiz);
  raizAberta = raiz;
  // Aponta o Neovim para a pasta junto: o buscador dele nasce no lugar certo.
  void cdNeovim(raiz).catch(() => {});
  registrarPasta(raiz);
  return projeto;
}

//* Recusa apagar a pasta aberta, ou qualquer pasta acima dela.
//! A trava fica AQUI, e não só na tela: tela pode voltar a errar, e apagar a
//!   pasta aberta leva o trabalho do dia inteiro.
//! QUEM DECIDE é `dominio/protecao-da-pasta-aberta`; esta função só conhece a
//!   raiz aberta e sabe redigir a recusa. A decisão saiu daqui para poder ser
//!   testada sem subir o Electron.
function protegerPastaDeTrabalho(alvo: string): void {
  if (!ehPastaProtegida(alvo, raizAberta)) return;
  throw new Error(
    `"${path.basename(path.resolve(alvo))}" é a pasta de trabalho aberta (ou está acima dela). ` +
      "Para tirá-la do Terminus use Fechar pasta — excluir aqui apagaria o seu trabalho.",
  );
}

//* A única pasta em que o Terminus aceita ESCREVER: a que está aberta.
function raizesDeEscrita(): string[] {
  return raizAberta ? [path.resolve(raizAberta)] : [];
}

//* Resolve um caminho e exige que ele caia dentro das raízes permitidas.
//! As TRÊS ETAPAS moram em três lugares agora, e a ordem entre elas é a regra:
//!   1. `dominio/entrada-recusada` peneira o texto ANTES de resolver — depois de
//!      resolver, `-c` já virou um caminho dentro da raiz e passaria;
//!   2. `infra/resolucao-de-caminho` desfaz o link simbólico, senão um atalho no
//!      projeto apontando para `~/.bashrc` passaria na comparação de nome;
//!   3. `dominio/guarda-de-caminho` decide, sobre o caminho já real.
//! Só a etapa 2 toca o disco — e é por isso que só ela ficou em `sistema/`.
function confinado(alvo: unknown, raizes: string[], oQue = "caminho"): string {
  const texto = recusarEntrada(alvo, oQue);
  const real = resolverReal(texto);
  if (dentroDaRaiz(real, raizes)) return real;
  throw new Error(
    `"${path.basename(path.resolve(texto))}" está fora da pasta aberta — o Terminus não mexe em arquivo de fora.`,
  );
}

//* Embrulha um handler para que exceção vire erro exibível, não promessa perdida.
function seguro<A extends unknown[], T>(
  fn: (...args: A) => Promise<T> | T,
): (...args: A) => Promise<Resultado<T>> {
  return async (...args: A) => {
    try {
      return { ok: true, valor: await fn(...args) };
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : String(err) };
    }
  };
}

//* Registra os 37 canais de IPC. A janela chega INJETADA (ramo A1).
export function registrarPonte(janelaViva: () => BrowserWindow | null): void {
  //! Quem abre diálogo precisa de uma janela de verdade, e a recusa tem de
  //!   chegar à tela como erro exibível — por isso estoura com a mesma frase
  //!   que o monólito usava.
  const exigirJanela = (): BrowserWindow => {
    const janela = janelaViva();
    if (!janela) throw new Error("Janela não disponível.");
    return janela;
  };


  ipcMain.handle(
    "projeto:escolher",
    seguro(async () => {
      const pasta = await escolherPasta(exigirJanela(), "Abrir pasta da corrida");
      if (!pasta) return null;
      return entrarNaPasta(pasta);
    }),
  );

  // Abrir uma pasta já conhecida (um recente), sem passar pelo diálogo.
  ipcMain.handle("projeto:entrar", seguro((_e, raiz: string) => entrarNaPasta(raiz)));
  ipcMain.handle("projeto:recentes", seguro(() => pastasRecentes()));
  ipcMain.handle(
    "projeto:esquecer",
    seguro((_e, raiz: string) => {
      esquecerPasta(raiz);
      return pastasRecentes();
    }),
  );

  // `projeto:abrir` também serve de "atualizar" para a árvore, e é chamado a
  // cada criação de arquivo — religar o servidor ali reindexaria o projeto
  // inteiro a cada toque. Por isso ele não liga nada.
  ipcMain.handle("projeto:abrir", seguro((_e, raiz: string) => abrirProjeto(raiz)));
  ipcMain.handle(
    "projeto:inicial",
    seguro(async () => {
      // A linha de comando ganha da memória: quem digitou `bancada <pasta>`
      // disse o que quer agora. Sem argumento, volta a última pasta aberta —
      // reabrir o aplicativo no meio da mesma corrida é o caso comum, e
      // procurar a pasta no diálogo todo dia é trabalho que a máquina faz.
      const pasta = pastaPedidaNaLinha(RAIZ_APP, app.isPackaged) ?? ultimaPasta();
      if (!pasta) return null;
      return entrarNaPasta(pasta);
    }),
  );
  /**
   * O botão de fluxo (ADR 0027): escolher a linguagem e dizer onde, e a pasta
   * nasce pronta com o arquivo principal aberto.
   *
   * `showSaveDialog` e não `showOpenDialog`: o diálogo de salvar já pergunta
   * ONDE e COM QUE NOME de uma vez, que são as duas coisas que faltam. Com o de
   * abrir seria escolher a pasta-mãe numa tela e digitar o nome em outra.
   */
  ipcMain.handle(
    "projeto:novo",
    seguro(async (_e, fluxo: Fluxo) => {
      const janela = exigirJanela();
      if (fluxo !== "cpp" && fluxo !== "python" && fluxo !== "csharp") {
        throw new Error("Fluxo desconhecido.");
      }

      const onde = await escolherOndeSalvar(
        janela,
        `Novo projeto ${NOME_DO_FLUXO[fluxo]}`,
        "Criar aqui",
        path.join(ultimaPasta() ?? homedir(), `projeto-${fluxo}`),
      );
      if (!onde) return null;

      const principal = await criarProjeto(onde, fluxo);
      const projeto = await entrarNaPasta(onde);
      return { projeto, principal, fluxo };
    }),
  );

  /**
   * O botão Rodar (ADR 0030): que linha roda o que está nesta pasta.
   *
   * Não executa nada — devolve a linha, e quem a executa é o mesmo caminho da
   * linha de comando. Assim o que aparece na tela é exatamente o que rodou, e o
   * histórico do ↑ recebe a linha como se tivesse sido digitada.
   */
  ipcMain.handle(
    "projeto:como-rodar",
    seguro((_e, raiz: string, fluxo: Fluxo) => {
      if (typeof raiz !== "string" || raiz.length === 0) throw new Error("Sem pasta aberta.");
      if (fluxo !== "cpp" && fluxo !== "python" && fluxo !== "csharp") {
        throw new Error("Marque a linguagem no botão de fluxo primeiro.");
      }
      return comoRodar(raiz, fluxo);
    }),
  );

  ipcMain.handle("projeto:listar", seguro((_e, dir: string) => listar(dir)));
  ipcMain.handle("projeto:arquivos", seguro((_e, raiz: string) => listarTudo(raiz)));

  ipcMain.handle(
    "arquivo:ler",
    seguro((_e, arquivo: string) => {
      // Ler **não** é confinado à pasta aberta, e é de propósito: o traceback
      // clicável abre o quadro dentro da biblioteca, o `F12` vai à definição no
      // biblioteca. Fechar aqui quebraria o salto do traceback.
      // O que se protege é o único segredo que existe.
      if (typeof arquivo !== "string" || arquivo.length === 0 || arquivo.includes("\0")) {
        throw new Error("O arquivo não é válido.");
      }
      const abs = path.resolve(arquivo);
      const alvo = existsSync(abs) ? realpathSync(abs) : abs;
      if (alvo === path.resolve(path.join(PASTA_CONFIG, "config.json"))) {
        throw new Error("config.json é a configuração do Terminus — não abre no editor.");
      }
      if (!ehTexto(alvo)) {
        throw new Error(`${path.basename(alvo)} não é arquivo de texto — o Terminus não sabe abrir.`);
      }
      return lerArquivo(alvo);
    }),
  );

  ipcMain.handle(
    "arquivo:gravar",
    seguro((_e, arquivo: string, conteudo: string) => {
      if (typeof conteudo !== "string") throw new Error("Conteúdo inválido.");
      return gravarArquivo(confinado(arquivo, raizesDeEscrita(), "arquivo"), conteudo);
    }),
  );

  ipcMain.handle(
    "arquivo:criar",
    seguro((_e, raiz: string, dir: string, nome: string) => criarArquivo(raiz, dir, nome)),
  );
  ipcMain.handle(
    "pasta:criar",
    seguro((_e, raiz: string, dir: string, nome: string) => criarPasta(raiz, dir, nome)),
  );
  ipcMain.handle(
    "caminho:renomear",
    seguro((_e, raiz: string, antigo: string, nome: string) => renomear(raiz, antigo, nome)),
  );

  ipcMain.handle(
    "caminho:excluir",
    seguro(async (_e, alvo: string) => {
      const janela = exigirJanela();
      protegerPastaDeTrabalho(alvo);
      const nome = path.basename(alvo);
      const temLixeira = aLixeiraAlcanca(alvo, app.getPath("home"));

      if (!(await perguntarExclusao(janela, nome, temLixeira))) return false;

      // Lixeira, não `unlink`. Numa pasta pode haver arquivo insubstituível;
      // apagar de vez a partir de um clique errado não é reversível.
      if (temLixeira) {
        await shell.trashItem(alvo);
      } else {
        rmSync(alvo, { recursive: true, force: true });
      }
      return true;
    }),
  );


  // Aparência: papel de parede e tema (ADR 0010) — o que sobrou dela na casca.
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
