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
