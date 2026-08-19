import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

//? CONFIGURAÇÃO SALVA — Decisão sobre onde a casca guarda o que lembra 16/08/2026
//!
//! 1. O arquivo é `~/.config/terminus/config.json`, com permissão 0600.
//! 2. Guarda o que a CASCA lembra entre sessões: aparência, pastas abertas
//!    antes, histórico da linha de comando.
//! 3. Configuração do editor NÃO passa por aqui — essa é do Neovim, em
//!    `~/.config/nvim`, e a casca não finge ser dona dela.
//! 4. Não é `localStorage` de propósito: caminho de projeto e comando digitado
//!    são dado sensível o bastante para merecer arquivo com dono.
const PASTA = path.join(os.homedir(), ".config", "terminus");
const ARQUIVO = path.join(PASTA, "config.json");

/** A pasta do usuário, para quem precisa guardar coisa dele ao lado da config. */
export const PASTA_CONFIG = PASTA;

interface ConfigGravada {
  /** Pastas já abertas, da mais recente para a mais antiga. */
  pastas?: string[];
  /** Linhas digitadas no terminal, da mais recente para a mais antiga. */
  /** Histórico da linha de comando, até 18/08. Só existe para ser apagado. */
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

//* Lê a aparência gravada (tema, papel de parede, escurecimento, zoom).
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

//* Grava só os campos de aparência que mudaram, mantendo o resto.
export function gravarAparencia(parcial: Partial<Aparencia>): Aparencia {
  const c = ler();
  c.aparencia = { ...lerAparencia(), ...parcial };
  gravar(c);
  return lerAparencia();
}

//* Lê a imagem de fundo e devolve como `data:` URL.
//* É `data:` porque a interface não tem acesso ao disco (ver a ponte).
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

//* Copia a imagem escolhida para dentro de `~/.config/terminus`.
//* Copiar, e não apontar: a imagem original pode ser apagada ou movida.
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

//* Remove o papel de parede e apaga a cópia guardada.
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

//* As pastas já abertas, da mais recente para a mais antiga.
export function pastasRecentes(): string[] {
  return (ler().pastas ?? []).filter((p) => {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  });
}

//* A última pasta aberta — é ela que o Terminus reabre sozinho.
export function ultimaPasta(): string | null {
  return pastasRecentes()[0] ?? null;
}

//* Põe uma pasta no topo da lista de recentes, sem repetir.
export function registrarPasta(raiz: string): void {
  const c = ler();
  const antes = (c.pastas ?? []).filter((p) => p !== raiz);
  c.pastas = [raiz, ...antes].slice(0, MAX_RECENTES);
  gravar(c);
}

//* Tira uma pasta da lista de recentes. NÃO toca no disco.
export function esquecerPasta(raiz: string): void {
  const c = ler();
  c.pastas = (c.pastas ?? []).filter((p) => p !== raiz);
  gravar(c);
}

/* --------------------------- histórico do terminal ------------------------ */

/**
 * O histórico da linha de comando SAIU daqui (19/08).
 *
 * Ele existia porque o terminal do Terminus não tinha shell: a seta ↑ era nossa,
 * então a lista tinha de ser nossa também. Com um shell de verdade quem guarda é
 * o bash, no `~/.bash_history` — o **mesmo arquivo que o Konsole usa**, o que era
 * justamente o ponto: duas listas separadas de "o que eu já digitei" é pior que
 * uma, e a que o `Ctrl+R` procura é a do bash.
 *
 * A razão de privacidade da ADR 0020 continua valendo, e foi conferida antes de
 * mexer: **comando é dado sensível** — carrega caminho de corrida, nome de
 * amostra, às vezes endereço de servidor. Medido nesta máquina:
 *
 *     ~/.config/terminus/config.json   -rw------- (0600)
 *     ~/.bash_history                  -rw------- (0600)
 *
 * Mesma proteção. O que mudou foi o dono do arquivo, não o cuidado com ele.
 *
 * A função abaixo é o que sobra: **apagar o que ficou para trás**. Sem ela, as
 * linhas já gravadas seguiriam no `config.json` para sempre, num campo que
 * ninguém mais lê — dado sensível guardado sem motivo é pior do que dado
 * sensível em uso, porque ninguém lembra que ele está lá.
 */
export function limparHistoricoAntigo(): number {
  const c = ler();
  const quantos = c.comandos?.length ?? 0;
  if (quantos === 0) return 0;
  delete c.comandos;
  gravar(c);
  return quantos;
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
