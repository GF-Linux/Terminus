import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from "electron";
import { existsSync, realpathSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Fluxo, ProjetoAberto, Resultado } from "../compartilhado/tipos.js";
import { dentroDaRaiz } from "../dominio/guarda-de-caminho.js";
import { recusarEntrada } from "../dominio/entrada-recusada.js";
import { ehPastaProtegida } from "../dominio/protecao-da-pasta-aberta.js";
import { resolverReal } from "./infra/resolucao-de-caminho.js";
import { aLixeiraAlcanca } from "./infra/alcance-da-lixeira.js";
import {
  esquecerPasta,
  limparHistoricoAntigo,
  gravarAparencia,
  guardarWallpaper,
  lerAparencia,
  lerWallpaper,
  tirarWallpaper,
  pastasRecentes,
  PASTA_CONFIG,
  registrarPasta,
  ultimaPasta,
} from "./configuracao-salva.js";
import {
  abrirNoKonsole,
  enviarAoShell,
  iniciarShell,
  linhaDeCd,
  mandarLinha,
  pararShell,
  pastaDoShell,
  redimensionarShell,
} from "./motor-do-shell-pty.js";
import {
  enviarNeovim,
  iniciarNeovim,
  pararNeovim,
  redimensionarNeovim,
} from "./motor-neovim-pty.js";
import {
  abrirNoNeovim,
  abrirTerminalNeovim,
  cdNeovim,
  pluginsNeovim,
  desfazerNeovim,
  refazerNeovim,
  resetarControle,
  salvarNeovim,
} from "./controle-neovim-rpc.js";
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
} from "./arquivos-do-projeto.js";
import { criarProjeto, NOME_DO_FLUXO } from "./molde-de-projeto.js";
import { comoRodar } from "./como-rodar-o-projeto.js";
import { ligarKits } from "./kits-embutidos.js";

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));

/** Raiz do repositório/pacote — onde vivem data/ e tools/. Em `out/main/` o
 *  caminho sobe dois níveis; empacotado, sobe a partir de resources. */
const RAIZ_APP = app.isPackaged
  ? process.resourcesPath
  : path.resolve(__dirname_, "..", "..");

let janela: BrowserWindow | null = null;

//* A pasta passada no comando: `terminus ~/projetos/x`.
//! Em desenvolvimento o próprio diretório do app aparece nos argumentos
//!   (`electron .`) e é descartado — senão o Terminus abriria a si mesmo.
function pastaDaLinhaDeComando(): string | null {
  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  // Em desenvolvimento o próprio diretório do aplicativo aparece entre os
  // argumentos (`electron .`), e ele **não** é pasta de corrida: lido como se
  // fosse, o repositório do Terminus abriria no lugar da pasta lembrada, e a
  // memória de pasta nunca teria vez fora do pacote. Só a primeira ocorrência é
  // descartada — quem passar o diretório de propósito continua sendo atendido.
  let appJaVisto = app.isPackaged;
  for (const a of args) {
    if (a.startsWith("-")) continue;
    const alvo = path.resolve(a);
    if (!appJaVisto && alvo === RAIZ_APP) {
      appJaVisto = true;
      continue;
    }
    try {
      if (statSync(alvo).isDirectory()) return alvo;
    } catch {
      /* não é caminho válido; segue */
    }
  }
  return null;
}

/** A pasta de trabalho aberta agora. Guardada aqui para poder ser protegida. */
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

//* Liga Ctrl+= , Ctrl+- e Ctrl+0 para o tamanho da janela inteira.
//! Fica no processo principal, e não no editor: "a letra está pequena" é
//!   problema da janela, e vale com o foco em qualquer painel.
function ligarZoom(alvo: BrowserWindow): void {
  const LIMITE_MIN = 0.6;
  const LIMITE_MAX = 2.5;
  const PASSO = 0.1;

  const aplicar = (fator: number): void => {
    const preso = Math.min(LIMITE_MAX, Math.max(LIMITE_MIN, Number(fator.toFixed(2))));
    alvo.webContents.setZoomFactor(preso);
    gravarAparencia({ zoom: preso });
  };

  // O zoom lembrado da sessão anterior. Vai depois do primeiro carregamento
  // porque o Electron reinicia o fator a cada navegação — aplicado antes, ele
  // seria descartado sem aviso.
  alvo.webContents.on("did-finish-load", () => {
    alvo.webContents.setZoomFactor(lerAparencia().zoom);
  });

  alvo.webContents.on("before-input-event", (evento, entrada) => {
    if (entrada.type !== "keyDown" || !entrada.control || entrada.alt || entrada.meta) return;
    const atual = alvo.webContents.getZoomFactor();
    if (entrada.key === "=" || entrada.key === "+") aplicar(atual + PASSO);
    else if (entrada.key === "-" || entrada.key === "_") aplicar(atual - PASSO);
    else if (entrada.key === "0") aplicar(1);
    else return;
    // Sem isto o `Ctrl 0` chegaria ao editor como digitar zero.
    evento.preventDefault();
  });
}

