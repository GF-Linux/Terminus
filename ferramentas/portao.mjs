//? PORTÃO DA CORRIDA — as cinco pernas do §12·4, e o veredito 23/08/2026
//!
//! 1. O §12·4 não é lista fixa de comandos: é contrato de três cláusulas. As
//!    pernas foram declaradas ANTES da fatia 1, em docs/tracker.md §1, cada uma
//!    com o comando concreto e o que fica descoberto.
//! 2. Cláusula (b): o que o portão MEDE, o portão TRAVA. Na v0.4 o portão
//!    imprimia os ciclos e devolvia verde assim mesmo. Aqui nenhum número é
//!    impresso sem entrar no veredito — é o que a catraca do docs/catraca.json
//!    garante: cada fatia declara o esperado, e piorar reprova.
//! 3. Cláusula (c): a perna de CONDUTA sobe o app de verdade. As outras quatro
//!    aprovam fatia sem nunca ligar o programa.
//! 4. A conduta roda com HOME redirecionado. Sem isso a partida do Terminus
//!    escreve em ~/.config/terminus/ e cria symlink em ~/.config/nvim/ — medido.
//!    Portão que suja a máquina de quem roda não é portão.

import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import * as path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const VERDE = "\x1b[32m", VERM = "\x1b[31m", CINZA = "\x1b[90m", FIM_COR = "\x1b[0m";

//* Lê a catraca: os valores que ESTA fatia promete não piorar.
function catraca() {
  const p = path.join(RAIZ, "docs", "catraca.json");
  if (!existsSync(p)) throw new Error("docs/catraca.json não existe — a catraca não tem contra o que comparar.");
  return JSON.parse(readFileSync(p, "utf8"));
}

//* Todos os .ts de uma pasta, recursivo.
function arquivosTs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? arquivosTs(p) : e.name.endsWith(".ts") ? [p] : [];
  });
}

//! Os imports RELATIVOS de um arquivo, já resolvidos para o .ts real.
//! O projeto importa com extensão .js (o Vite resolve); os testes importam com
//! .ts (o node --test exige). Os dois viram o mesmo alvo aqui.
function importsDe(arquivo) {
  const texto = readFileSync(arquivo, "utf8");
  const alvos = new Set();
  for (const m of texto.matchAll(/from\s+"(\.[^"]+)"/g)) {
    const bruto = path.resolve(path.dirname(arquivo), m[1]);
    for (const cand of [bruto.replace(/\.js$/, ".ts"), bruto, bruto + ".ts"]) {
      if (existsSync(cand) && statSync(cand).isFile()) { alvos.add(cand); break; }
    }
  }
  return [...alvos];
}

