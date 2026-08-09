import * as fs from "node:fs";
import * as path from "node:path";
import type {
  EstadoDoMascote,
  EstadoMascote,
  FalaMascote,
  RespostaMascote,
} from "../shared/tipos.js";
import {
  ARQUIVO_CONTEXTO,
  PASTA_SPRITE,
  chaveDoFantasma,
  configDoMascote,
  lerContexto,
} from "./config.js";
import {
  anotar,
  blocoDeMemoria,
  lembrar,
  lerNota,
  lerPerfil,
  listarNotas,
  gravarPerfil,
} from "./memoria.js";

/**
 * O mascote (ADR 0008).
 *
 * É explicitamente **pessoal, não profissional** — não é assistente de análise,
 * não sabe nada do que está aberto e não toca em arquivo nenhum. O que ele faz
 * é fazer companhia: reage ao trabalho (isso acontece inteiro na interface, sem
 * rede) e conversa (isso, sim, sai da máquina).
 *
 * ## A fronteira, que é o motivo de este arquivo existir
 *
 * O mascote lê **um** arquivo: `~/.config/bancada/contexto.md`, o miniMD escrito
 * à mão a partir do segundo cérebro (30/07). Nunca o segundo cérebro, nunca os
 * repositórios, nunca a pasta da corrida.
 *
 * E a conversa **não carrega nada da sessão**: nem nome de arquivo, nem caminho,
 * nem código, nem saída do terminal. Isso não é esquecimento — é a regra. Nome
 * de arquivo numa pasta de corrida costuma ser identificação de amostra, e
 * mandar isso para uma API por educação do mascote seria furar a fronteira pelo
 * lado mais bobo. As reações ao trabalho ficam locais justamente por isso.
 *
 * ## A ADR 0021 tentou abrir uma exceção aqui, e foi revertida
 *
 * O modo `master` dava a ela leitura dos arquivos da pasta aberta. Funcionava —
 * e mesmo assim reprovou no uso real, por um motivo que estava escrito no
 * `contexto.md` dela o tempo todo: *"não é assistente de código, não revisa o
 * trabalho dele"*. Dar olhos a ela era mandá-la ser o que a própria persona dela
 * proíbe. Quem faz esse trabalho agora é o verboo, pelo terminal do chat
 * (ADR 0022), e a fronteira acima voltou a valer inteira.
 */

/** Só uma conversa em voo; mandar outra pergunta cancela a anterior. */
let emVoo: AbortController | null = null;

export function cancelarConversa(): void {
  emVoo?.abort();
  emVoo = null;
}

const QUADROS: EstadoMascote[] = ["parado", "piscando", "feliz", "preocupado", "pensando"];

export function estadoDoMascote(): EstadoDoMascote {
  const cfg = configDoMascote();
  return {
    temChave: chaveDoFantasma() !== null,
    ligado: cfg.ligado,
    endpoint: cfg.endpoint,
    modelo: cfg.modelo,
    nome: cfg.nome,
    temContexto: lerContexto() !== null,
    arquivoContexto: ARQUIVO_CONTEXTO,
    pastaSprite: PASTA_SPRITE,
    quadros: QUADROS.filter((q) => fs.existsSync(path.join(PASTA_SPRITE, `${q}.png`))),
  };
}

/**
 * Os quadros do sprite, em `data:` URL.
 *
 * Moram em `~/.config/bancada/mascote/`, **fora do repositório**. São arte
 * pessoal, possivelmente de um personagem de outra pessoa: versionar junto do
 * código faria a licença do desenho decidir a licença da Bancada — a mesma
 * parede que já derrubou o Live2D, o QScintilla e a Pylance neste projeto.
 * Quem não tiver sprite vê o desenho de reserva, feito na própria casca.
 */
