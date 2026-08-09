import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import type { EdicaoSugerida } from "../shared/tipos.js";

/**
 * GitHub Copilot como motor do texto fantasma.
 *
 * **Por que ele cabe aqui e a Pylance não coubera.** O
 * `@github/copilot-language-server` é MIT, roda como servidor LSP em Node e não
 * compila nada — as três coisas que decidiram a escolha do pyright valem
 * igualmente. Nenhuma parede de licença desta vez. O que ele **não** dispensa é
 * assinatura própria do Copilot: o pacote é o cliente, o serviço é pago, e cada
 * pessoa entra com a conta dela.
 *
 * **O que ele substitui.** O Copilot faz *inline completion*, então troca o
 * fantasma (hoje DeepSeek via FIM) — e **não** a caixa do catálogo nem a do
 * pyright, que continuam iguais. A regra da ADR do fantasma continua de pé: é o
 * único recurso que manda código para fora, e continua sendo dito na cara.
 *
 * Duas diferenças de formato em relação ao FIM, que este módulo esconde do resto
 * da Bancada:
 *  - a resposta traz um **`range`**: a sugestão *substitui* um trecho em vez de
 *    ser enfiada no cursor. Aqui isso é convertido para "o que inserir no
 *    cursor", que é o contrato que o fantasma já tem;
 *  - vem um **comando de telemetria** para avisar que a sugestão foi aceita.
 *
 * **Uma terceira diferença, achada medindo (04/08).** O FIM só precisa do trecho
 * em volta do cursor. O Copilot monta o contexto dele a partir das **abas que o
 * editor declarou abertas** — e até 04/08 este módulo declarava uma só, a do
 * cursor. O comparativo de `docs/comparativo-fantasma-copilot.md` mediu o custo
 * com um arquivo vizinho de assinatura inadivinhável: sem as vizinhas ele
 * inventa o parâmetro (`limiar=0.1`, que não existe e vira `TypeError`); com
 * elas acerta nome e valor (`corte_phred=17`). 5 corridas de cada, 5/5 nos dois
 * lados. Medido junto, e por isso **não** implementado: mandar `rootUri` e
 * `workspaceFolders` no `initialize` não muda nada — são as abas, não a pasta.
 */

let proc: ChildProcessWithoutNullStreams | null = null;
let buf = Buffer.alloc(0);
let proximoId = 0;
const pendentes = new Map<number, (m: Record<string, unknown>) => void>();
let pronto = false;
const versoes = new Map<string, number>();

/**
 * As abas que o editor tem abertas, e qual delas está na frente.
 *
 * Vive aqui e não no servidor porque o editor abre arquivo antes de o servidor
 * do Copilot estar de pé: ele sobe junto com o aplicativo, e a pasta lembrada da
 * ADR 0007 pode restaurar abas nesse meio-tempo. Guardando aqui, `iniciarCopilot`
 * repassa tudo assim que fica pronto, em vez de perder as abas que chegaram
 * cedo demais.
 */
const abertos = new Map<string, string>();
let focado: string | null = null;

function caminhoDoServidor(raizApp: string): string {
  const alvo = path.join(
    raizApp,
    "node_modules",
    "@github",
    "copilot-language-server",
    "dist",
    "language-server.js",
  );
  if (!fs.existsSync(alvo)) {
    throw new Error("O servidor do Copilot não está instalado (@github/copilot-language-server).");
  }
  return alvo;
}

function escrever(msg: Record<string, unknown>): void {
  if (!proc) return;
  const corpo = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...msg }), "utf8");
  proc.stdin.write(`Content-Length: ${corpo.length}\r\n\r\n`);
  proc.stdin.write(corpo);
}

function notificar(method: string, params: unknown): void {
  escrever({ method, params });
}