//! Os imports EXTERNOS (node:, electron, pacote) — é o que M3 examina.
function externosDe(arquivo) {
  const texto = readFileSync(arquivo, "utf8");
  return [...texto.matchAll(/from\s+"([^".][^"]*)"|import\("([^"]+)"\)/g)]
    .map((m) => m[1] ?? m[2]).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// M1 — acoplamento máximo do registrador (o ALVO da corrida, E2 do §1.3a)
// ─────────────────────────────────────────────────────────────────────────────
//! Registrador = arquivo que registra canal de IPC. O teto conta módulos de
//! `sistema/` FORA da própria pasta do registrador (ramo E, decidido pela
//! cabeça): um embrulho compartilhado dentro de sistema/ponte/ não é a "gaveta
//! de bagunça" que a métrica nasceu para pegar, e mudá-lo de casa só para
//! melhorar o número seria fraudar a medida.
function medirM1() {
  const sistema = path.join(RAIZ, "codigos", "sistema");
  const registradores = arquivosTs(sistema).filter((f) =>
    /ipcMain\.(handle|on)\s*\(/.test(readFileSync(f, "utf8")));
  let pior = 0; const detalhe = [];
  const camadaPonte = path.join(sistema, "ponte");
  for (const r of registradores) {
    const fora = importsDe(r).filter((a) =>
      a.startsWith(sistema + path.sep) && !a.startsWith(camadaPonte + path.sep));
    detalhe.push({ arquivo: path.relative(RAIZ, r), n: fora.length,
                   modulos: fora.map((a) => path.relative(sistema, a)) });
    pior = Math.max(pior, fora.length);
  }
  return { valor: pior, registradores: detalhe.sort((a, b) => b.n - a.n) };
}

// ─────────────────────────────────────────────────────────────────────────────
// M2 — ciclos de import (Tarjan)
// ─────────────────────────────────────────────────────────────────────────────
//! Existe porque M1 sozinho é falsificável: dá para baixar o acoplamento
//! criando módulos que se importam em círculo. M2 fecha essa porta.
function medirM2() {
  const nos = arquivosTs(path.join(RAIZ, "codigos"));
  const grafo = new Map(nos.map((n) => [n, importsDe(n)]));
  const idx = new Map(), baixo = new Map(), pilha = [], naPilha = new Set();
  const ciclos = []; let c = 0;
  const forte = (v) => {
    idx.set(v, c); baixo.set(v, c); c++; pilha.push(v); naPilha.add(v);
    for (const w of grafo.get(v) ?? []) {
      if (!idx.has(w)) { if (grafo.has(w)) { forte(w); baixo.set(v, Math.min(baixo.get(v), baixo.get(w))); } }
      else if (naPilha.has(w)) baixo.set(v, Math.min(baixo.get(v), idx.get(w)));
    }
    if (baixo.get(v) === idx.get(v)) {
      const comp = [];
      for (;;) { const w = pilha.pop(); naPilha.delete(w); comp.push(w); if (w === v) break; }
      if (comp.length > 1) ciclos.push(comp.map((f) => path.relative(RAIZ, f)));
    }
  };
  for (const v of grafo.keys()) if (!idx.has(v)) forte(v);
  return { valor: ciclos.length, ciclos };
}

// ─────────────────────────────────────────────────────────────────────────────
// M3 — pureza do domínio
// ─────────────────────────────────────────────────────────────────────────────
//! LISTA-BRANCA, não negra: a planta promete "domínio importa SÓ node:path"
//! (fluxo.md:83 e :96), e lista negra só barra o que alguém previu — `node:os`
//! passava por fora sem violar item nenhum. O que a planta promete, o portão
//! trava (§12·4b). `node:path` é conta de string, não I/O — por isso é o único.
const PERMITIDOS = [/^node:path$/];
function medirM3() {
  const dominio = path.join(RAIZ, "codigos", "dominio");
  const violacoes = [];
  for (const f of arquivosTs(dominio)) {
    for (const e of externosDe(f)) {
      if (!PERMITIDOS.some((p) => p.test(e))) violacoes.push(`${path.relative(RAIZ, f)} importa ${e}`);
    }
    //! o domínio também não pode alcançar sistema/ nem interface/ — seria
    //! dependência para fora do núcleo, e o núcleo é a folha do grafo.
    for (const a of importsDe(f)) {
      const rel = path.relative(path.join(RAIZ, "codigos"), a);
      if (!rel.startsWith("dominio") && !rel.startsWith("compartilhado")) {
        violacoes.push(`${path.relative(RAIZ, f)} alcança ${rel}`);
      }
    }
  }
  return { valor: violacoes.length, violacoes };
}

// ─────────────────────────────────────────────────────────────────────────────
// M4 — conformidade com a árvore do §1.3
// ─────────────────────────────────────────────────────────────────────────────
const NOS_EXIGIDOS = [
  "codigos/compartilhado", "codigos/dominio", "codigos/porta", "codigos/sistema",
  "codigos/sistema/janela", "codigos/sistema/motores", "codigos/sistema/infra",
  "codigos/sistema/servicos", "codigos/sistema/ponte", "codigos/interface",
  "codigos/design", "tests", "kits",
];
function medirM4() {
  const faltam = NOS_EXIGIDOS.filter((n) => !existsSync(path.join(RAIZ, n)));
  return { valor: NOS_EXIGIDOS.length - faltam.length, faltam, total: NOS_EXIGIDOS.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// P5 — a perna de CONDUTA
// ─────────────────────────────────────────────────────────────────────────────
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

//! O sinal tem de ser produzido SÓ pelo JavaScript. A pagina.html tem 72 tags
//! estáticas: "o corpo tem mais de N elementos" nunca poderia falhar, e seria o
//! enfeite que o §12·2 proíbe. `.xterm` só existe se o módulo do renderer rodou.
//! `#btAbrirPasta` entrou na fatia 7, e a escolha dele custou DUAS tentativas:
//!   1. `#sideT` traz "Explorer" escrito no HTML estatico — conferi-lo seria a
//!      mesma asercao que nunca falha que o §12·2 proibe.
//!   2. `#sideAcoes` nasce vazio, mas `arvore-de-arquivos.ts:21` so o preenche
//!      QUANDO HA PASTA ABERTA — e a sonda roda com HOME limpo, sem pasta
//!      nenhuma. O sinal daria vermelho com o codigo certo. Medido, nao suposto.
//!   `#btAbrirPasta` e criado por `desenharArvore()` justamente no caso SEM
//!   pasta ("Nenhuma pasta aberta / Abrir pasta..."), que e o estado da sonda.
//!
//! ⚠️ E `#btAbrirPasta` NAO BASTA — isto foi medido, nao suposto. Sabotei o
//!   `painel-lateral` para nao desenhar a arvore e a sonda seguiu VERDE: e que
//!   `casca-principal.ts:241` chama `desenharArvore()` direto, por outro
//!   caminho. O sinal provava a partida do renderer, nao o despacho de painel.
//!   Por isso a sonda agora CLICA no icone de configuracoes e exige duas coisas:
//!   `#sideT` virar "Configuracoes" (so `definirLateral` escreve ali) e
//!   `#cfgAparencia` ter conteudo (so `desenharConfigAparencia` o preenche, e
//!   para isso ele le `aparencia.atual()`). A cadeia exigida e clique ->
//!   casca-principal -> painel-lateral -> tela-de-configuracoes ->
//!   aparencia-da-casca: atravessa os DOIS ciclos que a fatia 7 desfez.
//!
//! ⚠️ `#apEscurecer` foi tentado antes e REPROVADO pela medicao: e um `range`
//!   que so nasce quando ha papel de parede posto, e a sonda roda com HOME
//!   limpo. Mesmo erro de `#sideAcoes`: sinal escolhido sem medir a pre-condicao.
//!   Duas vezes. Fica escrito porque o custo de repetir e maior que o de ler.
const SINAL = `(async () => ({
  porta: typeof window.terminus,
  xterm: !!document.querySelector('.xterm'),
  aparencia: typeof (await window.terminus.aparencia.estado()),
  lateral: !!document.getElementById('btAbrirPasta'),
  painel: await (async () => {
    document.querySelector('button[data-p="config"]').click();
    await new Promise((ok) => setTimeout(ok, 1500));
    const cfg = document.getElementById('cfgAparencia');
    return document.getElementById('sideT').textContent === 'Configurações'
      && (cfg?.children.length ?? 0) > 0;
  })(),
}))()`;

async function pernaConduta({ silencioso = false } = {}) {
  const dizer = (s) => { if (!silencioso) console.log(s); };
  //! HOME próprio: a partida escreve em ~/.config/terminus e liga symlink em
  //! ~/.config/nvim. Medido. Sem esta linha o portão suja a máquina de quem roda.
  const casa = mkdtempSync(path.join(tmpdir(), "terminus-portao-"));
  const porta = 9200 + Math.floor(Math.random() * 500);
  //! detached: o Electron abre zygote, gpu, network e renderer. Matar só o PID
  //! do pai deixa SEIS processos vivos — medido com ps na v0.5.0. Com grupo
  //! próprio, `kill(-pid)` derruba a árvore inteira.
  const filho = spawn(path.join(RAIZ, "node_modules/.bin/electron"),
    [path.join(RAIZ, "out/main/index.js"), `--remote-debugging-port=${porta}`, "--no-sandbox"],
    { cwd: RAIZ, env: { ...process.env, HOME: casa }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = "";
  filho.stdout.on("data", (d) => (log += d));
  filho.stderr.on("data", (d) => (log += d));
  const encerrar = () => {
    try { process.kill(-filho.pid, "SIGKILL"); } catch { /* já morreu */ }
    try { rmSync(casa, { recursive: true, force: true }); } catch { /* §13.3b: lixo meu, em /tmp, nesta execução */ }
    //! O nvim do PTY nasce em SESSÃO própria e escapa do kill(-pid): recebe o HUP quando o
    //! PTY morre e regrava o shada DEPOIS do rm — foi o que deixou dezenas de
    //! /tmp/terminus-portao-* órfãs na v0.5.0 (medido pelos três laudos, e reproduzido aqui:
    //! o que sobra é exatamente .local/state/nvim/shada/main.shada). A segunda passada,
    //! depois de o HUP assentar, fecha a promessa da linha 14. Limite declarado: a espera
    //! cobre o caso medido (shada regravado em <1 s), não todo caso possível.
    spawnSync("sleep", ["1.5"]);
    try { rmSync(casa, { recursive: true, force: true }); } catch { /* idem */ }
  };

  try {
    let tela = null;
    for (let i = 0; i < 60 && !tela; i++) {
      try {
        const alvos = await (await fetch(`http://127.0.0.1:${porta}/json`)).json();
        tela = alvos.find((a) => a.type === "page" && a.webSocketDebuggerUrl);
      } catch { /* ainda subindo */ }
      if (!tela) await dorme(500);
    }
    if (!tela) { dizer(`${VERM}a tela nunca apareceu no depurador${FIM_COR}\n${log.slice(0, 1500)}`); encerrar(); return { ok: false }; }
    await dorme(2500); //! o módulo do renderer precisa rodar e o xterm abrir

    const ws = new WebSocket(tela.webSocketDebuggerUrl);
    await new Promise((ok, nok) => { ws.onopen = ok; ws.onerror = nok; });
    const resposta = new Promise((ok) => { ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) ok(d); }; });
    ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate",
      params: { expression: SINAL, awaitPromise: true, returnByValue: true } }));
    const r = await Promise.race([resposta, dorme(15000).then(() => null)]);
    ws.close(); encerrar();

    const v = r?.result?.result?.value;
    const vivo = v?.porta === "object" && v?.xterm === true && v?.aparencia === "object"
      && v?.lateral === true && v?.painel === true;
    dizer(`    porta=${v?.porta}  xterm=${v?.xterm}  aparencia=${v?.aparencia}  lateral=${v?.lateral}  painel=${v?.painel}`);
    return { ok: vivo, valor: v };
  } catch (e) { dizer(`${VERM}${e?.message}${FIM_COR}`); encerrar(); return { ok: false }; }
}

// ─────────────────────────────────────────────────────────────────────────────
function rodar(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: RAIZ, stdio: "pipe", encoding: "utf8", shell: false });
  return { ok: r.status === 0, saida: (r.stdout ?? "") + (r.stderr ?? "") };
}

