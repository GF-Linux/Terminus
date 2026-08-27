//? DESLIGAR O COPILOT POR LINGUAGEM — item 7 da comparação com a documentação do VSCode
//!
//! O VSCode chama isto de `github.copilot.enable`, e o motivo de existir é concreto: quem
//! escreve Markdown ou edita um `.env` quase nunca quer completar, e o fantasma no meio de
//! um texto em português atrapalha em vez de ajudar. Sem isto, o único desligar era global.
//!
//! ⚠️ POR QUE NO `localStorage` E NÃO NO `config.json` DO MAIN: é preferência de TELA, não
//! estado do sistema — não muda o que o aplicativo pode fazer, não atravessa a porta e não
//! precisa sobreviver a uma reinstalação. Pô-la no `config.json` custaria dois canais de
//! IPC e uma leitura de disco para guardar uma lista de palavras.
//! É a mesma decisão que a largura do painel já usa (`ligarDivisor`, `nucleo-da-casca.ts`).

const CHAVE = "terminus.copilot.desligado";

/** As linguagens em que o Copilot está desligado, por escolha. */
//! Lista NEGATIVA — o padrão é ligado. Uma lista positiva teria de ser atualizada a cada
//!   linguagem nova, e o modo de falhar seria o pior possível: o Copilot em silêncio numa
//!   linguagem que ninguém desligou. É a mesma lição do `ehTexto`, no mesmo dia.
function desligadas(): Set<string> {
  try {
    const cru = localStorage.getItem(CHAVE);
    return new Set(cru ? (JSON.parse(cru) as string[]) : []);
  } catch {
    //! `localStorage` pode falhar (janela sem armazenamento, JSON corrompido). Nesse caso
    //!   o certo é o PADRÃO — ligado —, não um erro na cara de quem só queria escrever.
    return new Set();
  }
}

//* O Copilot deve sugerir nesta linguagem?
export function copilotLigadoPara(linguagem: string): boolean {
  return !desligadas().has(linguagem);
}

//* Liga ou desliga o Copilot para uma linguagem. Devolve o estado novo.
export function alternarCopilotPara(linguagem: string): boolean {
  const lista = desligadas();
  const ligando = lista.delete(linguagem);
  if (!ligando) lista.add(linguagem);
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...lista]));
  } catch {
    /* sem armazenamento: vale para esta sessão e só */
  }
  return ligando;
}

//* As linguagens desligadas, para quem quiser mostrá-las.
export function linguagensSemCopilot(): string[] {
  return [...desligadas()].sort();
}
