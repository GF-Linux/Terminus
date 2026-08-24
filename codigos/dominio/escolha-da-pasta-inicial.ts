//* Decide qual pasta o Terminus abre ao subir.

//* O argumento da linha ganha da pasta lembrada. `null` se não houver nenhuma.
//! POR QUE A LINHA GANHA: quem digitou `terminus <pasta>` disse o que quer
//!   AGORA. Sem argumento, volta a última pasta aberta — reabrir o aplicativo no
//!   meio da mesma corrida é o caso comum, e procurar a pasta no diálogo todo
//!   dia é trabalho que a máquina faz.
export function pastaInicial(
  pedidaNaLinha: string | null,
  ultimaLembrada: string | null,
): string | null {
  return pedidaNaLinha ?? ultimaLembrada;
}