export function lerQuadros(): Partial<Record<EstadoMascote, string>> {
  const quadros: Partial<Record<EstadoMascote, string>> = {};
  for (const q of QUADROS) {
    const arquivo = path.join(PASTA_SPRITE, `${q}.png`);
    try {
      quadros[q] = `data:image/png;base64,${fs.readFileSync(arquivo).toString("base64")}`;
    } catch {
      /* quadro que não existe simplesmente não é oferecido */
    }
  }
  return quadros;
}

/** Quantas falas anteriores acompanham cada pergunta. */
const MEMORIA = 16;

function instrucao(nome: string, contexto: string | null): string {
  const bloco = blocoDeMemoria();
  return [
    `Você é ${nome}, a companhia de bancada de um pesquisador. Não é assistente de`,
    "código, não é suporte técnico e não é um chatbot de produtividade: você faz",
    "companhia enquanto ele trabalha, e se lembra dele de um dia para o outro.",
    "",
    "Como você responde:",
    "- em português do Brasil, curto — duas ou três frases, no máximo;",
    "- em tom leve e caloroso, sem bajulação e sem emoji em toda frase;",
    "- sem listas, sem títulos, sem formatação — é conversa, não documento;",
    "- puxando o que você já sabe dele quando vier ao caso, sem recitar a memória",
    "  inteira nem começar toda frase com 'me lembro que'.",
    "",
    "O que você sabe e o que não sabe:",
    "- você conhece o trabalho dele pelo resumo abaixo e pela sua própria memória;",
    "- você NÃO tem acesso ao computador, aos arquivos, ao código aberto, à pasta",
    "  da corrida nem a nenhum dado de laboratório, e nunca finge que tem;",
    "- se perguntarem algo que não está no resumo nem na sua memória, diga que não",
    "  sabe. Não invente resultado, número, prazo ou detalhe de método — inventar",
    "  aqui é pior do que em qualquer outro lugar, porque é sobre o trabalho de",
    "  verdade dele.",
    "",
    "Sua memória, e como usá-la:",
    "- `lembrar` é para o que valeria a pena saber daqui a um mês: o que ele gosta",
    "  e detesta, como trabalha, o que está pesando nele, o que combinaram. Use",
    "  quando aparecer algo assim, sem pedir licença e sem anunciar que vai usar.",
    "- NÃO guarde a conversa inteira, banalidade, nem nada que ele não repetiria",
    "  em voz alta. Memória cheia de ruído é pior que memória vazia.",
    "- `anotar` é para o que ele mandar guardar em arquivo: datas, listas, ideias.",
    "  Um assunto por arquivo, nome curto.",
    "- Ele lê e edita tudo isso quando quiser. Escreva como quem sabe que vai ser",
    "  lido pela pessoa de quem se está falando.",
    "",
    contexto
      ? `Resumo do trabalho dele, escrito por outra pessoa (você só lê):\n\n${contexto}`
      : "Você ainda não recebeu resumo nenhum sobre o trabalho dele. Converse sem" +
        " supor nada sobre o que ele faz.",
    bloco ? `\n${bloco}` : "\nSua memória ainda está vazia — hoje é o começo.",
  ].join("\n");
}

/**
 * As ferramentas que ela tem. Note o que **não** existe aqui: ler arquivo do
 * computador, listar pasta, rodar comando. Ela escreve na memória dela e lê a
 * memória dela. Mais nada alcança o disco.
 */
