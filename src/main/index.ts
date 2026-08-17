import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from "electron";
import { existsSync, realpathSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { EventoExecucao, ProjetoAberto, Resultado } from "../shared/tipos.js";
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
} from "./config.js";
import { analisar, destinoDoCd } from "./comando.js";
import { estaRodando, pararScript, pararTudo, rodarComando } from "./execucao.js";
import {
  enviarNeovim,
  iniciarNeovim,
  pararNeovim,
  redimensionarNeovim,
} from "./neovim.js";
import {
  abrirNoNeovim,
  abrirTerminalNeovim,
  cdNeovim,
  pluginsNeovim,
  desfazerNeovim,
  refazerNeovim,
  resetarControle,
  salvarNeovim,
} from "./controle.js";
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
} from "./projeto.js";

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));

/** Raiz do repositório/pacote — onde vivem data/ e tools/. Em `out/main/` o
 *  caminho sobe dois níveis; empacotado, sobe a partir de resources. */
const RAIZ_APP = app.isPackaged
  ? process.resourcesPath
  : path.resolve(__dirname_, "..", "..");

let janela: BrowserWindow | null = null;

/**
 * Pasta passada na linha de comando: `bancada ~/corridas/18S`.
 *
 * Em desenvolvimento o Electron recebe o script como primeiro argumento, então o
 * candidato é o segundo; empacotado, é o primeiro. Só vale se for pasta que
 * existe — argumento inválido não deve impedir a janela de abrir.
 */
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

/**
 * Recusa apagar a própria pasta de trabalho, ou qualquer pasta acima dela.
 *
 * Trava do lado de cá **de propósito** (ADR 0013): a interface já deixou de
 * oferecer "Excluir" para a raiz, mas isso é uma tela — e uma tela pode voltar a
 * errar. Apagar a pasta aberta é o tipo de acidente que leva junto o trabalho do
 * dia inteiro, então o processo principal também diz não.
 */
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

/**
 * A lixeira do sistema alcança este caminho?
 *
 * **Isto existe porque o `shell.trashItem` do Electron mente.** Fora do disco
 * onde a lixeira mora, ele **não** falha: apaga o arquivo de vez e devolve
 * sucesso. O `gio trash`, no mesmo arquivo, recusa com "Trashing on system
 * internal mounts is not supported" — foi assim que a diferença apareceu.
 * Verificado apagando um arquivo em `/tmp`: sumiu do disco e não estava em
 * lixeira nenhuma.
 *
 * Isso importa muito aqui: corrida de sequenciamento chega no laboratório em
 * **pendrive**, e o Terminus prometia na tela que dava para recuperar da lixeira.
 * Promessa falsa sobre `.ab1` insubstituível é pior que não ter o botão.
 *
 * O teste é o do próprio padrão XDG: a lixeira do usuário vive no disco da pasta
 * pessoal; em qualquer outro dispositivo ela só existe se aquele disco tiver a
 * própria pasta de lixeira. Comparar o número do dispositivo responde isso sem
 * depender de ferramenta externa.
 */
function aLixeiraAlcanca(alvo: string): boolean {
  try {
    return statSync(alvo).dev === statSync(app.getPath("home")).dev;
  } catch {
    return false;
  }
}

/**
 * `Ctrl +`, `Ctrl -` e `Ctrl 0` aumentam, diminuem e voltam ao tamanho natural.
 *
 * **Isto não existia** — descoberto em 08/08, quando o autor perguntou como
 * aumentaria a tela. A janela é `frame: false` (ADR 0003), então não há barra de
 * menu, e é da barra de menu que vinham os atalhos de zoom que todo aplicativo
 * Electron ganha de graça. Ninguém tinha reparado porque quem escreveu a casca
 * enxerga bem a 1340×820.
 *
 * **No processo principal, e não num `keymap` do CodeMirror**, de propósito: a
 * pessoa pode estar com o foco no terminal, na conversa da Fern, na trilha ou na
 * árvore de arquivos, e "a letra está pequena" não é um problema do editor — é
 * da janela. O `before-input-event` chega antes de qualquer campo da interface.
 *
 * Os três nomes de tecla do aumentar não são zelo: `=` é o que o teclado manda
 * quando se aperta `Ctrl` e a tecla do `+` sem `Shift`, `+` é o do teclado
 * numérico e o do ABNT2, e `Shift+=` é o de layouts onde o `+` exige `Shift`.
 * Escolher um só faria o atalho funcionar em alguns teclados e não em outros —
 * e este é o teclado ABNT2 de quem pediu.
 */
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

