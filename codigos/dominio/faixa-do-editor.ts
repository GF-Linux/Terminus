//* Converte faixa e posição entre o protocolo (base zero) e o editor (base um).

//? POR QUE ISTO É DOMÍNIO, E POR QUE EXISTE
//!
//! O LSP conta linha e coluna a partir de **zero**; o editor, a partir de **um**. É a
//! conversão mais boba do projeto e a que mais custa quando erra: o sublinhado aparece uma
//! linha acima do erro, a sugestão substitui o trecho errado, a correção do Copilot cai no
//! lugar errado — e **nada disso parece um defeito nosso**. Parece que o servidor está confuso.
//!
//! ⚠️ ELA ESTAVA ESCRITA TRÊS VEZES à mão — no provedor de sugestão inline, no de edição
//! seguinte e no puxador de diagnóstico. Três cópias de uma conta de somar é uma que vai
//! ficar para trás. Aqui ela é uma só, é pura, e é testável em milissegundos sem subir
//! navegador nenhum — que é exatamente o que `dominio/` existe para permitir.
//!
//! Devolve **números**, não tipos do editor: importar `monaco` aqui faria o domínio depender
//! do pacote do editor e deixar de ser puro — o M3 do portão pegaria, e com razão.

/** Uma posição como o protocolo a manda: base zero. */
export interface PosicaoDoProtocolo {
  line: number;
  character: number;
}

/** Uma faixa como o editor a quer: base um, e com os nomes que ele usa. */
export interface FaixaDoEditor {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

//* Converte uma faixa do protocolo para a do editor.
//! ⚠️ NÃO VALIDA se o fim vem antes do começo, e é decisão: faixa invertida é problema de
//!   quem a produziu (o servidor), e "corrigi-la" aqui esconderia um defeito dele atrás de
//!   um sublinhado que parece certo.
export function faixaParaOEditor(faixa: {
  start: PosicaoDoProtocolo;
  end: PosicaoDoProtocolo;
}): FaixaDoEditor {
  return {
    startLineNumber: faixa.start.line + 1,
    startColumn: faixa.start.character + 1,
    endLineNumber: faixa.end.line + 1,
    endColumn: faixa.end.character + 1,
  };
}

//* Converte uma posição do editor (base um) para a do protocolo (base zero).
export function posicaoParaOProtocolo(posicao: {
  lineNumber: number;
  column: number;
}): PosicaoDoProtocolo {
  return { line: posicao.lineNumber - 1, character: posicao.column - 1 };
}

//* Converte uma faixa do editor para a do protocolo. É o caminho dos diagnósticos.
export function faixaParaOProtocolo(faixa: FaixaDoEditor): {
  start: PosicaoDoProtocolo;
  end: PosicaoDoProtocolo;
} {
  return {
    start: { line: faixa.startLineNumber - 1, character: faixa.startColumn - 1 },
    end: { line: faixa.endLineNumber - 1, character: faixa.endColumn - 1 },
  };
}
