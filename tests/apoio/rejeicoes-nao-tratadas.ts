//? REJEIÇÕES NÃO TRATADAS — Decisão sobre capturar em vez de silenciar 24/08/2026
//!
//! 1. `entrarNaPasta` dispara `cdNeovim`, e `attach()` do pacote `neovim` produz UMA
//!    rejeição não tratada (`connect ENOENT /tmp/terminus-nvim.sock`) quando o socket não
//!    existe. Medido. É a árvore **A8** no tracker, e é herdada byte a byte da linha de base.
//! 2. Sem tratador, o `node --test` reprova o arquivo inteiro — e o vermelho não é da rede,
//!    é do defeito herdado chegando tarde. Com tratador largo no gancho, TODA rejeição
//!    futura ficaria escondida em toda a suíte, e a rede passaria a mentir junto (§12·3a·4).
//! 3. Então este módulo é **opt-in por arquivo** e ele CAPTURA, não engole: guarda tudo o
//!    que chegou, e a suíte que o importa é obrigada a afirmar o que chegou.
//! 4. ⚠️ A AFIRMAÇÃO É "nada INESPERADO vazou", e não "a A8 vazou" — e isto foi pensado,
//!    não relaxado: o socket é um caminho FIXO e compartilhado (`/tmp/terminus-nvim.sock`),
//!    então numa máquina com o Terminus aberto o `attach` CONECTA e a A8 não aparece. Exigir
//!    a A8 faria a suíte falhar por causa do ambiente de quem roda — o mesmo modo de falha
//!    do `#sideAcoes` do despacho 2, que deu vermelho com o código certo.

/** Tudo que chegou como rejeição não tratada, em texto, na ordem. */
export const naoTratadas: string[] = [];

process.on("unhandledRejection", (motivo) => {
  naoTratadas.push(motivo instanceof Error ? motivo.message : String(motivo));
});

/** A assinatura da A8 — a única rejeição que esta suíte sabe explicar. */
export const A8_SOCKET_NEOVIM = /connect ENOENT .*terminus-nvim\.sock/;

//* As que chegaram e NÃO são a A8. Lista vazia é o que a suíte exige.
export function inesperadas(): string[] {
  return naoTratadas.filter((m) => !A8_SOCKET_NEOVIM.test(m));
}

//* Dá tempo às rejeições atrasadas de chegarem antes de a suíte julgar.
//! `cdNeovim` é disparado com `void` e a rejeição chega DEPOIS do gancho que a
//!   provocou — foi exatamente assim que o `node --test` a viu primeiro.
export function esperarAsAtrasadas(ms = 300): Promise<void> {
  return new Promise((pronto) => setTimeout(pronto, ms));
}