/**
 * Os atalhos que a casca é dona (ADR 0025), interceptados **antes** de virarem
 * tecla no Neovim.
 *
 * O porquê de interceptar em vez de deixar passar: o LazyVim mapeia `<C-s>` como
 * `<Esc>:w`, que grava mas **joga a pessoa para fora do modo de escrita**. A
 * casca captura o Ctrl+S aqui, chama o `write` por RPC (que não mexe no modo) e
 * `preventDefault` para o Neovim nunca ver a tecla. O resto do teclado — todos os
 * outros `Ctrl+…` que o Neovim usa — continua fluindo direto para ele.
 *
 * `before-input-event` é o mesmo lugar do zoom: chega antes de qualquer campo da
 * interface, então vale com o foco no editor, na árvore ou na conversa.
 */
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
    // #141414 é o fundo da casca no Cursor Dark — evita o flash branco antes
    // do primeiro quadro.
    backgroundColor: "#141414",
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
    void janela.loadFile(path.join(__dirname_, "..", "renderer", "index.html"));
  }
}

/**
 * A raiz que o processo principal aceita **escrever**: a pasta que o usuário
 * abriu, e só ela. A instalação do Terminus fica de fora — o app não edita o
 * próprio código.
 *
 * Todas são registradas **aqui**, nunca recebidas de quem chama. É essa a
 * diferença para o `dentroDe` de `projeto.ts`, que confia na raiz que o
 * chamador passa junto — quem controla o argumento controla a checagem.
 */
function raizesDeEscrita(): string[] {
  return raizAberta ? [path.resolve(raizAberta)] : [];
}


/**
 * Resolve o caminho e exige que ele caia dentro de uma das raízes dadas.
 * Devolve o caminho já resolvido — use o retorno, não o argumento original, ou
 * a checagem não serve de nada.
 *
 * Os links simbólicos são resolvidos de propósito: sem isso, uma pasta de
 * corrida que traga `resultados.csv` apontando para `~/.bashrc` passaria na
 * comparação de texto e escreveria fora do projeto. Quando o arquivo ainda não
 * existe — gravar cria — resolve-se o diretório pai, que tem de existir.
 */
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

/** Embrulha um handler para que uma exceção vire erro exibível, não uma
 *  promessa rejeitada silenciosa do outro lado da ponte. */
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
      // site-packages e a auditoria da memória do mascote abre o `.md` em
      // `~/.config/bancada/fern` (ADR 0009). Fechar aqui quebraria os três.
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

      // Lixeira, não `unlink`. Numa pasta de corrida pode haver .ab1 insubstituível;
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

  /**
   * O terminal do chat (ADR 0022).
   *
   * Mesma análise e mesmas travas do terminal de baixo — é o mesmo `comando.ts`,
   * de propósito: duas linhas de comando com regras diferentes seriam duas
   * superfícies para auditar em vez de uma. O que muda é só **onde o processo
   * mora**, para o `verboo` não ocupar o lugar do ▶ pelo minuto que leva.
   *
   * A pasta é a mesma do terminal de baixo, e o `cd` de um move o outro. Foi
   * escolha: dois prompts mostrando pastas diferentes na mesma janela é o tipo
   * de coisa que faz alguém rodar o comando certo no lugar errado.
   */
  ipcMain.handle(
    "chat:comando",
    seguro((e, linha: unknown) => {
      if (typeof linha !== "string") throw new Error("Comando inválido.");
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

      if (estaRodando("chat")) throw new Error("Já há algo rodando aqui. Pare antes.");

      rodarComando(
        pronto.programa,
        pronto.args,
        cwd,
        (evento: EventoExecucao) => e.sender.send("chat:evento", evento),
        "chat",
      );
      return { pasta: cwd, rodando: true, nota: pronto.nota ?? null };
    }),
  );
  ipcMain.on("chat:parar", () => pararScript("chat"));

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
