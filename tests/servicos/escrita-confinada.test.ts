//? ESCRITA CONFINADA — a rede que trava o confinamento ANTES de a A3(a) mexer nele 24/08/2026
//!
//! 1. A ORDEM É DA CABEÇA e é o motivo desta suíte existir: a A3(a) muda conduta, e §12
//!    manda a rede vir primeiro. Com ela no lugar, o diff dos testes mostra EXATAMENTE o
//!    que passou a ser recusado — em vez de a mudança se provar por narrativa.
//! 2. AS TRÊS ETAPAS que `confinado` orquestra, e a ordem entre elas é a regra:
//!    peneirar o texto → desfazer o link → decidir sobre o caminho já real. Cada uma tem
//!    teste próprio abaixo, porque cada uma sozinha é furada.
//! 3. OS TESTES MARCADOS `A3` JÁ VIRARAM. Eles nasceram travando o defeito — `criar` e
//!    `renomear` confiando na raiz que o CHAMADOR enviava — e foram reescritos quando a
//!    cabeça mandou aplicar a A3(a), no mesmo dia. Ficam com a marca porque é por eles que
//!    se vê, de um relance, o que exatamente passou a ser recusado.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { casa, pastaNova } from "../apoio/casa-de-teste.ts";
import { esperarAsAtrasadas, inesperadas, naoTratadas } from "../apoio/rejeicoes-nao-tratadas.ts";
import { entrarNaPasta, raizesDeEscrita } from "../../codigos/sistema/servicos/abertura-de-projeto.ts";
import {
  confinado,
  criarArquivoNoProjeto,
  criarPastaNoProjeto,
  gravarConfinado,
  renomearNoProjeto,
} from "../../codigos/sistema/servicos/escrita-confinada.ts";

//! ⚠️ A MONTAGEM MORA NO CORPO DO MÓDULO, E NÃO NUM `before` — e isto foi MEDIDO, com
//!   cinco arquivos de isolamento, não escolhido por gosto. O motivo é a **A8**:
//!   `entrarNaPasta` dispara `cdNeovim`, e `attach()` produz uma rejeição não tratada
//!   (`connect ENOENT`) ~3 ms depois. Medido onde ela pode nascer sem reprovar o arquivo:
//!
//!     promessa que nunca assenta, dentro de `before` ....... passou
//!     rejeição não tratada dentro de `before` .............. REPROVOU
//!     rejeição não tratada dentro de um `test` ............. REPROVOU
//!     rejeição não tratada no CORPO DO MÓDULO .............. passou
//!
//!   E reprova **mesmo com tratador instalado e mesmo esperando 300 ms dentro do gancho**:
//!   o `node --test` atribui a rejeição ao escopo do gancho, não ao relógio. O corpo do
//!   módulo roda antes de o runner começar a atribuir — é o único lugar onde o defeito
//!   herdado não contamina o veredito da rede.
const aberta: string = pastaNova("aberta");
const deFora: string = pastaNova("de-fora");
//! A pasta só fica gravável depois de ABERTA — é `entrarNaPasta` quem diz ao main qual é
//!   a raiz, e `raizesDeEscrita()` lê dela. Sem este passo tudo é recusado, e um teste que
//!   passasse sem ele estaria provando a recusa por falta de estado, não pela guarda.
await entrarNaPasta(aberta);
await esperarAsAtrasadas();

