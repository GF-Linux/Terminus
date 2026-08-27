import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { abrirCanalLsp, type CanalLsp, type MensagemLsp } from "./canal-lsp.js";
import type { EstadoServidor } from "../../compartilhado/tipos.js";

//? OS SERVIDORES DE LINGUAGEM — o ramo B1 da planta de 26/08
//!
//! 1. É o que dá a Python e a C# o que TypeScript e JSON já tinham de graça:
//!    diagnóstico na linha, completar que conhece o projeto, ir-para-definição,
//!    hover com a documentação real.
//! 2. **A tradução LSP↔editor NÃO acontece aqui** — ela é do `monaco-languageclient`,
//!    na tela. Este arquivo é só o cano: sobe o processo, empurra mensagem para
//!    um lado e para o outro.
//! 3. ⚠️ **POR QUE O SERVIDOR RODA NO `main` E NÃO NA TELA:** o renderer tem
//!    `contextIsolation` ligado e `nodeIntegration` desligado — ele não tem
//!    `child_process`, e não é para ter. Quem abre processo é o processo
//!    principal, e a tela conversa pela porta. Isso não é contorno: é o desenho
//!    de segurança que a `porta/ponte-para-a-interface.ts` existe para sustentar.

//? DE ONDE VÊM OS SERVIDORES — a mesma conduta do Copilot, pela mesma razão
//!
//! O Terminus **não empacota** servidor de linguagem: o Roslyn sozinho passa de
//! 200 MB. Ele PROCURA e **diz onde procurou** quando não acha — que é o que
//! separa "o editor está burro" de "falta instalar o pyright", e é a mesma
//! conduta que o `como-rodar-o-projeto.ts` já tinha para o SDK do .NET.

/** O que cada linguagem precisa para subir. */
//! ⚠️ ISTO É DADO, E NÃO REGRA — por isso mora no motor e não em `dominio/`.
//!   O domínio decide **qual linguagem é um arquivo** (`linguagem-do-arquivo.ts`),
//!   que é decisão pura; **qual programa atende aquela linguagem nesta máquina**
//!   é conhecimento de instalação, e envelhece com o disco, não com a regra.
const RECEITAS: Record<string, { binarios: string[]; argumentos: string[] }> = {
  //! `--stdio` nos dois: é o único transporte que atravessa cano de processo sem
  //!   depender de socket nomeado, e cano é o que temos entre main e filho.
  python: {
    binarios: ["pyright-langserver", "basedpyright-langserver"],
    argumentos: ["--stdio"],
  },
  csharp: {
    binarios: ["roslyn-language-server"],
    //! `--autoLoadProjects`: sem ele o Roslyn espera que o cliente lhe entregue a
    //!   solução por um pedido próprio, e o arquivo aberto fica sem projeto —
    //!   o sintoma é "completa `System.` e mais nada".
    //! `--logLevel Warning`: o padrão despeja tanto no `stderr` que ele vira o
    //!   gargalo do cano.
    argumentos: ["--stdio", "--logLevel", "Warning", "--autoLoadProjects"],
  },
};

/** Onde procurar um binário, em ordem de intenção. */
//! A ordem é a mesma do Copilot: quem exportou a variável quis aquele; quem tem
//!   no PATH instalou de propósito; o do Mason é o que já está aqui.
function lugares(binario: string): string[] {
  const daVariavel = process.env[`TERMINUS_LSP_${binario.toUpperCase().replace(/-/g, "_")}`];
  return [
    ...(daVariavel ? [daVariavel] : []),
    path.join(homedir(), ".local/share/nvim/mason/bin", binario),
    path.join(homedir(), ".local/bin", binario),
    `/usr/bin/${binario}`,
  ];
}

/** Acha o servidor de uma linguagem, ou diz onde procurou. */
export function localizarServidorDeLinguagem(linguagem: string): {
  comando: string | null;
  argumentos: string[];
  procurados: string[];
} {
  const receita = RECEITAS[linguagem];
  if (!receita) return { comando: null, argumentos: [], procurados: [] };

  const procurados: string[] = [];
  for (const binario of receita.binarios) {
    for (const caminho of lugares(binario)) {
      procurados.push(caminho);
      if (existsSync(caminho)) {
        return { comando: caminho, argumentos: receita.argumentos, procurados };
      }
    }
  }
  return { comando: null, argumentos: receita.argumentos, procurados };
}

//? ⚠️ O ROSLYN PRECISA QUE ALGUÉM ABRA A SOLUÇÃO — defeito de campo de 26/08
//!
//! Relato: *"escrevi diversos erros e o código não acusou"*. Medido: com o servidor **de
//! pé**, Python dava 5 sublinhados e **C# dava zero**. O Roslyn não descobre o projeto
//! sozinho no arranque — ele espera uma notificação, e sem ela fica de pé analisando nada.
//! ⚠️ `--autoLoadProjects` NÃO BASTA, e isso está medido: ele já estava na linha de
//! comando desde a corrida 12, e o C# continuava mudo.
//! A FONTE DA VERDADE está nesta máquina: `nvim-lspconfig/lsp/roslyn_ls.lua`, a configuração
//! que faz o Roslyn funcionar no Neovim da cabeça. Ela manda `solution/open` quando acha uma
//! solução, e `project/open` com a lista de `.csproj` quando não acha. Copiei o gesto.