//* Os atalhos que a CASCA é dona: Ctrl+S, Ctrl+Z, Ctrl+Shift+Z e Ctrl+crase.
//! Intercepta ANTES de virar tecla no Neovim. O LazyVim mapeia `<C-s>` como
//!   `<Esc>:w`, que grava e joga a pessoa para fora do modo de escrita.
function ligarAtalhosNeovim(alvo: BrowserWindow): void {
  alvo.webContents.on("before-input-event", (evento, entrada) => {
    if (entrada.type !== "keyDown" || !entrada.control || entrada.alt || entrada.meta) return;
    const tecla = entrada.key.toLowerCase();
    if (tecla === "s") {
      evento.preventDefault();
      void salvarNeovim().catch(() => {
        /* sem editor aberto ainda, ou socket em pé de guerra: nada a gravar */
      });
    } else if (tecla === "z") {
      evento.preventDefault();
      void (entrada.shift ? refazerNeovim() : desfazerNeovim()).catch(() => {});
    } else if (entrada.code === "Backquote") {
      // Ctrl+` : a resposta ao Alt+t que o KDE rouba. Abre o terminal do Neovim.
      evento.preventDefault();
      void abrirTerminalNeovim().catch(() => {});
    }
  });
}

//* Cria a janela do Terminus, sem moldura, e liga os atalhos dela.
function criarJanela(): void {
  janela = new BrowserWindow({
    width: 1340,
    height: 820,
    minWidth: 1000,
    minHeight: 620,
    show: false,
    // O ícone da janela (e, no X11, o da barra de tarefas). PNG e não SVG: o
    // Electron não lê SVG aqui. Gerado da marca em `media/icon.svg` (ADR 0014).
    icon: path.join(RAIZ_APP, "media", "icon.png"),
    // Casca própria: a barra de título é desenhada pelo Terminus (ADR 0003).
    frame: false,
    // O fundo da casca na paleta Jared-Linux — evita o flash branco antes do
    // primeiro quadro.
    backgroundColor: "#14161f",
    webPreferences: {
      // .mjs, não .js: o electron-vite emite o preload como ESM, e o Electron só
      // aceita preload ESM pela extensão do arquivo (e com sandbox desligado).
      preload: path.join(__dirname_, "..", "preload", "index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  ligarZoom(janela);
  ligarAtalhosNeovim(janela);

  // A opção `icon:` do construtor não bastou nesta máquina (a propriedade
  // _NET_WM_ICON ficava vazia). Setar explicitamente resolve, e o aviso no
  // console diz se o arquivo sumiu — ícone faltando é o tipo de coisa que se
  // descobre tarde, olhando a barra de tarefas.
  const marca = nativeImage.createFromPath(path.join(RAIZ_APP, "media", "icon.png"));
  if (marca.isEmpty()) console.warn("ícone não carregou: media/icon.png");
  else janela.setIcon(marca);

  janela.once("ready-to-show", () => janela?.show());

  // O Neovim morre com a janela que o mostrava. Sem isto ele seguiria vivo até o
  // `window-all-closed`, escrevendo para uma interface que já não existe.
  janela.on("closed", () => {
    pararNeovim();
    resetarControle();
    //! E o shell do terminal também (19/08). Ele é um painel desta janela, não
    //! um programa separado: deixado vivo, ficaria um bash órfão escrevendo para
    //! uma interface que já não existe. O Konsole aberto pelo botão ↗ é o
    //! oposto — aquele é do sistema, e não morre com o Terminus.
    pararShell();
  });

  // Nenhum link abre dentro da janela do aplicativo: documentação vai para o
  // navegador do sistema.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const avisarEstado = (): void => {
    janela?.webContents.send("janela:estado", janela.isMaximized());
  };
  janela.on("maximize", avisarEstado);
  janela.on("unmaximize", avisarEstado);

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void janela.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void janela.loadFile(path.join(__dirname_, "..", "renderer", "interface", "pagina.html"));
  }
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

function registrarPonte(): void {

  ipcMain.handle(
    "projeto:escolher",
    seguro(async () => {
      if (!janela) throw new Error("Janela não disponível.");
      const r = await dialog.showOpenDialog(janela, {
        title: "Abrir pasta da corrida",
        properties: ["openDirectory"],
      });
      if (r.canceled || !r.filePaths[0]) return null;
      return entrarNaPasta(r.filePaths[0]);
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
      const pasta = pastaDaLinhaDeComando() ?? ultimaPasta();
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
      if (!janela) throw new Error("Janela não disponível.");
      if (fluxo !== "cpp" && fluxo !== "python" && fluxo !== "csharp") {
        throw new Error("Fluxo desconhecido.");
      }

      const r = await dialog.showSaveDialog(janela, {
        title: `Novo projeto ${NOME_DO_FLUXO[fluxo]}`,
        buttonLabel: "Criar aqui",
        defaultPath: path.join(ultimaPasta() ?? homedir(), `projeto-${fluxo}`),
        properties: ["createDirectory"],
      });
      if (r.canceled || !r.filePath) return null;

      const principal = await criarProjeto(r.filePath, fluxo);
      const projeto = await entrarNaPasta(r.filePath);
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
      if (!janela) throw new Error("Janela não disponível.");
      protegerPastaDeTrabalho(alvo);
      const nome = path.basename(alvo);
      const temLixeira = aLixeiraAlcanca(alvo, app.getPath("home"));

      const r = await dialog.showMessageBox(janela, {
        type: "warning",
        buttons: [temLixeira ? "Mover para a lixeira" : "Apagar de vez", "Cancelar"],
        defaultId: 1,
        cancelId: 1,
        message: `Excluir "${nome}"?`,
        detail: temLixeira
          ? "Vai para a lixeira do sistema — dá para recuperar de lá."
          : "Este arquivo está em outro disco — pendrive, disco externo ou pasta " +
            "temporária —, e a lixeira do sistema não vale para ele.\n\n" +
            "Apagar aqui NÃO TEM VOLTA. Numa pasta de corrida pode haver arquivo " +
            "que não se refaz.",
      });
      if (r.response !== 0) return false;

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
      if (!janela) throw new Error("Janela não disponível.");
      const r = await dialog.showOpenDialog(janela, {
        title: "Escolher papel de parede",
        properties: ["openFile"],
        filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
      });
      if (r.canceled || !r.filePaths[0]) return null;
      return { ...guardarWallpaper(r.filePaths[0]), imagem: lerWallpaper() };
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

  ipcMain.on("janela:minimizar", () => janela?.minimize());
  ipcMain.on("janela:alternar-maximo", () =>
    janela?.isMaximized() ? janela.unmaximize() : janela?.maximize(),
  );
  ipcMain.on("janela:fechar", () => janela?.close());
}

void app.whenReady().then(() => {
  registrarPonte();

  //! O histórico da linha de comando mudou de dono (19/08): quem guarda agora é
  //! o bash. O que já estava no `config.json` é apagado na primeira abertura —
  //! comando é dado sensível, e dado sensível esquecido num campo que ninguém
  //! mais lê é o pior dos dois mundos.
  const antigos = limparHistoricoAntigo();
  if (antigos > 0) console.log(`histórico antigo da linha de comando apagado (${antigos} linhas)`);

  //! As funções embutidas ficam disponíveis no editor antes de a janela abrir
  //! (ADR 0036). Falhar aqui NÃO impede o Terminus de subir: sem os kits ele
  //! continua sendo um editor inteiro, e travar a abertura por causa de um
  //! atalho de escrita seria trocar o essencial pelo acessório.
  void ligarKits(RAIZ_APP).then((r) => {
    if (r.erro) console.error("kits embutidos:", r.erro);
    for (const nome of r.respeitados) {
      console.warn(`kit não instalado, já existe arquivo seu em ${nome}`);
    }
  });

  criarJanela();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on("window-all-closed", () => {
  pararShell();
  pararNeovim();
  if (process.platform !== "darwin") app.quit();
});
