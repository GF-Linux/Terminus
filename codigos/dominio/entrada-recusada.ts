//* Recusa o texto que nem deveria virar caminho, antes de qualquer resolucao.

//* Confere a entrada crua e devolve a string, ou estoura dizendo o motivo.
//! POR QUE ANTES DE RESOLVER, e nao depois: `path.resolve("-c")` devolve
//!   `<pasta atual>/-c`, que cai DENTRO de uma raiz permitida e passaria na
//!   conferencia de confinamento. Um caminho que comeca com traco vira opcao do
//!   programa que o recebe — o Terminus nao precisa de nenhum e nao abre essa porta.
//! O byte nulo entra na mesma peneira porque ele TRUNCA a string em chamada de
//!   sistema: o que a checagem le e o que o kernel abre deixam de ser a mesma coisa.
export function recusarEntrada(alvo: unknown, oQue: string): string {
  if (typeof alvo !== "string" || alvo.length === 0 || alvo.includes("\0")) {
    throw new Error(`O ${oQue} não é válido.`);
  }
  if (alvo.startsWith("-")) throw new Error(`O ${oQue} não pode começar com "-".`);
  return alvo;
}
