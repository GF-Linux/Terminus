import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { EdicaoSeguinte, EstadoCopilot, SugestaoInline } from "../../compartilhado/tipos.js";

//? MOTOR DO COPILOT (LSP) — o único caminho deste produto que sai da máquina
//!
//! 1. O VSCode NÃO define protocolo de rede para sugestão inline. O que ele
//!    define é o registro `registerInlineCompletionItemProvider`; quem fala com
//!    a rede é a extensão. Aqui a "extensão" é este arquivo, e o backend é o
//!    `copilot-language-server` oficial, o mesmo binário que o Neovim usava.
//! 2. Por isso ele vive no `main` e não na tela: o CSP da página é
//!    `default-src 'self'` (`interface/pagina.html`), e o renderer não pode —
//!    nem deve — abrir conexão. A tela pergunta pela porta; quem sai daqui é o
//!    processo principal.
//! 3. O framing do LSP é escrito aqui, e não puxado de `vscode-jsonrpc`. São
//!    ~50 linhas (cabeçalho `Content-Length` + corpo JSON), foram RODADAS antes
//!    de virar código deste repositório, e a alternativa custaria uma
//!    dependência a mais num projeto que tem cinco.

//? A AUTENTICAÇÃO NÃO É PROBLEMA NOSSO — medido em 26/08/2026
//!
//! O servidor adota sozinho a sessão já persistida em `~/.config/github-copilot`:
//! o log dele diz `tryAutoAdopt: adopting tokenId=1 crossEditor=true` e
//! `resolveSession: persisted store resolved a session`. **Não existe tela de
//! login neste produto**, e não deve existir: quem cuida de credencial do
//! GitHub é o GitHub, e duplicar isso seria pedir a senha de alguém para
//! guardar pior do que já está guardada (§8·S1).

/** Onde procurar o servidor, em ordem. O primeiro que existir ganha. */
//! POR QUE PROCURAR EM VEZ DE EMPACOTAR: `@github/copilot-language-server` tem
//!   **114 MB** desempacotados — binário de toda plataforma — contra 2,8 MB do
//!   fonte inteiro deste app. Empacotá-lo faria o instalador do Terminus ser
//!   quarenta vezes o Terminus.
//! A ORDEM É A DA INTENÇÃO: quem exportou a variável quis aquele; quem tem no
//!   PATH instalou de propósito; o do LazyVim é o que já está aqui.
function candidatos(): { caminho: string; comoRodar: "node" | "direto" }[] {
  const casa = homedir();
  const daVariavel = process.env.COPILOT_LANGUAGE_SERVER;
  return [
    ...(daVariavel ? [{ caminho: daVariavel, comoRodar: "direto" as const }] : []),
    {
      caminho: path.join(casa, ".local/share/nvim/lazy/copilot.lua/copilot/js/language-server.js"),
      comoRodar: "node" as const,
    },
    {
      caminho: path.join(
        process.cwd(),
        "node_modules/@github/copilot-language-server/dist/language-server.js",
      ),
      comoRodar: "node" as const,
    },
  ];
}