describe("confinado — as três etapas, uma a uma", () => {
  test("aceita caminho dentro da pasta aberta e devolve o real", () => {
    const alvo = path.join(aberta, "nota.txt");
    assert.equal(confinado(alvo, raizesDeEscrita(), "arquivo"), alvo);
  });

  test("recusa caminho fora da pasta aberta, dizendo o nome", () => {
    assert.throws(() => confinado(path.join(deFora, "nota.txt"), raizesDeEscrita(), "arquivo"), {
      message: /"nota\.txt" está fora da pasta aberta/,
    });
  });

  test("recusa quando NÃO há raiz nenhuma — lista vazia não é passe livre", () => {
    assert.throws(() => confinado(path.join(aberta, "nota.txt"), [], "arquivo"), {
      message: /está fora da pasta aberta/,
    });
  });

  test("etapa 2 — o atalho para fora é DESFEITO e recusado", () => {
    //! É a etapa que a comparação de texto pura erraria: o nome está dentro da raiz,
    //!   e a escrita cairia fora dela. Sem realpath, este caminho passa.
    const atalho = path.join(aberta, "atalho");
    if (!existsSync(atalho)) symlinkSync(deFora, atalho, "dir");
    assert.throws(() => confinado(path.join(atalho, "roubado.txt"), raizesDeEscrita(), "arquivo"), {
      message: /está fora da pasta aberta/,
    });
  });

  test("etapa 1 — o caminho que começa com traço morre ANTES de resolver", () => {
    //! Depois de resolver, `-c` já virou `<pasta>/‑c` e cairia DENTRO da raiz. Por isso
    //!   a peneira do texto tem de vir primeiro, e por isso ela tem teste separado.
    assert.throws(() => confinado("-c", raizesDeEscrita(), "arquivo"), {
      message: /não pode começar com "-"/,
    });
  });

  test("etapa 1 — o que nem é string é recusado; a carga do IPC chega crua", () => {
    assert.throws(() => confinado(42, raizesDeEscrita(), "arquivo"), { message: /não é válido/ });
  });
});

describe("gravarConfinado — a peça-vitrine do confinamento", () => {
  test("grava dentro da pasta aberta", async () => {
    const alvo = path.join(aberta, "salvo.txt");
    await gravarConfinado(alvo, "conteúdo");
    assert.equal(readFileSync(alvo, "utf8"), "conteúdo");
  });

  //! ⚠️ `assert.throws`, e NÃO `assert.rejects`, e a diferença foi MEDIDA, não suposta:
  //!   `gravarConfinado` declara `Promise<void>` mas as duas guardas dela estouram de forma
  //!   SÍNCRONA — a função não é `async`, e `confinado()` estoura antes de qualquer promessa
  //!   nascer. Medido que `assert.rejects` REPASSA um throw síncrono em vez de aceitá-lo, e
  //!   por isso a asserção errada reprovava o código certo.
  //! Isto NÃO é defeito: o único chamador de produção é `respostaSegura`, que embrulha a
  //!   chamada num `try` dentro de função `async` (`resposta-segura.ts:12-17`) — e `try`
  //!   pega throw síncrono. A forma é mista de propósito: guarda estoura na hora, falha de
  //!   disco chega pela promessa.
  test("recusa gravar fora da pasta aberta, e nada é criado", () => {
    const alvo = path.join(deFora, "invadido.txt");
    assert.throws(() => gravarConfinado(alvo, "conteúdo"), /está fora da pasta aberta/);
    assert.equal(existsSync(alvo), false);
  });

  test("recusa conteúdo que não é texto", () => {
    assert.throws(() => gravarConfinado(path.join(aberta, "x.txt"), 42), /Conteúdo inválido/);
  });
});

