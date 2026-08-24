//? REJEIÇÕES NÃO TRATADAS — Decisão sobre capturar em vez de silenciar 24/08/2026
//!
//! 1. Sem tratador, o `node --test` reprova o arquivo inteiro quando uma rejeição não
//!    tratada nasce no escopo de um teste ou de um gancho. Com tratador LARGO instalado no
//!    gancho de módulos, toda rejeição futura ficaria escondida em toda a suíte, e a rede
//!    passaria a mentir junto (§12·3a·4).
//!    ⚠️ ONDE ELA PODE NASCER SEM REPROVAR O ARQUIVO — medido em 24/08 com cinco arquivos
//!    de isolamento, e guardado AQUI porque é fato sobre o `node --test`, não sobre a suíte
//!    que o descobriu:
//!
//!      promessa que nunca assenta, dentro de `before` ....... passou
//!      rejeição não tratada dentro de `before` .............. REPROVOU
//!      rejeição não tratada dentro de um `test` ............. REPROVOU
//!      rejeição não tratada no CORPO DO MÓDULO .............. passou
//!
//!    E reprova **mesmo com tratador instalado e mesmo esperando 300 ms dentro do gancho**:
//!    o runner atribui a rejeição ao escopo do gancho, não ao relógio.
//!    ⚠️ A leitura ERRADA desta tabela, e ela custou cinco arquivos na forma esquisita: ela
//!    NÃO diz "monte no corpo do módulo". Diz "não deixe vazar rejeição". Enquanto a A8
//!    vazava, o corpo do módulo era o único lugar que não contaminava o veredito; consertada
//!    a A8, não há o que fugir, e o `before` idiomático voltou a ser o certo (árvore A11).
//! 2. Então este módulo é **opt-in por arquivo** e ele CAPTURA, não engole: guarda tudo o
//!    que chegou, e a suíte que o importa é obrigada a afirmar que **nada** chegou.
//! 3. ⚠️ ELE JÁ TEVE UMA EXCEÇÃO, E ELA MORREU COM O DEFEITO QUE A CRIOU. Até 24/08 havia
//!    aqui um filtro que perdoava a assinatura da **A8** (`connect ENOENT` no socket do
//!    Neovim), e a asserção das suítes era "nada INESPERADO vazou". A A8 foi consertada no
//!    mesmo dia — a conexão passou a ser aberta pelo motor, com tratador na origem — e o
//!    filtro saiu junto. Duas razões, e a segunda é a que importa:
//!      a) não há mais o que perdoar: medido, o ciclo inteiro de desistência vaza ZERO;
//!      b) um filtro por assinatura sobrevive ao defeito e vira **buraco**: quem
//!         reintroduzisse o vazamento amanhã encontraria a suíte verde.
//!    O outro motivo daquele afrouxamento também acabou: o socket era um caminho FIXO e
//!    COMPARTILHADO, então a suíte dependia de o Terminus estar aberto na máquina de quem
//!    roda. O gancho passou a redirecionar `TMPDIR`, e o socket agora é privado do processo.

/** Tudo que chegou como rejeição não tratada, em texto, na ordem. Lista vazia é o exigido. */
export const naoTratadas: string[] = [];

process.on("unhandledRejection", (motivo) => {
  naoTratadas.push(motivo instanceof Error ? motivo.message : String(motivo));
});

//* Dá tempo às rejeições atrasadas de chegarem antes de a suíte julgar.
//! `cdNeovim` é disparado com `void` e uma rejeição chegaria DEPOIS do gancho que a
//!   provocou — foi exatamente assim que o `node --test` viu a A8 pela primeira vez.
export function esperarAsAtrasadas(ms = 300): Promise<void> {
  return new Promise((pronto) => setTimeout(pronto, ms));
}
