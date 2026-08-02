import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { rmSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  EventoExecucao,
  ExercicioTrilha,
  FalaMascote,
  ProjetoAberto,
  Resultado,
  Vestimenta,
} from "../shared/tipos.js";
import { detectarVersoes } from "./ambiente.js";
import { carregarCatalogo } from "./catalogo.js";
import { lerCromatograma } from "./cromatograma.js";
import {
  esquecerFantasma,
  esquecerPasta,
  gravarAparencia,
  guardarWallpaper,
  lerAparencia,
  lerWallpaper,
  tirarWallpaper,
  estadoDoFantasma,
  lerDoTwinny,
  ligarFantasma,
  ligarMascote,
  nomearMascote,
  pastasRecentes,
  registrarPasta,
  salvarFantasma,
  ultimaPasta,
} from "./config.js";
import { cancelarFantasma, sugerir } from "./fantasma.js";
import {
  cancelarConversa,
  conversar,
  destilar,
  estadoDoMascote,
  lerQuadros,
} from "./mascote.js";
import { apagarDaMemoria, listarMemoria } from "./memoria.js";
import {
  arquivarTentativa,
  caminhoDoTeste,
  caminhoDoVerificador,
  definirVestimenta,
  esquecerExercicio,
  lerTrilha,
  marcarFeito,
  prepararExercicio,
} from "./trilha.js";
import { estaRodando, pararScript, rodarScript } from "./execucao.js";
import { ServidorPython } from "./lsp.js";
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
let servidor: ServidorPython | null = null;

/**
 * Sobe o pyright para a pasta aberta. Um servidor por projeto: ele indexa a
 * raiz, então trocar de pasta significa trocar de servidor.
 */