/** Acha a solução (ou os projetos) que o Roslyn tem de abrir. */
//! A SOLUÇÃO GANHA DO PROJETO: uma solução conhece todos os projetos dela, e abrir os
//!   `.csproj` soltos faria o Roslyn tratar como independentes o que se referencia. O molde
//!   de C# desta casa cria exatamente esse desenho — `.slnx` na raiz, `comum/` e
//!   `programa1/` dentro —, então esta ordem é a que serve o projeto que o Terminus cria.
function projetosDeCsharp(raiz: string): { solucao?: string; projetos: string[] } {
  let entradas: string[];
  try {
    entradas = readdirSync(raiz);
  } catch {
    return { projetos: [] };
  }
  //! `.slnx` primeiro e `.sln` depois: o .NET 10 não gera mais `.sln`, mas pasta vinda de
  //!   antes ainda tem. As duas são solução.
  const solucao = entradas.find((e) => /\.slnx?$/i.test(e));
  if (solucao) return { solucao: path.join(raiz, solucao), projetos: [] };

  //! Sem solução, os `.csproj` da raiz. Um nível só: varrer a árvore inteira acharia
  //!   projeto de exemplo dentro de `node_modules` ou de pasta de saída.
  return { projetos: entradas.filter((e) => /\.csproj$/i.test(e)).map((e) => path.join(raiz, e)) };
}

/** A notificação que o Roslyn espera, ou `null` para linguagens que não precisam. */
//! Devolve a MENSAGEM em vez de mandá-la: quem manda é o canal, e assim esta decisão fica
//!   testável sem subir processo nenhum.
export function aberturaDeProjeto(
  linguagem: string,
  raiz: string,
): { metodo: string; params: Record<string, unknown> } | null {
  if (linguagem !== "csharp" || !raiz) return null;
  const { solucao, projetos } = projetosDeCsharp(raiz);
  const comoUri = (p: string): string => pathToFileURL(p).href;
  if (solucao) return { metodo: "solution/open", params: { solution: comoUri(solucao) } };
  if (projetos.length) {
    return { metodo: "project/open", params: { projects: projetos.map(comoUri) } };
  }
  //! Nem solução nem projeto: **arquivo `.cs` solto**. O Roslyn não tem o que analisar, e
  //!   dizer isso é melhor que ficar de pé em silêncio — é a frase que a barra mostra.
  return null;
}

/** Um canal por linguagem. A tela pede por nome, não por processo. */
//! UM POR LINGUAGEM, e não um por arquivo: o servidor de linguagem é do
//!   PROJETO — ele indexa a pasta inteira uma vez e responde sobre qualquer
//!   arquivo dela. Um por arquivo reindexaria tudo a cada aba aberta.
const canais = new Map<string, CanalLsp>();
const motivos = new Map<string, string>();

//* Sobe o servidor de uma linguagem. Devolve o que a barra sabe dizer.
//! Já estar de pé é SUCESSO, não erro: a tela chama isto toda vez que abre um
//!   arquivo, e não tem como saber se foi a primeira.
export function iniciarServidorDeLinguagem(
  linguagem: string,
  raiz: string,
  aoReceber: (mensagem: MensagemLsp) => void,
): EstadoServidor {
  const jaVivo = canais.get(linguagem);
  if (jaVivo?.vivo()) return { linguagem, pronto: true, comando: null, detalhe: "já de pé" };

  const { comando, procurados } = localizarServidorDeLinguagem(linguagem);
  if (!comando) {
    const detalhe = procurados.length
      ? `servidor não encontrado. Procurei em: ${procurados.join(" · ")}`
      : `o Terminus não conhece servidor para "${linguagem}"`;
    motivos.set(linguagem, detalhe);
    return { linguagem, pronto: false, comando: null, detalhe };
  }

  const { argumentos } = localizarServidorDeLinguagem(linguagem);
  const canal = abrirCanalLsp({
    comando,
    argumentos,
    //! O `cwd` é a raiz do projeto: é dela que o servidor deduz o que indexar, e
    //!   rodar da pasta errada faz o Roslyn não achar a solução.
    cwd: raiz || undefined,
    aoReceber,
    aoMorrer: (motivo) => {
      canais.delete(linguagem);
      motivos.set(linguagem, motivo);
    },
  });
  canais.set(linguagem, canal);
  motivos.delete(linguagem);
  return { linguagem, pronto: true, comando, detalhe: "de pé" };
}

//* Manda uma mensagem ao servidor daquela linguagem. Silencioso se não há um.
//! Silencioso de propósito: a tela manda `didChange` a cada tecla, e transformar
//!   "não há servidor" em exceção encheria o console a cada letra digitada.
export function enviarAoServidor(linguagem: string, mensagem: MensagemLsp): void {
  canais.get(linguagem)?.enviar(mensagem);
}

//* O que a barra de estado sabe dizer sobre uma linguagem.
export function estadoDoServidor(linguagem: string): EstadoServidor {
  const canal = canais.get(linguagem);
  if (canal?.vivo()) {
    return { linguagem, pronto: true, comando: localizarServidorDeLinguagem(linguagem).comando, detalhe: "de pé" };
  }
  return {
    linguagem,
    pronto: false,
    comando: null,
    detalhe: motivos.get(linguagem) ?? "ainda não subiu",
  };
}

//* Derruba todos. Chamado no fechamento da janela.
export function pararServidoresDeLinguagem(): void {
  for (const canal of canais.values()) canal.parar();
  canais.clear();
  motivos.clear();
}
