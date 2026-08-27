import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

//? CANAL LSP — o cano genérico: sobe um processo e troca mensagens com ele
//!
//! 1. O protocolo é sempre o mesmo: cabeçalho `Content-Length`, linha em branco,
//!    corpo JSON. Quem muda é o programa do outro lado e o que se pergunta.
//! 2. Este módulo **não sabe o que é linguagem, nem completar, nem diagnóstico**.
//!    Ele entrega mensagem crua e recebe mensagem crua — quem dá sentido é quem
//!    o usa.
//! 3. ⚠️ **HÁ UMA SEGUNDA CÓPIA DESTE FRAMING NO `motor-copilot-lsp.ts`**, e ela
//!    NÃO foi migrada para cá nesta fatia, de propósito: aquele arquivo está
//!    provado e a fatia já carrega mudança demais (§12·3). A duplicação está
//!    registrada como árvore no `tracker.md` (A21) para a cabeça decidir, em vez
//!    de eu resolvê-la em silêncio no meio de outra coisa.

/** Com `TERMINUS_LSP_LOG=1`, escreve no `stderr` o que atravessa o cano. */
//! POR QUE ISTO É PERMANENTE E NÃO UM `console.log` TEMPORÁRIO: quando um
//!   servidor de linguagem não responde, a pergunta é sempre a mesma — *"o
//!   cliente chegou a mandar `didOpen`?"* — e sem este fio a resposta exige
//!   reconstruir o app com um log dentro. Ele nasce desligado e não custa nada.
//! Só o MÉTODO e o id, nunca o corpo: o corpo carrega o texto do arquivo (§8·S10).
const REGISTRAR = process.env["TERMINUS_LSP_LOG"] === "1";
function anotar(sentido: string, m: MensagemLsp): void {
  if (!REGISTRAR) return;
  const metodo = typeof m["method"] === "string" ? m["method"] : `resposta#${String(m["id"])}`;
  process.stderr.write(`[lsp] ${sentido} ${metodo}\n`);
}

/** Uma mensagem do protocolo, já desmontada. Forma livre: é JSON-RPC. */
export type MensagemLsp = Record<string, unknown>;

export interface CanalLsp {
  enviar(mensagem: MensagemLsp): void;
  parar(): void;
  /** `true` enquanto o processo do outro lado estiver de pé. */
  vivo(): boolean;
}

/** Sobe um servidor e liga os dois sentidos. */
//! `aoReceber` e `aoMorrer` são as DUAS saídas, e a segunda é obrigatória: sem
//!   ela, um servidor que morre vira um cliente esperando resposta para sempre.
export function abrirCanalLsp(opcoes: {
  comando: string;
  argumentos: string[];
  cwd?: string;
  aoReceber: (mensagem: MensagemLsp) => void;
  aoMorrer: (motivo: string) => void;
}): CanalLsp {
  let processo: ChildProcessWithoutNullStreams | null = spawn(
    opcoes.comando,
    opcoes.argumentos,
    { cwd: opcoes.cwd, stdio: "pipe" },
  );

  //! Tratador de `error` obrigatório e permanente: processo sem ouvinte de
  //!   `error` derruba o processo principal pelo EventEmitter — e derrubar o
  //!   editor porque um servidor de linguagem não abriu seria trocar um recurso
  //!   por um produto.
  processo.on("error", (e) => {
    processo = null;
    opcoes.aoMorrer(`não foi possível executar: ${e.message}`);
  });
  processo.on("exit", (codigo) => {
    processo = null;
    opcoes.aoMorrer(`o servidor encerrou (código ${codigo ?? "?"})`);
  });

  //! O `stderr` é DRENADO: cano cheio sem leitor trava quem escreve nele, e o
  //!   servidor escreveria até parar de responder. Sintoma seria "travou", sem
  //!   erro nenhum.
  processo.stderr.on("data", () => {});

  //! O acumulador é BUFFER, não string: uma mensagem pode chegar partida no meio
  //!   de um caractere de vários bytes, e concatenar como string corromperia o
  //!   acento antes de o JSON ser lido.
  let acumulado = Buffer.alloc(0);
  processo.stdout.on("data", (pedaco: Buffer) => {
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
      try {
        const msg = JSON.parse(cru) as MensagemLsp;
        anotar("<-", msg);
        opcoes.aoReceber(msg);
      } catch {
        //! Lixo no cano não derruba o canal: a próxima mensagem ainda vem, e
        //!   servidor que fala errado uma vez não deve custar a sessão inteira.
      }
    }
  });

  return {
    enviar(mensagem) {
      if (!processo) return;
      //! `Buffer.byteLength` e não `.length`: o corpo é UTF-8 e o
      //!   `Content-Length` do LSP conta BYTES. Com acento no texto — e este
      //!   projeto é todo em português — contar caracteres desalinha o fluxo já
      //!   na primeira mensagem, e o servidor para de responder sem dizer por quê.
      anotar("->", mensagem);
      const corpo = Buffer.from(JSON.stringify(mensagem), "utf8");
      processo.stdin.write(`Content-Length: ${corpo.length}\r\n\r\n`);
      processo.stdin.write(corpo);
    },
    parar() {
      processo?.kill();
      processo = null;
    },
    vivo: () => processo !== null,
  };
}
