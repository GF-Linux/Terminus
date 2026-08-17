import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from "electron";
import { existsSync, realpathSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { EventoExecucao, ProjetoAberto, Resultado } from "../compartilhado/tipos.js";
import {
  comandosRecentes,
  esquecerComandos,
  esquecerPasta,
  gravarAparencia,
  guardarWallpaper,
  lerAparencia,
  lerWallpaper,
  tirarWallpaper,
  pastasRecentes,
  PASTA_CONFIG,
  registrarPasta,
  registrarComando,
  ultimaPasta,
} from "./configuracao-salva.js";
import { analisar, destinoDoCd } from "./triagem-de-comando.js";
import { estaRodando, pararScript, pararTudo, rodarComando } from "./executor-de-comando.js";
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

/**
 * A pasta onde a linha de comando roda (ADR 0020). Começa na pasta aberta,
 * anda com o `cd`, e volta para a raiz sempre que outra pasta é aberta — abrir
 * uma corrida nova e continuar digitando dentro da corrida anterior seria a
 * armadilha mais fácil de cair e mais difícil de perceber.
 */
let pastaDoComando: string | null = null;

//* Assume uma pasta como projeto: registra nos recentes e aponta o Neovim.
async function entrarNaPasta(raiz: string): Promise<ProjetoAberto> {
  // A leitura da pasta vem primeiro: se ela não existe mais, o erro sobe e a
  // pasta some da lista em vez de ser registrada de novo.
  const projeto = await abrirProjeto(raiz);
  raizAberta = raiz;
  pastaDoComando = raiz;
  // Aponta o Neovim para a pasta junto: o buscador dele nasce no lugar certo.
  void cdNeovim(raiz).catch(() => {});
  registrarPasta(raiz);
  return projeto;
}

//* Recusa apagar a pasta aberta, ou qualquer pasta acima dela.
//! A trava fica AQUI, e não só na tela: tela pode voltar a errar, e apagar a
//!   pasta aberta leva o trabalho do dia inteiro.
function protegerPastaDeTrabalho(alvo: string): void {
  if (!raizAberta) return;
  const raiz = path.resolve(raizAberta);
  const escolhido = path.resolve(alvo);
  if (escolhido === raiz || raiz.startsWith(escolhido + path.sep)) {
    throw new Error(
      `"${path.basename(escolhido)}" é a pasta de trabalho aberta (ou está acima dela). ` +
        "Para tirá-la do Terminus use Fechar pasta — excluir aqui apagaria o seu trabalho.",
    );
  }
}

//* Diz se a lixeira do sistema alcança este caminho.
//! Existe porque o `shell.trashItem` do Electron MENTE: fora do disco de casa
//!   ele apaga de vez e devolve sucesso. A tela prometia recuperação.
function aLixeiraAlcanca(alvo: string): boolean {
  try {
    return statSync(alvo).dev === statSync(app.getPath("home")).dev;
  } catch {
    return false;
  }
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
//! Resolve link simbólico de propósito: sem isso, um atalho dentro do projeto
//!   apontando para `~/.bashrc` passaria na comparação de texto.
//! Recusa caminho que começa com `-` ANTES de resolver: viraria opção do
//!   programa que o recebe.
function confinado(alvo: unknown, raizes: string[], oQue = "caminho"): string {
  if (typeof alvo !== "string" || alvo.length === 0 || alvo.includes("\0")) {
    throw new Error(`O ${oQue} não é válido.`);
  }
  // Recusado antes de resolver, e não depois: `path.resolve("-c")` devolve
  // `<pasta atual>/-c`, que cai dentro de uma raiz permitida e passaria na
  // conferência. Um caminho que comece com traço vira opção do programa que o
  // recebe — o Terminus não precisa de nenhum e não abre essa porta.
  if (alvo.startsWith("-")) throw new Error(`O ${oQue} não pode começar com "-".`);
  const abs = path.resolve(alvo);
  let real: string;
  try {
    real = existsSync(abs)
      ? realpathSync(abs)
      : path.join(realpathSync(path.dirname(abs)), path.basename(abs));
  } catch {
    throw new Error(`${path.basename(abs)}: a pasta de destino não existe.`);
  }
  for (const raiz of raizes) {
    const rel = path.relative(raiz, real);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return real;
  }
  throw new Error(
    `"${path.basename(abs)}" está fora da pasta aberta — o Terminus não mexe em arquivo de fora.`,
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
      const temLixeira = aLixeiraAlcanca(alvo);

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

  ipcMain.on("exec:parar", () => pararScript());

  /**
   * A linha de comando do terminal (ADR 0020).
   *
   * **Aqui não há `confinado`, e é a diferença de fundo em relação a
   * `exec:rodar`.** Aquele recebe um caminho vindo da árvore de arquivos e só
   * pode acabar em `.py` dentro da pasta aberta, porque é o Terminus quem monta o
   * comando. Este recebe uma linha que a pessoa digitou olhando para a tela:
   * confiná-la seria fingir que o Terminus sabe melhor do que o dono da máquina o
   * que ele quis instalar. O que sobra de proteção é o que realmente protege —
   * `shell: false`, sem interpolação de texto — e está em `comando.ts`.
   *
   * Devolve a pasta atual junto porque o `cd` acontece deste lado: quem pergunta
   * já recebe o prompt novo, sem uma segunda viagem pela ponte.
   */
  ipcMain.handle(
    "exec:comando",
    seguro((e, linha: unknown) => {
      if (typeof linha !== "string") throw new Error("Comando inválido.");
      // Recusado antes de qualquer análise: quebra de linha aqui é a única forma
      // de uma caixa de texto de uma linha esconder um segundo comando.
      if (/[\n\r\0]/.test(linha)) throw new Error("O comando não pode ter quebra de linha.");
      if (linha.length > 4000) throw new Error("Comando longo demais.");

      const cwd = pastaDoComando ?? homedir();
      const pronto = analisar(linha, cwd);
      if (!pronto) return { pasta: cwd, rodando: false, nota: null };

      registrarComando(linha.trim());

      if (pronto.tipo === "cd") {
        pastaDoComando = destinoDoCd(pronto.args, cwd, homedir());
        return { pasta: pastaDoComando, rodando: false, nota: null };
      }

      if (estaRodando()) throw new Error("Já há algo em execução. Pare antes de rodar outro.");

      rodarComando(pronto.programa, pronto.args, cwd, (evento: EventoExecucao) =>
        e.sender.send("exec:evento", evento),
      );
      return { pasta: cwd, rodando: true, nota: pronto.nota ?? null };
    }),
  );
  ipcMain.handle(
    "exec:pasta",
    seguro(() => pastaDoComando ?? homedir()),
  );
  ipcMain.handle(
    "exec:historico",
    seguro(() => comandosRecentes()),
  );
  ipcMain.handle(
    "exec:esquecerHistorico",
    seguro(() => esquecerComandos()),
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
  criarJanela();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on("window-all-closed", () => {
  pararTudo();
  pararNeovim();
  if (process.platform !== "darwin") app.quit();
});