function imprimirMedidas(m, c) {
  const linha = (nome, valor, esperado, ok) =>
    console.log(`    ${ok ? VERDE + "ok  " : VERM + "FALHA"}${FIM_COR} ${nome.padEnd(38)} ${String(valor).padStart(6)}   ${CINZA}(catraca: ${esperado})${FIM_COR}`);
  linha("M1 acoplamento máx. do registrador", m.m1.valor, `≤ ${c.M1}`, m.m1.valor <= c.M1);
  linha("M2 ciclos de import", m.m2.valor, `≤ ${c.M2}`, m.m2.valor <= c.M2);
  linha("M3 violações de pureza em dominio/", m.m3.valor, `≤ ${c.M3}`, m.m3.valor <= c.M3);
  linha("M4 nós da árvore §1.3 presentes", `${m.m4.valor}/${m.m4.total}`, `≥ ${c.M4}`, m.m4.valor >= c.M4);
}

function medirTudo() {
  return { m1: medirM1(), m2: medirM2(), m3: medirM3(), m4: medirM4() };
}

function medidasPassam(m, c) {
  return m.m1.valor <= c.M1 && m.m2.valor <= c.M2 && m.m3.valor <= c.M3 && m.m4.valor >= c.M4;
}

const arg = process.argv[2];