const FERRAMENTAS = [
  {
    type: "function",
    function: {
      name: "lembrar",
      description:
        "Guarda uma observação no seu diário — algo sobre ele que valeria a pena " +
        "saber daqui a um mês. Uma frase, escrita por você, não a fala dele copiada.",
      parameters: {
        type: "object",
        properties: { texto: { type: "string", description: "A observação, em uma ou duas frases." } },
        required: ["texto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "anotar",
      description:
        "Cria ou atualiza um arquivo de notas dele (datas importantes, listas, ideias). " +
        "Use quando ele pedir para guardar algo, ou quando um assunto merecer arquivo próprio.",
      parameters: {
        type: "object",
        properties: {
          arquivo: { type: "string", description: "Nome curto, sem barras. Ex.: 'datas importantes'." },
          conteudo: { type: "string", description: "O conteúdo, em Markdown simples." },
          modo: {
            type: "string",
            enum: ["escrever", "acrescentar"],
            description: "'acrescentar' preserva o que já existe. Prefira acrescentar.",
          },
        },
        required: ["arquivo", "conteudo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ler_nota",
      description: "Lê uma nota que você guardou antes.",
      parameters: {
        type: "object",
        properties: { arquivo: { type: "string" } },
        required: ["arquivo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_notas",
      description: "Lista os nomes das notas que existem.",
      parameters: { type: "object", properties: {} },
    },
  },
] as const;


interface ChamadaDeFerramenta {
  id: string;
  function: { name: string; arguments: string };
}

/** Executa uma ferramenta pedida pelo modelo e devolve o que ela respondeu. */
function usarFerramenta(chamada: ChamadaDeFerramenta): { texto: string; efeito?: string } {
  let args: Record<string, string>;
  try {
    args = JSON.parse(chamada.function.arguments || "{}") as Record<string, string>;
  } catch {
    return { texto: "não entendi os argumentos" };
  }

  try {
    switch (chamada.function.name) {
      case "lembrar": {
        const r = lembrar(String(args["texto"] ?? ""));
        return { texto: r, efeito: r };
      }
      case "anotar": {
        const r = anotar(
          String(args["arquivo"] ?? ""),
          String(args["conteudo"] ?? ""),
          args["modo"] === "escrever" ? "escrever" : "acrescentar",
        );
        return { texto: r, efeito: r };
      }
      case "ler_nota":
        return { texto: lerNota(String(args["arquivo"] ?? "")) };
      case "listar_notas": {
        const notas = listarNotas();
        return { texto: notas.length ? notas.join(", ") : "nenhuma nota ainda" };
      }
      default:
        return { texto: "essa ferramenta não existe" };
    }
  } catch (err) {
    // O erro volta para o modelo em vez de estourar: nome de nota inválido é
    // coisa que ele consegue corrigir sozinho na próxima tentativa.
    return { texto: `não deu: ${err instanceof Error ? err.message : String(err)}` };
  }
}

interface Mensagem {
  role: string;
  content: string | null;
  tool_calls?: ChamadaDeFerramenta[];
  tool_call_id?: string;
}

/** Uma ida ao modelo. Separada para o laço de ferramentas e a destilação usarem. */
async function pedir(
  corpo: Record<string, unknown>,
  sinal: AbortSignal,
): Promise<{ content: string | null; tool_calls?: ChamadaDeFerramenta[] }> {
  const cfg = configDoMascote();
  const chave = chaveDoFantasma();
  if (!chave) throw new Error("Sem chave configurada — importe uma em Configurações.");

  const resposta = await fetch(cfg.endpoint, {
    method: "POST",
    signal: sinal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
    body: JSON.stringify({ model: cfg.modelo, stream: false, ...corpo }),
  });

  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => "");
    throw new Error(
      `${resposta.status} ${resposta.statusText}${texto ? ` — ${texto.slice(0, 200)}` : ""}`,
    );
  }

  const dados = (await resposta.json()) as {
    choices?: { message?: { content?: string; tool_calls?: ChamadaDeFerramenta[] } }[];
  };
  const msg = dados.choices?.[0]?.message;
  return { content: msg?.content ?? null, tool_calls: msg?.tool_calls };
}

/**
 * Quantas rodadas de ferramenta uma resposta pode gastar.
 *
 * Baixo de propósito: ela está conversando, não executando tarefa. Se precisar
 * de mais que isso para responder um "oi, como foi seu dia", alguma coisa está
 * errada — e o teto impede que um laço de ferramenta rode em círculo pagando
 * requisição.
 */
const RODADAS = 4;

export async function conversar(falas: FalaMascote[]): Promise<RespostaMascote> {
  const cfg = configDoMascote();
  if (!cfg.ligado) throw new Error("A conversa do mascote está desligada.");

  cancelarConversa();
  const controle = new AbortController();
  emVoo = controle;

  const mensagens: Mensagem[] = [
    { role: "system", content: instrucao(cfg.nome, lerContexto()) },
    ...falas.slice(-MEMORIA).map((f) => ({
      role: f.quem === "autor" ? "user" : "assistant",
      content: f.texto,
    })),
  ];
  const efeitos: string[] = [];

  try {
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      const msg = await pedir(
        {
          messages: mensagens,
          tools: FERRAMENTAS,
          // Curto de propósito: é companhia, não redação. Teto baixo também
          // segura o custo de uma conversa que pode durar o dia inteiro.
          max_tokens: 400,
          temperature: 0.8,
        },
        controle.signal,
      );

      if (msg.tool_calls?.length) {
        mensagens.push({ role: "assistant", content: msg.content, tool_calls: msg.tool_calls });
        for (const chamada of msg.tool_calls) {
          const r = usarFerramenta(chamada);
          if (r.efeito) efeitos.push(r.efeito);
          mensagens.push({ role: "tool", tool_call_id: chamada.id, content: r.texto });
        }
        continue;
      }

      const texto = msg.content?.trim() ?? "";
      if (!texto) throw new Error("O modelo respondeu vazio.");
      return { texto, memoria: efeitos };
    }
    throw new Error("ela se enrolou nas próprias anotações — tente de novo.");
  } finally {
    if (emVoo === controle) emVoo = null;
  }
}

/**
 * A volta do laço: destilar a conversa no perfil (ADR 0009).
 *
 * O diário é cru e cresce; o perfil é o que sobrou depois de pensar. Sem este
 * passo a memória vira um monte de anotação solta que ninguém releva — que é
 * exatamente o que separa "guardar tudo" de "aprender alguma coisa".
 *
 * Roda ao fim da conversa, não durante: pensar sobre a conversa no meio dela
 * atrapalharia a conversa.
 */
export async function destilar(falas: FalaMascote[]): Promise<boolean> {
  const cfg = configDoMascote();
  if (!cfg.ligado || falas.length < 4) return false;

  const conversa = falas
    .slice(-24)
    .map((f) => `${f.quem === "autor" ? "ele" : "você"}: ${f.texto}`)
    .join("\n");

  const perfil = lerPerfil() ?? "(ainda não existe perfil)";
  const controle = new AbortController();

  const msg = await pedir(
    {
      messages: [
        {
          role: "system",
          content: [
            `Você é ${cfg.nome}. Acabou de conversar com ele e vai atualizar, para si`,
            "mesma, o que sabe sobre a pessoa.",
            "",
            "Devolva o perfil INTEIRO reescrito, em Markdown, no formato:",
            "linhas curtas com hífen, agrupadas por assunto (quem é, como trabalha,",
            "o que gosta, combinados). Regras:",
            "- no máximo 25 linhas. Se passar, corte o que envelheceu;",
            "- só o que continua verdade daqui a um mês. Fato do dia fica no diário;",
            "- nada de dado de laboratório, resultado, número de amostra ou detalhe de",
            "  método — isso não é seu para guardar;",
            "- se a conversa não trouxe nada novo, devolva o perfil como está;",
            "- escreva sabendo que ele lê este arquivo.",
          ].join("\n"),
        },
        { role: "user", content: `Perfil atual:\n\n${perfil}\n\n---\n\nA conversa:\n\n${conversa}` },
      ],
      max_tokens: 700,
      temperature: 0.4,
    },
    controle.signal,
  );

  const texto = msg.content?.trim();
  if (!texto || texto.length < 10) return false;
  gravarPerfil(texto);
  return true;
}