/** Como executar o servidor achado: comando, argumentos e ambiente. */
//? ⚠️ ESTA FUNÇÃO NASCEU DE UM DEFEITO DE CAMPO (26/08/2026), e o defeito era invisível
//? de dentro do teste.
//!
//! Relato: *"inline completions não sugere nada"*. Medido no app de verdade: o servidor
//! era ACHADO e morria no aperto de mão — *"o Copilot encerrou"*.
//! A causa: `process.execPath`, **dentro do Electron, é o binário do Electron**, não o do
//! Node (medido: `/…/node_modules/electron/dist/electron`). Mandar
//! `electron language-server.js` sobe um SEGUNDO APLICATIVO ELECTRON, que não entende o
//! argumento e morre. O `ELECTRON_RUN_AS_NODE=1` é o que faz o mesmo binário se comportar
//! como Node — é o mecanismo oficial, e existe exatamente para isto.
//!
//! ⚠️ E POR QUE A MINHA PROVA ANTERIOR NÃO PEGOU: eu provei o motor **importando-o num
//! `node` puro**, onde `process.execPath` É o node. A prova passou pelo motivo errado.
//! Estava escrito no diário como `[não medido] o Copilot dentro do app montado` — e o
//! defeito morava exatamente no buraco que eu tinha declarado. **A lacuna declarada
//! apontava para o lugar certo; o que faltou foi fechá-la.**
export function comoExecutar(achado: { caminho: string; comoRodar: "node" | "direto" }): {
  comando: string;
  argumentos: string[];
  ambiente: NodeJS.ProcessEnv;
} {
  if (achado.comoRodar !== "node") {
    return { comando: achado.caminho, argumentos: ["--stdio"], ambiente: process.env };
  }

  //! ⚠️ O NODE DO SISTEMA GANHA DO NODE DO ELECTRON, e a razão foi medida no defeito de
  //!   campo: com `ELECTRON_RUN_AS_NODE` o servidor até roda, e morre dizendo
  //!   **"Node.js 22.13 is required to run GitHub Copilot but found 20.18.3"** — porque o
  //!   Electron 33 embute o Node 20. A máquina tem 22; o Electron é que está atrás.
  //! Amarrar o Copilot à versão de Node que o Electron carrega significaria que atualizar
  //!   o editor por outro motivo pode quebrar a sugestão, e vice-versa. São dois relógios
  //!   diferentes, e este é o único lugar em que eles se encostam.
  const doSistema = nodeDoSistema();
  if (doSistema) {
    return { comando: doSistema, argumentos: [achado.caminho, "--stdio"], ambiente: process.env };
  }

  //! Sem Node no sistema, o do Electron é melhor que nada: servidores menos exigentes
  //!   rodam nele, e a frase de erro do que não roda agora chega à barra (ver `esquecer`).
  return {
    comando: process.execPath,
    argumentos: [achado.caminho, "--stdio"],
    //! Só esta variável muda; o resto do ambiente segue igual, porque o servidor precisa
    //!   do `HOME` para achar a sessão do GitHub e do `PATH` para o que ele chamar.
    ambiente: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  };
}