describe("criar e renomear — confinados como o gravar, desde a A3(a)", () => {
  test("cria arquivo dentro da pasta aberta", async () => {
    const criado = await criarArquivoNoProjeto(aberta, "novo.txt");
    assert.equal(criado, path.join(aberta, "novo.txt"));
    assert.equal(existsSync(criado), true);
  });

  test("cria pasta dentro da pasta aberta", async () => {
    const criada = await criarPastaNoProjeto(aberta, "sub");
    assert.equal(existsSync(criada), true);
  });

  test("recusa nome com barra — nome não é caminho", async () => {
    await assert.rejects(() => criarArquivoNoProjeto(aberta, "a/b"), /não pode conter barra/);
  });

  test("recusa nome vazio", async () => {
    await assert.rejects(() => criarArquivoNoProjeto(aberta, "   "), /não pode ser vazio/);
  });

  test("renomeia dentro da pasta aberta", async () => {
    const antes = await criarArquivoNoProjeto(aberta, "antes.txt");
    const depois = await renomearNoProjeto(antes, "depois.txt");
    assert.equal(path.basename(depois), "depois.txt");
    assert.equal(existsSync(antes), false);
  });

  test("recusa renomear por cima de nome que já existe", async () => {
    await criarArquivoNoProjeto(aberta, "ocupado.txt");
    const outro = await criarArquivoNoProjeto(aberta, "outro.txt");
    await assert.rejects(() => renomearNoProjeto(outro, "ocupado.txt"), /Já existe/);
  });

  //! A3(a) APLICADA em 24/08 por decisão da cabeça: `criar` e `renomear` passaram a usar
  //!   `confinado()` — realpath + as raízes que o DONO conhece — em vez da raiz que o
  //!   renderer manda. Os dois testes abaixo travavam o defeito e VIRARAM; a virada é o
  //!   resultado declarado, não uma surpresa.
  //! `assert.throws` e não `assert.rejects`, pelo MESMO motivo do `gravarConfinado` logo
  //!   acima: a guarda estoura de forma síncrona, e medido que `assert.rejects` repassa um
  //!   throw síncrono. E a forma agora é a mesma nos quatro caminhos, que é o ponto da
  //!   A3(a) — antes dela, a recusa de `criar` vinha como rejeição de promessa. Invisível
  //!   em produção: `respostaSegura` embrulha os dois casos no mesmo `try`.
  test("A3 · recusa criar fora da pasta aberta, mesmo com raiz arbitrária do chamador", () => {
    assert.throws(() => criarArquivoNoProjeto(deFora, "de-fora.txt"), /está fora da pasta aberta/);
    assert.equal(existsSync(path.join(deFora, "de-fora.txt")), false);
  });

  test("A3 · o atalho para fora agora É desfeito por criar", () => {
    const atalho = path.join(aberta, "atalho");
    if (!existsSync(atalho)) symlinkSync(deFora, atalho, "dir");
    assert.throws(() => criarArquivoNoProjeto(atalho, "pelo-atalho.txt"), /está fora da pasta aberta/);
    assert.equal(existsSync(path.join(deFora, "pelo-atalho.txt")), false);
  });

  test("A3 · recusa criar PASTA fora da pasta aberta", () => {
    assert.throws(() => criarPastaNoProjeto(deFora, "sub-de-fora"), /está fora da pasta aberta/);
  });

  test("A3 · recusa renomear coisa que está fora da pasta aberta", () => {
    const alheio = path.join(deFora, "alheio.txt");
    writeFileSync(alheio, "conteúdo de outro");
    assert.throws(() => renomearNoProjeto(alheio, "roubado.txt"), /está fora da pasta aberta/);
    assert.equal(existsSync(alheio), true);
  });
});

describe("o andaime não está escondendo nada", () => {
  test("nenhuma rejeição INESPERADA vazou durante a suíte", async () => {
    await esperarAsAtrasadas();
    //! A única explicada é a A8 (`connect ENOENT` no socket do Neovim), herdada e
    //!   registrada no tracker. Qualquer outra reprova aqui em vez de sumir.
    assert.deepEqual(inesperadas(), []);
    //! Impresso, não afirmado: numa máquina com o Terminus aberto o socket existe e a
    //!   A8 não aparece. Contar é informação; exigir seria falhar pelo ambiente alheio.
    console.log(`      [A8] rejeições não tratadas nesta corrida: ${naoTratadas.length}`);
  });
});

describe("a casa de teste está mesmo redirecionada", () => {
  test("a pasta aberta mora dentro da casa temporária, não na do autor", () => {
    //! Guarda de segurança do próprio andaime: se o gancho parar de redirecionar `HOME`,
    //!   esta suíte passaria a escrever na máquina de quem roda. Melhor descobrir aqui.
    assert.equal(aberta.startsWith(casa()), true);
    assert.match(casa(), /terminus-teste-/);
  });
});
