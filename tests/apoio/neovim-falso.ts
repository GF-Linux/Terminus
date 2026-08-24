//? NEOVIM FALSO — Decisão sobre como a rede prova o caminho de SUCESSO 24/08/2026
//!
//! 1. A A8 existe porque o canal de controle PENDURA quando não há Neovim escutando. Provar
//!    o conserto exige as duas cores: que a recusa apareça **e** que o canal continue
//!    funcionando quando o Neovim responde. Sem a segunda, um "conserto" que simplesmente
//!    estourasse a frase sempre passaria na rede inteira — é a lição da guarda-da-guarda que
//!    a corrida 4 aprendeu em `escrita-em-pasta-por-atalho`.
//! 2. TRÊS CAMINHOS FORAM MEDIDOS antes de escolher este:
//!      a) `nvim --listen` de verdade (existe em `/usr/bin/nvim` nesta máquina) — RECUSADO:
//!         amarra a suíte a um binário externo, e o tracker §10.1 já declarou que nenhum
//!         teste sobe processo de verdade;
//!      b) dublê do pacote `neovim` pelo gancho de módulos — RECUSADO: apagaria justamente
//!         a peça sob teste, que é a conversa com o socket;
//!      c) um servidor msgpack-RPC de 40 linhas — ESCOLHIDO. Fala o mesmo protocolo do
//!         Neovim real, então o código sob teste roda inteiro, sem dublê nenhum no caminho.
//! 3. O `@msgpack/msgpack` é o MESMO codec que o pacote `neovim` usa por dentro. Ele já
//!    estava em disco como dependência transitiva; entrou em `devDependencies` em 24/08 para
//!    deixar de ser dependência-fantasma (declarado no tracker §13.1c).
//! 4. ⚠️ AS CONEXÕES SÃO FECHADAS COM `end()`, NUNCA COM `destroy()`, e isto foi medido:
//!    `destroy()` faz o iterador assíncrono do transporte rejeitar com `Premature close`,
//!    e essa rejeição **não tem tratador** dentro do pacote `neovim` (`transport.js:87` —
//!    `iter.next().then(...)` sem ramo de erro). Um andaime que largasse socket com
//!    `destroy()` sujaria a suíte com a mesma família de vazamento que a A8 conserta.

import { createServer, type Server, type Socket } from "node:net";
import { decodeMultiStream, encode } from "@msgpack/msgpack";

/** Um Neovim de mentira escutando num socket unix, para a rede do canal de controle. */
export interface NeovimFalso {
  /** Os pedidos que chegaram, na ordem, como `metodo(argumentos em JSON)`. É a prova do QUE foi mandado. */
  pedidos: string[];
  /** Quantas conexões o falso ACEITOU. Uma tentativa do motor deve valer UMA. */
  //! ⚠️ ESTE CONTADOR NASCEU DE UMA SABOTAGEM QUE NÃO MORDEU: trocar
  //!   `attach({ reader, writer })` por `attach({ socket })` — que abre uma SEGUNDA conexão
  //!   por dentro, ao lado da que o motor já validou — não fazia teste nenhum falhar. O
  //!   desperdício era invisível: um descritor de arquivo a mais por tentativa, até 25 por
  //!   ciclo de reconexão. Contar conexões é o que torna a escolha conferível.
  conexoesAceitas: number;
  /** O que `nvim_exec_lua` devolve — é por ele que o painel de plugins recebe a lista. */
  respostaLua: unknown;
  /** Para de escutar e encerra as conexões abertas. */
  parar(): Promise<void>;
}

/** Como o falso se comporta. `mudo` aceita a conexão e nunca responde — é o socket travado. */
export interface ModoDoFalso {
  mudo?: boolean;
}

//* Sobe um servidor msgpack-RPC no caminho pedido e devolve o controle dele.
//! O `channelId` respondido é `7` e não `1` de propósito: um número arbitrário prova que o
//!   cliente leu a resposta em vez de assumir o primeiro canal.
export async function subirNeovimFalso(caminho: string, modo: ModoDoFalso = {}): Promise<NeovimFalso> {
  const pedidos: string[] = [];
  const conexoes = new Set<Socket>();

  const servidor: Server = createServer((conexao) => {
    controle.conexoesAceitas += 1;
    conexoes.add(conexao);
    conexao.on("close", () => conexoes.delete(conexao));
    //! Socket sem tratador de `error` derruba o processo pelo EventEmitter, não por promessa.
    conexao.on("error", () => {
      /* o cliente foi embora no meio — não é falha do teste */
    });
    void (async () => {
      for await (const bruto of decodeMultiStream(conexao)) {
        //! O formato do msgpack-RPC: `[0, id, metodo, argumentos]` para pedido.
        if (!Array.isArray(bruto) || bruto[0] !== 0) continue;
        const id = bruto[1] as number;
        const metodo = String(bruto[2]);
        const argumentos = bruto[3];
        pedidos.push(`${metodo}(${JSON.stringify(argumentos)})`);
        if (modo.mudo) continue;
        conexao.write(Buffer.from(encode([1, id, null, responder(metodo, argumentos, controle)])));
      }
    })().catch(() => {
      /* a conexão morreu antes do fim do fluxo — o teste já terá o que precisa */
    });
  });

  const controle: NeovimFalso = {
    pedidos,
    conexoesAceitas: 0,
    respostaLua: [],
    async parar(): Promise<void> {
      for (const c of conexoes) c.end();
      await new Promise<void>((pronto) => servidor.close(() => pronto()));
    },
  };

  await new Promise<void>((pronto) => servidor.listen(caminho, () => pronto()));
  return controle;
}

//* A tabela de respostas — só os métodos que `controle-neovim-rpc.ts` realmente usa.
//! Método desconhecido devolve `null` em vez de estourar: o objetivo é travar o que o nosso
//!   código MANDA (que fica em `pedidos`), não emular o Neovim inteiro.
function responder(metodo: string, argumentos: unknown, controle: NeovimFalso): unknown {
  if (metodo === "nvim_get_api_info") return [7, {}];
  if (metodo === "nvim_eval") return 1;
  if (metodo === "nvim_exec_lua") return controle.respostaLua;
  //! `fnameescape` devolve o caminho de volta: o teste quer provar que o nosso código
  //!   PERGUNTOU ao Neovim como escapar, não reimplementar o escape do Vim.
  if (metodo === "nvim_call_function") {
    const args = argumentos as [string, unknown[]];
    return String(args[1]?.[0] ?? "");
  }
  return null;
}
