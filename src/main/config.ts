import { safeStorage } from "electron";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ConfigFantasma, EstadoFantasma } from "../shared/tipos.js";

/**
 * Configuração da Bancada, incluindo o segredo do texto fantasma.
 *
 * A chave é cifrada pelo `safeStorage` do Electron, que usa o chaveiro do
 * sistema (kwallet no KDE deste Deck). Se o chaveiro não estiver disponível a
 * chave é gravada em texto puro com permissão 0600 — e o aplicativo **diz isso
 * na tela**, em vez de fingir que guardou bem.
 *
 * O arquivo mora em `~/.config/bancada/config.json`, não no `state.vscdb` do VS
 * Code. Ler o banco do Twinny em tempo de execução amarraria a Bancada a ele
 * estar instalado, e copiar segredo do armazenamento de outro aplicativo sem o
 * usuário mandar não é coisa que se faça em silêncio. A importação existe, mas
 * é um botão.
 */

const PASTA = path.join(os.homedir(), ".config", "bancada");
const ARQUIVO = path.join(PASTA, "config.json");

interface ConfigGravada {
  fantasma?: {
    endpoint: string;
    modelo: string;
    /** Chave cifrada pelo safeStorage, em base64. */
    chaveCifrada?: string;
    /** Chave em texto puro — só quando não há chaveiro. */
    chaveAberta?: string;
    ligado: boolean;
  };
  /** Pastas de corrida já abertas, da mais recente para a mais antiga. */
  pastas?: string[];
  aparencia?: {
    /** Arquivo copiado para dentro de ~/.config/bancada, ou null. */
    wallpaper?: string | null;
    /** 0–0.95: quanto do preto entra por cima da imagem. */
    escurecer?: number;
    /** Desfoque em pixels. */
    desfoque?: number;
    /** Como esconder a volta do loop num papel de parede animado (ADR 0011). */
    junta?: string;
    /** Nome do tema, ou "gerado". */
    tema?: string;
    /** A paleta extraída da imagem, quando o tema é "gerado". */
    gerado?: Record<string, string> | null;
  };
  mascote?: {
    /** Endpoint de conversa. Vazio = derivado do endpoint do fantasma. */
    endpoint?: string;
    modelo?: string;
    nome?: string;
    ligado: boolean;
  };
}

function ler(): ConfigGravada {
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO, "utf8")) as ConfigGravada;
  } catch {
    return {};
  }
}

function gravar(c: ConfigGravada): void {
  fs.mkdirSync(PASTA, { recursive: true, mode: 0o700 });
  fs.writeFileSync(ARQUIVO, JSON.stringify(c, null, 2), { encoding: "utf8", mode: 0o600 });
}

/** Resolve a chave para uso, decifrando se for o caso. */
export function chaveDoFantasma(): string | null {
  const f = ler().fantasma;
  if (!f) return null;
  if (f.chaveAberta) return f.chaveAberta;
  if (!f.chaveCifrada) return null;
  try {
    return safeStorage.decryptString(Buffer.from(f.chaveCifrada, "base64"));
  } catch {
    // Chaveiro trocado ou perfil movido: a chave cifrada virou lixo. Melhor
    // dizer que não há chave do que estourar no meio de uma sugestão.
    return null;
  }
}

export function configDoFantasma(): ConfigFantasma | null {
  const f = ler().fantasma;
  if (!f) return null;
  return { endpoint: f.endpoint, modelo: f.modelo, ligado: f.ligado };
}

export function estadoDoFantasma(): EstadoFantasma {
  const f = ler().fantasma;
  return {
    configurado: chaveDoFantasma() !== null,
    ligado: f?.ligado ?? false,
    endpoint: f?.endpoint ?? null,
    modelo: f?.modelo ?? null,
    chaveiroDisponivel: safeStorage.isEncryptionAvailable(),
    chaveEmTextoPuro: Boolean(f?.chaveAberta),
    arquivo: ARQUIVO,
  };
}

export function salvarFantasma(entrada: {
  endpoint: string;
  modelo: string;
  chave: string;
  ligado: boolean;
}): EstadoFantasma {
  const c = ler();
  const base = { endpoint: entrada.endpoint, modelo: entrada.modelo, ligado: entrada.ligado };

  c.fantasma = safeStorage.isEncryptionAvailable()
    ? { ...base, chaveCifrada: safeStorage.encryptString(entrada.chave).toString("base64") }
    : { ...base, chaveAberta: entrada.chave };

  gravar(c);
  return estadoDoFantasma();
}

export function ligarFantasma(ligado: boolean): EstadoFantasma {
  const c = ler();
  if (c.fantasma) {
    c.fantasma.ligado = ligado;
    gravar(c);
  }
  return estadoDoFantasma();
}

