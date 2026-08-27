import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import type { ExtensaoDoVscode } from "../../compartilhado/tipos.js";

//? AS EXTENSÕES QUE A PESSOA JÁ USA NO VSCODE — o que a lateral mostra
//!
//! 1. O painel "Plugins do Neovim" morreu com o motor (26/08). Este é o sucessor, e ele
//!    parte de um dado que **já existe no disco**: `~/.vscode/extensions/`, com o
//!    `package.json` de cada extensão instalada.
//! 2. ⚠️ **ELE NÃO INSTALA NADA, e é de propósito.** A leitura é do disco, sem rede e sem
//!    escrita. O que ele responde é *"isto é o que você usa hoje, e isto é o que o Terminus
//!    saberia carregar"* — que é a informação que falta para decidir o que fazer depois.
//! 3. ⚠️ **A DIVISÃO ENTRE "DÁ" E "NÃO DÁ" NÃO É PALPITE**, e é o valor deste módulo: uma
//!    extensão do VSCode roda num **host de extensão**, e há dois tipos. As que declaram
//!    `browser` no `package.json` são **web extensions** — rodam no mesmo lugar que o editor,
//!    e são as que o `@codingame/monaco-vscode-api` sabe carregar. As que só declaram `main`
//!    precisam de um processo Node com a API completa do VSCode, que este produto não tem.
//!    Dizer isso na tela evita a pergunta que viria depois: *"por que essa não funciona?"*

/** Onde o VSCode guarda as extensões da pessoa. */
//! Uma pasta só, e não uma varredura: é o caminho que o VSCode usa desde sempre, e procurar
//!   em mais lugares acharia cópia de backup e pasta de outro editor.
function pastaDasExtensoes(): string {
  return path.join(homedir(), ".vscode", "extensions");
}

/** Resolve `%chave%` pelo `package.nls.json` da extensão. */
//! ⚠️ ISTO NÃO É ENFEITE: extensões traduzíveis põem `"displayName": "%extension.title%"` no
//!   manifesto e guardam o texto de verdade num arquivo ao lado. Sem resolver, a lista mostra
//!   `%extension.title%` — foi o que apareceu no primeiro teste, para o C# Dev Kit. O que
//!   deveria ajudar a reconhecer a extensão passa a atrapalhar.
//! Só o `package.nls.json` (o padrão, em inglês): resolver por idioma exigiria escolher entre
//!   `package.nls.pt-br.json` e o padrão, e a lista é para reconhecer, não para ler.
function resolverTexto(valor: string, dir: string): string {
  const marcador = /^%(.+)%$/.exec(valor);
  if (!marcador) return valor;
  try {
    const nls = JSON.parse(readFileSync(path.join(dir, "package.nls.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const traduzido = nls[marcador[1] as string];
    //! O valor pode ser string ou `{ message }` — as duas formas existem no formato.
    if (typeof traduzido === "string") return traduzido;
    if (traduzido && typeof (traduzido as { message?: unknown }).message === "string") {
      return (traduzido as { message: string }).message;
    }
  } catch {
    /* sem arquivo de tradução: fica o que veio */
  }
  //! Sem tradução, devolve o miolo do marcador em vez do marcador com os `%`: "extension
  //!   title" ainda diz mais do que "%extension.title%".
  return (marcador[1] as string).replace(/[._]/g, " ");
}

/** Lê o `package.json` de uma extensão. `null` quando não é uma. */
//! Devolve `null` em vez de estourar: a pasta tem `extensions.json` e restos de instalação
//!   pela metade, e um deles não pode derrubar a lista inteira.
function lerManifesto(dir: string): ExtensaoDoVscode | null {
  try {
    const bruto = readFileSync(path.join(dir, "package.json"), "utf8");
    const m = JSON.parse(bruto) as Record<string, unknown>;
    const nome = typeof m["name"] === "string" ? m["name"] : null;
    if (!nome) return null;

    //! `displayName` é o nome que a pessoa reconhece; `name` é o identificador. Mostrar o
    //!   identificador faria a lista parecer um `ls`, que é o que ela já tinha no terminal.
    const rotulo =
      typeof m["displayName"] === "string" ? resolverTexto(m["displayName"], dir) : nome;
    const temBrowser = typeof m["browser"] === "string";
    const temMain = typeof m["main"] === "string";

    return {
      id: `${String(m["publisher"] ?? "?")}.${nome}`,
      rotulo,
      versao: typeof m["version"] === "string" ? m["version"] : "?",
      descricao: typeof m["description"] === "string" ? resolverTexto(m["description"], dir) : "",
      pasta: dir,
      //! ⚠️ TRÊS ESTADOS, e não dois: "carregável", "só desktop" e "sem código". A terceira
      //!   é a que surpreende — tema, pacote de idioma e gramática **não têm código
      //!   nenhum**, e são justamente as que carregariam mais fácil.
      tipo: temBrowser ? "web" : temMain ? "desktop" : "declarativa",
    };
  } catch {
    return null;
  }
}

//* Lista as extensões instaladas no VSCode desta máquina.
//! Ordenada por rótulo: a lista é para procurar com o olho, e ordem de `readdir` é ordem de
//!   criação no sistema de arquivos — que não quer dizer nada para quem lê.
export function listarExtensoesDoVscode(): ExtensaoDoVscode[] {
  let entradas: string[];
  try {
    entradas = readdirSync(pastaDasExtensoes());
  } catch {
    //! Sem VSCode instalado a lista é vazia, e isso não é erro — é a resposta.
    return [];
  }

  return entradas
    .map((e) => lerManifesto(path.join(pastaDasExtensoes(), e)))
    .filter((e): e is ExtensaoDoVscode => e !== null)
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}