function pedir(method: string, params: unknown, ms = 20_000): Promise<Record<string, unknown> | null> {
  return new Promise((resolver) => {
    const id = ++proximoId;
    const relogio = setTimeout(() => {
      pendentes.delete(id);
      resolver(null);
    }, ms);
    pendentes.set(id, (msg) => {
      clearTimeout(relogio);
      // **Erro de protocolo não pode virar silêncio.** Antes, um `error` do
      // servidor caía no `?? null` e chegava ao resto da Bancada como "não
      // tenho sugestão" — indistinguível de uma resposta legítima vazia. Custou
      // uma investigação em 08/08.
      if (msg["error"]) {
        console.error(`[copilot] ${method}:`, JSON.stringify(msg["error"]));
      }
      resolver((msg["result"] as Record<string, unknown>) ?? null);
    });
    escrever({ id, method, params });
  });
}

function receber(pedaco: Buffer): void {
  buf = Buffer.concat([buf, pedaco]);
  for (;;) {
    const corte = buf.indexOf("\r\n\r\n");
    if (corte < 0) return;
    const m = /Content-Length:\s*(\d+)/i.exec(buf.subarray(0, corte).toString());
    if (!m) return;
    const inicio = corte + 4;
    const tam = Number(m[1]);
    if (buf.length < inicio + tam) return;
    const msg = JSON.parse(buf.subarray(inicio, inicio + tam).toString()) as Record<string, unknown>;
    buf = buf.subarray(inicio + tam);
    const id = msg["id"] as number | undefined;
    if (id !== undefined && pendentes.has(id)) {
      pendentes.get(id)!(msg);
      pendentes.delete(id);
    }
  }
}

/**
 * @param ligado O fantasma está ligado agora. **Respeita o interruptor:** o
 *   servidor sobe sempre que o motor escolhido é o Copilot, inclusive com o
 *   recurso desligado, e mandar até as duas linhas de mentira do despertar para
 *   fora nesse caso quebraria em silêncio a regra que a ADR 0024 protegeu.
 *
 *   Quem decide isso é quem tem a configuração na mão — este módulo fala
 *   protocolo, não política. Custo aceito: ligar o fantasma no meio da sessão
 *   faz o **fantasma** valer na hora, mas a **correção** só depois de fechar e
 *   reabrir, porque o despertar precisa vir antes de qualquer arquivo real.
 */