export function esquecerFantasma(): EstadoFantasma {
  const c = ler();
  delete c.fantasma;
  gravar(c);
  return estadoDoFantasma();
}

/* -------------------------------- aparência -------------------------------- */

/**
 * Wallpaper e tema (ADR 0010).
 *
 * A imagem é **copiada** para cá em vez de referenciada onde estava: quem
 * escolhe um papel de parede em `~/Downloads` acaba limpando a pasta um dia, e
 * a Bancada não pode nascer quebrada por causa disso.
 */
const APARENCIA_PADRAO = {
  wallpaper: null as string | null,
  // Escuro por padrão, e isto é regra da ADR 0005 virando número: a casca não
  // pode competir com as quatro bases do cromatograma. Dá para clarear, mas o
  // ponto de partida protege o dado.
  escurecer: 0.82,
  desfoque: 3,
  // Padrão do papel de parede animado: dissolver a volta. Ver ADR 0011 — a
  // emenda mora no arquivo, e mascarar é o que dá para fazer.
  junta: "crossfade",
  tema: "cursor-dark",
  gerado: null as Record<string, string> | null,
};

export type Aparencia = typeof APARENCIA_PADRAO;

export function lerAparencia(): Aparencia {
  const a = ler().aparencia ?? {};
  return {
    wallpaper: a.wallpaper ?? APARENCIA_PADRAO.wallpaper,
    escurecer: Math.min(0.95, Math.max(0, a.escurecer ?? APARENCIA_PADRAO.escurecer)),
    desfoque: Math.min(24, Math.max(0, a.desfoque ?? APARENCIA_PADRAO.desfoque)),
    junta: a.junta ?? APARENCIA_PADRAO.junta,
    tema: a.tema ?? APARENCIA_PADRAO.tema,
    gerado: a.gerado ?? null,
  };
}

export function gravarAparencia(parcial: Partial<Aparencia>): Aparencia {
  const c = ler();
  c.aparencia = { ...lerAparencia(), ...parcial };
  gravar(c);
  return lerAparencia();
}

/** A imagem em `data:` URL — o renderizador não tem acesso ao disco. */
export function lerWallpaper(): string | null {
  const caminho = lerAparencia().wallpaper;
  if (!caminho) return null;
  try {
    const ext = path.extname(caminho).slice(1).toLowerCase() || "png";
    const tipo = ext === "jpg" ? "jpeg" : ext;
    return `data:image/${tipo};base64,${fs.readFileSync(caminho).toString("base64")}`;
  } catch {
    return null;
  }
}

export function guardarWallpaper(origem: string): Aparencia {
  fs.mkdirSync(PASTA, { recursive: true, mode: 0o700 });
  const destino = path.join(PASTA, `fundo${path.extname(origem).toLowerCase()}`);
  // Limpa cópias antigas de outra extensão, senão sobra lixo a cada troca.
  for (const f of fs.readdirSync(PASTA)) {
    if (f.startsWith("fundo.")) fs.rmSync(path.join(PASTA, f), { force: true });
  }
  fs.copyFileSync(origem, destino);
  return gravarAparencia({ wallpaper: destino });
}

export function tirarWallpaper(): Aparencia {
  const atual = lerAparencia().wallpaper;
  if (atual) fs.rmSync(atual, { force: true });
  // O tema gerado morre com a imagem: paleta tirada de uma foto que não está
  // mais na tela é paleta órfã.
  return gravarAparencia({ wallpaper: null, gerado: null, tema: "cursor-dark" });
}

/* --------------------------------- mascote --------------------------------- */

/**
 * O mascote (ADR 0008).
 *
 * Reusa a chave do texto fantasma — é a mesma conta e o mesmo dono —, mas o
 * endereço é outro: o fantasma fala com um endpoint de **completamento** (FIM),
 * e conversa é `/chat/completions`. Por padrão o endereço é derivado do que já
 * está configurado; quem quiser outro provedor escreve no arquivo.
 */
export const PASTA_SPRITE = path.join(PASTA, "mascote");
export const ARQUIVO_CONTEXTO = path.join(PASTA, "contexto.md");
/** Onde vive a memória que o próprio mascote escreve (ADR 0009). */
export const PASTA_FERN = path.join(PASTA, "fern");

const MODELO_CONVERSA_PADRAO = "deepseek-chat";

/** Deriva o endereço de conversa a partir do endereço de completamento. */
function endpointDerivado(): string {
  const f = ler().fantasma;
  if (!f?.endpoint) return "https://api.deepseek.com/chat/completions";
  try {
    const u = new URL(f.endpoint);
    return `${u.origin}/chat/completions`;
  } catch {
    return "https://api.deepseek.com/chat/completions";
  }
}

