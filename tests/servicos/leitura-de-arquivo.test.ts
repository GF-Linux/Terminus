//? LEITURA DE ARQUIVO — a rede que trava as duas recusas e a NÃO-recusa deliberada 24/08/2026
//!
//! 1. Este caso de uso é o único que NÃO confina de propósito, e o porquê está escrito no
//!    código: *"o traceback clicável abre o quadro dentro da biblioteca (…) Fechar aqui
//!    quebraria o salto do traceback."* Um teste que exigisse confinamento aqui estaria
//!    travando a intenção errada — por isso há um teste que exige o contrário, com o porquê.
//! 2. O único segredo que existe no Terminus é o `config.json` dele, e a recusa dele tem
//!    teste próprio. Ela depende de `PASTA_CONFIG`, que nasce de `os.homedir()` no
//!    carregamento — e é por isso que o gancho redireciona `HOME` antes de tudo.
//! 3. AS GUARDAS ESTOURAM DE FORMA SÍNCRONA, e por isso `assert.throws` e não
//!    `assert.rejects`: a função não é `async`, e medido que `assert.rejects` REPASSA um
//!    throw síncrono em vez de aceitá-lo. Quem embrulha em produção é `respostaSegura`,
//!    cujo `try` pega os dois casos.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { casa, pastaNova } from "../apoio/casa-de-teste.ts";
import {
  abrirParaTela,
  lerParaEditor,
  listarPasta,
  listarProjeto,
} from "../../codigos/sistema/servicos/leitura-de-arquivo.ts";

const projeto = pastaNova("leitura");
const foraDoProjeto = pastaNova("biblioteca");
writeFileSync(path.join(projeto, "codigo.py"), "print('oi')\n");
writeFileSync(path.join(projeto, "imagem.png"), "nao e texto");
mkdirSync(path.join(projeto, "dados"));
writeFileSync(path.join(projeto, "dados", "tabela.csv"), "a,b\n1,2\n");
writeFileSync(path.join(foraDoProjeto, "modulo.py"), "def f(): pass\n");

describe("lerParaEditor — as duas recusas que valem", () => {
  test("lê um arquivo de texto do projeto", async () => {
    assert.equal(await lerParaEditor(path.join(projeto, "codigo.py")), "print('oi')\n");
  });

  test("recusa o que não é string — a carga do IPC chega crua", () => {
    assert.throws(() => lerParaEditor(42), /não é válido/);
  });

  test("recusa string vazia", () => {
    assert.throws(() => lerParaEditor(""), /não é válido/);
  });

  test("recusa caminho com byte nulo — ele TRUNCA na chamada de sistema", () => {
    //! O que a checagem lê e o que o kernel abre deixariam de ser a mesma coisa.
    assert.throws(() => lerParaEditor(`${path.join(projeto, "codigo.py")}\0.png`), /não é válido/);
  });

  test("recusa o config.json do Terminus — o único segredo que existe", () => {
    const segredo = path.join(casa(), ".config", "terminus", "config.json");
    mkdirSync(path.dirname(segredo), { recursive: true });
    writeFileSync(segredo, "{}");
    assert.throws(() => lerParaEditor(segredo), /não abre no editor/);
  });

  test("recusa arquivo que não é texto — abrir um .png mostraria lixo", () => {
    assert.throws(() => lerParaEditor(path.join(projeto, "imagem.png")), /não é arquivo de texto/);
  });

  //? Este teste exige a NÃO-recusa, e é de propósito. Se alguém "consertar" a leitura
  //?   confinando-a à pasta aberta, o salto do traceback e o F12 para dentro da
  //?   biblioteca param de funcionar — e este vermelho é o aviso.
  test("LÊ arquivo FORA da pasta aberta — é o que faz o traceback clicável funcionar", async () => {
    assert.equal(await lerParaEditor(path.join(foraDoProjeto, "modulo.py")), "def f(): pass\n");
  });
});

describe("listar — o que alimenta a árvore e o Ctrl+P", () => {
  test("abrirParaTela devolve a raiz, o nome e o primeiro nível", async () => {
    const aberto = await abrirParaTela(projeto);
    assert.equal(aberto.nome, path.basename(projeto));
    assert.deepEqual(aberto.filhos.map((f) => f.nome), ["dados", "codigo.py", "imagem.png"]);
  });

  test("listarPasta põe pasta antes de arquivo", async () => {
    const nos = await listarPasta(projeto);
    assert.equal(nos[0]?.tipo, "pasta");
  });

  test("listarProjeto devolve caminhos RELATIVOS, e desce nas subpastas", async () => {
    const tudo = await listarProjeto(projeto);
    assert.equal(tudo.includes("codigo.py"), true);
    assert.equal(tudo.includes(path.join("dados", "tabela.csv")), true);
    //! Relativos porque é o que o Ctrl+P mostra: caminho absoluto encheria a lista de
    //!   prefixo igual em toda linha.
    assert.equal(tudo.some((c) => path.isAbsolute(c)), false);
  });
});