/** O `node` do sistema, varrendo o `PATH`. `null` se não houver. */
//! À mão, e não com `which`: abrir um processo para descobrir onde está outro é caro e
//!   depende de shell. O `PATH` é uma string, e procurar nela é conta de string.
function nodeDoSistema(): string | null {
  for (const dir of (process.env["PATH"] ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const alvo = path.join(dir, "node");
    if (existsSync(alvo)) return alvo;
  }
  return null;
}

/** O servidor achado, ou `null` — e, junto, onde se procurou. */
//! Devolve os LUGARES junto com o achado porque a frase de "não achei" tem de
//!   dizer onde se olhou. Recusa que não diz o que falta obriga quem lê a
//!   adivinhar, e é a mesma conduta que o `como-rodar-o-projeto.ts` já pratica.
export function localizarServidor(): {
  achado: { caminho: string; comoRodar: "node" | "direto" } | null;
  procurados: string[];
} {
  const lista = candidatos();
  return {
    achado: lista.find((c) => existsSync(c.caminho)) ?? null,
    procurados: lista.map((c) => c.caminho),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O canal — framing do LSP sobre os canos do processo
// ─────────────────────────────────────────────────────────────────────────────

/** Teto de uma pergunta ao servidor. Sugestão que chega tarde já não serve. */
//! 10 s e não 2: a PRIMEIRA sugestão da sessão paga o aquecimento do servidor
//!   (certificados, sessão, embeddings — tudo visível no log dele). As
//!   seguintes voltam em fração disso. Um teto curto reprovaria o produto no
//!   primeiro uso, que é o único que a pessoa lembra.
const TETO_DA_PERGUNTA_MS = 10_000;

let processo: ChildProcessWithoutNullStreams | null = null;
let subindo: Promise<boolean> | null = null;
let sequencia = 0;
/** A última coisa que o servidor escreveu no `stderr`. Vira a frase do erro. */
let ultimaQueixa = "";
/** O provedor de NES do servidor já foi acordado nesta sessão? */
let aqueceu = false;
const pendentes = new Map<number, { ok: (v: unknown) => void; nao: (e: Error) => void }>();

/** Documentos que o servidor já conhece, e em que versão. */
//! O servidor sugere sobre o documento que ELE tem. Sem isto, ele completa o
//!   arquivo de dois minutos atrás e a sugestão chega certa para um texto que
//!   não existe mais — o defeito nº 2 da lista de riscos da planta.
const abertos = new Map<string, number>();

/** O que o servidor ANUNCIOU, por categoria. Não é pergunta: é o que ele disse. */
//! Por notificação (`didChangeStatus/v2`) e não por `checkStatus`: assim a
//!   barra reflete a queda no MEIO da sessão, e não só o que era verdade na
//!   partida.
//! ⚠️ É UM MAPA, E NÃO UM VALOR ÚNICO, e isto foi MEDIDO em 26/08/2026: as
//!   notificações do servidor são PARCIAIS — ele manda só as categorias que
//!   mudaram. Guardando um valor só e sobrescrevendo a cada aviso, uma
//!   notificação sobre `completion` APAGAVA o `cls: Normal` recebido antes, e o
//!   estado virava "sem status" com o Copilot funcionando perfeitamente. O
//!   sintoma seria a barra dizendo "desligado" enquanto as sugestões chegam.
const statusPorCategoria = new Map<string, string>();
/** Uma frase para o caso de nem termos subido ainda. */
let motivoDeNaoSubir = "ainda não subiu";

//* Devolve o processo ao estado de "nunca ligado". Chame quando ele morrer.
function esquecer(): void {
  for (const { nao } of pendentes.values()) nao(new Error("o Copilot encerrou."));
  pendentes.clear();
  abertos.clear();
  statusPorCategoria.clear();
  //! O servidor morreu: o provedor dele morreu junto, e o próximo há de ser acordado outra vez.
  aqueceu = false;
  processo = null;
  subindo = null;
}

//* Escreve uma mensagem no cano de entrada do servidor, com o cabeçalho do LSP.
//! `Buffer.byteLength` e não `.length`: o corpo é UTF-8 e o `Content-Length` do
//!   LSP conta BYTES. Com acento no texto — e este projeto é todo em português
//!   — contar caracteres desalinharia o fluxo já na primeira mensagem.
function escrever(mensagem: unknown): void {
  if (!processo) return;
  const corpo = Buffer.from(JSON.stringify(mensagem), "utf8");
  processo.stdin.write(`Content-Length: ${corpo.length}\r\n\r\n`);
  processo.stdin.write(corpo);
}

//* Manda uma notificação: não tem resposta e não se espera por ela.
function notificar(metodo: string, params: unknown): void {
  escrever({ jsonrpc: "2.0", method: metodo, params });
}

//* Manda um pedido e espera a resposta, com relógio por cima.
//! O teto existe porque promessa que não assenta PENDURA a tela: foi assim que
//!   o canal do Neovim travava Ctrl+S em silêncio pela sessão inteira (a A8 de
//!   24/08). A lição não era do Neovim — era de canal com processo externo.
function perguntar(metodo: string, params: unknown): Promise<unknown> {
  if (!processo) return Promise.reject(new Error("o Copilot não está de pé."));
  const id = ++sequencia;
  escrever({ jsonrpc: "2.0", id, method: metodo, params });
  return new Promise<unknown>((ok, nao) => {
    const relogio = setTimeout(() => {
      pendentes.delete(id);
      nao(new Error(`o Copilot não respondeu a ${metodo} em ${TETO_DA_PERGUNTA_MS} ms.`));
    }, TETO_DA_PERGUNTA_MS);
    pendentes.set(id, {
      ok: (v) => { clearTimeout(relogio); ok(v); },
      nao: (e) => { clearTimeout(relogio); nao(e); },
    });
  });
}

//* Lê o cano de saída e desmonta as mensagens do LSP, uma a uma.
//! O acumulador é BUFFER, não string: uma mensagem pode chegar partida no meio
//!   de um caractere de vários bytes, e concatenar como string corromperia o
//!   acento antes de o JSON ser lido.
function ligarLeitura(filho: ChildProcessWithoutNullStreams): void {
  let acumulado = Buffer.alloc(0);
  filho.stdout.on("data", (pedaco: Buffer) => {
    acumulado = Buffer.concat([acumulado, pedaco]);
    for (;;) {
      const fimDoCabecalho = acumulado.indexOf("\r\n\r\n");
      if (fimDoCabecalho < 0) return;
      const cabecalho = acumulado.subarray(0, fimDoCabecalho).toString("utf8");
      const tamanho = Number(/content-length: (\d+)/i.exec(cabecalho)?.[1]);
      if (!Number.isFinite(tamanho)) return;
      const inicio = fimDoCabecalho + 4;
      if (acumulado.length < inicio + tamanho) return;

      const cru = acumulado.subarray(inicio, inicio + tamanho).toString("utf8");
      acumulado = acumulado.subarray(inicio + tamanho);
      receber(cru);
    }
  });
}

//* Encaminha uma mensagem já desmontada: resposta a pedido, ou anúncio dele.
function receber(cru: string): void {
  let msg: { id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown };
  try {
    msg = JSON.parse(cru) as typeof msg;
  } catch {
    return; //! lixo no cano não derruba o motor; a próxima mensagem ainda vem
  }

  const esperando = msg.id !== undefined ? pendentes.get(msg.id) : undefined;
  if (esperando) {
    pendentes.delete(msg.id as number);
    if (msg.error) esperando.nao(new Error(JSON.stringify(msg.error)));
    else esperando.ok(msg.result);
    return;
  }

  if (msg.method === "didChangeStatus/v2") {
    const statuses = (msg.params as { statuses?: { category?: string; kind?: string }[] })?.statuses;
    //! MERGE, não substituição — ver a razão no `statusPorCategoria`.
    for (const s of statuses ?? []) {
      if (s.category && s.kind) statusPorCategoria.set(s.category, s.kind);
    }
  }

  //! Pedido DO servidor PARA nós (tem `id` e `method`) recebe resposta vazia em
  //!   vez de silêncio: servidor que espera resposta que nunca vem para de
  //!   trabalhar, e o sintoma seria "o Copilot parou" sem nada no log.
  if (msg.id !== undefined && msg.method) {
    escrever({ jsonrpc: "2.0", id: msg.id, result: null });
  }
}

//* Sobe o servidor e faz o aperto de mão. `false` = não deu, e o estado diz por quê.
async function garantirDePe(): Promise<boolean> {
  if (processo) return true;
  if (subindo) return subindo;

  subindo = (async () => {
    const { achado, procurados } = localizarServidor();
    if (!achado) {
      motivoDeNaoSubir = `servidor não encontrado. Procurei em: ${procurados.join(" · ")}`;
      return false;
    }

    const { comando, argumentos, ambiente } = comoExecutar(achado);
    const filho = spawn(comando, argumentos, { stdio: "pipe", env: ambiente });

    //! O tratador de `error` é obrigatório e permanente: processo sem ouvinte de
    //!   `error` derruba o main pelo EventEmitter — e derrubar o editor porque a
    //!   sugestão falhou seria trocar um recurso por um produto.
    filho.on("error", () => {
      motivoDeNaoSubir = "o servidor não pôde ser executado";
      esquecer();
    });
    filho.on("exit", (codigo) => {
      motivoDeNaoSubir = ultimaQueixa || `o servidor encerrou (código ${codigo ?? "?"})`;
      esquecer();
    });
    //! O `stderr` é DRENADO, e de propósito: cano cheio sem leitor trava quem
    //!   escreve nele, e o servidor escreveria até parar de responder.
    //! ⚠️ COM `TERMINUS_COPILOT_LOG=1` ele é REPASSADO. Sem este fio, um servidor que
    //!   morre no arranque aparece como *"o Copilot encerrou"* e mais nada — foi
    //!   exatamente o que aconteceu no defeito de campo de 26/08, e eu tive de abrir o
    //!   cano para saber por quê. Nasce desligado e não custa nada.
    const repassarErro = process.env["TERMINUS_COPILOT_LOG"] === "1";
    filho.stderr.on("data", (d: Buffer) => {
      const texto = d.toString("utf8").trim();
      if (repassarErro) process.stderr.write(`[copilot] ${texto}\n`);
      //! ⚠️ A ÚLTIMA LINHA DO `stderr` VIRA A FRASE DA BARRA. Sem isto, um servidor que
      //!   morre no arranque dizia só *"o Copilot encerrou"* — verdadeiro e inútil. O que
      //!   ele REALMENTE disse era *"Node.js 22.13 is required … but found 20.18.3"*, e
      //!   essa frase é a diferença entre "não sei" e "sei o que fazer".
      if (texto) ultimaQueixa = texto.split("\n").pop() ?? texto;
    });

    processo = filho;
    ligarLeitura(filho);

    try {
      await perguntar("initialize", {
        processId: process.pid,
        rootUri: null,
        capabilities: { workspace: { workspaceFolders: true } },
        initializationOptions: {
          editorInfo: { name: "Terminus", version: "0.0.10" },
          editorPluginInfo: { name: "terminus-copilot", version: "0.0.1" },
        },
      });
      notificar("initialized", {});
      return true;
    } catch (erro) {
      motivoDeNaoSubir = ultimaQueixa || `aperto de mão falhou: ${String(erro)}`;
      esquecer();
      return false;
    }
  })();

  return subindo;
}

// ─────────────────────────────────────────────────────────────────────────────
// A superfície que a ponte usa
// ─────────────────────────────────────────────────────────────────────────────

//* O que a barra de estado mostra. Nunca estoura: não saber é um estado.
export async function estadoCopilot(): Promise<EstadoCopilot> {
  const { achado, procurados } = localizarServidor();
  if (!achado) {
    return { pronto: false, servidor: null, detalhe: `não encontrado em: ${procurados.join(" · ")}` };
  }
  if (!(await garantirDePe())) {
    return { pronto: false, servidor: achado.caminho, detalhe: motivoDeNaoSubir };
  }
  //! `cls` é a categoria do próprio servidor de linguagem; `Normal` é ele dizendo
  //!   que está de pé E autenticado. As outras categorias (`completion`, com o
  //!   `busy`) são ruído para a barra de estado.
  const cls = statusPorCategoria.get("cls");
  return {
    pronto: cls === "Normal",
    servidor: achado.caminho,
    detalhe: cls ?? "o servidor ainda não anunciou o estado",
  };
}

//* Pede uma sugestão para a posição em que o cursor está.
//! O TEXTO INTEIRO VIAJA A CADA CHAMADA, e é decisão, não descuido: manter um
//!   diário de edições incrementais entre dois processos é a fonte clássica de
//!   "o servidor tem outro documento". O custo é cópia de string dentro da
//!   máquina; o que se compra é impossibilidade de dessincronizar.
export async function sugerir(pedido: {
  caminho: string;
  linguagem: string;
  texto: string;
  linha: number;
  coluna: number;
  invocado?: boolean;
}): Promise<SugestaoInline[]> {
  if (!(await garantirDePe())) return [];

  const uri = pathToFileURL(pedido.caminho).href;
  abrir(uri, pedido.linguagem, pedido.texto);

  try {
    const resposta = (await perguntar("textDocument/inlineCompletion", {
      textDocument: { uri },
      position: { line: pedido.linha, character: pedido.coluna },
      //! ⚠️ 1 = Invoke, 2 = Automatic, e a diferença NÃO é cosmética: o protocolo diz
      //!   que o Invoke devolve **várias** sugestões (para ciclar com showNext/showPrevious
      //!   e escolher na barra), e o Automatic devolve uma só — que é o certo para quem
      //!   está apenas digitando, porque é mais barato e mais rápido.
      //!   Até 26/08 mandávamos SEMPRE 2, e por isso não havia o que ciclar.
      context: { triggerKind: pedido.invocado ? 1 : 2 },
      formattingOptions: { tabSize: 4, insertSpaces: true },
    })) as { items?: SugestaoInline[] } | null;
    return resposta?.items ?? [];
  } catch {
    //! Sugestão que falhou é ausência de sugestão, não erro na cara de quem
    //!   escreve. O motivo fica no `estadoCopilot`, que a barra mostra.
    return [];
  }
}

//? A EDIÇÃO SEGUINTE (NES) — e a receita que fez ela funcionar
//!
//! ⚠️ EU JÁ DISSE DUAS VEZES QUE ISTO ERA IMPOSSÍVEL, e nas duas eu estava errado.
//!   1ª: *"o modelo da conta não produz"*. Falso — o servidor lista `copilot-nes-pandia-4`
//!      e `copilot-nes-oct` entre 8 modelos de proxy. A conta sempre teve.
//!   2ª: *"o VSCode não usa este método, então o caminho está morto"*. A extensão de fato
//!      não usa — e o método funciona assim mesmo, pelo servidor que já está aqui.
//! O que faltava não era permissão nem formato de prompt. Eram TRÊS coisas de protocolo, e
//! só apareceram quando liguei o log do servidor (`COPILOT_AGENT_VERBOSE=1`) e li o motivo
//! que ele dizia em texto claro: `no edit, reason: activeDocumentHasNoEdits`.
//!
//!   1. **Sincronia incremental.** `didChange` com `range`, não o texto inteiro. A decisão
//!      de mandar tudo estava escrita neste arquivo com uma boa razão — e texto inteiro
//!      **não é edição**. A linha que decide, no código do servidor:
//!      `if (e.xtabEditHistory.length === 0) return ActiveDocumentHasNoEdits`.
//!   2. **O aquecimento.** O provedor de NES nasce no PRIMEIRO pedido e só então escuta.
//!      O que se digitou antes disso não existiu para ele.
//!   3. **`didFocus`.** O NES é sobre o documento em que a pessoa está.
//!
//! ⚠️ E o `diagnostics` continua sendo o `nextEditSuggestions.fixes` da documentação: é por
//! ele que o Copilot propõe a correção do que o pyright ou o Roslyn apontaram. `severity` é
//! **string** (`"error"`/`"warning"`), não o número do LSP — o validador do servidor recusa.
export async function pedirEdicaoSeguinte(pedido: {
  caminho: string;
  linguagem: string;
  texto: string;
  linha: number;
  coluna: number;
  problemas: {
    severidade: "error" | "warning";
    mensagem: string;
    inicio: { linha: number; coluna: number };
    fim: { linha: number; coluna: number };
  }[];
}): Promise<EdicaoSeguinte[]> {
  if (!(await garantirDePe())) return [];

  const uri = pathToFileURL(pedido.caminho).href;
  abrir(uri, pedido.linguagem, pedido.texto);
  //! A VERSÃO TEM DE SER A QUE O `didChange` anunciou: o servidor casa as duas, e um número
  //!   diferente faz ele responder sobre um documento que não é este.
  const versao = abertos.get(uri) ?? 1;

  notificar("textDocument/didFocus", { textDocument: { uri } });

  //! ⚠️ O AQUECIMENTO (item 2 acima). O primeiro pedido de cada sessão é sacrificado de
  //!   propósito: ele não traz edição, ele **acorda quem escuta**. Medido em 27/08 — mesma
  //!   sequência sem ele: `{edits: []}`; com ele: `fetch succeeded, 1 edits returned`, 511 ms.
  if (!aqueceu) {
    aqueceu = true;
    try {
      await perguntar("textDocument/copilotInlineEdit", {
        textDocument: { uri, version: versao },
        position: { line: pedido.linha, character: pedido.coluna },
        diagnostics: [],
      });
    } catch {
      /* o aquecimento não precisa dar certo — precisa acontecer */
    }
    //! E este pedido também volta vazio: quem edita depois é que terá histórico.
    return [];
  }

  try {
    const resposta = (await perguntar("textDocument/copilotInlineEdit", {
      textDocument: { uri, version: versao },
      position: { line: pedido.linha, character: pedido.coluna },
      diagnostics: pedido.problemas.map((p) => ({
        severity: p.severidade,
        message: p.mensagem,
        range: {
          start: { line: p.inicio.linha, character: p.inicio.coluna },
          end: { line: p.fim.linha, character: p.fim.coluna },
        },
      })),
    })) as { edits?: EdicaoSeguinte[] } | null;
    return resposta?.edits ?? [];
  } catch {
    //! Falha aqui é ausência de edição seguinte, não erro na cara de quem escreve.
    return [];
  }
}

//* Avisa o Copilot que a sugestão foi aceita — é o que ele pede no `command`.
//! Sem isto o servidor nunca fica sabendo o que serviu, e é essa devolução que
//!   ele usa para não repetir o que já foi recusado.
export function aceitou(comando: { command: string; arguments?: unknown[] }): void {
  if (!processo) return;
  notificar("workspace/executeCommand", {
    command: comando.command,
    arguments: comando.arguments ?? [],
  });
}

//* Encerra o servidor. Chamado no fechamento da janela.
export function pararCopilot(): void {
  processo?.kill();
  esquecer();
}

//? ⚠️ OS ARQUIVOS VIZINHOS — item 10 da comparação com a documentação do VSCode
//!
//! O documento do VSCode diz, com todas as letras: *"having related files open in VS Code
//! while using Copilot helps set this context"*. Até 26/08 o Terminus mandava **só o
//! arquivo em que o cursor está** — então "ter arquivos abertos" não ajudava em nada aqui,
//! porque o servidor não sabia que eles existiam.
//! O protocolo já resolve isso e não precisa de campo novo: **`didOpen` de cada aba**. O
//! servidor mantém o conjunto de documentos abertos e usa os vizinhos como contexto, que é
//! exatamente o que ele faz dentro do VSCode.
//! ⚠️ POR QUE O TEXTO INTEIRO A CADA VEZ, e não um diário de edições: manter sincronia
//!   incremental entre dois processos é a fonte clássica de "o servidor tem outro
//!   documento". O custo é cópia de string dentro da máquina; o que se compra é
//!   impossibilidade de dessincronizar.

//* Põe (ou atualiza) um documento vizinho no servidor, sem pedir sugestão.
//! Chamado quando uma ABA abre, não quando o cursor entra nela: o valor está em o servidor
//!   conhecer o conjunto, e o conjunto é o que está aberto.
export async function acompanharDocumento(pedido: {
  caminho: string;
  linguagem: string;
  texto: string;
}): Promise<void> {
  if (!(await garantirDePe())) return;
  abrir(pathToFileURL(pedido.caminho).href, pedido.linguagem, pedido.texto);
}

//? ⚠️ A SINCRONIZAÇÃO VIROU INCREMENTAL EM 27/08, E ISSO DESTRAVOU O NES
//!
//! Até aqui eu mandava o TEXTO INTEIRO a cada mudança, com a razão escrita de que
//! *"manter um diário de edições entre dois processos é a fonte clássica de o servidor ter
//! outro documento"*. O raciocínio era bom e a conclusão, errada: **texto inteiro não é
//! edição.** O servidor declara `textDocumentSync.change = 2` (incremental) e o NES vive
//! do histórico — com sincronia total ele responde, literalmente,
//! `no edit, reason: activeDocumentHasNoEdits`, e a linha que decide isso é uma só no
//! código dele: `if (e.xtabEditHistory.length === 0) return ActiveDocumentHasNoEdits`.
//!
//! O risco de dessincronizar continua real; o que mudou é quem o corre. O editor do Monaco
//! **já entrega os deltas prontos** (`onDidChangeModelContent`), no mesmo formato do LSP —
//! então não há diário a manter à mão: o que se manda é o que o editor acabou de aplicar.

//* Abre um documento no servidor. Só na primeira vez.
function abrir(uri: string, linguagem: string, texto: string): void {
  if (abertos.has(uri)) return;
  notificar("textDocument/didOpen", {
    textDocument: { uri, languageId: linguagem, version: 1, text: texto },
  });
  abertos.set(uri, 1);
}

//* Aplica no servidor as mesmas edições que o editor acabou de aplicar.
//! ⚠️ É **ESTA** função que faz o NES existir. Sem os deltas, o servidor não tem histórico e
//!   recusa com `activeDocumentHasNoEdits` — provado lendo o log dele com
//!   `COPILOT_AGENT_VERBOSE=1`, que é como se descobre o motivo em vez de adivinhá-lo.
//! Os `range` chegam prontos do Monaco (`onDidChangeModelContent`), no mesmo formato do LSP.
export function editarDocumento(pedido: {
  caminho: string;
  mudancas: {
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    rangeLength: number;
    text: string;
  }[];
}): void {
  const uri = pathToFileURL(pedido.caminho).href;
  const versao = abertos.get(uri);
  //! Documento que o servidor não conhece não recebe `didChange`: a mudança viria sem base,
  //!   e o servidor a rejeitaria — ou pior, a aceitaria contra outro texto.
  if (versao === undefined || pedido.mudancas.length === 0) return;

  notificar("textDocument/didChange", {
    textDocument: { uri, version: versao + 1 },
    contentChanges: pedido.mudancas,
  });
  abertos.set(uri, versao + 1);
}

//* Esquece um documento — a aba fechou, e o servidor não precisa mais dele.
export function fecharDocumento(caminho: string): void {
  const uri = pathToFileURL(caminho).href;
  if (!abertos.delete(uri)) return;
  notificar("textDocument/didClose", { textDocument: { uri } });
}