export function configDoMascote(): {
  endpoint: string;
  modelo: string;
  nome: string;
  ligado: boolean;
} {
  const m = ler().mascote;
  return {
    endpoint: m?.endpoint || endpointDerivado(),
    modelo: m?.modelo || MODELO_CONVERSA_PADRAO,
    nome: m?.nome || "Mascote",
    // Vem **desligado**: conversa sai da máquina, e isso não se liga sozinho.
    ligado: m?.ligado ?? false,
  };
}

export function ligarMascote(ligado: boolean): void {
  const c = ler();
  c.mascote = { ...(c.mascote ?? {}), ligado };
  gravar(c);
}

export function nomearMascote(nome: string): void {
  const c = ler();
  c.mascote = { ...(c.mascote ?? {}), ligado: c.mascote?.ligado ?? false, nome };
  gravar(c);
}

/**
 * O miniMD — o **único** arquivo que o mascote lê.
 *
 * Fica no processo principal de propósito: a interface nunca vê este texto, e
 * ele não atravessa a ponte de IPC. Vai direto daqui para o modelo, quando há
 * conversa, e para mais lugar nenhum.
 */
export function lerContexto(): string | null {
  try {
    return fs.readFileSync(ARQUIVO_CONTEXTO, "utf8");
  } catch {
    return null;
  }
}

/* ----------------------------- pastas de corrida --------------------------- */

/**
 * As pastas já abertas, da mais recente para a mais antiga.
 *
 * Guardar isto no lugar do segredo é de propósito: é a mesma configuração do
 * usuário, no mesmo arquivo `0600`. **Caminho de pasta de corrida é dado
 * sensível por si só** — diz em que máquina e sob que nome o laboratório guarda
 * material não publicado —, então não vai para `localStorage` nem para lugar
 * nenhum que saia daqui.
 *
 * A lista é filtrada na leitura: pasta apagada, renomeada ou em pendrive que
 * saiu simplesmente deixa de aparecer, sem erro na cara de quem abriu o app.
 */
const MAX_RECENTES = 8;

export function pastasRecentes(): string[] {
  return (ler().pastas ?? []).filter((p) => {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  });
}

/** A pasta a reabrir sozinha: a última que foi aberta e ainda existe. */
export function ultimaPasta(): string | null {
  return pastasRecentes()[0] ?? null;
}

export function registrarPasta(raiz: string): void {
  const c = ler();
  const antes = (c.pastas ?? []).filter((p) => p !== raiz);
  c.pastas = [raiz, ...antes].slice(0, MAX_RECENTES);
  gravar(c);
}

/** Tira uma pasta da lista — o "esquecer" do menu de contexto do recente. */
export function esquecerPasta(raiz: string): void {
  const c = ler();
  c.pastas = (c.pastas ?? []).filter((p) => p !== raiz);
  gravar(c);
}

/* --------------------------- importar do Twinny --------------------------- */

/**
 * Lê o provedor FIM configurado no Twinny, se o VS Code estiver instalado.
 *
 * Só é chamado quando o usuário aperta o botão. Depois da importação a Bancada
 * passa a ter cópia própria: desinstalar o Twinny não a quebra.
 *
 * O `state.vscdb` é um SQLite, e ler SQLite daqui exigiria dependência nativa —
 * que esta máquina não compila. Em vez disso o valor sai por `sqlite3` do
 * sistema, e se ele não existir a importação falha dizendo o porquê.
 */
export async function lerDoTwinny(): Promise<{
  endpoint: string;
  modelo: string;
  chave: string;
}> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const executar = promisify(execFile);

  const candidatos = [
    path.join(os.homedir(), ".var", "app", "com.visualstudio.code", "config", "Code", "User", "globalStorage", "state.vscdb"),
    path.join(os.homedir(), ".config", "Code", "User", "globalStorage", "state.vscdb"),
  ];
  const banco = candidatos.find((c) => fs.existsSync(c));
  if (!banco) throw new Error("Não achei a configuração do VS Code nesta máquina.");

  let bruto: string;
  try {
    const { stdout } = await executar("sqlite3", [
      banco,
      "select value from ItemTable where key='rjmacarthy.twinny'",
    ]);
    bruto = stdout;
  } catch {
    throw new Error("Precisa do comando `sqlite3` para ler a configuração do Twinny.");
  }

  if (!bruto.trim()) throw new Error("O Twinny não tem configuração gravada.");

  const dados = JSON.parse(bruto) as {
    "twinny.active-fim-provider"?: {
      apiProtocol: string;
      apiHostname: string;
      apiPath: string;
      modelName: string;
      apiKey?: string;
    };
  };
  const p = dados["twinny.active-fim-provider"];
  if (!p?.apiKey) throw new Error("O Twinny não tem provedor FIM com chave configurada.");

  return {
    endpoint: `${p.apiProtocol}://${p.apiHostname}${p.apiPath}`,
    modelo: p.modelName,
    chave: p.apiKey,
  };
}