export async function iniciarCopilot(raizApp: string, ligado: boolean): Promise<void> {
  if (proc) return;
  const servidor = caminhoDoServidor(raizApp);

  // Mesmo mecanismo do pyright: o binário do Electron faz de node, então não se
  // exige node instalado na máquina de quem usa.
  proc = spawn(process.execPath, [servidor, "--stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  proc.stdout.on("data", (d: Buffer) => receber(d));
  proc.stderr.on("data", () => {
    /* o servidor fala bastante; nada disso é erro nosso */
  });
  proc.on("exit", () => {
    pronto = false;
    proc = null;
    versoes.clear();
  });

  await pedir("initialize", {
    processId: process.pid,
    // O idioma da pessoa, que a Bancada nunca dizia. Fixo em pt-BR e não
    // herdado do `LANG` (esta máquina está em `en_US`): a Bancada inteira fala
    // português com quem a usa, e o comentário que o modelo escreve é texto
    // para essa mesma pessoa.
    //
    // **E isto NÃO conserta o espanhol de 08/08.** Medido em
    // `tools/comparativo-fantasma/medir-idioma.mjs`, um processo por perfil:
    // sem `locale` a mesma `def lista(dicionario):` já devolvia português, e com
    // `pt-BR` a resposta saiu **idêntica**. A hipótese do idioma não declarado
    // era minha e estava errada — o espanhol é o modelo variando num arquivo
    // quase vazio, onde ele não tem contexto nenhum para se ancorar. Fica só
    // porque é o campo certo do protocolo, não porque resolveu alguma coisa.
    locale: "pt-BR",
    clientInfo: { name: "Bancada", version: "0.1.0" },
    capabilities: { workspace: { workspaceFolders: true }, textDocument: { inlineCompletion: {} } },
    initializationOptions: {
      editorInfo: { name: "Bancada", version: "0.1.0" },
      editorPluginInfo: { name: "Bancada", version: "0.1.0" },
    },
    rootUri: null,
    workspaceFolders: [],
  });
  notificar("initialized", {});
  pronto = true;

  // **Antes de declarar qualquer arquivo de verdade.** Ver `acordarCorrecao`: a
  // ordem não é estética. Documento aberto antes desse primeiro pedido não tem
  // a história de edição acompanhada, e nunca recebe correção.
  if (ligado) await acordarCorrecao();

  // As abas que o editor abriu enquanto o servidor subia. Sem este repasse elas
  // ficariam invisíveis para o Copilot até serem tocadas de novo.
  for (const [arquivo, texto] of abertos) enviarDocumento(arquivo, texto);
  if (focado) focarDocumento(focado);
}

export function pararCopilot(): void {
  proc?.kill();
  proc = null;
  pronto = false;
  // `abertos` e `focado` sobrevivem de propósito: são o que o editor tem na
  // tela, não o que o servidor sabe. As versões, não — o servidor novo conta do
  // zero. O comando da correção também não: ele identifica uma edição que só
  // existia no servidor que acabou de morrer.
  versoes.clear();
  comandoDaEdicao = null;
  // O servidor novo nasce frio: o próximo pedido de correção precisa acordá-lo
  // de novo.
  edicaoAquecida = false;
}

export async function estadoCopilot(): Promise<{ entrou: boolean; usuario: string | null }> {
  if (!pronto) return { entrou: false, usuario: null };
  const r = await pedir("checkStatus", {});
  const usuario = (r?.["user"] as string) ?? null;
  return { entrou: r?.["status"] === "OK", usuario };
}

/**
 * Começa o fluxo de dispositivo e devolve o código para a pessoa digitar.
 *
 * Quem autoriza é ela, no navegador dela, com a conta dela — a Bancada nunca vê
 * senha nem token. O `workspace/executeCommand` fica esperando a confirmação, e
 * por isso a espera aqui é longa de propósito.
 */
export async function entrarNoCopilot(): Promise<{
  codigo: string | null;
  endereco: string | null;
  concluir: Promise<boolean>;
}> {
  const r = await pedir("signIn", {}, 30_000);
  const codigo = (r?.["userCode"] as string) ?? null;
  const endereco = (r?.["verificationUri"] as string) ?? "https://github.com/login/device";
  const comando = r?.["command"] as { command: string; arguments: unknown[] } | undefined;

  const concluir = comando
    ? pedir(
        "workspace/executeCommand",
        { command: comando.command, arguments: comando.arguments },
        600_000,
      ).then((f) => f?.["status"] === "OK")
    : Promise.resolve(false);

  return { codigo, endereco, concluir };
}

/**
 * Põe o documento no servidor: `didOpen` na primeira vez, `didChange` depois.
 *
 * A numeração de versão é **desta função**, não a que o editor usa com o
 * pyright. São dois servidores com contagens independentes, e o fantasma manda
 * o texto por fora do `didChange` debounçado do editor (ver `sugerirComCopilot`)
 * — misturar as duas contagens daria versão repetida.
 */
function enviarDocumento(arquivo: string, texto: string): string {
  const uri = pathToFileURL(arquivo).href;
  const versao = (versoes.get(uri) ?? 0) + 1;
  versoes.set(uri, versao);
  if (versao === 1) {
    notificar("textDocument/didOpen", {
      textDocument: { uri, languageId: "python", version: versao, text: texto },
    });
  } else {
    notificar("textDocument/didChange", {
      textDocument: { uri, version: versao },
      contentChanges: [{ text: texto }],
    });
  }
  return uri;
}

/** Uma aba abriu, ou o texto dela mudou. */
export function sincronizarDocumento(arquivo: string, texto: string): void {
  abertos.set(arquivo, texto);
  if (pronto) enviarDocumento(arquivo, texto);
}

/** Uma aba fechou. Sem isto o Copilot seguiria usando como vizinho um arquivo
 *  que ninguém tem mais na tela. */
export function fecharDocumento(arquivo: string): void {
  abertos.delete(arquivo);
  if (focado === arquivo) focado = null;
  const uri = pathToFileURL(arquivo).href;
  if (versoes.delete(uri) && pronto) {
    notificar("textDocument/didClose", { textDocument: { uri } });
  }
}

/**
 * Qual aba está na frente.
 *
 * O `didFocus` é o que separa "o arquivo que estou escrevendo" de "os arquivos
 * que estão abertos do lado", e o Copilot usa essa diferença para montar o
 * contexto. Até 04/08 ele era mandado uma vez só, na abertura, e trocar de aba
 * não avisava ninguém.
 */
export function focarDocumento(arquivo: string | null): void {
  focado = arquivo;
  if (!arquivo || !pronto) return;
  // Focar um documento que o servidor não tem é pedir para ele ignorar o aviso.
  const texto = abertos.get(arquivo);
  if (texto !== undefined) enviarDocumento(arquivo, texto);
  notificar("textDocument/didFocus", { textDocument: { uri: pathToFileURL(arquivo).href } });
}

/** Deslocamento absoluto -> linha/coluna 0-based. */
function emLinhaColuna(texto: string, pos: number): { line: number; character: number } {
  const antes = texto.slice(0, pos);
  const line = (antes.match(/\n/g) ?? []).length;
  const character = pos - (antes.lastIndexOf("\n") + 1);
  return { line, character };
}

/** linha/coluna 0-based -> deslocamento absoluto. */
function emDeslocamento(texto: string, line: number, character: number): number {
  let at = 0;
  for (let n = 0; n < line; n++) {
    const q = texto.indexOf("\n", at);
    if (q < 0) return texto.length;
    at = q + 1;
  }
  return Math.min(at + character, texto.length);
}

interface ItemInline {
  insertText: string;
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
  command?: { command: string; arguments: unknown[] };
}

/**
 * Uma sugestão para o cursor, no mesmo contrato do fantasma FIM: o texto a
 * **inserir no cursor**, ou null.
 *
 * O Copilot responde com um `range` que costuma começar antes do cursor — em
 * geral no começo da linha, englobando a indentação já digitada. Enfiar o
 * `insertText` inteiro no cursor duplicaria esse pedaço. Aqui o trecho do
 * documento que vai de `range.start` até o cursor é descontado da frente da
 * sugestão, e o que sobra é o que de fato falta escrever.
 */
export async function sugerirComCopilot(
  arquivo: string,
  texto: string,
  cursor: number,
): Promise<string | null> {
  if (!pronto) return null;
  // O texto vem junto com o pedido, e não só pelo `didChange` do editor, porque
  // aquele é debounçado em 300 ms — os mesmos 300 ms da espera do fantasma. A
  // corrida entre os dois faria o Copilot responder sobre a tecla anterior.
  sincronizarDocumento(arquivo, texto);
  const uri = pathToFileURL(arquivo).href;
  const posicao = emLinhaColuna(texto, cursor);

  const r = await pedir("textDocument/inlineCompletion", {
    textDocument: { uri },
    position: posicao,
    context: { triggerKind: 2 },
    formattingOptions: { tabSize: 4, insertSpaces: true },
  });

  const itens = (r?.["items"] as ItemInline[]) ?? [];
  const item = itens[0];
  if (!item?.insertText) return null;

  let sugestao = item.insertText;
  if (item.range) {
    const de = emDeslocamento(texto, item.range.start.line, item.range.start.character);
    if (de < cursor) {
      const jaEscrito = texto.slice(de, cursor);
      if (sugestao.startsWith(jaEscrito)) sugestao = sugestao.slice(jaEscrito.length);
      else return null; // o range não bate com o documento: melhor não sugerir nada
    }
  }

  if (!sugestao.trim()) return null;

  // Telemetria de aceite: o Copilot pede para ser avisado. Não é obrigatório
  // para funcionar, e por isso vai sem esperar resposta.
  if (item.command) {
    notificar("workspace/executeCommand", {
      command: item.command.command,
      arguments: item.command.arguments,
    });
  }
  return sugestao;
}

/* ------------------------- correção (o next edit) ------------------------- */

/**
 * A correção do que **já está escrito** — `textDocument/copilotInlineEdit`.
 *
 * **Por que ela é outra coisa, e não um ajuste do fantasma.** Completar só sabe
 * enfiar texto no cursor. O caso que a pediu (08/08) era `dicionario(i, 0)` onde
 * cabia `dicionario.get(i, 0)`: não falta nada no cursor, sobra um erro três
 * linhas acima. Nenhuma superfície da Bancada alcançava isso — nem o pyright,
 * que não acusa, porque `dicionario` é parâmetro sem anotação e chamá-lo é
 * legítimo para ele.
 *
 * **O protocolo não vem documentado no pacote** — foi lido do `dist/main.js` do
 * servidor 1.527.1 e medido em `tools/comparativo-fantasma/medir-inline-edit.mjs`.
 * Três coisas que a medição ensinou, e que valem para quem mexer aqui:
 *
 *  - **`version` é obrigatório.** O handler do servidor começa com um
 *    `if (version === undefined) throw` — ao contrário do `inlineCompletion`,
 *    esquecer disso dá exceção, não resposta vazia;
 *  - **ele corrige o que mudou, não "o arquivo".** Abrir um documento pronto e
 *    perguntar devolve zero edições em ~260 ms, sem nem consultar o modelo; com
 *    a história de edição (`didOpen` e depois `didChange`), acha. Como a Bancada
 *    manda `didChange` a cada tecla, a história existe sozinha — mas abrir um
 *    `.py` do disco e esperar correção **não** vai funcionar, e é assim mesmo;
 *  - **é lento**: 2,5 s a 4,5 s medidos, três a cinco vezes o fantasma. Por isso
 *    tem gatilho próprio na interface, e não pega carona nos 300 ms dele.
 *
 * O cursor quase não importa: medido, ele acha o defeito da linha 7 mesmo
 * perguntado do fim do arquivo.
 */
interface EdicaoInline {
  text: string;
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
  command?: { command: string; arguments: unknown[] };
}

/** O aceite/recusa é telemetria, e o servidor identifica a edição por este comando. */
let comandoDaEdicao: { command: string; arguments: unknown[] } | null = null;

/**
 * **O primeiro pedido de correção de cada servidor volta vazio. Sempre.**
 *
 * Medido em 08/08, e não está documentado em lugar nenhum do pacote. Servidor
 * recém-subido responde ao primeiro `copilotInlineEdit` em ~30 ms com zero
 * edições — rápido demais para ter consultado modelo — e a partir do segundo
 * responde de verdade, em segundos, com a correção certa.
 *
 * **Não é tempo, é o pedido.** Testado: esperar 4 s antes de perguntar continua
 * devolvendo vazio; mandar um pedido descartado antes funciona. É o pedido que
 * acorda o subsistema.
 *
 * **E a ordem importa mais que o pedido.** Acordar *depois* de o arquivo já
 * estar aberto e editado não adianta — medido, continua vazio. Parece que o
 * servidor só acompanha a história de documentos abertos **depois** do primeiro
 * pedido. Por isso o despertar mora no `iniciarCopilot`, antes de qualquer
 * arquivo real ser declarado, e não na primeira correção pedida.
 *
 * Isto custou meio diagnóstico: a primeira medição rodava todos os casos num
 * processo só, e o caso que voltava vazio parecia apenas um caso negativo — era
 * ele que fazia os outros funcionarem.
 */
let edicaoAquecida = false;

/**
 * Gasta o pedido que o servidor sempre desperdiça, **num documento de mentira**.
 *
 * A tentação era mandar duas vezes o pedido de verdade e jogar a primeira
 * resposta fora. Não funciona, e a razão é a mesma armadilha que a sessão de
 * 04/08 já tinha registrado: o servidor **guarda resposta por conteúdo +
 * posição**. O segundo pedido, idêntico ao primeiro, recebe de volta em 3 ms o
 * vazio que o primeiro produziu. Medido — a correção só aparece quando o pedido
 * descartado fala de outro documento.
 *
 * Daí este arquivo que não existe para ninguém: duas linhas triviais, uma
 * edição, um pedido, e fecha. Sai da máquina menos código do que uma tecla
 * digitada no editor.
 */
async function acordarCorrecao(): Promise<void> {
  if (edicaoAquecida) return;
  edicaoAquecida = true;
  const uri = pathToFileURL(path.join(os.tmpdir(), "bancada-aquecimento.py")).href;
  notificar("textDocument/didOpen", {
    textDocument: { uri, languageId: "python", version: 1, text: "a = 1\n" },
  });
  notificar("textDocument/didChange", {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text: "a = 1\nb = 2\n" }],
  });
  await pedir(
    "textDocument/copilotInlineEdit",
    { textDocument: { uri, version: 2 }, position: { line: 1, character: 5 }, diagnostics: [] },
    10_000,
  );
  notificar("textDocument/didClose", { textDocument: { uri } });
}

