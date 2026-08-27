//? A CONVERSAO BASE-ZERO / BASE-UM — a conta boba que custa caro quando erra
//!
//! O LSP conta a partir de zero, o editor a partir de um. Errar por UM faz o sublinhado
//! aparecer uma linha acima do erro e a correcao cair no lugar errado — e nada disso parece
//! defeito nosso: parece que o servidor esta confuso.
//! ⚠️ Ela estava escrita TRES VEZES a mao (sugestao inline, edicao seguinte, diagnostico).
//! Estes testes existem para ela ser uma so, e continuar certa.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  faixaParaOEditor,
  faixaParaOProtocolo,
  posicaoParaOProtocolo,
} from "../../codigos/dominio/faixa-do-editor.ts";

test("a primeira linha e a primeira coluna sao o caso que mais engana", () => {
  //! Zero vira UM. Quem escreve isto de cabeca costuma deixar o zero passar, e o erro so
  //!   aparece no comeco do arquivo — onde quase ninguem testa.
  assert.deepEqual(
    faixaParaOEditor({ start: { line: 0, character: 0 }, end: { line: 0, character: 4 } }),
    { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 },
  );
});

test("faixa que atravessa linhas converte as DUAS pontas", () => {
  assert.deepEqual(
    faixaParaOEditor({ start: { line: 5, character: 8 }, end: { line: 9, character: 2 } }),
    { startLineNumber: 6, startColumn: 9, endLineNumber: 10, endColumn: 3 },
  );
});

test("a volta desfaz a ida — sem isto, cada caminho teria a sua propria conta", () => {
  const doProtocolo = { start: { line: 12, character: 3 }, end: { line: 12, character: 20 } };
  assert.deepEqual(faixaParaOProtocolo(faixaParaOEditor(doProtocolo)), doProtocolo);
});

test("a posicao do cursor tambem desce de um", () => {
  assert.deepEqual(posicaoParaOProtocolo({ lineNumber: 1, column: 1 }), { line: 0, character: 0 });
  assert.deepEqual(posicaoParaOProtocolo({ lineNumber: 42, column: 7 }), { line: 41, character: 6 });
});

//! Faixa vazia (cursor sem selecao) e o caso do NES: a edicao pode ser uma INSERCAO, e
//!   inserir e uma faixa em que o comeco e o fim sao o mesmo ponto.
test("faixa vazia sobrevive — e o caso de INSERIR, nao de substituir", () => {
  const r = faixaParaOEditor({ start: { line: 3, character: 0 }, end: { line: 3, character: 0 } });
  assert.equal(r.startLineNumber, r.endLineNumber);
  assert.equal(r.startColumn, r.endColumn);
});

//! ⚠️ Faixa INVERTIDA passa de proposito: e problema de quem a produziu (o servidor), e
//!   "corrigi-la" aqui esconderia um defeito dele atras de um sublinhado que parece certo.
test("faixa invertida NAO e corrigida — o defeito e de quem a mandou", () => {
  const r = faixaParaOEditor({ start: { line: 9, character: 0 }, end: { line: 2, character: 0 } });
  assert.equal(r.startLineNumber, 10);
  assert.equal(r.endLineNumber, 3);
});
