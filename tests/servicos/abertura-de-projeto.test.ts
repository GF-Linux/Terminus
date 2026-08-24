//? ABERTURA DE PROJETO — a rede que trava a ORDEM, que é a regra deste caso de uso 24/08/2026
//!
//! 1. O que este módulo promete, no comentário dele: *"A ORDEM É A REGRA (…) a leitura da
//!    pasta vem PRIMEIRO. Se ela não existe mais, o erro sobe e a pasta some da lista em vez
//!    de ser registrada de novo."* Promessa de ORDEM só se confere executando as duas na
//!    ordem errada — é o que o teste da pasta sumida faz.
//! 2. ⚠️ AS ABERTURAS BEM-SUCEDIDAS MORAM NO CORPO DO MÓDULO, e não em `before` nem dentro
//!    de `test`. Motivo medido (árvore **A8**): `entrarNaPasta` dispara `cdNeovim`, que
//!    produzia rejeição não tratada quando o socket do Neovim não existe — e o `node --test`
//!    reprova o arquivo se ela nascer dentro de gancho ou de teste, mesmo com tratador.
//!    ⚠️ **A CAUSA MORREU EM 24/08**, e fica escrito para não virar comentário mentiroso: a
//!    A8 foi consertada no mesmo dia, `cdNeovim` não vaza mais nada, e a metade do parágrafo
//!    acima que fala do `node --test` continua verdadeira mas **não se aplica mais aqui**.
//!    A forma poderia voltar ao `before` idiomático — não voltou porque isso é refatoração
//!    de andaime, fora da fatia que consertou a A8. Registrado como árvore **A11**.
//! 3. A abertura que FALHA pode ficar dentro do teste, e a razão é do código: `abrirProjeto`
//!    estoura ANTES de `cdNeovim` ser chamado. Se um dia a ordem mudar, este arquivo passa a
//!    reprovar — e isso é o aviso funcionando, não um teste frágil.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { casa, pastaNova } from "../apoio/casa-de-teste.ts";
import { PASTA_CONFIG } from "../../codigos/sistema/motores/configuracao-salva.ts";
import { esperarAsAtrasadas, naoTratadas } from "../apoio/rejeicoes-nao-tratadas.ts";
import {
  entrarNaPasta,
  esquecerRecente,
  listarRecentes,
  pastaAberta,
  raizesDeEscrita,
} from "../../codigos/sistema/servicos/abertura-de-projeto.ts";

const primeira = pastaNova("proj-primeira");
const segunda = pastaNova("proj-segunda");
const descartavel = pastaNova("proj-descartavel");
writeFileSync(path.join(primeira, "leia.txt"), "oi");
mkdirSync(path.join(primeira, "sub"));

const abertaPrimeira = await entrarNaPasta(primeira);
await esperarAsAtrasadas();
await entrarNaPasta(descartavel);
const abertaSegunda = await entrarNaPasta(segunda);

describe("entrarNaPasta — o que ela devolve e o que ela muda", () => {
  test("devolve a árvore do primeiro nível, com o nome da pasta", () => {
    assert.equal(abertaPrimeira.raiz, primeira);
    assert.equal(abertaPrimeira.nome, path.basename(primeira));
    //! Pastas antes de arquivos — a ordem do VSCodium, escolhida para a árvore não
    //!   parecer aleatória a quem vem de lá.
    assert.deepEqual(abertaPrimeira.filhos.map((f) => f.nome), ["sub", "leia.txt"]);
  });

  test("a última pasta em que se entrou é a aberta", () => {
    assert.equal(pastaAberta(), segunda);
    assert.equal(abertaSegunda.raiz, segunda);
  });

  test("a pasta aberta é a ÚNICA raiz de escrita", () => {
    //! Uma raiz, não uma lista que cresce: cada `entrarNaPasta` SUBSTITUI. Se um dia
    //!   passar a acumular, a escrita ficaria liberada em pasta que a pessoa já deixou.
    assert.deepEqual(raizesDeEscrita(), [path.resolve(segunda)]);
  });
});

describe("a ORDEM — leitura primeiro, registro depois", () => {
  //! ⚠️ ESTA ASSERÇÃO OLHA O ARQUIVO CRU, E NÃO `listarRecentes()`. A primeira versão deste
  //!   teste conferia a lista — e ela NUNCA PODERIA FALHAR: `pastasRecentes()` já filtra por
  //!   `statSync(p).isDirectory()` (`configuracao-salva.ts:167-173`), então pasta morta some
  //!   da lista por OUTRO mecanismo, com ou sem a ordem certa. Descobri invertendo a ordem
  //!   em `entrarNaPasta` e vendo a suíte seguir 71/71 VERDE. Era o enfeite do §12·2.
  //! O que a ordem realmente muda é o arquivo GRAVADO: com o registro antes da leitura, a
  //!   pasta morta entra no `config.json` e ocupa uma das 8 vagas de `MAX_RECENTES` —
  //!   empurrando pasta viva para fora. É isso que se confere aqui.
  test("pasta que sumiu do disco ESTOURA e não é GRAVADA no config", async () => {
    const fantasma = path.join(casa(), "esta-pasta-nunca-existiu");
    await assert.rejects(() => entrarNaPasta(fantasma));
    const cru = JSON.parse(
      readFileSync(path.join(PASTA_CONFIG, "config.json"), "utf8"),
    ) as { pastas?: string[] };
    assert.equal((cru.pastas ?? []).includes(fantasma), false);
    assert.equal(listarRecentes().includes(fantasma), false);
  });

  test("estourar não troca a pasta aberta", () => {
    assert.equal(pastaAberta(), segunda);
  });
});

describe("recentes", () => {
  test("a mais recente vem primeiro, sem repetir", () => {
    const recentes = listarRecentes();
    assert.equal(recentes[0], segunda);
    assert.equal(recentes.includes(primeira), true);
    assert.equal(new Set(recentes).size, recentes.length);
  });

  test("esquecer tira da lista e devolve a lista já sem ela", () => {
    const depois = esquecerRecente(descartavel);
    assert.equal(depois.includes(descartavel), false);
    assert.equal(listarRecentes().includes(descartavel), false);
  });

  test("esquecer uma pasta que não está na lista não quebra nada", () => {
    const antes = listarRecentes().length;
    assert.equal(esquecerRecente("/pasta/que/nunca/esteve").length, antes);
  });
});

describe("o andaime não está escondendo nada", () => {
  test("NENHUMA rejeição não tratada vazou durante a suíte", async () => {
    await esperarAsAtrasadas();
    //! A asserção era "nada INESPERADO" enquanto a A8 vazava o `connect ENOENT` do socket
    //!   do Neovim. Consertada a A8 em 24/08, o perdão saiu e a exigência passou a ser total.
    assert.deepEqual(naoTratadas, []);
  });
});