export async function sugerirEdicaoComCopilot(
  arquivo: string,
  texto: string,
  cursor: number,
  diagnosticos: unknown[] = [],
): Promise<EdicaoSugerida[]> {
  if (!pronto) return [];
  // **Só sincroniza se o texto mudou de verdade.** O fantasma sincroniza sempre,
  // e para ele tanto faz. Aqui não: um `didChange` que não muda nada é dizer ao
  // servidor "acabei de editar" sem edição nenhuma, logo antes de perguntar
  // justamente o que mudou. O `abertos` já guarda o último texto enviado.
  if (abertos.get(arquivo) !== texto) sincronizarDocumento(arquivo, texto);
  const uri = pathToFileURL(arquivo).href;
  const versao = versoes.get(uri);
  // Sem versão o servidor lança exceção em vez de responder vazio.
  if (versao === undefined) return [];

  const pedido = {
    textDocument: { uri, version: versao },
    position: emLinhaColuna(texto, cursor),
    // Os diagnósticos do editor, que o servidor aceita porque tem um provedor
    // de correção guiado por eles (`nextEditSuggestions.fixes`, ligado por
    // padrão). **Ninguém os manda hoje, e isso é decisão medida, não esquecimento:**
    // em 08/08 testei se um `IndentationError` do pyright destravaria a correção
    // de um bloco mal indentado — o servidor recusou igual, com e sem o
    // diagnóstico, gastando ~4 s de consulta real nas duas vezes. Plumbar os
    // diagnósticos do renderer até aqui seria trabalho por uma promessa que a
    // medição não sustentou.
    //
    // O parâmetro fica porque a bancada de medição o usa, e porque o formato
    // não é o do LSP e custou uma corrida para descobrir: o `severity` é
    // **"error" | "warning"** (string), não o número 1..4. Mandar o número dá
    // `-32602 Expected union value`, que sem o log de erro do `pedir` teria
    // chegado aqui como "não tenho correção".
    diagnostics: diagnosticos,
  };

  const r = await pedir("textDocument/copilotInlineEdit", pedido, 15_000);

  const edicoes = (r?.["edits"] as EdicaoInline[]) ?? [];
  comandoDaEdicao = edicoes.find((e) => e.command)?.command ?? null;

  const saida: EdicaoSugerida[] = [];
  for (const e of edicoes) {
    if (!e.range || typeof e.text !== "string") continue;
    const de = emDeslocamento(texto, e.range.start.line, e.range.start.character);
    const ate = emDeslocamento(texto, e.range.end.line, e.range.end.character);
    // Intervalo torto, ou troca que não troca nada: ruído na tela de quem
    // esperava ver um erro apontado.
    if (ate < de) continue;
    if (texto.slice(de, ate) === e.text) continue;
    saida.push({ de, ate, texto: e.text });
  }
  return saida;
}

/** A pessoa aceitou a correção. Igual ao fantasma, avisa e não espera resposta. */
export function avisarEdicaoAceita(): void {
  if (!pronto || !comandoDaEdicao) return;
  notificar("workspace/executeCommand", {
    command: comandoDaEdicao.command,
    arguments: comandoDaEdicao.arguments,
  });
  comandoDaEdicao = null;
}

/** A pessoa dispensou. O servidor tem método próprio para isto, com o mesmo id. */
export function avisarEdicaoRecusada(): void {
  const uuid = comandoDaEdicao?.arguments?.[0];
  comandoDaEdicao = null;
  if (!pronto || typeof uuid !== "string") return;
  void pedir("notifyNextEditRejected", { uuid, reason: "rejected" }, 5_000);
}