if (arg === "--medidas") {
  const c = catraca(), m = medirTudo();
  console.log(`\n${CINZA}fatia: ${c.fatia}${FIM_COR}`);
  imprimirMedidas(m, c);
  if (m.m1.registradores.length) {
    console.log(`\n${CINZA}    registradores:${FIM_COR}`);
    for (const r of m.m1.registradores) console.log(`${CINZA}      ${String(r.n).padStart(2)}  ${r.arquivo}${FIM_COR}`);
  }
  for (const ciclo of m.m2.ciclos) console.log(`${VERM}    ciclo: ${ciclo.join(" -> ")}${FIM_COR}`);
  for (const v of m.m3.violacoes) console.log(`${VERM}    pureza: ${v}${FIM_COR}`);
  if (m.m4.faltam.length) console.log(`${CINZA}    faltam: ${m.m4.faltam.join(", ")}${FIM_COR}`);
  process.exit(medidasPassam(m, c) ? 0 : 1);
}

if (arg === "--conduta") {
  const r = await pernaConduta();
  console.log(r.ok ? `${VERDE}CONDUTA VIVA${FIM_COR}` : `${VERM}CONDUTA MORTA${FIM_COR}`);
  process.exit(r.ok ? 0 : 1);
}

//* Sem argumento: as CINCO pernas, e o veredito.
const c = catraca();
console.log(`\n${CINZA}PORTÃO — fatia: ${c.fatia}${FIM_COR}\n`);
const pernas = [];

