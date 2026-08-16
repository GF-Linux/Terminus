import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Configuração do Terminus: `~/.config/terminus/config.json`, com permissão
 * 0600.
 *
 * O que mora aqui é o que a **casca** guarda entre sessões — aparência, pastas
 * abertas antes, histórico da linha de comando. Configuração do editor não
 * passa por aqui: essa é do Neovim, em `~/.config/nvim`.
 *
 * Não é `localStorage` de propósito: caminho de projeto e linha de comando
 * digitada são dado sensível o bastante para merecer um arquivo com dono.
 */

const PASTA = path.join(os.homedir(), ".config", "terminus");
const ARQUIVO = path.join(PASTA, "config.json");

/** A pasta do usuário, para quem precisa guardar coisa dele ao lado da config. */
export const PASTA_CONFIG = PASTA;

interface ConfigGravada {
  /** Pastas já abertas, da mais recente para a mais antiga. */
  pastas?: string[];
  /** Linhas digitadas no terminal, da mais recente para a mais antiga. */
  comandos?: string[];
  aparencia?: {
    /** Arquivo copiado para dentro de ~/.config/terminus, ou null. */
    wallpaper?: string | null;
    /** 0–0.95: quanto do preto entra por cima da imagem. */
    escurecer?: number;
    /** Desfoque em pixels. */
    desfoque?: number;
    /** Como esconder a volta do loop num papel de parede animado (ADR 0011). */
    junta?: string;
    /** Nome do tema, ou "gerado". */
    tema?: string;
    /** Zoom da janela inteira, como fator. 1 é o tamanho natural. */
    zoom?: number;
    /** A paleta extraída da imagem, quando o tema é "gerado". */
    gerado?: Record<string, string> | null;
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

/* -------------------------------- aparência -------------------------------- */

/**
 * Wallpaper e tema (ADR 0010).
 *
 * A imagem é **copiada** para cá em vez de referenciada onde estava: quem
 * escolhe um papel de parede em `~/Downloads` acaba limpando a pasta um dia, e
 * o Terminus não pode nascer quebrada por causa disso.
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
  /**
   * O zoom da janela inteira, como fator (1 = tamanho natural).
   *
   * Mora aqui, e não no `localStorage`, pelo mesmo motivo das medidas dos
   * painéis: é ajuste de acessibilidade, e quem precisa dele precisa **toda
   * vez**. Reiniciar e a tela voltar ao tamanho pequeno é a ferramenta
   * esquecendo o que mais importa lembrar.
   */
  zoom: 1,
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
    // Os mesmos limites que os atalhos aplicam, para um config.json editado à
    // mão não deixar a janela ilegível nem microscópica.
    zoom: Math.min(2.5, Math.max(0.6, a.zoom ?? APARENCIA_PADRAO.zoom)),
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

/* --------------------------- histórico do terminal ------------------------ */

/**
 * As linhas já digitadas no terminal (ADR 0020), para a seta ↑.
 *
 * Mora aqui pela mesma razão que a lista de pastas recentes: **comando também é
 * dado sensível** — carrega caminho de corrida, nome de amostra, às vezes um
 * endereço de servidor. Fica no `config.json` `0600` e não no `localStorage`,
 * que é um arquivo do Chromium sem permissão restrita e sem dono claro.
 *
 * Repetido não empilha: quem roda `pip list` dez vezes não perde o comando de
 * ontem por causa disso.
 */
const MAX_COMANDOS = 200;

export function comandosRecentes(): string[] {
  return ler().comandos ?? [];
}

export function registrarComando(linha: string): void {
  const c = ler();
  const antes = (c.comandos ?? []).filter((x) => x !== linha);
  c.comandos = [linha, ...antes].slice(0, MAX_COMANDOS);
  gravar(c);
}

export function esquecerComandos(): void {
  const c = ler();
  delete c.comandos;
  gravar(c);
}

/* --------------------------- importar do Twinny --------------------------- */

/**
 * Lê o provedor FIM configurado no Twinny, se o VS Code estiver instalado.
 *
 * Só é chamado quando o usuário aperta o botão. Depois da importação o Terminus
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
