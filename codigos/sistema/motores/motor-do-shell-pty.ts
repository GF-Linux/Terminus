import { spawn as abrirPrograma } from "node:child_process";
import { spawn, type IPty } from "node-pty";
import { readFileSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

//? MOTOR DO SHELL (PTY) — Decisão sobre o terminal que não tinha cor 19/08/2026
//!
//! 1. O pedido do autor: "ao adicionar o comando de cores, o terminal embutido no
//!    Terminus não reproduz as cores, mas no Konsole aparece". Medido, e a culpa
//!    NÃO era do xterm.js:
//!
//!       ls --color=auto /usr/lib
//!         por cano  b'alsa\nbinfmt.d\n...'              <- sem cor
//!         por PTY   b'\x1b[01;34malsa\x1b[0m ...'       <- com cor
//!       python3 -c "print(sys.stdout.isatty())"
//!         por cano  False        por PTY  True
//!
//!    Programa que se pergunta se fala com um terminal desliga a cor sozinho
//!    quando a resposta é não. O Konsole tem cor porque tem PTY; o Terminus não
//!    tinha PTY, então nenhum ajuste de tema traria a cor de volta.
//! 2. O terminal da casca rodava comando com CANOS COMUNS (`executor-de-comando.ts`,
//!    hoje apagado). Aquilo foi decidido no SteamOS, que não tinha `gcc` nem
//!    `make` e não compilava módulo nativo. ESSA TRAVA NÃO EXISTE MAIS: o
//!    `node-pty` está compilado e já roda o Neovim neste mesmo aplicativo
//!    (`motor-neovim-pty.ts`) desde a ADR 0025.
//! 3. Então o terminal da casca passa a ser um terminal DE VERDADE: um shell num
//!    pseudo-terminal, exatamente como o Konsole faz. O que vem junto não é só
//!    cor — é `htop`, `python` interativo, `sudo` pedindo senha, `nano`, barra de
//!    progresso do `pip`, e o `|`, `>`, `&&` e `;` que a triagem recusava.
//!
//? POR QUE NÃO EMBUTIR O KONSOLE DE VERDADE, QUE FOI O PEDIDO
//!
//! 4. Medido antes de responder, e não dá:
//!       konsolepart.so   e KPart Qt6 Widgets  -> exige hospedeiro Qt; o Electron nao e
//!       konsole --help   nao tem opcao de embutir em janela alheia
//!       a sessao aqui e  Wayland              -> nao existe XEmbed
//!    Sobraria reparentar janela X por XWayland, que quebra foco, redimensionamento
//!    e empilhamento. O Konsole entra pela outra porta: o botão ↗ do cabeçalho
//!    abre o Konsole de verdade, na MESMA pasta em que este shell está.
//!
//? O SHELL É O MESMO QUE O KONSOLE ABRE, E ISSO É PROPOSITAL
//!
//! 5. Nem PATH remendado, nem variável a mais. A ADR 0020 tinha de emendar o PATH
//!    à mão porque não havia shell para ler o `.bashrc` — a sessão gráfica do
//!    Plasma não entrega o nvm nem o `~/.local/bin`, e o `verboo` sumia. Com
//!    shell de verdade quem resolve isso é o `.bashrc` da pessoa, uma vez só,
//!    para o Konsole e para cá. Emendar de novo aqui faria os dois divergirem —
//!    e "funciona no Konsole e não no Terminus" é exatamente o defeito que esta
//!    mudança veio matar.
//! 6. As três variáveis abaixo são a exceção, e cada uma tem motivo escrito.

/** O shell da pessoa, como o sistema o registra. */
function shellDoUsuario(): string {
  const s = process.env["SHELL"];
  //! `/bin/bash` de reserva, e não `/bin/sh`: `sh` no Fedora é o próprio bash em
  //! modo POSIX, que não lê `.bashrc` e nasceria sem nada do que a pessoa
  //! configurou. Reserva que perde a configuração é pior do que não ter reserva.
  return s && s.trim() !== "" ? s : "/bin/bash";
}

/**
 * O ambiente que o shell recebe.
 *
 * Quase tudo passa intacto, de propósito (item 5 acima). O que sai, sai por
 * APAGAR a chave, e não por atribuir `undefined`: medido no fonte do node-pty,
 * `terminal.js` monta o ambiente com `pairs.push(chave + "=" + env[chave])`, e
 * uma chave valendo `undefined` viraria a STRING "undefined" no ambiente do
 * shell — pior do que não ter mexido. Foi um defeito meu, achado lendo o
 * módulo em vez de supondo o que ele faz.
 */
function ambiente(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;

  //! Diz aos programas que aqui há 24 bits de cor, e não só as 256 do terminfo.
  //! É o que o Konsole também anuncia.
  env["COLORTERM"] = "truecolor";

  //! Herdadas do Electron e sem sentido num shell. A primeira faz programa que
  //! consulta a área de trabalho responder errado; a segunda faria um `node`
  //! filho nascer achando que é o Electron.
  delete env["ORIGINAL_XDG_CURRENT_DESKTOP"];
  delete env["ELECTRON_RUN_AS_NODE"];

  return env;
}

let proc: IPty | null = null;

export interface OpcoesShell {
  /** Pasta onde o terminal abre — a corrida aberta, ou a home na falta dela. */
  cwd: string;
  cols: number;
  rows: number;
  /** Bytes crus do shell rumo ao xterm: texto, cor, movimento de cursor. */
  aoSaida: (dados: string) => void;
  /** O shell terminou (`exit`, Ctrl+D, queda). */
  aoSair: (codigo: number) => void;
}

//* Sobe o shell dentro de um pseudo-terminal, na pasta pedida.
//! Mata o anterior antes: um terminal por janela. Dois shells vivos disputariam
//!   a mesma tela e ninguém saberia qual recebe o que se digita.
export function iniciarShell(op: OpcoesShell): void {
  pararShell();

  const shell = shellDoUsuario();

  //! `-i` explícito. O bash já se declara interativo ao ver um tty, mas dizê-lo
  //! na linha protege de shell que herde um `BASH_ENV` ou que seja outro
  //! programa: interativo é o que faz o `.bashrc` ser lido, e sem `.bashrc` o
  //! prompt, os apelidos e o PATH do .NET da ADR 0039 não existiriam aqui.
  proc = spawn(shell, ["-i"], {
    //! O mesmo nome que o `motor-neovim-pty.ts` usa. É o que a base de dados de
    //! terminais (`terminfo`) consulta para saber quantas cores existem.
    name: "xterm-256color",
    cols: Math.max(2, op.cols),
    rows: Math.max(1, op.rows),
    cwd: op.cwd || homedir(),
    env: ambiente(),
  });

  proc.onData(op.aoSaida);
  proc.onExit(({ exitCode }) => {
    proc = null;
    op.aoSair(exitCode);
  });
}

//* O que se digita, indo para o shell. Bytes crus: quem interpreta é o bash.
//! Não há triagem, e é a decisão de 19/08: o terminal do Terminus passa a ter o
//!   mesmo alcance do Konsole. O que segurava a linha antes (`shell: false`, sem
//!   metacaractere) só existia porque não havia shell nenhum.
export function enviarAoShell(dados: string): void {
  proc?.write(dados);
}

//* A janela mudou de tamanho: o shell precisa saber, senão a quebra de linha
//* dele fica na medida antiga e todo programa de tela cheia desenha torto.
export function redimensionarShell(cols: number, rows: number): void {
  try {
    proc?.resize(Math.max(2, cols), Math.max(1, rows));
  } catch {
    /* o processo morreu entre a medida e o aviso */
  }
}

/**
 * A pasta em que o shell está AGORA.
 *
 * Lida do sistema (`/proc/<pid>/cwd`), e não de uma conta que o Terminus faça
 * por fora acompanhando os `cd`. Depois de um `cd` dentro de um script, de um
 * `pushd`, ou de um `cd` digitado, a conta por fora estaria errada e o botão do
 * Konsole abriria no lugar errado — dizendo, com a cara mais séria, que é a
 * mesma pasta.
 */
export function pastaDoShell(): string {
  const pid = proc?.pid;
  if (!pid) return homedir();
  try {
    return readlinkSync(path.join("/proc", String(pid), "cwd"));
  } catch {
    //! Sem `/proc` (outro sistema), ou o processo morreu entre a pergunta e a
    //! leitura. A home é a única resposta que não mente.
    return homedir();
  }
}

/**
 * O shell está no prompt, ou tem programa rodando na frente?
 *
 * Perguntado ao sistema, não deduzido: `/proc/<pid>/stat` traz o `tpgid`, que é
 * o grupo de processos que está com o terminal AGORA. Quando ele é o próprio
 * bash, o bash está esperando alguém digitar. Medido, com `sleep 5` no meio:
 *
 *     no prompt, parado       tpgid=394580 == pid   ocioso
 *     com "sleep 5" rodando   tpgid=394689 != pid   ocupado
 *     o sleep acabou          tpgid=394580 == pid   ocioso
 *
 * Existe por causa dos dois botões que ESCREVEM no terminal em nome da pessoa —
 * o Rodar, e o `cd` de quando se abre outra pasta. Escrever uma linha enquanto
 * um programa está na frente não roda comando nenhum: entrega o texto para o
 * programa, que pode ser um `python` interativo, um `nano`, ou um `sudo`
 * esperando senha. Digitar `cd /home/...` dentro do prompt de senha alheio é o
 * tipo de coisa que só se descobre depois.
 */
export function shellEstaOcioso(): boolean {
  const pid = proc?.pid;
  if (!pid) return false;
  try {
    const stat = readFileSync(path.join("/proc", String(pid), "stat"), "utf8");
    //! A partir do ÚLTIMO parêntese, e não do primeiro: o segundo campo é o nome
    //! do programa entre parênteses, e nome com parêntese dentro existe. Contar
    //! campos desde o começo quebraria em silêncio num programa de nome torto.
    const campos = stat.slice(stat.lastIndexOf(")") + 2).split(/\s+/);
    //! Depois do ')': [0] estado, [1] pai, [2] grupo, [3] sessão, [4] terminal,
    //! [5] tpgid — o grupo que está na frente.
    return Number(campos[5]) === pid;
  } catch {
    //! Sem `/proc`, a resposta honesta é "não sei" — e "não sei" tem de valer
    //! ocupado, porque o custo de errar para o lado do ocupado é um aviso na
    //! tela, e para o outro lado é texto digitado dentro de um programa alheio.
    return false;
  }
}

/**
 * Escreve uma linha no terminal, como se a pessoa a tivesse digitado.
 *
 * São só dois os chamadores, e os dois têm botão na tela: o **Rodar** (que
 * mostra a linha antes de rodar, ADR 0030) e o **`cd` ao abrir outra pasta**.
 * Devolve `false` quando o shell está ocupado — e aí quem chamou avisa, em vez
 * de empurrar texto para dentro do programa que está na frente.
 */
export function mandarLinha(linha: string): boolean {
  if (!shellEstaOcioso()) return false;
  //! `\n` e não `\r\n`: num PTY o Enter é o `\n`, e o par mandaria duas linhas —
  //! a segunda vazia, que o bash responde com outro prompt de enfeite.
  proc?.write(`${linha}\n`);
  return true;
}

/**
 * A linha de `cd` para uma pasta, com o caminho protegido.
 *
 * Aspas simples porque dentro delas o bash não interpreta NADA — nem `$`, nem
 * `` ` ``, nem espaço. A única coisa que fecha uma aspa simples é outra aspa
 * simples, e por isso ela vira `'\''` (fecha, escapa uma solta, reabre). Sem
 * isto, uma pasta chamada `; rm -rf ~` rodaria como comando.
 */
export function linhaDeCd(pasta: string): string {
  return `cd '${pasta.replace(/'/g, "'\\''")}'`;
}

//* Encerra o shell. Chamado quando a janela fecha.
export function pararShell(): void {
  if (!proc) return;
  try {
    proc.kill();
  } catch {
    /* já tinha morrido */
  }
  proc = null;
}

/**
 * Abre o **Konsole de verdade**, na pasta em que este shell está.
 *
 * É o botão ↗ do cabeçalho do terminal, e substitui a segunda janela do
 * Electron da ADR 0031 — que era uma cópia da nossa própria tela, com os mesmos
 * defeitos dela. O pedido do autor foi trocar o terminal do Terminus pelo
 * Konsole; como embutir não dá (item 4 lá em cima), o Konsole entra inteiro.
 *
 * Devolve a pasta onde abriu, para a casca poder dizer na tela — ou recusa, com
 * a frase que a tela sabe exibir, quando o `konsole` não existe nesta máquina.
 */
export function abrirNoKonsole(): Promise<string> {
  const pasta = pastaDoShell();

  //! `konsole`, e não uma caça ao "terminal padrão do sistema". Abrir outro
  //! programa sem avisar seria responder a pergunta errada: o relato do autor é
  //! sobre o Konsole, e quando ele não existe a frase precisa dizer isso.
  const filho = abrirPrograma("konsole", ["--workdir", pasta], {
    //! `detached` + `unref`: o Konsole é do sistema, não um painel nosso. Filho
    //! do Terminus, ele morreria quando o editor fechasse — que é exatamente a
    //! segunda janela da ADR 0031 outra vez, com outro nome.
    detached: true,
    stdio: "ignore",
    //! O mesmo ambiente que o shell recebe, e pelo mesmo motivo: com as
    //! variáveis do Chromium por cima, o Konsole aberto pelo Terminus abriria
    //! diferente do Konsole aberto pelo menu.
    env: ambiente(),
  });
  //! O ENOENT de `spawn` NÃO é síncrono: chega pelo evento `error` depois que a
  //! resposta já teria ido — era assim que a tela dizia "Konsole aberto em ..."
  //! sem Konsole nenhum, numa máquina fora do KDE. Esperar o PRIMEIRO de
  //! {spawn, error} é o que torna verdadeira a frase que o leia-me promete.
  //! Medido neste runtime (Electron 33 / Node v20.18.3): o evento `spawn`
  //! existe e dispara, e o ausente chega como `error` com `code === "ENOENT"`.
  return new Promise((resolver, recusar) => {
    filho.once("spawn", () => {
      filho.unref();
      resolver(pasta);
    });
    filho.once("error", (err: NodeJS.ErrnoException) => {
      recusar(
        new Error(
          err.code === "ENOENT"
            ? "o `konsole` não está instalado nesta máquina."
            : `o Konsole não abriu: ${err.message}`,
        ),
      );
    });
  });
}