process.stdout.write("  P1 teste da peça      ");
//! ⚠️ PELO SCRIPT DO package.json, e NÃO por comando repetido aqui. Em 24/08 a P1
//!   ganhou um `--import` (o gancho de módulos, tracker §10.1) e este comando ficou
//!   para trás por uma hora: `npm run teste` rodava a suíte inteira e o portão rodava
//!   OUTRA, sem o gancho. Perna declarada num lugar e executada de outro é o §12·4b
//!   ao contrário — o portão mediria uma suíte que não é a declarada. Uma definição só.
//! A trava contra `teste` virar `echo ok` continua de pé logo abaixo: sem `# pass`, a
//!   contagem é 0 e a perna reprova.
const p1 = rodar("npm", ["run", "--silent", "teste"]);
const conta = Number(p1.saida.match(/# pass (\d+)/)?.[1] ?? 0);
const falhas = Number(p1.saida.match(/# fail (\d+)/)?.[1] ?? 0);
//! Suíte VAZIA sai exit 0 — medido. Verde vazio é o enfeite que o §12·2 proíbe:
//!   uma perna que não pode falhar não é perna. Zero teste reprova.
const p1ok = p1.ok && conta > 0;
console.log(!p1.ok ? `${VERM}FALHA${FIM_COR} ${falhas} falharam`
  : conta === 0 ? `${VERM}FALHA${FIM_COR} suíte vazia — verde vazio não é verde`
  : `${VERDE}ok${FIM_COR}    ${conta} passaram`);
if (!p1.ok) console.log(CINZA + p1.saida.split("\n").filter((l) => /not ok|Error|error:/.test(l)).slice(0, 12).join("\n") + FIM_COR);
pernas.push(p1ok);

process.stdout.write("  P2 verificação de tipo ");
const p2 = rodar("npx", ["tsc", "--noEmit"]);
console.log(p2.ok ? `${VERDE}ok${FIM_COR}` : `${VERM}FALHA${FIM_COR}`);
if (!p2.ok) console.log(CINZA + p2.saida.split("\n").slice(0, 12).join("\n") + FIM_COR);
pernas.push(p2.ok);

process.stdout.write("  P3 build               ");
const p3 = rodar("npx", ["electron-vite", "build"]);
console.log(p3.ok ? `${VERDE}ok${FIM_COR}` : `${VERM}FALHA${FIM_COR}`);
if (!p3.ok) console.log(CINZA + p3.saida.split("\n").slice(-15).join("\n") + FIM_COR);
pernas.push(p3.ok);

console.log("  P4 alvo da corrida");
const m = medirTudo();
imprimirMedidas(m, c);
for (const ciclo of m.m2.ciclos) console.log(`${VERM}       ciclo: ${ciclo.join(" -> ")}${FIM_COR}`);
for (const v of m.m3.violacoes) console.log(`${VERM}       pureza: ${v}${FIM_COR}`);
pernas.push(medidasPassam(m, c));

process.stdout.write("  P5 conduta             ");
//! a conduta roda contra out/, então depende do P3. Se o build falhou, ela
//! testaria um pacote velho e mentiria verde — por isso é pulada, não assumida.
let p5 = false;
if (!p3.ok) console.log(`${CINZA}pulada — o build falhou, e ela testaria pacote velho${FIM_COR}`);
else { const r = await pernaConduta({ silencioso: true }); p5 = r.ok;
       console.log(r.ok ? `${VERDE}ok${FIM_COR}    porta+renderer+ipc responderam` : `${VERM}FALHA${FIM_COR} ${JSON.stringify(r.valor ?? {})}`); }
pernas.push(p5);

const verde = pernas.every(Boolean);
console.log(`\n  ${verde ? VERDE + "PORTÃO VERDE" : VERM + "PORTÃO VERMELHO"}${FIM_COR}   ${pernas.filter(Boolean).length}/5 pernas\n`);
process.exit(verde ? 0 : 1);