async function ligarServidor(raiz: string): Promise<void> {
  servidor?.parar();
  servidor = new ServidorPython({
    raiz,
    aoDiagnosticar: (uri, diagnosticos) => {
      janela?.webContents.send("lsp:diagnosticos", {
        arquivo: decodeURIComponent(uri.replace(/^file:\/\//, "")),
        diagnosticos,
      });
    },
  });
  try {
    await servidor.iniciar(RAIZ_APP);
  } catch (err) {
    servidor = null;
    // Sem language server o editor continua inteiro — só perde os avisos.
    janela?.webContents.send("lsp:falhou", err instanceof Error ? err.message : String(err));
  }
}

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
  // fosse, o repositório da Bancada abriria no lugar da pasta lembrada, e a
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

/**
 * Entra numa pasta de corrida: sobe o pyright para ela e a registra como
 * recente. É o único caminho que grava — abrir a árvore de novo (o "atualizar")
 * passa por `projeto:abrir`, que não mexe em servidor nem em memória.
 */
/** A pasta de trabalho aberta agora. Guardada aqui para poder ser protegida. */
let raizAberta: string | null = null;

async function entrarNaPasta(raiz: string): Promise<ProjetoAberto> {
  // A leitura da pasta vem primeiro: se ela não existe mais, o erro sobe e a
  // pasta some da lista em vez de ser registrada de novo.
  const projeto = await abrirProjeto(raiz);
  raizAberta = raiz;
  void ligarServidor(raiz);
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
        "Para tirá-la da Bancada use Fechar pasta — excluir aqui apagaria o seu trabalho.",
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
 * **pendrive**, e a Bancada prometia na tela que dava para recuperar da lixeira.
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

function criarJanela(): void {
  janela = new BrowserWindow({
    width: 1340,
    height: 820,
    minWidth: 1000,
    minHeight: 620,
    show: false,
    // Casca própria: a barra de título é desenhada pela Bancada (ADR 0003).
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

  janela.once("ready-to-show", () => janela?.show());

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
  ipcMain.handle("catalogo:carregar", seguro(() => carregarCatalogo(RAIZ_APP)));
  ipcMain.handle("ambiente:versoes", seguro(() => detectarVersoes()));

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
      if (!ehTexto(arquivo)) {
        throw new Error(
          `${path.basename(arquivo)} não é arquivo de texto — a Bancada não sabe abrir.`,
        );
      }
      return lerArquivo(arquivo);
    }),
  );

  ipcMain.handle(
    "cromatograma:ler",
    seguro((_e, arquivo: string) => lerCromatograma(RAIZ_APP, arquivo)),
  );

  ipcMain.handle(
    "arquivo:gravar",
    seguro((_e, arquivo: string, conteudo: string) => gravarArquivo(arquivo, conteudo)),
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

  ipcMain.on("lsp:abrir", (_e, arquivo: string, texto: string) => servidor?.abrir(arquivo, texto));
  ipcMain.on("lsp:mudar", (_e, arquivo: string, versao: number, texto: string) =>
    servidor?.mudar(arquivo, versao, texto),
  );
  ipcMain.on("lsp:fechar", (_e, arquivo: string) => servidor?.fechar(arquivo));

  ipcMain.handle(
    "lsp:completar",
    seguro((_e, arquivo: string, linha: number, coluna: number) =>
      servidor?.completar(arquivo, linha, coluna) ?? [],
    ),
  );
  ipcMain.handle(
    "lsp:hover",
    seguro((_e, arquivo: string, linha: number, coluna: number) =>
      servidor?.hover(arquivo, linha, coluna) ?? null,
    ),
  );
  ipcMain.handle(
    "lsp:definicao",
    seguro((_e, arquivo: string, linha: number, coluna: number) =>
      servidor?.definicao(arquivo, linha, coluna) ?? null,
    ),
  );

  ipcMain.handle("fantasma:estado", seguro(() => estadoDoFantasma()));
  ipcMain.handle("fantasma:ligar", seguro((_e, ligado: boolean) => ligarFantasma(ligado)));
  ipcMain.handle("fantasma:esquecer", seguro(() => esquecerFantasma()));
  ipcMain.handle(
    "fantasma:importar",
    seguro(async () => {
      const t = await lerDoTwinny();
      return salvarFantasma({ ...t, ligado: true });
    }),
  );
  ipcMain.handle(
    "fantasma:sugerir",
    seguro((_e, texto: string, cursor: number) => sugerir({ texto, cursor })),
  );
  ipcMain.on("fantasma:cancelar", () => cancelarFantasma());

  // Mascote (ADR 0008). A interface pede a conversa e recebe a resposta — o
  // miniMD que serve de contexto nunca atravessa esta ponte: ele é lido do lado
  // de cá e vai direto para o modelo.
  ipcMain.handle("mascote:estado", seguro(() => estadoDoMascote()));
  ipcMain.handle("mascote:quadros", seguro(() => lerQuadros()));
  ipcMain.handle(
    "mascote:ligar",
    seguro((_e, ligado: boolean) => {
      ligarMascote(ligado);
      return estadoDoMascote();
    }),
  );
  ipcMain.handle(
    "mascote:nomear",
    seguro((_e, nome: string) => {
      nomearMascote(nome.trim().slice(0, 40));
      return estadoDoMascote();
    }),
  );
  ipcMain.handle("mascote:conversar", seguro((_e, falas: FalaMascote[]) => conversar(falas)));
  ipcMain.on("mascote:cancelar", () => cancelarConversa());

  // Memória do mascote (ADR 0009). A interface lista e apaga; ler e escrever o
  // conteúdo é com o editor da própria Bancada — é isso que torna a memória
  // auditável sem inventar uma tela de edição nova.
  // Aparência: wallpaper e tema (ADR 0010).
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

  // Trilha de estudo (ADR 0015). A fase pedida vira a corrente, para as
  // gravações seguintes devolverem a mesma lista sem a interface repetir.
  let faseAtual = "fase1";
  ipcMain.handle("trilha:ler", seguro((_e, fase?: string) => {
      if (fase) faseAtual = fase;
      return lerTrilha(RAIZ_APP, faseAtual);
    }));
  ipcMain.handle(
    "trilha:vestimenta",
    seguro((_e, v: Vestimenta) => {
      definirVestimenta(v);
      return lerTrilha(RAIZ_APP, faseAtual);
    }),
  );
  ipcMain.handle(
    "trilha:marcar",
    seguro((_e, chave: string, vestimenta: string) => {
      marcarFeito(chave, vestimenta);
      return lerTrilha(RAIZ_APP, faseAtual);
    }),
  );
  ipcMain.handle(
    "trilha:esquecer",
    seguro((_e, chave: string) => {
      esquecerExercicio(chave);
      return lerTrilha(RAIZ_APP, faseAtual);
    }),
  );
  // Refazer do zero: arquiva a tentativa anterior e devolve o arquivo limpo.
  ipcMain.handle(
    "trilha:refazer",
    seguro(
      (
        _e,
        entrada: {
          raizProjeto: string;
          topico: string;
          exercicio: ExercicioTrilha;
          vestimenta: string;
          enunciado: string;
        },
      ) => {
        const alvo = path.join(
          entrada.raizProjeto,
          "trilha",
          `${entrada.topico}_${entrada.exercicio.id}.py`,
        );
        const guardado = arquivarTentativa(alvo);
        return { ...prepararExercicio(entrada), guardado };
      },
    ),
  );
  ipcMain.handle(
    "trilha:praticar",
    seguro(
      (
        _e,
        entrada: {
          raizProjeto: string;
          topico: string;
          exercicio: ExercicioTrilha;
          vestimenta: string;
          enunciado: string;
        },
      ) => prepararExercicio(entrada),
    ),
  );
  ipcMain.handle(
    "trilha:verificar",
    seguro((_e, exercicio: string, arquivo: string) => {
      const teste = caminhoDoTeste(RAIZ_APP, exercicio);
      if (!teste) throw new Error(`o exercício "${exercicio}" ainda não tem correção escrita`);
      return { verificador: caminhoDoVerificador(RAIZ_APP), teste, arquivo };
    }),
  );

  ipcMain.handle("memoria:listar", seguro(() => listarMemoria()));
  ipcMain.handle("memoria:apagar", seguro((_e, caminho: string) => apagarDaMemoria(caminho)));
  ipcMain.handle("memoria:destilar", seguro((_e, falas: FalaMascote[]) => destilar(falas)));

  ipcMain.handle("exec:rodando", () => estaRodando());
  ipcMain.on("exec:rodar", (e, arquivo: string, extras: string[] = []) => {
    rodarScript(arquivo, (evento: EventoExecucao) => e.sender.send("exec:evento", evento), extras);
  });
  ipcMain.on("exec:parar", () => pararScript());

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
  pararScript();
  servidor?.parar();
  if (process.platform !== "darwin") app.quit();
});
