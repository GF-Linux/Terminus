#* O tracker da corrida — as pernas do portão, o progresso das fatias e os defeitos achados.

# Tracker — corrida Terminus v0500

> A planta (`docs/fluxo.md`) é **fixa e completa**. Este arquivo é a outra folha (§12·5):
> o que já fechou, com que número, e o que ficou decidido em aberto.

---

## 1. As pernas do portão — declaradas ANTES da fatia 1 (§12·4a)

O portão **não é lista fixa de comandos**: é contrato de três cláusulas. Piso = teste da peça +
verificação de tipo + build. Mais o **alvo da corrida** (b) e uma perna de **conduta** (c).

Cada perna abaixo traz: o comando concreto **neste projeto**, o que ela cobre, **o que fica
descoberto**, e o valor **medido hoje** (2026-08-23, HEAD `ada7bfa`).

### P1 · Teste da peça — §6·R5

```bash
npm run teste          #  →  node --test "tests/**/*.test.ts"
```

> ⚠️ **O comando mudou em 24/08** — ganhou `--import ./tests/apoio/gancho-de-modulos.ts`, e o
> número foi de 26 para 99. O bloco acima fica como está porque é registro **datado** de
> 23/08; a declaração vigente, com os quatro obstáculos medidos, está em **§10.1**.

| | |
|---|---|
| **medido hoje** | **0 testes.** `tests/` **não existe** no alvo, nem na linha de base (`~/projetos/terminus`, mesma HEAD). A corrida começa sem rede nenhuma. |
| **cobre** | a regra de `dominio/` e a ordem de chamada de `sistema/servicos/`, sem subir Electron. |
| **descoberto** | tudo que só existe com o Electron de pé: diálogo nativo, PTY vivo, socket do Neovim, `webContents`. Isso é da perna **P5**, e é por isso que P5 não é opcional. |
| **tradução honesta** | o Node deste ambiente (**v22.23.1**) roda TypeScript **nativo** no `node --test` — medido nesta corrida: 2 testes verdes, exit 0, **zero dependência nova**. Duas consequências medidas, e as duas são custo real: (1) o import do teste precisa da extensão **`.ts`** — com `.js` dá `ERR_MODULE_NOT_FOUND`, medido; (2) por isso o `tsconfig.json` ganha `allowImportingTsExtensions: true` — medido contra o projeto de hoje: `tsc --noEmit` exit **0** e `electron-vite build` exit **0**, nada quebra. O código de produção continua importando `.js`; **só os testes usam `.ts`**. Duas convenções no mesmo repo é o preço, e está escrito aqui porque preço não escrito é preço escondido. |
| **depende de** | **Ramo C** (§4) — se a cabeça escolher Vitest, o comando vira `npx vitest run` e a convenção dupla some. |

### P2 · Verificação de tipo

```bash
npm run typecheck      #  →  tsc --noEmit
```

| | |
|---|---|
| **medido hoje** | exit **0**. |
| **cobre** | tipo, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `strict`. Numa refatoração que move símbolo de arquivo, é o que pega import quebrado e reexport esquecido. |
| **descoberto** | não executa nada. Arquivo que compila e estoura na primeira linha passa aqui. |
| **tradução honesta** | nenhuma — o TypeScript tem o equivalente exato, e ele já está no `package.json`. |

### P3 · Build

```bash
npx electron-vite build
```

| | |
|---|---|
| **medido hoje** | exit **0**; 3 pacotes (`main` 55,07 kB · `preload` 8,12 kB · `renderer` 471,09 kB). |
| **cobre** | os três reinos empacotam; o grafo de import fecha do jeito que o Vite resolve — que **não** é o jeito do `tsc`. Pega o que P2 não pega: entrada do `electron.vite.config.ts` apontando para arquivo que mudou de lugar. |
| **descoberto** | **§12·4a pede "build/empacote", e aqui só existe a metade "build".** O Terminus **não é empacotado** — não há AppImage nem RPM, e o próprio README diz isso em "Ainda não existe". Então a segunda metade da perna **fica descoberta**, e fica escrita como descoberta em vez de carimbada como cumprida. |

### P4 · O ALVO DA CORRIDA — o que o portão mede, o portão TRAVA (§12·4b)

```bash
node ferramentas/portao.mjs --medidas
```

Quatro números. **Nenhum é impresso sem entrar no veredito** — foi exatamente esse o defeito da
v0.4 (o portão imprimia "CICLOS 2 / 1" e devolvia "PORTÃO VERDE", exit 0).

| # | métrica | hoje | alvo | como é medida |
|---|---|:---:|:---:|---|
| **M1** | **acoplamento máximo de registrador** — módulos de `sistema/` que um registrador importa (E2) | **7** | **≤ 2** | grafo de import de `codigos/sistema/ponte/*.ts` |
| **M2** | ciclos de import em `codigos/` | **2** | **0** | componentes fortemente conexos > 1 nó (Tarjan) |
| **M3** | pureza do domínio — imports **não permitidos** em `dominio/` | **n/a** (não existe) | **0** | **lista-branca** desde 24/08: só `node:path` passa. Era lista negra (`electron`, `node:fs`, `node-pty`, `neovim`, `node:child_process`), e `node:os` escapava dela — a planta promete *"só node:path"* (`fluxo.md:83`, `:96`), e o que a planta promete o portão trava (§12·4b) |
| **M4** | conformidade com a árvore do §1.3 | **5/13** | **13/13** | os 13 nós exigidos existem |

**M1 é o alvo declarado da corrida.** Os outros três são pernas de apoio: M2 e M3 são o que
torna M1 verdadeiro em vez de cosmético (dá para baixar M1 criando arquivos que se importam em
círculo, e M2 fecha essa porta), e M4 é a padronização que a corrida existe para entregar.

**A perna é CATRACA, não meta única.** Cada fatia declara o valor esperado ao entrar; o portão
falha se o medido for **pior** que o declarado. Sem isso, uma fatia intermediária ficaria
impedida de fechar por não ter chegado ao alvo final, e a regra viraria letra morta na prática.

**Os números de hoje são reprodutíveis** — foram medidos por script nesta corrida, não estimados:
M1 = 7 (corpo de `registrarPonte`, linhas 317–675, alcança `configuracao-salva`,
`motor-do-shell-pty`, `motor-neovim-pty`, `controle-neovim-rpc`, `arquivos-do-projeto`,
`molde-de-projeto`, `como-rodar-o-projeto`); M2 = 2 (um ciclo de 2 nós entre
`aparencia-da-casca` ↔ `tela-de-configuracoes`, um de 3 nós entre `arvore-de-arquivos` ↔
`barra-lateral` ↔ `painel-de-plugins`).

> ⚠️ **Uma definição precisa ser cravada antes da fatia 1, e ela é do ramo E (§4):** o
> `sistema/ponte/resposta-segura.ts` é módulo de `sistema/`. Contado ao pé da letra, **todo**
> registrador gasta metade do teto num embrulho de `try/catch`. A planta desenha M1 contando
> **módulos de `sistema/` fora de `sistema/ponte/`** — o teto mede o quanto o registrador
> alcança **para fora da própria camada**. Está escrito aqui, e não resolvido em silêncio,
> porque medida definida depois do resultado não é medida.

### P5 · CONDUTA — o programa sobe e responde (§12·4c)

```bash
node ferramentas/portao.mjs --conduta
```

| | |
|---|---|
| **medido hoje** | **VIVA**, exit 0. E a rede **morde**: sabotado o pacote do renderer, foi a **MORTA**, exit 1; restaurado o build, voltou a VIVA. Verde-vermelho-verde conferido nesta corrida (§12·2). |
| **o que ela pergunta** | avalia na tela, por CDP, cinco sinais de uma vez: `typeof window.terminus` (a **porta** subiu) · `!!document.querySelector('.xterm')` (o **renderer** rodou) · `typeof await window.terminus.aparencia.estado()` (o **main** respondeu pelo IPC) · `!!document.getElementById('btAbrirPasta')` (a **lateral** montou) · o clique em `config` exigindo `#sideT` == "Configurações" **e** `#cfgAparencia` com filhos (o **painel** respondeu). Atravessa os três reinos numa chamada. |
| **por que `.xterm` e não "a página tem elementos"** | a `pagina.html` tem **72 tags estáticas**: uma asserção de "o corpo tem mais de N elementos" **nunca poderia falhar**, e seria o enfeite que o §12·2 proíbe. O `.xterm` só existe se o módulo do renderer executou — **sinal que só o JavaScript produz**. Medido: sob sabotagem, `porta` e `aparencia` continuaram vivos e **só o `.xterm` virou `false`**. A perna aponta para a camada certa. |
| **encerra sozinha** | `spawn(..., { detached: true })` dá ao Electron um **grupo de processos próprio**, e o fim mata o grupo (`process.kill(-pid)`). |
| **⚠️ e por que assim** | a primeira versão matou só o PID do pai e **deixou 6 processos vivos** (zygote, gpu, network, renderer) — medido com `ps`, mortos por PID. Matar o pai do Electron **não** mata a árvore. |
| **não suja a máquina** | roda com **`HOME` redirecionado** para pasta temporária. Sem isso a partida escreve em `~/.config/terminus/` e cria **symlinks em `~/.config/nvim/`** (`kits-embutidos.ts`). Medido: com `HOME` trocado, `os.homedir()` e `app.getPath("home")` seguem junto, os arquivos caem na pasta falsa, e o `~/.config/nvim` real ficou com mtime de **17/08** — intocado. |
| **descoberto** | prova que o app **sobe e responde**; **não** prova que o botão certo faz a coisa certa. Clique, diálogo nativo e PTY interativo continuam fora — não há automação de UI aqui, e inventar uma seria escopo novo, não portão. |

### Resumo — as 5 pernas

| perna | comando | hoje | exigido para fechar fatia |
|---|---|:---:|---|
| P1 teste | `npm run teste` (com `--import` do gancho desde 24/08 — §10.1) | **102 testes** | verde, e a peça movida tem teste |
| P2 tipo | `npm run typecheck` | exit 0 | exit 0 |
| P3 build | `npx electron-vite build` | exit 0 | exit 0 |
| P4 alvo | `node ferramentas/portao.mjs --medidas` | M1=7 M2=2 M3=n/a M4=5/13 | ≤ o declarado da fatia (catraca) |
| P5 conduta | `node ferramentas/portao.mjs --conduta` | VIVA | VIVA |

**Sem as cinco verdes, não avança.**

> ⚠️ **Ponteiro, e não reescrita: nasceu uma SEXTA perna em 24/08 — a P6 · conduta em `dev`
> (§17.1).** A tabela acima é registro **datado de 23/08** e falsificá-la seria pior que
> apontar para o novo — é a mesma decisão que a P1 já recebeu na §10.1. A P6 **não tem comando
> próprio de propósito**: ela anda dentro de `npm run teste`, porque o defeito que a fez nascer
> sobreviveu justamente por morar num comando que nenhuma perna rodava.

---

## 2. Fatia 0 — o que precisa existir antes da fatia 1

A rede vem antes do movimento (§12·2). Nada aqui move código de lugar.

- `ferramentas/portao.mjs` — as pernas P4 e P5 num executável (mecanismo já medido nesta corrida).
- `tests/` com o runner escolhido no **ramo C**, e o `package.json` ganhando `teste`.
- `tsconfig.json` com `allowImportingTsExtensions` **se** o ramo C for `node:test`.
- **A rede semeada e sabotada** para a conduta que a fatia 1 vai preservar: a guarda de caminho.
  Escrever o teste que trava o que ela recusa hoje, ver verde, **sabotar a guarda, ver vermelho**,
  restaurar. Enquanto isso não acontecer, não há rede — há enfeite.
- Linha de base commitada com os quatro números de M1–M4, para a catraca ter contra o que comparar.

---

## 3. Defeitos achados — árvores de decisão (§12·3a)

Achados ao medir o alvo, **antes** de mover código. Nenhum foi consertado: consertar dentro da
fatia mistura duas mudanças e o portão verde deixa de dizer qual delas passou.

### D1 · Dois comandos do `package.json` apontam para uma pasta que não existe

| parte | |
|---|---|
| **o defeito** | `package.json:22-23`. `npm run catalogo` → `python3 tools/build_catalog.py` e `npm run fontes` → `python3 tools/extract_fonts.py`. **`tools/` não existe no repositório.** Prova executada no alvo (é a cópia de trabalho, não a linha de base): os dois devolvem `No such file or directory`, **exit 2**. |
| **o que custa deixar** | quem clonar e rodar qualquer um dos dois recebe erro. Não quebra o app — nenhum dos dois participa de `dev`, `build`, `start` ou `typecheck`, medido. O custo é de confiança: um `package.json` com dois comandos mortos faz duvidar dos outros quatro. |
| **as opções** | **(a) deixar como está** — custo zero agora, o erro fica esperando quem tentar. **(b) remover os dois scripts** — uma linha cada; risco: se os `.py` existem fora do repo e alguém os usa, some o atalho (o `.gitignore:22-29` guarda sete caminhos de `tools/comparativo-fantasma/`, o que sugere que `tools/` já existiu). **(c) trazer os dois `.py` de volta** — só a cabeça sabe se eles existem e onde; eu não fui atrás porque a busca me levaria ao segundo cérebro, que é vedado a mim. |
| **minha recomendação** | **(b), na varredura de fechamento da corrida (§12·6), não numa fatia.** É defeito de vitrine, não de código, e a corrida já vai reescrever o `package.json` para acrescentar `teste`. Se a cabeça disser que os `.py` existem, vira (c) e eu os trago. |
| **se ficar para depois** | **igual.** Não apodrece nem encarece: são duas linhas hoje e duas linhas daqui a um ano. |

### D2 · O README descreve uma árvore que o projeto não tem mais

| parte | |
|---|---|
| **o defeito** | `README.md:248-251` desenha a estrutura como `src/main/`, `src/preload/`, `src/renderer/`. Essas três pastas **não existem**: a árvore real é `codigos/{sistema,ponte,interface,compartilhado,design}`. E o próprio README **se contradiz onze linhas antes** — `README.md:237` cita corretamente `codigos/ponte/ponte-para-a-interface.ts`. |
| **o que custa deixar** | é o bloco que um recém-chegado lê para saber onde mexer, e ele manda para pastas inexistentes. Pior depois desta corrida: a árvore vai mudar de novo, e um leitor que confie no README erra **duas** gerações de estrutura de uma vez. Custa também ao agente do próximo despacho, que lê README antes de código. |
| **as opções** | **(a) deixar como está** — o bloco fica errado e fica pior. **(b) corrigir agora** — 4 linhas, mas seriam reescritas de novo no fim da corrida. **(c) corrigir na varredura de fechamento (§12·6)**, junto com todos os outros nomes que a corrida mover, e com a árvore já final. |
| **minha recomendação** | **(c).** O §12·6 já exige que todo nome e caminho que a corrida mover seja procurado no repo inteiro e atualizado; este bloco cai naturalmente nessa passagem, e corrigi-lo antes é escrever duas vezes. |
| **se ficar para depois** | **fica mais barato**, contra a intuição: corrigido no fechamento é uma edição só, com a árvore definitiva na mão. Corrigido agora, são duas. |

### D3 · "ponte" nomeia duas coisas, e a E1 aumenta a confusão antes de resolvê-la

| parte | |
|---|---|
| **o defeito** | não é defeito de código — é de vocabulário, e a E1 o torna agudo. Medido: a palavra "ponte" aparece **22 vezes em 11 arquivos** (fora de `node_modules`/`out`). Dessas, **3 são o caminho** (`electron.vite.config.ts:14`, `codigos/interface/tipos-da-janela.d.ts:1`, `README.md:237`) e **19 são prosa** — e boa parte da prosa quer dizer *preload*: `compartilhado/tipos.ts:1` diz "o que atravessa a ponte", `tipos.ts:3` diz "os três lados (sistema, ponte, interface)", `configuracao-salva.ts:115` diz "ver a ponte". Depois da E1, `ponte` passa a significar **os handlers do main**, e esses 19 comentários passam a apontar para o lugar errado. |
| **o que custa deixar** | renomear só os 3 caminhos deixa o repo com a palavra significando duas coisas ao mesmo tempo — que é exatamente o vão que a E1 nasceu para fechar (§1.3a: *"'ponte' nomeava duas coisas diferentes"*). E é o modo de falha que o próprio PADRAO nomeia: **emenda sem varredura** (§15.4). |
| **as opções** | **(a) renomear só os 3 caminhos** — barato, e deixa a ambiguidade de pé. **(b) renomear os 3 caminhos e varrer as 19 prosas**, trocando por "porta" onde significa preload — cerca de 19 edições de comentário, sem risco de execução (é comentário), mas encosta em 11 arquivos e engorda o diff da fatia. **(c) (b), mas com a varredura de prosa na passagem de fechamento (§12·6)** — a fatia fica limpa, e o fechamento já é obrigado a varrer. |
| **minha recomendação** | **(c).** A E1 é mudança de caminho e entra na fatia; a varredura de vocabulário é exatamente o que o §12·6 manda fazer no fim, e fazê-la lá mantém a fatia legível. |
| **se ficar para depois** | **fica mais caro se ficar para DEPOIS DA CORRIDA** — quanto mais tempo as duas grafias convivem, mais texto novo nasce usando a errada. Dentro da corrida (opção c), o custo é o mesmo. |

---

## 4. Ramos — DECIDIDOS em 2026-08-23 pela concordância dupla (§13.1a)

> ✅ **Planta aprovada.** Os cinco ramos foram decididos pela cabeça e conferidos pelo
> orquestrador. A coluna "decidido" abaixo é a escolha; a recomendação fica ao lado porque o
> registro do que eu propus tem de sobreviver à decisão, para o ciclo 13.2 poder comparar.

| ramo | decidido | era minha recomendação? |
|---|---|---|
| **A** | **A1 + A3** — janela injetada por parâmetro; os 4 `dialog.*` viram `janela/dialogos-do-sistema.ts` | sim |
| **B** | **B1** — `molde-de-projeto` e `como-rodar` vão para `sistema/infra/`. ⚠️ **E o PADRAO foi emendado** (`e38b468`, no repo da lei `~/projetos/jared-agent`, não neste): a árvore do §1.3 não os lista mais em `dominio/`, e a E3 passou a registrar que foi ela quem os tirou | sim |
| **C** | **C1** — `node --test` nativo. A convenção dupla foi aceita **porque foi escrita como preço** | sim |
| **D** | **D1, como fatia final** — os 2 ciclos entram depois de `sistema/` fechado. Contexto que eu não tinha: **eles sobreviveram a duas refatorações anteriores deste alvo**, porque aqueles portões não mediam ciclo | sim |
| **E** | **E2** — o teto conta módulos **fora** de `sistema/ponte/` | sim |

**Os três defeitos herdados entram na corrida:** D1 e D2 no fechamento (§12·6); **D3 na própria
fatia que faz a E1**, não no fim.

---

## 4a. O que eu recomendei, para o registro

| ramo | a pergunta | opções | minha recomendação |
|---|---|---|---|
| **A** | como o registrador alcança a janela? (8 handlers usam `janela` hoje) | **A1** injetada como parâmetro (`registrar(janelaViva)`) — não conta no teto, registrador testável sem Electron · **A2** módulo `janela/janela-viva.ts` importado (queima 1 dos 2) · **A3** `janela/dialogos-do-sistema.ts` embrulha os diálogos (queima 1, centraliza) | **A1 + A3**: a janela entra injetada, e os 4 `dialog.*` viram `dialogos-do-sistema`, que é infra de janela de verdade e não só desvio de contagem |
| **B** | ⚠️ **o §1.3 se contradiz.** A árvore diz que `molde-de-projeto` e `como-rodar` são **`dominio/`**; a emenda **E3**, na mesma seção, diz que são **`sistema/infra/`** | **B1** seguir a E3 (infra) · **B2** seguir a árvore (dominio) · **B3** partir cada um em dois (decisão pura em `dominio/`, disco em `infra/`) | **B1.** Medido: `molde-de-projeto.ts` importa `node:fs` **e** `node:child_process`; `como-rodar-o-projeto.ts` importa `node:fs`. Os dois **violam** "dominio não importa fs" como estão. A E3 é posterior, é explícita e bate com o código. B3 é defensável, mas parte dois arquivos que ninguém pediu para partir. **E o vão em si é do PADRAO, não desta corrida** — é a "emenda sem varredura" do §15.4 acontecendo dentro do §1.3, e quem corrige o PADRAO é a cabeça. |
| **C** | qual runner de teste? | **C1** `node --test` nativo — zero dependência, TypeScript direto (medido verde), custo: import `.ts` nos testes e `.js` na produção · **C2** Vitest — resolve `.js`→`.ts` como o Vite do próprio app, uma convenção só, custo: devDependency nova · **C3** `tsx` + `node:test` | **C1.** O §7 manda recusar o que não medimos precisar, e o Node desta máquina já entrega o que a corrida pede. A convenção dupla é feia, mas está escrita, é local aos testes, e não entra no pacote |
| **D** | os **2 ciclos** de `interface/` entram na corrida? | **D1** entram — M2 vira 0 e a planta ganha `painel-lateral.ts` · **D2** ficam fora — a corrida é só de `sistema/`, e M2 sai das pernas · **D3** entram como **última** fatia, depois de `sistema/` fechado | **D1, mas como fatia final.** M2=0 é o que impede M1 de ser cosmético; deixá-lo fora tira do portão a única perna que pega "baixei o acoplamento criando dependência circular". A planta já desenha `painel-lateral.ts` |
| **E** | o teto do E2 conta `sistema/ponte/resposta-segura.ts`? | **E1** conta ao pé da letra — todo registrador gasta 1 dos 2 num `try/catch` · **E2** o teto conta módulos **fora** de `sistema/ponte/` · **E3** empurrar `respostaSegura` para `dominio/` para escapar da conta | **E2.** O E1 do PADRAO nasceu medindo *"quantos módulos o registrador importa"* para pegar **gaveta de bagunça**; um embrulho compartilhado dentro da própria camada não é isso. E **E3 seria fraudar a métrica** — `respostaSegura` não é regra de negócio, e mudá-la de casa para melhorar o número é exatamente o que o §12·4b proíbe |

---

## 5. Progresso das fatias — CORRIDA FECHADA em 2026-08-23

A trajetória de M1 foi declarada **antes** de cada fatia. Onde a previsão errou, o portão
reprovou e o número foi re-declarado **com a causa medida** — nunca com o alvo final movido.

| # | fatia | M1 decl. | M1 medido | M2 | M3 | M4 | portão | commit |
|---|---|:---:|:---:|:--:|:--:|:--:|:---:|---|
| 0 | o portão, a catraca e o runner | 8 | 8 | 2 | 0 | 5/13 | andaime | `ff4653b` |
| 1 | a guarda vira `dominio/` + `infra/` | 10 | 10 ✔ | 2 | 0 | 8/13 | **5/5** | `9eeb50a` |
| 2 | E1: `ponte/` → `porta/` + varredura D3 | 10 | 10 ✔ | 2 | 0 | 9/13 | **5/5** | `2e07a94` |
| 3 | `motores/` e `infra/` recebem os 9 | 10 | 10 ✔ | 2 | 0 | 10/13 | **5/5** | `2142b45` |
| 4 | `janela/` — A1 + A3 | 10 | **12 ✗** | 2 | 0 | 12/13 | **5/5** | `048c11d` |
| 5 | `servicos/` — o caso de uso | 11 | 11 ✔ | 2 | 0 | 13/13 | **5/5** | `1198cb1` |
| 6 | `ponte/` — os 8 registradores | **2** | **2 ✔** | 2 | 0 | 13/13 | **5/5** | `07b7c0e` |
| 7 | `interface/` — os 2 ciclos | 2 | 2 ✔ | **0** | 0 | 13/13 | **5/5** | `2920c30` |
| — | fechamento: varredura e vitrine | 2 | 2 ✔ | 0 | 0 | 13/13 | **5/5** | — |

**A única previsão errada foi a da fatia 4**, e o portão a pegou (exit 1). Causa medida, aresta
a aresta: saiu `infra/kits-embutidos` (foi para a partida) e entraram três —
`janela/dialogos-do-sistema`, `janela/janela-principal` (só pelo `RAIZ_APP`) e
`infra/argumentos-da-partida`. 10 − 1 + 3 = 12.

### O placar da corrida

| métrica | partida | chegada |
|---|:---:|:---:|
| **M1 acoplamento máximo do registrador** | **8** | **2** |
| M2 ciclos de import | 2 | **0** |
| M3 violações de pureza em `dominio/` | — (não existia) | **0** |
| M4 conformidade com a árvore §1.3 | 5/13 | **13/13** |
| testes | **0** | **26** |
| arquivos `.ts` em `codigos/` | 28 | **58** |
| maior arquivo de `sistema/` | **707 linhas** (o monólito) | **285** — o `motor-do-shell-pty`. Era **289** (o `configuracao-salva`, que já tinha 289 antes) até a árvore **A1** apagar o `lerDoTwinny` em 24/08 e o arquivo cair para 228 |
| canais de IPC | 37 | **37 — idênticos** |

---

## 6. Conduta preservada — como foi conferido

- **Os 37 canais** foram extraídos por script e comparados com `diff` **duas vezes** (depois da
  fatia 5 e da fatia 6). Idênticos nas duas: nenhum nasceu, morreu ou trocou de nome.
- **As mensagens de recusa** foram movidas palavra por palavra. A guarda que recusa hoje recusa
  depois, com o mesmo texto na tela.
- **A ordem das três etapas do `confinado`** — recusar o texto, resolver o link, decidir — foi
  preservada, e é a regra: `path.resolve("-c")` vira um caminho DENTRO da raiz.
- **A ordem de `entrarNaPasta`** — ler a pasta antes de registrar nos recentes — foi preservada,
  e é o que faz uma pasta que sumiu do disco sair da lista em vez de voltar para ela.
- **A perna P5 subiu o aplicativo de verdade a cada fatia**, com `HOME` redirecionado.

---

## 7. Os defeitos, no fim

| # | o que era | como fechou |
|---|---|---|
| **D1** | `npm run catalogo` e `npm run fontes` apontavam para `tools/*.py` inexistente (exit 2 os dois) | **os dois scripts saíram do `package.json`** |
| **D2** | `README:248-251` desenhava `src/main\|preload\|renderer`, que não existem | **o bloco passou a desenhar a árvore real**, e a varredura achou **mais dois**: `README:443` e **`LICENSE:28`**, que apontavam para `src/renderer/fontes/` |
| **D3** | "ponte" nomeava duas coisas; 19 menções em prosa queriam dizer *preload* | **12 trocadas na própria fatia da E1.** As outras são a marca do produto ("uma ponte amigável") e ficaram |
| **D4** | `localizador-do-python.ts` exporta `acharPython()` e **ninguém o importa** | **NÃO consertado.** Movido para `infra/` junto com os outros, para preservar conduta. Árvore de decisão abaixo |
| **D5** | `codigos/design/fontes.css:1` mandava *"rode o gerador"* — o gerador é o `tools/extract_fonts.py` que o D1 removeu | **corrigido**: é cauda direta do D1, e deixá-lo faria o repo mentir |

### D4 · o módulo órfão — árvore de decisão (§12·3a)

| parte | |
|---|---|
| **o defeito** | `codigos/sistema/infra/localizador-do-python.ts` (20 linhas) exporta `acharPython()`. Busca larga por `localizador\|localizarPython\|acharPython` em `.ts`, `.json`, `.md` e `.html`, fora de `node_modules` e `out`, achou **só a própria planta**. Nada no código o chama |
| **o que custa deixar** | 20 linhas que o `tsc` compila, o Vite empacota e ninguém executa. Custa **atenção**: quem for mexer no Rodar do Python vai lê-lo achando que está no caminho, e ele não está. Não custa comportamento — não roda |
| **as opções** | **(a) deixar** — custo zero hoje, a confusão fica. **(b) apagar** — 20 linhas a menos; risco: se ele era o começo de um recurso planejado, a intenção some junto. **(c) manter e marcar** com um `//?` dizendo que está fora do caminho e por quê — custo de uma linha, e a próxima pessoa não perde tempo |
| **minha recomendação** | **(c) agora, (b) depois.** Só a cabeça sabe se `acharPython` era semente de recurso. Marcar custa uma linha e resolve o custo real, que é de atenção. Se a cabeça disser que não era semente, (b) |
| **se ficar para depois** | **igual.** Não apodrece: 20 linhas hoje, 20 linhas daqui a um ano |
| **DESFECHO** | **(c) aplicada em 24/08/2026, decidida pela cabeça** (plano 02 do sugestor, P7): a marca `//?` está em `localizador-do-python.ts:11-12`. **(b) — apagar — segue em aberto**, e só a cabeça fecha, porque só ela sabe se `acharPython` era semente de recurso. Este é o caso que fez o §12·3a ganhar o quinto dever: a recomendação "(c) agora" ficou 24 h sem ser posta nem recusada |


---

## 8. Corrida 2 — 24/08/2026: as árvores e os seus DESFECHOS (§12·3a·5)

> **Por que esta seção existe:** em 24/08 o §12·3a ganhou o **quinto dever** — *toda árvore
> devolvida tem desfecho registrado: aplicada, recusada ou adiada, com quem decidiu e quando*.
> O D4 da seção 7 é o caso que fez a regra nascer (recomendou "(c) agora" e a marca nunca foi
> posta nem recusada). Aqui nenhuma árvore sai sem a linha de desfecho.

| árvore | o que era | desfecho |
|---|---|---|
| **A1** | `lerDoTwinny` — 59 linhas em `configuracao-salva.ts` que abriam o `state.vscdb` do VS Code por `sqlite3` e devolviam endpoint, modelo e **chave de API** do provedor FIM do Twinny. **Sem chamador**, e o comentário afirmava *"Só é chamado quando o usuário aperta o botão"* — não existia botão | **(a) aplicada em 24/08/2026, decidida pela cabeça:** apagada. `Twinny` tem hoje **zero** ocorrências no repo. Se a importação virar recurso um dia, ela se reescreve a partir do git — e nasce revisada, com botão de verdade |
| **A2** | o botão ↗ do terminal anunciava *"Konsole aberto em …"* mesmo sem `konsole` na máquina: `abrirNoKonsole` devolvia a pasta **sincronamente**, e o ENOENT chegava depois, no `filho.on("error", () => {})`, onde morria. O `README:293-295` promete o contrário | **(a) aplicada em 24/08/2026, decidida pela cabeça:** conserto **só no motor** — ele passa a devolver `Promise<string>`, resolvendo no primeiro de {`spawn`, `error`}. Ponte, casca e README **não mudaram**: `respostaSegura` já aceitava `Promise<T> | T` e o ramo de erro da casca (:113) só era **inalcançável**. Medido de ponta a ponta — ver abaixo |
| **A4** | `ehNossaLigacao` (`kits-embutidos.ts`) diz *"nossa"* para **qualquer** symlink, então um symlink do usuário chamado `terminus-*` é apagado e refeito a cada partida — contra o item 5 do cabeçalho do arquivo e contra o `README:178-179` | **(b) aplicada em 24/08/2026, decidida pela cabeça** — a variante do executor, medida em **4 de 4**: é nossa se o alvo cai na origem atual **ou** se o caminho tem a forma `…/kits/{funcoes,editor}/…`. Ver §10.5 |
| **A5** | capacidade viva sem uso: os canais `arquivo:ler` e `arquivo:gravar` expostos e registrados **sem nenhum chamador no renderer**, mais dois exports órfãos sem porquê (`shellEstaVivo`, `neovimRodando`) | **(b) aplicada em 24/08/2026, decidida pela cabeça:** os dois canais **ficam e ficam REGISTRADOS** (comentário `//?` na porta + esta árvore); os dois `EstaVivo` **saíram** — órfãos sem porquê, sem plano e sem teste |
| **A6** | **achada pelo terceiro ato**, e por mais nada: os canais `neovim:parar` e `shell:pasta` estão registrados no main e expostos na porta, e **nenhum código do renderer os chama**. Não aparecem em nenhum laudo, nem na matriz, nem no plano | **(b) aplicada em 24/08/2026, decidida pela cabeça:** os DOIS canais **ficam e ficam REGISTRADOS** — marca `//?` na porta, árvore aqui. A contagem segue **37**, e é de propósito: 37 é a prova de conduta preservada da corrida 1, e não se gasta uma prova para arrumar capacidade dormente já documentada. Ver §10.6 |
| **A3** | criar/renomear confinam contra a raiz que o CHAMADOR envia, por comparação textual; `gravar` usa realpath + raízes do dono | **(b) aplicada em 24/08/2026, decidida pela cabeça:** conduta fica, comentário passa a dizer a verdade (P4), e o fundo fica registrado aqui. **(a) — uniformizar — APLICADA em 24/08/2026**, na corrida 3, depois que `servicos/` ganhou rede de teste, que era a condição escrita aqui. Ver §10.1 e o commit da A3(a) |

### A3 · o confinamento assimétrico — árvore de decisão (§12·3a)

| parte | |
|---|---|
| **o defeito** | `arquivos-do-projeto.ts:134-139` (`dentroDe`) compara **texto**, sem `realpath`, contra a `raiz` que veio do renderer; `escrita-confinada.ts:18-25` (`confinado`) resolve o link e confere contra `raizesDeEscrita()` — as raízes que o **dono** conhece. Os dois caminhos saem do mesmo registrador (`ponte-arquivo.ts`). **Herdado**: a infra é byte-idêntica à linha de base fora dois imports |
| **o que custa deixar** | um renderer **já comprometido** cria ou renomeia fora da pasta aberta passando uma raiz arbitrária. Risco baixo — exige o renderer comprometido antes — e uma assimetria real entre canais vizinhos. Com o P4 aplicado, o custo de **ilusão** morre: o comentário deixa de prometer o que o código não faz |
| **as opções** | **(a) uniformizar** — os três `*NoProjeto` resolvem a raiz pelo dono e validam com `confinado()` antes de delegar. **Muda conduta**: pedido com raiz fora das abertas passa a ser recusado, e a frase de recusa e o comportamento da árvore da interface precisam ser decididos. E hoje **não há teste de serviço** — pela ordem do §12, primeiro a rede, depois o movimento. **(b) deixar como está + P4 + registrar** aqui como herdado conhecido. **(c) deixar sem registro** — não é opção |
| **minha recomendação** | **(b) agora**; (a) como candidata de corrida futura, quando `servicos/` tiver teste — aí o §12 se cumpre inteiro (rede antes da mudança de conduta) |
| **se ficar para depois** | **fica mais BARATA depois** da rede de teste de serviço |

### A1 · `lerDoTwinny` — a função órfã que lia uma chave de API (§12·3a)

| parte | |
|---|---|
| **o defeito** | `configuracao-salva.ts:230-288` (antes de apagar) abria o `state.vscdb` do VS Code por `sqlite3` e devolvia `{endpoint, modelo, chave}` do provedor FIM do Twinny. **Busca larga minha, insensível a caixa, no repo inteiro: só a definição.** Zero chamadores, zero menção em docs. Herdado — a linha era idêntica na linha de base (`git show ada7bfa`). Prova estática; nada precisou executar |
| **o que custa deixar** | hoje nada roda, e eu **medi um limite que o plano não tinha medido**: a função também **não estava no pacote construído** (`grep -c twinny out/main/index.js` = 0) — sem chamador, o empacotador já a descartava. O custo real é outro, e é duplo: **(1)** qualquer chamador futuro liga leitura de segredo já "documentada" como se tivesse UI, sem revisão; **(2)** o comentário falso dava aparência de coisa ligada e auditada |
| **as opções** | **(a) apagar as 59 linhas** — os imports do topo ficam (`os`, `fs` e `path` são usados pelo resto do arquivo, conferido). **(b) manter + corrigir o comentário + marcar como órfão** — a intenção fica, e o risco (1) também. **(c) deixar como está** — é a única que mantém de pé um comentário FALSO sobre função capaz de ler segredo |
| **minha recomendação** | **(a)**. Zero chamadores medidos por dois auditores e por mim. Se a importação do Twinny virar recurso um dia, ela se reescreve numa tarde a partir do git — e nasce revisada |
| **se ficar para depois** | o custo de apagar não muda; o risco (1) cresce a cada corrida que move o arquivo sem olhar dentro — esta já foi uma |
| **DESFECHO** | **(a) aplicada em 24/08/2026, decidida pela cabeça** (plano 02 do sugestor, árvore A1) |

### A2 · o botão do Konsole anunciava sucesso falso (§12·3a)

| parte | |
|---|---|
| **o defeito** | `motor-do-shell-pty.ts:261-285` (antes) devolvia a pasta **sincronamente**. O ENOENT de `spawn` **não é síncrono**: chega pelo evento `error`, depois de `seguro()` já ter respondido — e o ouvinte `filho.on("error", () => {})` o engolia. `casca-principal.ts:110` então exibia *"Konsole aberto em …"*, e o ramo de erro (:113) era **inalcançável** para esse caso. O próprio motor confessava o mecanismo (:278-280) e declarava a intenção certa (:264-266). Herdado byte a byte da linha de base |
| **o que custa deixar** | numa máquina **sem `konsole` — fora do KDE, exatamente o público que o README endereça** — o botão anuncia sucesso falso, e a vitrine promete um comportamento que não existe. Custa a quem chega antes de poder conferir |
| **a prova, medida por mim de ponta a ponta** | sonda de uso único (renderer → porta → ponte → `seguro` → motor, por CDP, com `HOME` e `PATH` próprios; `PATH` = cópia de `/usr/bin` **sem** `konsole`). **Código antigo, sem konsole: `{"ok":true,"valor":"…"}`** — a tela diria "Konsole aberto". **Consertado, sem konsole: `{"ok":false,"erro":"o \\`konsole\\` não está instalado nesta máquina."}`**. **Consertado, com konsole: `{"ok":true,"valor":"…"}`**. Verde-vermelho-verde, e o vermelho é o do código de ontem |
| **as opções** | **(a) conserto no motor, e só nele** — `Promise<string>` resolvida no primeiro de {`spawn`, `error`}. **(b) rebaixar a vitrine** — reescrever o README dizendo que a falha é silenciosa; oficializa um botão que mente. **(c) deixar sabendo** — a vitrine continua falsa |
| **minha recomendação** | **(a)** — a única em que código, tela e README dizem a mesma coisa |
| **a dependência que o plano declarou sem medir, e que eu medi** | o evento `spawn` exige Node ≥ 15.1. **Neste runtime: Electron 33 embute Node v20.18.3, o evento existe e dispara**, e o programa ausente chega como `error` com `code === "ENOENT"`. O plano B (resolver por timeout) **não é necessário** |
| **⚠️ o que fica DESCOBERTO** | a sonda que provou o conserto é de **uso único** e morreu com a sessão. **Nenhuma perna do portão guarda esta conduta**: P1 só cobre `dominio/`, e a P5 sobe o app mas não aperta o botão. Se alguém devolver `abrirNoKonsole` ao retorno síncrono amanhã, **o portão fica verde**. Uma rede permanente exigiria teste de motor, que este repositório não tem — a mesma lacuna que o A3(a) espera. **Declarado, não resolvido** |
| **DESFECHO** | **(a) aplicada em 24/08/2026, decidida pela cabeça** (plano 02 do sugestor, árvore A2) |

### A4 · `ehNossaLigacao` aceita qualquer symlink — árvore de decisão (§12·3a) · **RESOLVIDA em 24/08, variante (b)** — ver §10.5

| parte | |
|---|---|
| **o defeito** | `kits-embutidos.ts:66-73` devolve verdadeiro para **qualquer** symlink; `ligarUm` então apaga e refaz. O item 5 do cabeçalho do próprio arquivo promete o critério que a função não tem (*"um arquivo que já existe e NÃO é ligação nossa é deixado em paz"*), e o `README:178-179` repete a promessa (*"o Terminus não o toca e avisa"*). Herdado — movido com diff zero |
| **o que custa deixar** | um symlink do usuário com nome `terminus-*` em `~/.config/nvim/snippets/…` ou `~/.config/nvim/lua/plugins/` é sobrescrito **em silêncio a cada partida**. Raio limitado pelo prefixo; promessa quebrada real, em dois lugares |
| **⚠️ POR QUE A OPÇÃO (a) NÃO FOI APLICADA — e é medição, não receio** | o plano propôs conferir se o **alvo** do link cai dentro de `kits/`. Montei uma fixture isolada com os quatro casos e medi o predicado velho e o proposto. O proposto **acerta 2 e erra 2**: |
| | `terminus-basico` (nossa, apontando para a cópia que roda) → **REFAZ** ✔ |
| | `terminus-do-usuario` (link alheio com nosso prefixo) → **RESPEITA** ✔ — é o caso que a árvore existe para consertar |
| | `terminus-velha` (**nossa**, apontando para uma cópia anterior do Terminus) → passa a **RESPEITAR** ✘ — o usuário fica em silêncio com os kits da cópia velha |
| | `terminus-pendurada` (**nossa**, e a cópia antiga sumiu) → passa a **RESPEITAR** ✘ — e este é o pior: o link fica pendurado **para sempre**, o kit nunca mais funciona, e é **exatamente** o caso que o comentário de `ligarUm` diz que a refeitura existe para consertar (*"se o Terminus mudou de pasta, a antiga aponta para o vazio e o editor deixaria de achar o kit em silêncio"*) |
| **as opções** | **(a) como o plano escreveu** — alvo dentro da origem atual. Conserta o caso do usuário e **cria** dois silêncios novos. **(b) por FORMA do caminho** — é nossa se o alvo cai na origem atual **ou** se o caminho tem a forma `…/kits/{funcoes,editor}/…`. Medida na mesma fixture: **4 de 4**. Custa uma heurística de forma, que é mais frouxa que a de lugar. **(c) deixar como está**, com a marca `//?` que já foi posta — a promessa do README continua falsa. **(d) rebaixar a promessa** no README e no cabeçalho: *"symlink com nome `terminus-` é considerado nosso e refeito"* — três linhas, e oficializa sobrescrever coisa alheia |
| **minha recomendação** | **(b)**, e a razão é que ela é a única medida em 4 de 4. Mas **(b) não estava na mesa que a cabeça aprovou** — a aprovação foi de (a) —, e (b) muda conduta em três casos em vez de um. Por isso não a apliquei: rumo é da cabeça, e o cardápio, com os números, é meu |
| **se ficar para depois** | **igual** — nenhuma das opções encarece. O que corre é o silêncio: cada partida com um link alheio no lugar o sobrescreve de novo |
| **DESFECHO** | **(b) aplicada em 24/08/2026, decidida pela cabeça.** A marca `//?` saiu do código, substituída pela implementação e pelo porquê. Os quatro casos viraram **rede permanente** (`tests/infra/kits-embutidos.test.ts`) — ver §10.5 |

### A5 · capacidade viva sem uso — árvore de decisão (§12·3a)

| parte | |
|---|---|
| **os fatos, todos conferidos por mim** | `arquivo:ler` e `arquivo:gravar` estão expostos na porta e registrados em `ponte-arquivo.ts` — e **nenhum código de `interface/` os chama**. Busca larga por nome de canal e por nome de método: zero. `lerParaEditor` lê qualquer arquivo do disco **de propósito e com o porquê escrito** (`leitura-de-arquivo.ts`: *"o traceback clicável abre o quadro dentro da biblioteca […] Fechar aqui quebraria o salto do traceback"*). Além deles, dois exports órfãos **sem** porquê: `shellEstaVivo` e `neovimRodando` — nem teste os usava |
| **o que custa deixar** | os canais são alcançáveis por qualquer código do renderer; hoje ninguém os chama, mas **um renderer comprometido chama**. É superfície carregada antes do uso. Por isso não é cosmético: o laudo A pôs `arquivo:ler` no eixo **Segurança** |
| **as opções** | **(a) remover os dois canais** (porta + registro) e o que ficar órfão por arrasto — **atenção ao arrasto**: `gravarConfinado` é a peça-vitrine do confinamento (realpath + guarda + raízes do dono, com os 26 testes do domínio embaixo); removê-la por arrasto seria jogar fora a melhor peça por causa da superfície da pior. **(b) manter e REGISTRAR** — a capacidade planejada fica escrita na porta e aqui, e os dois `EstaVivo` saem. **(c) deixar tudo sem registro** — não é opção |
| **minha recomendação** | **(b)**. O porquê do ler-largo está escrito e é bom; o que faltava era o registro da capacidade dormente — a mesma família do D4. Removê-la é decisão de **produto** sobre uma feature (traceback clicável) que só a cabeça sabe se vive |
| **se ficar para depois** | igual — e o terceiro ato do §12·6, nascido em 24/08, faz o próximo fechamento listar isto de ofício |
| **DESFECHO** | **(b) aplicada em 24/08/2026, decidida pela cabeça** (plano 02 do sugestor, árvore A5). Fica **em aberto** para a cabeça: se o traceback clicável foi abandonado, (a) ganha força para `arquivo:ler` — o `gravar` fica, que é o confinado |

### A6 · dois canais expostos sem chamador — árvore de decisão (§12·3a) · **RESOLVIDA em 24/08, os dois FICAM registrados** — ver §10.6

> **De onde veio:** nenhum humano e nenhum auditor apontou estes dois. Eles saíram do **terceiro
> ato do §12·6**, que nasceu em 24/08 justamente porque a varredura anterior era cega para o que
> o repositório carrega **parado**. É o ato pagando o próprio preço no primeiro uso.

| parte | |
|---|---|
| **o defeito** | **`neovim:parar`** — registrado em `ponte-neovim.ts:77`, exposto em `porta:116` como `api.neovim.parar()`. Nenhuma chamada no renderer (`interface/` **e** `design/`, busca larga). **`shell:pasta`** — registrado em `ponte-shell.ts:67-68`, exposto em `porta:144` como `api.shell.pasta()`. Nenhuma chamada. Nos dois casos **a função do motor está viva** e é usada pelo próprio main (`pararNeovim` em `janela-principal.ts:67` e `partida.ts:43`; `pastaDoShell` em `abrirNoKonsole`) — o que está morto é **o canal**, não a peça |
| **o que custa deixar** | superfície de IPC alcançável por qualquer código do renderer, sem nenhum uso. `neovim:parar` deixa o renderer **matar o editor**; `shell:pasta` entrega a pasta corrente do shell. Hoje ninguém chama — um renderer comprometido chama. É a mesma família do A5, e a mesma gravidade: pequena, e real |
| **as opções** | **(a) remover os dois canais** (registro + porta), preservando `pararNeovim` e `pastaDoShell`, que o main usa. Muda a contagem de canais de **37 para 35** — e essa contagem é a prova de conduta preservada da corrida 1, então o número teria de ser re-declarado com a causa. **(b) manter e REGISTRAR**, como o A5 fez: comentário na porta dizendo que dormem e por quê, se houver um porquê. **(c) deixar sem registro** — não é opção |
| **minha recomendação** | **(a) para `neovim:parar`** — não achei intenção escrita para ele, e é o que tem o maior raio (mata o editor). **(b) para `shell:pasta`**, se a cabeça souber de uso planejado; **(a)** se não souber. **Não apliquei nenhuma das duas**: são conduta, não estavam no plano aprovado, e mexem no número que a corrida 1 usou como prova |
| **se ficar para depois** | **igual** — não apodrece. O que muda é que o próximo fechamento os lista de novo, de ofício |
| **DESFECHO** | **(b) aplicada em 24/08/2026, decidida pela cabeça** — os dois ficam, registrados na porta com `//?`, e a contagem de canais **não se mexeu**. Ver §10.6 |

---

## 9. Fechamento da corrida 2 — 24/08/2026 · os TRÊS atos do §12 passo 6

> O passo 6 passou de **dois** atos para **três** em 24/08 (`jared-agent`, commit `28f2672`).
> O terceiro é novo, e nasceu porque a varredura da corrida 1 era escopada ao *"que a corrida
> moveu"* — escopo certo para o que cobre, e cego por construção para o que o repositório
> carrega **parado**. Este é o primeiro fechamento a rodá-lo.

### Ato 1 — varredura do que a corrida MOVEU

| nome/número removido ou mudado | onde ficou |
|---|---|
| `lerDoTwinny`, `Twinny` | **0 em código.** As 5 menções restantes são a árvore A1 no próprio tracker — registro, não uso |
| `shellEstaVivo`, `neovimRodando` | **0 em código.** As 2 restantes são a árvore A5 aqui |
| `PROIBIDOS` (a lista negra do M3) | **0 no repo** — trocada por `PERMITIDOS`, e `tracker:70`, que a descrevia por extenso, foi sincronizada |
| `legado-extensao`, `extensionHost`, `*.vsix`, `make_ab1`, `comparativo-fantasma` | **0**, exceto `tracker:150` — prosa datada da árvore do D1, **listada e não alterada** de propósito |
| as 3 frases de comentário trocadas (P2, P4) | **0 ocorrências** de cada uma |
| **canais de IPC** | **37**, e o instrumento largo confirma: **idênticos ao fechamento da corrida 1 (`5c7dbd8`) E à linha de base (`ada7bfa`)**. Nenhum nasceu, morreu ou trocou de nome |
| `.ts` em `codigos/` | **58** — inalterado (nenhum arquivo nasceu ou morreu) |
| testes | **26**, todos verdes |
| maior arquivo de `sistema/` | era **289** (`configuracao-salva`), hoje **285** (`motor-do-shell-pty`) — `tracker:239` atualizada, com a causa |

⚠️ **Um erro meu de instrumento, registrado porque o método é o que precisa ser auditável
(§15.4):** contei os canais três vezes e obtive **21**, **38** e **37**. O 38 veio de somar
`grep -c` por arquivo (contava linha de comentário junto); o 21, de um regex de uma linha só
(perdia as chamadas quebradas em várias linhas). **37 é o número, e é o que os docs já diziam.**
Só o instrumento largo — regex com `re.S` sobre o arquivo inteiro — bate com a fonte.

### Ato 2 — vitrine conferida

| afirmação do README | conferida como | resultado |
|---|---|---|
| `npm run teste` — *"26 testes"* | **rodado** | 26 passaram, 0 falharam |
| `npm run typecheck` | **rodado** | exit 0 |
| `npm run portao` — *"as cinco pernas"* | **rodado** | **VERDE 5/5** |
| a descrição do portão (:80-85) | lida contra `portao.mjs` | verdadeira: roda teste, tipo e build, mede M1-M4, trava em cada um, e sobe o app com `HOME` redirecionado |
| **`README:16` — "Estado: v0.0.7"** | contra `package.json:5` **e** o topo do changelog | **os três dizem 0.0.7.** É a cláusula que a L2 acrescentou ao segundo ato, e ela fecha aqui |
| `npx electron-rebuild -f -w node-pty` | **medido**: `node-pty` carregado dentro do runtime do Electron, com um PTY real respondendo | carrega e responde |
| o bloco do lançador (`media/icon.png`, `media/terminus.desktop`) | `test -f` nos dois | os dois existem |
| os 6 scripts do `package.json` | `build`, `typecheck`, `teste` rodados; `portao` rodado | exit 0 em todos |
| `git clone git@github.com:GF-Linux/Terminus.git` | **NÃO conferido** | rede e `ssh` estão fora do que me é permitido. Fica declarado, não presumido |

### Ato 3 — varredura do que NINGUÉM moveu

**(a) exportado e canal SEM chamador, nome a nome, fora de `node_modules`/`out`.**

| | |
|---|---|
| símbolos exportados em `codigos/` | **175**, examinados um a um |
| **órfão de verdade** (sem uso em lugar nenhum) | **1** — `acharPython` (é o **D4**, já marcado e com desfecho). As 4 menções dele são documentação: órfão **conhecido**, não órfão **usado** |
| exportados usados só dentro do próprio arquivo | **14** — `export` mais largo que o necessário. **Observação, não defeito**: têm chamador, e estreitar seria mexer no que ninguém pediu |
| canais registrados | **37**, cada um seguido até o renderer |
| **canais expostos sem chamador** | **4** — `arquivo:ler` e `arquivo:gravar` (**A5**, registrados) e **`neovim:parar` e `shell:pasta`** (**A6 — achados aqui, por mais nada**) |

⚠️ **O instrumento do (a) foi construído, reprovado e refeito — e isto é o mais importante
deste fechamento.** A primeira versão contava **menção** como **chamador**, e falhou duas vezes
de formas instrutivas: **(1)** copiei o script para dentro da árvore examinada, e o
*comentário do próprio script* citava `lerDoTwinny` — o medidor se escondeu de si mesmo;
**(2)** uma linha de prosa neste tracker esconderia qualquer órfão que eu tivesse acabado de
registrar. É o modo de falha nº 7 do §15.4 (*"o grep contou o texto junto do código"*), vivo.
A versão 2 separa **código** de **prosa** e roda **de fora** da árvore. **Validação:** contra a
árvore de ontem (`5c7dbd8`), ela acha **os quatro** órfãos que existiam — inclusive o
`lerDoTwinny`, que é exatamente o que a varredura da v0.5.0 perdeu e que fez esta lei nascer.
Instrumento que não morde nada não prova nada; este morde, e a mordida foi medida.

**(b) resto de produto anterior — o que este repositório já foi.**

| resto | destino |
|---|---|
| `.vscode/launch.json` e `tasks.json` (extensão de editor), `tsconfig` excluindo `legado-extensao`, `*.vsix`, bloco `tools/comparativo-fantasma/*` no `.gitignore` | **removidos** — é o P6 |
| **`media/icon.svg:8`** — *"o erlenmeyer que estava aqui virou o ícone do painel do catálogo"*. **Não existe painel de catálogo neste repositório**: era do produto anterior, o mesmo cujo `npm run catalogo` o D1 removeu | **LISTADO**, não alterado — não estava no plano aprovado. Uma linha resolve, se a cabeça quiser |
| **`docs/fluxo.md:314`** — *"máximo = 2 **(hoje: 7)**"*. O 7 é o número que **a própria corrida 1 retratou** no commit de fechamento dela (*"onde eu escrevi M1=7, o certo é 8"*), e "hoje" já não quer dizer hoje | **LISTADO** — afirmação falsa herdada do fechamento anterior. Não corrigida em silêncio, e não calada |
| `tracker:150` cita `.gitignore:22-29`, que o P6 apagou | **LISTADO e deliberadamente intacto** — o tracker é registro datado (§10); reescrever o texto de uma árvore já decidida falsificaria o registro |
| `.fasta`/`.fastq` no filtro TEXTO e a prosa *"script de laboratório"* (`arquivos-do-projeto.ts:76,84`) | **LISTADO** — o plano recusou consertar (R3) e eu concordo: fasta/fastq **são** texto e abrem legitimamente; remover pioraria a conduta |
| `configuracao-salva.ts:156` — *"sob que nome o laboratório guarda material não publicado"* | **LISTADO** — enquadramento do produto anterior, mas o argumento (caminho de pasta é dado sensível) continua verdadeiro |
| `*.ab1`/`*.fsa`/`*.scf`/`*.phd.1` no `.gitignore` | **MANTIDOS de propósito**, decisão da cabeça: parecem fóssil e são a última rede contra o commit acidental (§8·S1) |
| duas pastas `CLAUDE-SECURITY-2026*/` no disco | **LISTADAS** — artefato de varredura anterior, **não rastreadas** pelo git (`git ls-files` = 0) e cobertas pelo `.gitignore`. Não vão junto de nenhum clone |
| `casca-principal.ts:283-285`, `pagina.html:111-114` | **não são fóssil** — são o registro do que **saiu** e por quê. Ficam |

### Pendências vivas ao fim desta corrida

| # | o que é | quem decide |
|---|---|---|
| **A4** | `ehNossaLigacao` aceita qualquer symlink. Opção do plano medida em **2 de 4**; variante (b) em **4 de 4**. Devolvida | a cabeça |
| **A6** | `neovim:parar` e `shell:pasta` expostos sem chamador. Devolvida | a cabeça |
| **A3(a)** | uniformizar o confinamento de criar/renomear — depois que `servicos/` tiver rede de teste | a cabeça |
| **A5** | se o traceback clicável foi abandonado, `arquivo:ler` vira candidato a sair | a cabeça |
| **D4(b)** | apagar `localizador-do-python.ts` — só a cabeça sabe se era semente | a cabeça |
| herdados listados | `icon.svg:8`, `fluxo.md:314`, `tracker:150`, prosa de laboratório | a cabeça |
| do despacho 1 | o desvio de planta (sem `tests/arquitetura` e `tests/funcionais`), o nome do arquivo do preload, e o "empacote" descoberto na P3 | a cabeça |
| **rede do A2** | a conduta nova do botão do Konsole **não tem teste permanente** — a prova foi sonda de uso único. Enquanto `servicos/` e `motores/` não tiverem rede, o portão fica verde se alguém a desfizer | a cabeça |

---

## 10. Corrida 3 — 24/08/2026: a rede de `servicos/` e do motor, e as três decisões da cabeça

> **A ordem é da cabeça, e ela importa:** a rede vem PRIMEIRO (§6, test-first), porque é o que
> a A3(a) esperava e o que faltava à A2. Só depois a A3(a), que muda conduta — com a rede no
> lugar, o diff dos testes mostra exatamente o que passou a ser recusado. Depois A4(b) e A6.

### 10.1 · ⚠️ MUDANÇA DE PERNA DECLARADA ANTES (§12·4a)

A perna **P1** muda de comando e de número. Está escrito aqui **antes** da primeira linha de
teste, porque perna declarada depois do resultado não é perna declarada.

| o que muda | de | para |
|---|---|---|
| **comando da P1** | `node --test "tests/**/*.test.ts"` | `node --import ./tests/apoio/gancho-de-modulos.ts --test "tests/**/*.test.ts"` |
| **nº de testes da P1** | **26** (só `dominio/`) | **99** — medido em 24/08: 26 `dominio/` + 61 `servicos/` + 7 `motores/` + 5 `infra/`. Contado arquivo a arquivo com `node --test`, não somado de cabeça |

**Por que a P1 precisa de um gancho, e é medição, não preferência.** Medi os quatro obstáculos
antes de escolher a forma:

| # | obstáculo medido | comando |
|---|---|---|
| 1 | `import { app } from "electron"` dá **`SyntaxError: Named export 'app' not found`** — o pacote `electron` é CJS e resolve para uma **string** com o caminho do binário. Qualquer módulo no fecho de `servicos/` morre no *link*, antes de rodar | `node --input-type=module -e 'import { app } from "electron"'` |
| 2 | a produção importa com **`.js`** (o Vite resolve) e o disco tem **`.ts`** → `ERR_MODULE_NOT_FOUND`. Já estava declarado na P1 desde 23/08; só não mordia porque `dominio/` não tem import relativo | medido ao carregar `escrita-confinada.ts` |
| 3 | `PASTA_CONFIG` (`configuracao-salva.ts:15`) nasce de `os.homedir()` **no carregamento do módulo** — e em ESM todo `import` estático roda **antes** da primeira linha do corpo. Redirecionar `HOME` dentro do arquivo de teste chegaria tarde | leitura da fonte |
| 4 | `RAIZ_APP` (`janela-principal.ts:19`) avalia `app.isPackaged` **no carregamento** — o duble precisa existir antes do primeiro import | leitura da fonte |

**A alternativa que EXISTE e foi recusada, com o número:** `t.mock.module()` do `node:test`.
Medido — `typeof mock.module` é **`undefined`** neste Node (v22.23.1) sem
`--experimental-test-module-mocks`. A flag traz `ExperimentalWarning` na saída, e a P1 exige
saída limpa. **Recusada por medição, não por gosto.**

**O que o gancho faz — exatamente duas coisas, e nenhuma muda conduta:**
1. resolve o especificador `electron` para `tests/apoio/electron-duble.ts`;
2. resolve `./x.js` para `./x.ts` **quando o `.js` não existe e o `.ts` existe** — é a mesma
   ponte que `ferramentas/portao.mjs:41-42` já documenta (*"os dois viram o mesmo alvo aqui"*).

**O que fica DESCOBERTO, e fica escrito porque preço não escrito é preço escondido:**

| descoberto | por quê |
|---|---|
| o `electron` de verdade | o duble responde o que o teste mandar. A rede prova a **ordem e a decisão** do caso de uso — não prova que `dialog.showOpenDialog` abre janela. Isso é da **P5**, e é por isso que P5 não é opcional |
| o PTY vivo | nenhum teste sobe shell de verdade. Subir um arrisca deixar processo órfão — foi o erro nº 1 do despacho 1 — e o ganho não paga. `iniciarShell`/`enviarAoShell`/`redimensionarShell` seguem cobertos só pela P5 |
| o duble pode divergir do `electron` real | mitigado, e não só afirmado: o `tsc` continua conferindo a produção **contra os tipos reais** do `electron` (o gancho é só de runtime), e o duble mora em `tests/`, dentro do `include` do tsconfig, então também é conferido |

**A trava de segurança mora no gancho, não na disciplina de cada teste.** O `HOME` é
redirecionado para uma pasta temporária **pelo próprio gancho**, antes de qualquer módulo
carregar. É o §8·S2 aplicado ao andaime: a trava fica na camada que vê todo pedido, porque
"a sétima rota é a que alguém esquece" — e aqui esquecer significa escrever no
`~/.config/terminus/` **de quem roda a suíte**.

### 10.2 · A7 — "Fechar pasta" nunca chega ao main — árvore de decisão (§12·3a) · **EM ABERTO**

> **De onde veio:** apareceu ao desenhar a rede. Para saber se os testes de `servicos/` podiam
> dividir um processo, precisei responder *"existe como voltar ao estado sem pasta aberta?"* —
> e a resposta é **não existe**. A pergunta era de andaime; o achado, não.

| parte | |
|---|---|
| **o defeito** | `raizAberta` (`abertura-de-projeto.ts:18`) tem **um único escritor** em todo o repositório — a linha `:38`, dentro de `entrarNaPasta`, que só atribui valor **não-nulo**. O "Fechar pasta" da tela (`arvore-de-arquivos.ts:335,424-436`) é **só do renderer**: limpa `estado.projeto`, redesenha e avisa — e faz **zero** chamadas `api.*` (contado nas 13 linhas da função). Não há canal de fechar no main (busca larga: o único `fechar` de `sistema/` é `janela:fechar`, que fecha a **janela**). **Prova estática, nada precisou executar** |
| **o que custa deixar** | duas coisas sobrevivem ao fechar, e a segunda é visível: **(1)** `raizesDeEscrita()` continua devolvendo a pasta fechada, então o canal `arquivo:gravar` segue aceitando escrita nela — hoje sem chamador de tela, mas é superfície que a pessoa **acredita ter desligado**; **(2)** `protegerPastaDeTrabalho` continua defendendo a pasta fechada, e a recusa diz *"é a pasta de trabalho aberta (ou está acima dela)"* — **uma frase falsa**, na tela, para uma pasta que a pessoa acabou de fechar. O caminho é real e curto: abrir `~/proj`, fechar, abrir `~`, botão direito em `proj` → Excluir → recusa com o motivo errado. É a mesma família da **A2**: a tela afirma o que o estado não sustenta |
| **as opções** | **(a) canal novo** `projeto:fechar` → `servicos.fecharPasta()` pondo `raizAberta = null`, e o renderer passa a avisar. **Muda conduta e a contagem de canais vai de 37 a 38** — e 37 é a prova de conduta preservada das corridas 1 e 2, então o número teria de ser re-declarado com a causa. **(b) sem canal novo** — **MEDIDA E DESCARTADA**: os cinco canais de projeto são `escolher`, `entrar`, `recentes`, `esquecer`, `inicial` (`ponte-projeto.ts:18-24`), e nenhum sabe dizer *"fechei"*; `projeto:entrar` com nulo estoura em `abrirProjeto`. Não há caminho barato aqui. **(c) deixar como está e REGISTRAR** (marca `//?` no código + esta árvore), como o A5 fez com a capacidade dormente. **(d) rebaixar só a frase** da recusa de exclusão, para ela deixar de mentir sem mexer no estado — barato, e conserta o único sintoma visível |
| **minha recomendação** | **(c) agora, (d) logo em seguida**, e não é timidez: a rede que este despacho está construindo é a pré-condição do resto. (a) muda conduta **e** mexe no número que duas corridas usaram como prova — decisão de rumo, da cabeça. (d) é três palavras e mata a frase falsa, que é a parte que a pessoa **vê** |
| **se ficar para depois** | **igual** — não apodrece e não encarece. O que corre é o mesmo silêncio da A2: a tela dizendo o que o estado não sustenta |
| **DESFECHO** | **APLICADA em 24/08/2026, opção (a), decidida pela cabeça.** A (d) ficou **absorvida**: a frase deixou de mentir porque o estado passou a sustentá-la, não por reescrita de texto. ⚠️ **O roteiro de repro escrito nesta árvore estava ERRADO** — medido e corrigido em **§13.9**. O conserto está em **§13.10** |

### 10.3 · A8 — o canal de controle do Neovim pendura para sempre — árvore de decisão (§12·3a) · **EM ABERTO**

> **De onde veio:** o `node --test` reprovou a suíte de `escrita-confinada` com uma rejeição
> não tratada que eu não tinha causado. Fui atrás de por que a MINHA rede estava vermelha e
> o defeito estava embaixo. **Herdado byte a byte** — o `diff` contra `ada7bfa` acusa só a
> mudança de caminho do import.

| parte | |
|---|---|
| **o defeito** | `controle-neovim-rpc.ts:33-50`. O laço promete tentar 25 vezes a cada 120 ms *"porque o socket surge um instante depois do spawn"*. **Ele nunca faz a segunda tentativa.** Medido, em três passos: **(1)** `attach({socket})` num socket ausente produz **uma rejeição não tratada** `connect ENOENT` ~3 ms depois — e ela **não é** a promessa do `eval`, então o `try/catch` do laço não a vê; **(2)** `await c.eval("1")` **nunca assenta** — nem resolve nem rejeita (medido com teto de 8 s, e com relógio: `entrarNaPasta` volta em 57 ms e nada assenta depois); **(3)** como o laço trava na primeira volta, `conectando` fica **pendente para sempre** — e ele é **memoizado** (`:32`), então toda chamada seguinte devolve a mesma promessa morta. Medido: 1ª `salvarNeovim()` **PENDURADA**, 2ª `salvarNeovim()` **PENDURADA** |
| **o que custa deixar** | sem Neovim escutando, **Ctrl+S, Ctrl+Z, F12, o terminal do editor e o painel de plugins penduram em silêncio, para sempre** — `respostaSegura` nunca retorna, o `await` da tela nunca completa, e **nenhuma mensagem aparece**. Pior: a frase que o autor escreveu para este caso — *"Neovim não respondeu ao canal de controle."* (`:59`, `:89`, `:105`, `:114`) — é **inalcançável** aqui, porque ela exige que `obter()` **resolva** para `null`, e ele não resolve. O aviso existe e não pode ser exibido |
| **⚠️ a gravidade, MEDIDA e MENOR do que parecia** | em **node puro** a rejeição não tratada **mata o processo** (medido: `triggerUncaughtException`). No **Electron, não**: subi o app de verdade com `HOME` próprio e um `nvim` falso que sai sem criar socket, e **ele seguiu de pé aos 14 s**, sem nenhuma linha de rejeição. **E a sonda provou que chegou no caso** — o `config.json` da casa temporária voltou reescrito por `registrarPasta`, indentado, com a pasta lembrada. Sem essa prova o "não caiu" não valeria nada |
| **quando acontece** | sempre que `entrarNaPasta` roda com o socket ausente: **Neovim não instalado**, Neovim que não subiu, ou a **corrida na partida** entre `neovim:iniciar` e `projeto:inicial` — que são dois canais separados, disparados pelo renderer, e o laço de 3 s existia justamente para cobrir essa corrida |
| **as opções** | **(a) pôr teto no `eval`** — `Promise.race([c.eval("1"), teto(300ms)])`, e o laço volta a tentar 25 vezes de verdade. Três linhas, e é o que faz o comentário do arquivo virar verdade. **(b) tratar o erro do socket na origem** — pegar o `error` do transporte para a rejeição não escapar, além do teto. **(c) (a)+(b) juntas**, que é o conserto inteiro. **(d) deixar como está e REGISTRAR** — a marca `//?` e esta árvore; o silêncio continua |
| **minha recomendação** | **(c)**, e não é preferência estética: (a) sozinha destrava o laço mas a rejeição não tratada continua vazando — e ela é o que mata o processo em node puro, que é onde a **suíte** roda. As duas juntas fazem o código cumprir o que ele já promete por escrito. **Não apliquei**: é conduta, não estava no despacho, e mexe num motor sem rede — que é exatamente a ordem que este despacho está corrigindo |
| **se ficar para depois** | **fica mais BARATO depois**, e por um motivo concreto: com a rede de `motores/` de pé, (c) nasce com teste antes. Hoje seria conserto sem rede, no motor, que é o que a corrida veio evitar |
| **DESFECHO** | **APLICADA em 24/08/2026, opção (c), decidida pela cabeça.** Adiada mais cedo no mesmo dia (devolvida pelo executor, nenhuma conduta mudou); retomada no despacho seguinte com a ordem *rede primeiro*. O conserto e as suas medições estão em **§13.2** |

### 10.4 · A9 — pasta aberta por ATALHO recusava toda escrita — árvore de decisão (§12·3a) · **APLICADA 24/08/2026**

> **De onde veio:** eu ia aplicar a A3(a) e fui conferir o que exatamente `gravar` faz, já que
> a A3(a) manda `criar` fazer o mesmo. Achei que `gravar` faz uma coisa a menos do que promete.
> **É a A4 acontecendo de novo:** medir antes de obedecer mudou o que há para decidir.

| parte | |
|---|---|
| **o defeito** | `abertura-de-projeto.ts:22` guarda `path.resolve(raizAberta)` — **sem realpath**. `confinado()` resolve o alvo **com** realpath (`resolucao-de-caminho.ts:20`). Quando a pasta é aberta por um **atalho**, os dois lados falam de lugares diferentes e `dentroDaRaiz` responde `false` para arquivo que está **dentro da pasta aberta** |
| **a prova, medida em fixture isolada** | abri `…/atalho-para-o-projeto` (link para `…/projeto-real`) e gravei dentro: `raiz de escrita: ["…/atalho-para-o-projeto"]`, `caminho real: …/projeto-real`, **`RESULTADO: RECUSOU — "nota.txt" está fora da pasta aberta`**. Nada foi destruído para provar |
| **o que custa deixar** | quem abre a pasta por atalho **não consegue salvar nada** — Ctrl+S recusa com a frase *"está fora da pasta aberta"* para o arquivo que está **exatamente** dentro dela. A mensagem não é só uma recusa errada: ela é **contraditória com o que a tela mostra**. E atalho para pasta de projeto é hábito comum em Linux — este repositório mesmo nasceu de uma máquina com onze symlinks em `~/.config/nvim` |
| **⚠️ e A3(a) ALARGA ISTO** | hoje `criar`/`renomear` **funcionam** na pasta aberta por atalho, porque comparam TEXTO contra a raiz que o renderer manda — que é o próprio atalho, e portanto bate. Ao passarem a usar `confinado()`, herdam a mesma recusa. **É o resultado que o despacho mandou declarar em vez de esconder**, e ele está travado na rede: `tests/servicos/escrita-em-pasta-por-atalho.test.ts` tem teste marcado `A9` registrando a recusa nova, com a marca de que é o defeito e não a intenção. ⚠️ **Esta linha dizia `escrita-confinada.test.ts`, e era falso** — medido `grep -c A9` = **0** naquele arquivo. A rede da A9 sempre morou em arquivo próprio (isolamento de `raizAberta` entre suítes). Corrigido pela varredura de 24/08 |
| **as opções** | **(a) resolver a raiz na entrada** — `raizAberta = resolverReal(raiz)` em `entrarNaPasta`, ou `raizesDeEscrita()` devolvendo o real. Uma linha, e conserta `gravar` **e** o alargamento da A3(a) de uma vez. Custa: a pasta aberta passa a ser reportada pelo caminho real, e a tela mostra o nome real em vez do nome do atalho — **mudança visível**, e é por isso que é da cabeça. **(b) resolver dos dois lados na guarda**, deixando `raizAberta` como veio. Não muda o que a tela mostra; espalha o realpath por mais um lugar. **(c) deixar como está e REGISTRAR** — a recusa continua, agora em três canais em vez de um |
| **minha recomendação** | **(a)**, e a razão é que ela é a única que faz a frase da tela voltar a ser verdadeira. **Não apliquei**: muda o que a interface exibe, é conduta, e não estava no despacho |
| **se ficar para depois** | **fica mais CARO depois da A3(a)**, e isto é o único item desta corrida que encarece: hoje o silêncio existe em `gravar`; aplicada a A3(a), existe em `gravar`, `criar` e `renomear`. O conserto é o mesmo, mas o estrago corrente triplica |
| **DESFECHO** | **APLICADA em 24/08/2026, decidida pela cabeça** — opção **(a)**, com o custo visível autorizado por escrito. Devolvida adiada mais cedo no mesmo dia; a cabeça priorizou por ser a única árvore que **encarece com o tempo**. Commit `de5c450`. A marca `//?` saiu de `abertura-de-projeto.ts` e virou `//!`, e o teste **virou do avesso** — ver §12 |

### 10.5 · A4(b) aplicada — e a rede que reproduz o número da árvore

A cabeça decidiu pela variante **(b)**, a do executor: uma ligação é nossa se o alvo cai na
**origem atual** *ou* se o caminho tem a **forma** `…/kits/{funcoes,editor}/…`.

**O que mudou no código.** `ehNossaLigacao` deixou de responder *"é symlink?"* e passou a
responder *"é symlink NOSSO?"*. Ela agora recebe a `origem` e lê o destino com **`readlink`**,
não `realpath` — e essa escolha é o que faz o quarto caso funcionar: `realpath` estoura
justamente na ligação **pendurada**, que é a que a refeitura existe para consertar.

**O número da árvore virou teste, e o teste o confirma.** A A4 dizia, a partir de uma fixture
de uso único, que a opção (a) do plano acerta **2 de 4**. Reduzi a implementação à opção (a)
— só o LUGAR — e rodei a suíte:

| caso | opção (a), medida pela rede | (b), aplicada |
|---|---|---|
| `terminus-basico` — nossa, aponta para a cópia que roda | **REFAZ** ✔ | REFAZ ✔ |
| `terminus-do-usuario` — alheia, com o nosso prefixo | **RESPEITA** ✔ | RESPEITA ✔ |
| `terminus-velha` — nossa, aponta para a cópia anterior | **RESPEITA** ✘ | REFAZ ✔ |
| `terminus-pendurada` — nossa, e a cópia sumiu | **RESPEITA** ✘ | REFAZ ✔ |
| | **2 de 4** | **4 de 4** |

A lista `respeitados` sob a opção (a) saiu com **três** entradas em vez de uma —
`do-usuario`, `pendurada` e `velha` — e é essa saída crua que prova o 2 de 4. **A árvore
foi escrita a partir de uma fixture que morreu com a sessão; agora o mesmo número tem rede
permanente**, e quem mexer nisso amanhã descobre na hora.

**A vitrine passou a dizer a verdade.** `README:178-179` promete *"se já existir um arquivo
seu com esse nome, o Terminus não o toca e avisa"*. Antes disso a frase era falsa para
symlink; agora é verdadeira, e o texto **não precisou mudar** — o código é que foi ao encontro
dele. Conferido lendo as duas fontes, não presumido.

### 10.6 · A6 aplicada — os dois canais ficam, e ficam registrados

A cabeça decidiu: `neovim:parar` e `shell:pasta` **continuam expostos**, com a marca `//?` na
porta e a árvore no tracker — o mesmo tratamento que `arquivo:ler` recebeu na A5(b).

**A contagem de canais segue 37, e isso é escolha, não inércia.** 37 é a prova de conduta
preservada da corrida 1, conferida de novo no fechamento da corrida 2 (*"idênticos a `5c7dbd8`
E a `ada7bfa`"*). Remover dois canais para arrumar uma capacidade dormente **já documentada**
gastaria essa prova por um ganho que a documentação já entrega.

**O que a marca diz, e é o que faltava:** nos dois casos **a peça está viva e o canal é que
dorme.** `pararNeovim` é usado pelo próprio main ao fechar a janela e na partida; `pastaDoShell`
é usado dentro de `abrirNoKonsole`. Quem lesse "sem chamador" sem esse detalhe concluiria que
há código morto a apagar — e apagaria a peça junto com o canal. A marca impede exatamente isso.

**O que fica descoberto, dito porque a decisão é de manter:** enquanto os canais existem, o
renderer pode **matar o editor** (`neovim:parar`) e **ler a pasta corrente do shell**
(`shell:pasta`). Hoje ninguém chama; um renderer comprometido chama. É a mesma gravidade da
A5 — pequena, e real — e agora está escrita nos dois lugares onde alguém vai olhar.

### 10.7 · A10 — o NOME não passa por peneira nenhuma — árvore de decisão (§12·3a) · **EM ABERTO**

> **De onde veio:** apareceu duas vezes no mesmo dia. Primeiro como **falso vermelho** meu — o
> RED da A3(a) saiu `"Cannot read properties of undefined (reading 'trim')"` em vez da recusa
> que eu esperava, e foi assim que descobri que tinha errado a aridade. Depois, ao aplicar a
> A3(a), percebi que **o erro que me confundiu é o que chega na tela de quem usa**.

| parte | |
|---|---|
| **o defeito** | `arquivos-do-projeto.ts:122` (`validarNome`) faz `nome.trim()` **sem conferir que `nome` é string**. A carga do IPC chega crua: `ponte-arquivo.ts` **declara** `nome: string`, e declaração de tipo não confere nada em runtime. Os vizinhos todos peneiram — `confinado` chama `recusarEntrada`, `gravarConfinado` confere `typeof conteudo` — e o **nome** ficou de fora |
| **a prova, medida através de `respostaSegura`** (é o caminho real da tela) | `nome = 42` → **`{"ok":false,"erro":"nome.trim is not a function"}`** · `nome = {}` → idem · `nome = null` → **`{"ok":false,"erro":"Cannot read properties of null (reading 'trim')"}`** · `nome = "a.txt"` → `{"ok":true,…}`. Nada foi destruído para provar |
| **o que custa deixar** | **falha em segurança** — nada é criado, e é por isso que a gravidade é baixa. O custo é de **vitrine**: um erro interno de JavaScript aparece na tela, com a palavra `trim` e o nome de uma variável do nosso código. É a mesma família da A2 — a tela dizendo algo que não serve a quem lê —, só que aqui a frase nem foi escrita por ninguém. Herdado: `validarNome` é igual à linha de base |
| **as opções** | **(a) `recusarEntrada(nome, "nome")` antes do `trim`** — usa a peneira que já existe, e a frase vira *"O nome não é válido."*, que é a do resto da casa. Uma linha. Custa: `recusarEntrada` também recusa `-`, o que é **conduta nova** para nome (hoje `-x.txt` é aceito, e é um nome legítimo de arquivo). **(b) só o `typeof`** — `if (typeof nome !== "string") throw new Error("O nome não é válido.")`, sem herdar a regra do traço. **(c) tipar `nome: unknown` na ponte e no serviço**, o que faz o `tsc` cobrar a conferência — é (b) com a trava no compilador junto. **(d) deixar como está** |
| **minha recomendação** | **(c)**, e a razão é a que a A3(a) acabou de mostrar: `unknown` na borda foi o que fez o `tsc` empurrar a peneira para o lugar certo em `dir` e `antigo`. Nome é a última entrada de `arquivo:criar`/`pasta:criar`/`caminho:renomear` ainda tipada como promessa. **(a) não**, porque herdaria a recusa do traço sem alguém ter decidido isso |
| **se ficar para depois** | **igual** — não apodrece, e nada de novo passa a depender dele |
| **DESFECHO** | **APLICADA em 24/08/2026, opção (c), decidida pela cabeça.** Adiada mais cedo no mesmo dia; retomada no despacho seguinte, depois da A8. O conserto e as suas medições estão em **§13.6** |

---

## 11. Fechamento da corrida 3 — 24/08/2026 · os TRÊS atos do §12 passo 6

### Ato 1 — varredura do que a corrida MOVEU

| o que mudou | onde ficou |
|---|---|
| **26 → 99 testes** | `README:75` atualizado (e a descrição deixou de dizer *"só regra pura"*), planta atualizada com o bloco por camada, `gera-fluxo.py` e o PNG refeitos, tracker §10.1 preenchido com a contagem **por arquivo** |
| **comando da P1** (ganhou `--import`) | tracker §10.1 declara; §1·P1 ganhou ponteiro em vez de ser reescrito — é registro **datado** de 23/08 e falsificá-lo seria pior. E o **portão passou a rodar a P1 pelo script do `package.json`**: ele repetia o comando à mão e ficou uma hora atrás do que a P1 declarava |
| **assinaturas de `criarArquivoNoProjeto` / `criarPastaNoProjeto` / `renomearNoProjeto`** (3 args → 2) | os 3 chamadores (`ponte-arquivo.ts`) atualizados; **o IPC não mudou** — a ponte recebe a raiz e a ignora, com `_raiz` visível |
| **`ehNossaLigacao` / `ligarUm`** (ganharam `origem`) | chamadores internos atualizados; a marca `//?` da A4 **saiu do código**, substituída pela implementação — e `grep` por `DEFEITO CONHECIDO (A4` dá **0** |
| **A3 · A4 · A6** saíram de "em aberto" | cabeçalhos das três árvores, a tabela de desfechos do §8 e as seções §10.5/§10.6 |
| ⚠️ **uma duplicata que EU criei nesta corrida** | escrevi um `dentroDe` local em `kits-embutidos.ts` — **mesmo nome** de outra função privada da mesma camada (`arquivos-do-projeto.ts:140`) e **contrato oposto**: aquela estoura, a minha devolvia booleano. E a regra já existia no domínio, que a infra pode importar (§1.3). **Removida**, domínio reutilizado. Terceira cópia da mesma regra é o §6·R4 pedindo passagem |

### Ato 2 — vitrine conferida

| afirmação do README | conferida como | resultado |
|---|---|---|
| `npm run teste` — *"99 testes"* | **rodado** | 99 passaram, 0 falharam |
| `npm run typecheck` | **rodado** | exit 0 |
| `npm run build` | **rodado** | exit 0 |
| `npm run portao` — *"as cinco pernas"* | **rodado** | **VERDE 5/5** |
| **`README:16` — "Estado: v0.0.7"** | contra `package.json` **e** o topo do changelog | **os três dizem 0.0.7** |
| **`README:178-179`** — *"se já existir um arquivo seu com esse nome, o Terminus não o toca e avisa"* | contra o código **e** contra a rede nova | **passou a ser VERDADE** com a A4(b). Era falso para symlink. O texto **não precisou mudar** — o código é que foi ao encontro dele |
| o escopo de criar/renomear | procurado no README inteiro | **nenhuma afirmação fala disso** — a mudança de conduta da A3(a) não quebrou promessa de vitrine |
| os 6 scripts, `media/icon.png`, `media/terminus.desktop` | `test -f` e execução | todos existem / exit 0 |
| `git clone git@github.com:…` | **NÃO conferido** | rede e `ssh` estão fora do que me é permitido. Declarado, não presumido |

### Ato 3 — varredura do que NINGUÉM moveu

**⚠️ O instrumento foi reconstruído, reprovado DUAS vezes e revalidado — e as duas reprovações
são o mais instrutivo deste fechamento.**

| tentativa | o que deu errado | como apareceu |
|---|---|---|
| **v1** | tirava comentário de bloco **antes** do de linha. O sigilo da casa (§3) é **`//*` — e ele contém `/*`**: o regex casou de dentro do `//*` até o primeiro `*/` e **comeu 1320 de 1551 caracteres** de `ponte-projeto.ts`. Símbolos **usados** viraram órfãos | 21 falsos positivos, entre eles `escolherPastaEEntrar`, que tem chamador na linha 18 do arquivo comido |
| **v2** | procurava o canal pelo **nome do método** solto (`.parar(`) | **falso NEGATIVO** em `neovim:parar`: o reprodutor de papel de parede também tem `.parar()`. Nome de método é genérico; `grupo.metodo` não é |
| **v3** | lia a porta **linha a linha** | 21 canais dados como *"não exposto"* — quase toda definição da porta quebra em várias linhas |
| **v4** | posicional: acha o canal e caminha **para trás** até a propriedade (ancorada em início de linha, senão pega o **parâmetro**) e até o grupo | **validada** |

**A validação, e é a mesma regra de sempre:** rodei a v4 contra a árvore de ontem (`5c7dbd8`),
onde eu **sei** que havia quatro canais órfãos. Ela achou **exatamente os quatro** —
`arquivo:ler`, `arquivo:gravar`, `neovim:parar`, `shell:pasta` — e os três símbolos órfãos
daquele dia, inclusive `lerDoTwinny`. *Instrumento que não morde nada não prova nada.*

**(a) exportado e canal sem chamador, na árvore de hoje.**

| | |
|---|---|
| símbolos exportados | **169** (eram 172 em `5c7dbd8`; os 3 a menos são `lerDoTwinny`, `shellEstaVivo`, `neovimRodando`, apagados na corrida 2) |
| **sem uso em lugar NENHUM** | **1** — `acharPython` (é o **D4**, já marcado e com desfecho). **Zero novos** |
| exportados usados só dentro do próprio arquivo | **17** — observação, não defeito. Dois deles (`confinado`, `shellEstaOcioso`) ganharam chamador em `tests/` nesta corrida, o que é o `export` finalmente se pagando |
| canais registrados | **37**, idênticos em número à linha de base |
| **canais sem chamador no renderer** | **4** — `arquivo:ler` e `arquivo:gravar` (**A5**, registrados) e `neovim:parar` e `shell:pasta` (**A6**, registrados nesta corrida). **Zero não registrados** |

**(b) resto de produto anterior.** Reconferido item a item: `media/icon.svg:8` (painel de
catálogo), `docs/fluxo.md:314` (*"hoje: 7"*, número que a corrida 1 retratou), `tracker:150`,
a prosa de laboratório em `arquivos-do-projeto.ts` e `configuracao-salva.ts` — **todos ainda
lá, todos LISTADOS de novo, nenhum alterado**: não estavam no despacho, e corrigir prosa
datada de árvore já decidida falsificaria o registro. `*.ab1` e companhia seguem no
`.gitignore` **de propósito** (decisão da cabeça, reconfirmada neste despacho). As duas pastas
`CLAUDE-SECURITY-2026*` continuam **não rastreadas** (`git ls-files` = 0). As menções a
`tests/arquitetura` e `tests/funcionais` são as **notas do desvio** — elas explicam a ausência,
não apontam para o vazio; a nota da planta ganhou uma linha dizendo o que a corrida 3 mudou nisso.

### Pendências vivas ao fim da corrida 3

| # | o que é | quem decide |
|---|---|---|
| **A7** | "Fechar pasta" nunca chega ao main: a pasta fechada segue gravável, e a recusa de exclusão diz uma frase falsa. **NOVA** | a cabeça |
| **A8** | o laço de reconexão do Neovim nunca faz a 2ª volta; sem socket, Ctrl+S/F12/plugins penduram em silêncio e o aviso escrito é inalcançável. **NOVA** | a cabeça |
| ~~**A9**~~ | pasta aberta por atalho recusava toda escrita. **FECHADA em 24/08/2026** — a cabeça decidiu pela opção (a) e ela foi aplicada na corrida 4 (§12). Era a única que encarecia com o tempo, e foi por isso que veio primeiro | **decidida** |
| **A10** | o `nome` não passa por peneira: erro interno de JavaScript vira frase de interface. **NOVA** | a cabeça |
| **A5** | se o traceback clicável foi abandonado, `arquivo:ler` vira candidato a sair | a cabeça |
| **D4(b)** | apagar `localizador-do-python.ts` — só a cabeça sabe se era semente | a cabeça |
| herdados listados | `icon.svg:8`, `fluxo.md:314`, `tracker:150`, prosa de laboratório | a cabeça |
| do despacho 1 | o desvio de planta, o nome do arquivo do preload, o "empacote" descoberto na P3 | a cabeça |
| **o instrumento do 3º ato** | foi reconstruído do zero pela **segunda** corrida seguida, e reprovou **três** vezes antes de servir. Ele mora no scratchpad e morre com a sessão. Virar ferramenta do repo é escopo novo | a cabeça |

---

## 12. Corrida 4 — 24/08/2026: a A9 opção (a), e o teste que virou do avesso

Despacho de uma árvore só. A cabeça decidiu a **A9 (a)** com prioridade, pela razão que o
executor tinha dado ao devolvê-la: **é a única que encarece com o tempo**, e foi a corrida 3
que a alargou de um canal para três. A7, A8 e A10 ficaram onde estavam.

### 12.1 · O conserto, e por que nesta linha e não noutra

`entrarNaPasta` resolve a pasta pedida **na entrada**, com `resolverParaLeitura`. `raizAberta`
passa a guardar o lugar **real**, e com isso tudo o que vem depois — a guarda de escrita, a
proteção contra excluir a pasta aberta, os recentes, o `cd` do Neovim e a árvore que a tela
desenha — passa a falar do **mesmo lugar**. `raizesDeEscrita()` deixou de resolver: era ela e
`confinado()` falando de lugares diferentes que **formavam** o defeito, e resolver nos dois
lados seria manter as duas fontes da verdade que a doença tinha.

**`resolverParaLeitura` e NÃO `resolverReal`, e a escolha foi medida.** Abrir pasta é leitura,
e o irmão **estoura com mensagem própria** quando o destino não existe. Aqui a pasta que sumiu
precisa estourar dentro de `abrirProjeto`, com a mensagem do sistema de arquivos e **depois**
da leitura — é a ordem travada em `abertura-de-projeto.test.ts` (*"pasta que sumiu do disco
ESTOURA e não é GRAVADA no config"*), e trocar o resolvedor a quebraria em silêncio.

### 12.2 · O TESTE VIROU DO AVESSO — e é a prova de que o conserto pegou

`tests/servicos/escrita-em-pasta-por-atalho.test.ts` travava o **defeito** com o aviso do
§12·3a·4 ao lado. Agora afirma que **escrever funciona**, e o aviso saiu. Ele foi de **5 para
8 testes**, e os três novos não são enfeite:

| teste novo | por que existe |
|---|---|
| o preço que a cabeça autorizou | a tela dizer o nome real virou conduta **pretendida**; se alguém a desfizer, isto avisa |
| arquivo de fora continua recusado | sem ele, *"gravar funciona"* passaria também num código que **parou de conferir** |
| atalho dentro do projeto apontando para fora continua recusado | idem, para o caso que o realpath existe para pegar |

> **Se aquele arquivo tivesse seguido verde sem mudar, o conserto não teria pegado.** Era o
> combinado do despacho, e é o que separa consertar de dizer que consertou.

### 12.3 · A TELA, medida antes e depois (fixture isolada, nada tocado no alvo vivo)

Instrumento: o **mesmo andaime da suíte** (gancho de módulos + captura de rejeição), rodando
`entrarNaPasta` de verdade sobre `…/atalho-para-o-projeto` → `…/projeto-real`, e compondo as
frases com os literais exatos do renderer. Fora da árvore do alvo, de propósito.

| onde, no código | ANTES | DEPOIS |
|---|---|---|
| `arvore-de-arquivos.ts:48` cabeçalho da lateral | `atalho-para-o-projeto` | `projeto-real` |
| `arvore-de-arquivos.ts:377` nota ao abrir | `pasta aberta: …/atalho-para-o-projeto` | `pasta aberta: …/projeto-real` |
| `casca-principal.ts:232` nota na partida | `pasta aberta: …/atalho-para-o-projeto` | `pasta aberta: …/projeto-real` |
| `arvore-de-arquivos.ts:425` nota ao fechar | `pasta fechada: atalho-para-o-projeto (nada foi apagado)` | `pasta fechada: projeto-real (nada foi apagado)` |
| `arvore-de-arquivos.ts:32` "Abertas antes" | `atalho-para-o-projeto` | `projeto-real` |
| **Ctrl+S dentro da pasta que a tela mostra** | **`RECUSOU: "nota.txt" está fora da pasta aberta — o Terminus não mexe em arquivo de fora.`** | **`GRAVOU`** |

**Nada pior do que a árvore descreveu.** A mudança é exatamente *"o nome real em vez do nome
do atalho"*, mais a recusa virando escrita. A autorização cobria isto, então não houve o que
devolver.

**Um efeito de segunda ordem, medido e declarado:** `ehPastaProtegida` compara por texto, e
com a raiz real a proteção passa a valer sobre a pasta **real**. O **atalho em si** deixa de
ser protegido — mas ele também deixa de aparecer na árvore da tela (que agora é desenhada a
partir do caminho real), e apagar um link não apaga a pasta. **Nenhuma perda de dado**, e a
consistência melhorou: antes, tela e guarda discordavam; agora concordam.

### 12.4 · Sabotagem NAS DUAS CORES — as duas com `tsc` exit 0

A lição da corrida 3 é do próprio executor: **sabotagem que quebra a compilação é ruído**.
As duas foram conferidas com `tsc` antes de acreditar no vermelho. E as duas revertem coisa
real — a primeira reverte **o conserto**, não um vizinho.

| # | o que foi revertido | medido | veredito |
|---|---|---|---|
| 1 | **o conserto**: `raiz = pedida`, sem resolver (import mantido em uso, `tsc` **0**) | **5 falhas** — exatamente as 5 do RED —, 97 passando, **nenhum outro arquivo caiu** | mordida no lugar, não apagão |
| 2 | a guarda: `dentroDaRaiz` sempre aceitando (`tsc` **0**) | **16 falhas**, entre elas os **dois** testes de *"não afrouxou a guarda"* | o verde novo não é a guarda tendo parado de guardar |

Restaurados os dois (o segundo **byte a byte**, `git diff` vazio): **102/102 verde**.

### 12.5 · O portão

Catraca **declarada antes de medir** (§12·4a) e confirmada: os quatro no alvo e **inalterados**,
porque a A9(a) é conserto de conduta num serviço — não é registrador (M1 não a vê), o módulo que
ela passou a importar só importa `node:` (M2 não ganha aresta), não toca `dominio/` (M3) nem a
árvore de pastas (M4).

| perna | resultado |
|---|---|
| P1 teste da peça | **ok — 102 passaram** (eram 99: −5 do arquivo virado, +8 do novo) |
| P2 verificação de tipo | ok |
| P3 build | ok |
| P4 alvo da corrida | M1 **2** · M2 **0** · M3 **0** · M4 **13/13** — como previsto |
| P5 conduta | ok — porta+renderer+ipc responderam |

**PORTÃO VERDE 5/5.**

### 12.6 · Fechamento da corrida 4 — os TRÊS atos do §12 passo 6

**Ato 1 — varredura do que a corrida MOVEU.** Contagens remedidas arquivo por arquivo (não
somadas de cabeça): `dominio` 26 · `servicos` 64 · `motores` 7 · `infra` 5 = **102**. O
`99 → 102` e o `servicos 61 → 64` foram varridos em **quatro** lugares: `docs/fluxo.md`,
`README:75`, `docs/tracker.md:119` (a perna P1) e `ferramentas/gera-fluxo.py` (a fonte do PNG).
A planta ganhou o nó da resolução na entrada (F2) e o parágrafo do que quebrava no F1. Canais
de IPC remedidos: **37**, idênticos — a legenda do PNG segue verdadeira.

> **Achado da varredura, corrigido com a correção escrita ao lado:** a linha do §10.4 dizia que
> a marca `A9` estava em `escrita-confinada.test.ts`. Medido `grep -c A9` = **0** naquele
> arquivo. A rede da A9 sempre morou em arquivo próprio.

**Ato 2 — vitrine conferida.**

| o que o README afirma | como foi conferido | resultado |
|---|---|---|
| `npm run teste` — *"102 testes"* | **rodado** | 102 passaram, 0 falharam |
| `npm run typecheck` | **rodado** | exit 0 |
| `npm run portao` | **rodado** | VERDE 5/5 |
| `README:16` — *"Estado: v0.0.7"* | contra `package.json`, o topo do changelog **e a tag** | os três primeiros dizem 0.0.7 |
| `git clone` · `npm install` · `npx electron-rebuild` | **não rodados**, e declarado: o clone é de rede e os outros dois mexeriam em `node_modules` sem necessidade | — |

> ⚠️ **O que este fechamento viu e os dois anteriores não:** o §12 passo 6 nomeia **três** fontes
> para o estado declarado — `package.json`, changelog e **tag**. As fechadas das corridas 2 e 3
> conferiram as duas primeiras. Conferindo a terceira: **a tag mais nova é `v0.0.6`; não existe
> `v0.0.7`.** O projeto **tem** o hábito de marcar (v0.0.3 a v0.0.6 existem), então a v0.0.7 está
> **por marcar**. Não é afirmação falsa — as três fontes que existem concordam —, então entra
> como **listado**, não como árvore. Marcar ou não é da cabeça: mexe no histórico do repositório.

**Ato 3 — varredura do que NINGUÉM moveu.** Instrumento reaproveitado do despacho anterior, e
**revalidado antes de acreditar nele**, nas duas colunas:

| coluna | como foi validada | resultado |
|---|---|---|
| símbolos | rodado sobre a árvore base `ada7bfa`, onde a resposta é conhecida | achou **exatamente os quatro** órfãos conhecidos, `lerDoTwinny` incluso |
| canais | ⚠️ a base **não valida** esta coluna — `codigos/porta/` não existe lá, e tudo lê como "não exposto". Validada à parte: **numa cópia**, removido um chamador conhecido (`aparencia.tirar`) | o canal apareceu como **quinto** órfão, e só ele — a coluna morde |

Achados de hoje, e **nenhum é novo**: **1 símbolo** sem uso nenhum (`acharPython`, o D4, já
marcado) e **4 canais** sem chamador (`arquivo:gravar`, `arquivo:ler`, `neovim:parar`,
`shell:pasta` — os quatro já registrados pelas árvores A5 e A6).

**Restos de produto anterior:** `.gitignore` limpo (os fósseis saíram na corrida 3); nenhum
caminho pendurado em `tsconfig.json`, `electron.vite.config.ts` ou `package.json`; as duas
pastas `CLAUDE-SECURITY-2026*` seguem **não rastreadas**. Varredura de prosa: **um** caminho
citado que não existe — `tracker:162`, `codigos/ponte/ponte-para-a-interface.ts`, dentro do
**registro histórico** de um defeito da corrida 1, citando o que o README dizia **antes** da
emenda E1. **Listado, não alterado**: reescrevê-lo falsificaria o registro. Os docs vivos já
dizem `codigos/porta/`.

### 12.7 · Pendências vivas ao fim da corrida 4

| # | o que é | quem decide |
|---|---|---|
| **A7** | "Fechar pasta" nunca chega ao main: a pasta fechada segue gravável, e a recusa de exclusão diz uma frase falsa | a cabeça |
| **A8** | o laço de reconexão do Neovim nunca faz a 2ª volta; sem socket, Ctrl+S/F12/plugins penduram em silêncio | a cabeça |
| **A10** | o `nome` não passa por peneira: erro interno de JavaScript vira frase de interface | a cabeça |
| **A5** | se o traceback clicável foi abandonado, `arquivo:ler` vira candidato a sair | a cabeça |
| **D4(b)** | apagar `localizador-do-python.ts` — só a cabeça sabe se era semente | a cabeça |
| **a tag v0.0.7 que não existe** | **NOVA**, do ato 2. Marcar mexe no histórico do repositório, que é da lista negativa | a cabeça |
| herdados listados | `icon.svg:8`, `fluxo.md:314`, `tracker:150`, `tracker:162`, prosa de laboratório | a cabeça |
| do despacho 1 | o desvio de planta, o nome do arquivo do preload, o "empacote" descoberto na P3 | a cabeça |
| **o instrumento do 3º ato** | agora foi **reaproveitado** em vez de reconstruído — e a revalidação mostrou que a coluna de canais **não pode** ser validada contra a árvore base. Ele segue no scratchpad e morre com a sessão | a cabeça |
| **a receita do PNG** | `magick -background none -density 150 docs/fluxo.svg -strip docs/fluxo.png` **não está escrita em lugar nenhum do repo**. Hoje isso custou um PNG na resolução errada, pego só por eu abrir a imagem | a cabeça |

---

## 13. Corrida 5 — 24/08/2026: A8(c), A10(c) e A7(a) — as três decisões da cabeça

A ordem é da cabeça e tem razão escrita: **A8 primeiro**, porque é a única das três que trava o
produto de verdade *e* atrapalha **quem tenta medir o produto** — foi ela que avermelhou a suíte
de `escrita-confinada` na corrida 3 e que matou uma sonda em silêncio na corrida 4. Consertá-la
barateia toda corrida futura. **A10 depois**, a última entrada de IPC sem peneira. **A7 por
último**, decidida em separado no meio do despacho.

Dentro da A8 a ordem é **test-first e é minha**, por indicação do despacho: a rede do
`controle-neovim-rpc` nasce **antes** do conserto, travando a **conduta de hoje — inclusive a
pendura**. Depois o conserto, e o diff dos testes é o que mostra o que mudou. É o mesmo desenho
que virou o teste do avesso na corrida 4.

### 13.1 · ⚠️ MUDANÇAS DECLARADAS ANTES (§12·4a)

Três coisas mudam de número ou de forma **antes** da primeira linha de teste. Estão aqui antes
de serem verdade, porque perna declarada depois do resultado não é perna declarada.

**a) A perna P1 fica MAIS LENTA, e o preço é intrínseco.**

| | de | para (previsto) |
|---|---|---|
| **duração da P1** | **1,07 s** (medido hoje, `time npm run teste`) | **~7 s** |
| **nº de testes** | **102** | **~115** |

**Por que ~6 s a mais, e por que não dá para baratear honestamente.** A conduta que a A8
conserta é *"o canal espera ~3 s pelo socket e então diz a frase"*. Um teste que prove que a
frase **aparece** tem de deixar o orçamento acabar — e o orçamento é de 3 s por decisão do autor
(`controle-neovim-rpc.ts:28`, *"Tenta por ~3 s"*). Encurtá-lo em teste exigiria um botão de
teste dentro do código de produção, que é o anti-padrão que a `test-driven-development`
nomeia. **Então o teste paga os 3 s de verdade, duas vezes:** uma para provar que as quatro
funções que carregam a frase a exibem, outra para provar que a chamada seguinte **tenta de
novo** em vez de devolver a promessa morta (que é a metade memoizada do defeito).
Mitigação medida: `node --test` dá **um processo por arquivo** e roda os arquivos em paralelo,
então os dois ciclos de 3 s moram em arquivos diferentes e se sobrepõem.

**b) `TMPDIR` passa a ser redirecionado pelo gancho, junto do `HOME`.**
`SOCKET_NEOVIM` (`motor-neovim-pty.ts:18`) é `path.join(tmpdir(), "terminus-nvim.sock")` — um
caminho **fixo e compartilhado**. Sem redirecionar, a suíte se comporta de um jeito na máquina
com o Terminus aberto (o socket existe, `attach` conecta) e de outro sem ele. Isso é exatamente
a ressalva que `tests/apoio/rejeicoes-nao-tratadas.ts:11-15` escreveu e teve de aceitar.
Com o redirecionamento o socket é **garantidamente ausente**, e a ressalva pode sair no fim
desta corrida. Medido antes de escolher: `os.tmpdir()` honra `TMPDIR` (`node -e` com e sem), e
`SOCKET_NEOVIM` é o **único** consumidor de `tmpdir()` em `codigos/`.

**c) `@msgpack/msgpack@2.8.0` entra em `devDependencies`.**
O Neovim falso da rede (§13.3) fala msgpack-RPC de verdade. O pacote **já estava em disco** como
dependência transitiva de `neovim`, e usá-lo assim seria dependência-fantasma. Instalado
`--offline --save-exact`: `npm` respondeu *"up to date in 249ms"* e o diff foi de **uma linha em
cada arquivo** (`package.json` e `package-lock.json`) — nenhum pacote baixado, `node_modules`
intocado.

**d) A catraca — previsão escrita ANTES de medir.**

| | M1 | M2 | M3 | M4 |
|---|:---:|:---:|:---:|:---:|
| **declarado** | **2** | **0** | **0** | **13/13** |

**Por quê, tese por tese:** a A8 mexe num **motor** (não é registrador → M1 não a vê) e o import
novo é `node:net` (externo → M2 não ganha aresta). A A10 troca **tipos** na porta, na ponte e na
infra — `unknown` não cria import. A A7 acrescenta **um canal** a um registrador que **já
importa** `servicos/` — nenhum módulo novo de `sistema/`, então M1 não sobe. Nenhuma das três
toca `dominio/` (M3) nem a árvore de pastas (M4). **Se algum deles mudar, a previsão estava
errada e o portão reprova — que é o ponto.**

**e) A contagem de canais de IPC muda de FORMA, e a mudança é da cabeça.**
As corridas 1–4 provaram conduta preservada com *"**37**, idênticos por `diff`"*. A A7(a) cria
`projeto:fechar` **de propósito**. A asserção passa a ser: **os 37 da linha de base, idênticos
por `diff`, mais 1 novo declarado — total 38.** Um número re-declarado com a causa ao lado vale
mais que um número preservado em cima de um defeito.

### 13.2 · A8(c) APLICADA — o laço destravado e o vazamento parado

**O conserto tem duas metades, e a medição mostrou que uma sem a outra não fecha.**

| metade | o que mudou | por quê, medido |
|---|---|---|
| **(b) a conexão é NOSSA** | `abrirSoquete()` abre o socket, espera o `connect`, e **só então** `attach({ reader, writer })` | `attach({ socket })` num socket ausente produz `connect ENOENT` em **5 ms** como **rejeição não tratada** — e ela nasce dentro do pacote (`neovim/lib/utils/transport.js:87`, `iter.next().then(...)` sem ramo de erro). ⚠️ **Pôr tratador de `error` no socket NÃO basta**: medido, com o socket já falhado o `attach` ainda vaza. O que corta é **não anexar em socket morto** |
| **(a) teto na confirmação** | `comTeto(c.eval("1"), 300 ms)` | um socket que **aceita** a conexão e não fala msgpack faz `eval` **nunca assentar** — medido, nem em 800 ms nem nunca. É o mesmo mecanismo da A8 por outra porta, e é o único caso que a metade (b) não alcança |

**Duas decisões minhas dentro do conserto, as duas por medição e nenhuma na letra da árvore:**

**1. O laço passou a ser regido por PRAZO, não por contagem.** A árvore esboçava
`Promise.race([c.eval("1"), teto(300ms)])` mantendo as 25 tentativas. A conta reprova o
esboço: 25 × (300 + 120) = **10,5 s**, contra o *"Tenta por ~3 s"* que o arquivo promete por
escrito — 3,5× a promessa. Com `PACIENCIA_MS = 3000` como prazo, a frase do autor volta a ser
verdadeira qualquer que seja o custo de cada tentativa.

**2. Socket largado com `end()`, nunca `destroy()`.** Medido: `destroy()` num socket já
anexado faz o mesmo iterador rejeitar com `Premature close` — sem tratador. Largar com
`destroy()` seria trocar o silêncio da A8 por um vazamento novo, com outro nome.

#! ⚠️ UM ERRO MEU QUE O PRÓPRIO TESTE PEGOU: o laço parava **uma volta antes** do prazo, e a
#!   asserção de "esperou o orçamento inteiro" mediu **2904 ms de 3000**. A causa era conferir
#!   o relógio antes de dormir a espera cheia. A última espera passou a ser **aparada no que
#!   resta**, e o "~3 s" virou literal em vez de aproximado.

**A rede: três arquivos, três estados do mundo, 24 testes.**

| arquivo | o mundo que ele monta | testes |
|---|---|:---:|
| `controle-neovim-rpc.test.ts` | **sem Neovim nenhum** — socket ausente por construção (`TMPDIR` privado) | 6 |
| `controle-neovim-rpc-mudo.test.ts` | **socket que aceita e não fala** — a guarda do TETO | 4 |
| `controle-neovim-rpc-com-neovim.test.ts` | **Neovim falso respondendo msgpack-RPC de verdade** | 15 |

**O teste virou do avesso, e o diff é a prova.** O primeiro arquivo nasceu travando o defeito —
*"as cinco funções PENDURAM"*, *"a rejeição VAZA"*, *"a segunda chamada herda a promessa
morta"* — com o aviso do §12·3a·4 ao lado. Aplicada a A8(c), os **três ficaram vermelhos** e
foram reescritos para a conduta pretendida. **A frase agora aparece de verdade**, e é ela que o
teste cobra, verbatim, não um "algo retornou":

```
as quatro funções que carregam a frase rejeitam COM ela
   → erro.message === "Neovim não respondeu ao canal de controle."
```

Uma quarta mudança de forma é resultado do conserto e não escolha: a montagem voltou do **corpo
do módulo** para um `before` idiomático. Ela morava no corpo porque o `node --test` reprova o
escopo onde uma rejeição não tratada nasce — e agora não nasce nenhuma.

### 13.3 · As SABOTAGENS — quatro, e DUAS NÃO MORDERAM

Cada sabotagem reverte **o conserto**, não um vizinho, e todas com `tsc` **exit 0**.

| # | o que sabotei | mordeu? | resultado |
|---|---|:---:|---|
| 1 | `silent! write` → `write` | ✅ | 1 falha, a certa |
| 2 | memo de `conectando` removido | ❌ → ✅ | **não mordeu**: o teste media o `cliente` guardado, não o memo. Refeito com chamadas **concorrentes**, morde: 1 falha |
| 3 | teto neutralizado (metade **a**) | ✅ | 3 falhas no arquivo do socket mudo |
| 4 | guarda `if (soquete)` removida (metade **b**) | ✅ | **6 falhas** — a do vazamento mais as 5 asserções de rejeição das suítes de `servicos/` |
| 5 | `attach({reader,writer})` → `attach({socket})` | ❌ → ✅ | **não mordeu**: a suíte inteira seguiu verde abrindo **duas** conexões por tentativa. Fechado com contador de conexões no falso; refeito, morde: `expected 1, actual 2` |

> **As duas que não morderam valem mais que as três que morderam.** Cada uma expôs um teste meu
> que media a coisa errada — e o segundo caso era um desperdício de descritor de arquivo por
> tentativa, até 25 por ciclo, que **nenhuma perna do portão veria**.

#! ⚠️ E UMA TERCEIRA SABOTAGEM FOI REPROVADA POR MIM MESMO: a primeira tentativa de derrubar a
#!   guarda deixou `tsc` em **exit 2** (o `soquete` ficava `Socket | null` na chamada de
#!   `largarSoquete`). Pela lei que a corrida 4 escreveu — *sabotagem que quebra a compilação é
#!   ruído* — ela não conta, e foi refeita com `tsc` limpo antes de eu acreditar no vermelho.

#! ⚠️ E A SABOTAGEM DO TETO PENDUROU A SUÍTE: pus o teto em 24 h para "neutralizá-lo", e o
#!   `setTimeout` de um dia **segura o laço de eventos** — o processo de teste não podia sair,
#!   e o comando estourou 300 s. Morto por PID (nunca `pkill -f`, §15.4·8). O vermelho que eu
#!   queria já estava colhido; a lição é que **neutralizar com um número absurdo cria um
#!   segundo defeito** — um valor grande porém finito teria bastado.

### 13.4 · O que a A8 arrastou junto, porque a causa dela morreu

| onde | o que era | o que virou |
|---|---|---|
| `tests/apoio/rejeicoes-nao-tratadas.ts` | um filtro perdoava a assinatura da A8 por regex, e a asserção das suítes era *"nada INESPERADO vazou"* | o filtro e o regex **saíram**. A asserção é **"nada vazou"**, em 6 arquivos. Um perdão por assinatura sobrevive ao defeito e vira **buraco**: quem reintroduzisse o vazamento amanhã acharia a suíte verde |
| `escrita-confinada.test.ts` | um `console.log` imprimia a contagem de rejeições **sem entrar no veredito** | removido. Era o enfeite que o §12·2 proíbe, e agora o número **trava** |
| 5 arquivos de `servicos/` | comentários justificavam a montagem no corpo do módulo *"pela A8"* | anotados: a medição sobre o `node --test` continua verdadeira, **a rejeição não existe mais**, e a forma sobreviveu à causa → árvore **A11** |
| `tests/apoio/gancho-de-modulos.ts` | a suíte dependia de o Terminus estar aberto na máquina de quem roda | `TMPDIR` redirecionado: o socket é **privado do processo** |

### 13.5 · O portão da fatia A8

| perna | resultado |
|---|---|
| P1 teste da peça | **ok — 127 passaram** (eram 102: +24 do canal de controle, +1 do contador de conexões) |
| P2 verificação de tipo | ok |
| P3 build | ok |
| P4 alvo da corrida | M1 **2** · M2 **0** · M3 **0** · M4 **13/13** — como previsto em §13.1d |
| P5 conduta | ok — porta+renderer+ipc responderam |

**PORTÃO VERDE 5/5.** Duração da P1: **1,07 s → 6,5 s** (previsto ~7 s em §13.1a).

### 13.6 · A10(c) APLICADA — `unknown` na borda, e o `tsc` cobrando a peneira

**O caminho inteiro do `nome`, e onde ele parou de mentir:**

```
renderer  ──►  ponte-arquivo.ts        ──►  escrita-confinada.ts   ──►  arquivos-do-projeto.ts
   carga        nome: string→unknown         nome: string→unknown        validarNome(unknown)
   crua              (3 canais)                    (3 serviços)          + typeof, antes do trim
```

**O `tsc` fez exatamente o trabalho que a opção (c) prometia.** Tipada a borda como `unknown`,
ele apontou **3 erros — e os três nos lugares certos**, os pontos de entrega para a infra:

```
escrita-confinada.ts(62,67): error TS2345: Argument of type 'unknown' is not assignable to 'string'.
escrita-confinada.ts(68,65): error TS2345: ...
escrita-confinada.ts(74,68): error TS2345: ...
```

É o mesmo que aconteceu com `dir` e `antigo` na A3(a), e foi por isso que eu recomendei (c).

**Por que `typeof` e não `recusarEntrada`, que já existe e diz a mesma frase.** Era a opção (a),
e a árvore a recusou por escrito: aquela peneira também recusa o que começa com `-`, porque
**caminho** com traço vira opção do programa que o recebe. **Nome de arquivo não é caminho** —
`-x.txt` é legítimo. Herdar aquela regra seria mudar conduta sem ninguém ter decidido.
Isso agora tem **teste próprio**: *"nome começando com traço é ACEITO, e tem de continuar
sendo"*, e ele existe para que a opção (a) não seja aplicada por engano amanhã.

**As sabotagens, e a primeira é o argumento inteiro de (c) contra (b):**

| # | o que sabotei | `tsc` | resultado |
|---|---|:---:|---|
| A | tirar a peneira, e mais nada | **exit 2** | `error TS18046: 'nome' is of type 'unknown'` — **o compilador RECUSA**. Com a opção (b), tirar a linha compilaria em silêncio; com (c), o tipo é a guarda da guarda |
| B | voltar a CONFIAR no tipo: `(nome as string).trim()` | **exit 0** | **3 falhas**, uma por canal (`arquivo:criar`, `pasta:criar`, `caminho:renomear`). Restaurado: 25/25 |

> A sabotagem B é a reversão fiel do conserto: `(nome as string)` é literalmente o que o código
> antigo fazia — confiar na declaração. Ela morde os três canais, e só eles.

**O teste virou do avesso, e os moldes sumiram.** O bloco nasceu travando o defeito, e para
isso precisava escrever `42 as unknown as string` — porque a assinatura prometia `string` da
ponte até a infra. Depois do conserto o `42` entra direto. **O teste só pôde ficar mais simples
porque o tipo parou de mentir**, e o sumiço do molde é metade da prova.

### 13.7 · O portão da fatia A10

| perna | resultado |
|---|---|
| P1 teste da peça | **ok — 131 passaram** (eram 127: +4 no bloco do nome, um por canal mais a guarda do traço) |
| P2 verificação de tipo | ok |
| P3 build | ok |
| P4 alvo da corrida | M1 **2** · M2 **0** · M3 **0** · M4 **13/13** — como previsto |
| P5 conduta | ok — porta+renderer+ipc responderam |

**PORTÃO VERDE 5/5.**

---

### 13.8 · ⚠️ RE-DECLARAÇÃO ANTES DA A7 (§12·4a) — o número 37 muda de forma

A cabeça decidiu a **A7 opção (a)** no meio deste despacho. Ela cria um canal, e **37 era a
prova de conduta preservada das corridas 1 e 2**. O que aquele número provava continua valendo;
o que muda é a forma da asserção.

| | antes | a partir de agora |
|---|---|---|
| **a asserção** | *"**37**, idênticos por `diff`"* | *"os **37** da linha de base, idênticos por `diff`, **mais 1 novo declarado** — total **38**"* |
| **a causa** | — | `projeto:fechar`, criado **de propósito**, por decisão registrada em 24/08/2026 |

> Um número re-declarado com a causa escrita ao lado vale mais que um número preservado em cima
> de um defeito. **A catraca (M1–M4) NÃO muda**: `projeto:fechar` entra no registrador de
> projeto, que **já importa** `servicos/abertura-de-projeto` — nenhum módulo novo de `sistema/`,
> então M1 continua **2**; sem import novo, M2 segue **0**; `dominio/` intocado (M3 **0**) e a
> árvore de pastas idem (M4 **13/13**).

### 13.9 · ⚠️ CORREÇÃO DA PRÓPRIA ÁRVORE A7 — o caminho de repro que ela afirma NÃO reproduz

**Medi antes de obedecer, e o roteiro estava errado.** A árvore (§10.2) escreveu, e o despacho
repetiu: *"abrir `~/proj`, fechar, abrir `~`, botão direito em `proj` → Excluir → recusa com o
motivo errado"*. Rodado contra a regra de domínio, em fixture isolada:

| roteiro | `ehPastaProtegida` | o que acontece |
|---|:---:|---|
| **o da árvore** — abrir `~/proj`, fechar, **abrir `~`**, excluir `proj` | **false** | **nenhuma recusa.** Abrir `~` reatribui `raizAberta` para `~`, e `~/proj` fica **abaixo** dela — o defeito é apagado pelo próprio passo seguinte do roteiro |
| fechar e **não abrir mais nada**, excluir a pasta fechada | **true** | recusa com *"é a pasta de trabalho aberta"* — **a frase falsa** |
| fechar e **não abrir mais nada**, excluir a pasta **acima** da fechada | **true** | recusa idem |

**O defeito é real; o roteiro é que não é.** A raiz velha só sobrevive enquanto **nenhuma outra
pasta é aberta** — e abrir outra é justamente o que o roteiro mandava fazer. Sigo com a **(a)**,
que é o conserto certo para o defeito verdadeiro, e escrevo o teste no caminho **que
reproduz**. Não devolvo a árvore porque **a opção não mudou**: o que estava errado era a prova,
não a decisão.

⚠️ **E há uma ressalva de alcance que o registro precisa carregar:** com a pasta fechada o
renderer fica **sem árvore na tela**, então o menu de contexto — e portanto o botão Excluir —
**não é alcançável pela interface de hoje**. O que fica alcançável é o **canal**. Isso não
diminui o defeito, e a razão está escrita no próprio código que ele contamina: *"A trava fica
AQUI, e não só na tela: tela pode voltar a errar"* (`exclusao-de-caminho.ts:12`). Uma trava que
existe para sobreviver ao erro da tela **não pode depender da tela para importar**.

**O sintoma mais gordo, e é o outro:** `raizesDeEscrita()` continua devolvendo a pasta fechada,
então os **quatro** canais de escrita — `arquivo:gravar`, `arquivo:criar`, `pasta:criar`,
`caminho:renomear` — seguem aceitando escrita numa pasta que a pessoa acredita ter desligado.
Esse é reachable pelo canal e não depende de tela nenhuma.

### 13.10 · A7(a) APLICADA — fechar passa a fechar

**Quatro camadas, e a ordem entre elas é a regra.**

| camada | o que ganhou |
|---|---|
| `servicos/abertura-de-projeto.ts` | `fecharPasta()` — o **segundo escritor** de `raizAberta` no repositório, e o primeiro que a devolve a `null` |
| `sistema/ponte/ponte-projeto.ts` | o canal `projeto:fechar` |
| `porta/ponte-para-a-interface.ts` | `api.fecharPasta()` |
| `interface/arvore-de-arquivos.ts` | `fecharProjeto()` **avisa o main antes de limpar a tela** |

**Por que avisar antes de limpar, e não depois.** Se o main recusar, a tela ainda mostra a pasta
e a pessoa vê o erro com o estado íntegro. Limpando primeiro, uma falha deixaria tela e main
discordando — que é **exatamente o defeito que este conserto fecha**.

**A opção (d) ficou ABSORVIDA, e é o desfecho certo para ela.** A frase *"é a pasta de trabalho
aberta (ou está acima dela)"* parou de mentir **porque o estado passou a sustentá-la**, não
porque o texto foi reescrito. Nenhuma frase precisou de ajuste — conferido.

**A contagem de canais, medida contra a linha de base com extração larga:**

```
linha de base (ada7bfa): 37
hoje                    : 38
sumiram : []
novos   : ['projeto:fechar']
identicos: 37  ->  OS 37 DA BASE INTACTOS
```

É exatamente a asserção re-declarada em §13.8: **os 37 da linha de base, idênticos, mais 1 novo
declarado.**

**A sabotagem — `fecharPasta()` vira no-op**, que é a reversão fiel do conserto. `tsc` exit 0,
**4 falhas** (a pasta que não some, os quatro canais que não recusam, e as duas exclusões que
seguem mentindo) e **as 4 gêmeas de "com a pasta ABERTA nada mudou" seguiram verdes** — que é
o que separa "fechou" de "parou de funcionar". Restaurado: 8/8.

### 13.11 · A12 — o conserto da A7 não tem rede na ÚLTIMA camada — árvore de decisão (§12·3a)

> **De onde veio:** eu mesmo, sabotando o meu próprio conserto para ver o que a rede pega.

| parte | |
|---|---|
| **o defeito** | `arvore-de-arquivos.ts:431` é o **único chamador** de `api.fecharPasta()` em todo o repositório. Removida essa chamada — o renderer voltando a fechar só na tela, que é a A7 inteira de volta — **a suíte deu 139/139 e o portão deu VERDE 5/5**. Medido, com `tsc` exit 0 |
| **o que custa deixar** | a A7 pode ser desfeita amanhã, por engano, **sem que nada avise**. É a mesma família do buraco que a A2 deixou e que a corrida 3 teve de tapar — só que agora eu sei disso **antes** de fechar a corrida |
| **⚠️ o alcance, para não exagerar o tamanho** | isto **já estava declarado** como descoberto na perna **P5** desde 23/08: *"prova que o app sobe e responde; **não** prova que o botão certo faz a coisa certa. Clique, diálogo nativo e PTY interativo continuam fora"*. A A7 cai exatamente nesse buraco conhecido — ela não abriu um novo, ela mostrou o tamanho do que havia |
| **as opções** | **(a) automação de UI** (clicar o botão de verdade) — fecha o buraco inteiro e é infraestrutura nova, que o tracker §10.1 já recusou uma vez por custo. **(b) estender a perna P5** para chamar `window.terminus.fecharPasta()` por CDP e conferir o efeito — cobre porta+ponte+serviço de ponta a ponta, **mas não o botão**: a sabotagem que eu fiz continuaria passando. **(c) teste de registro de canal** — fazer o dublê do `electron` gravar os canais registrados e afirmar que `projeto:fechar` está lá; pega nome trocado e registro esquecido, não pega o renderer calado. **(d) deixar como está e REGISTRAR** |
| **minha recomendação** | **(d) agora, (a) quando houver decisão de investir em automação de UI.** E a razão não é preguiça: **(b) e (c) custam rede nova e não pegam a sabotagem que eu acabei de fazer** — dariam a sensação de cobertura sem a cobertura. Buraco tapado pela metade é pior que buraco medido, porque some do radar. O que **não** pode acontecer é a A7 fechar sem este parágrafo existir |
| **se ficar para depois** | **igual** — não apodrece. Mas cada conserto novo que termine no renderer cai no mesmo buraco, e o buraco já engoliu a A2 uma vez |
| ⚠️ **CORREÇÃO, medida no ato 3 desta mesma corrida** | **o buraco é MENOR do que eu escrevi acima.** O instrumento do terceiro ato **pega** esta sabotagem: removido o chamador, `projeto:fechar` aparece na coluna *"canal sem chamador na tela"* — e só ele. Então a A7 desfeita **seria vista no fechamento da corrida seguinte**. O que continua verdade é que **o portão não a pega**, e fechamento é ritual manual de fim de corrida, não trava de cada mudança |
| **DESFECHO** | **DECIDIDA em 24/08 pela cabeça: nem (a) nem (d) — REGISTRAR *e* VERSIONAR o instrumento.** A cabeça repetiu a sabotagem por conta própria (removeu `api.fecharPasta()` do renderer: `tsc` exit 0, 139/139, PORTÃO VERDE) e depois foi conferir o controle compensatório que eu invoquei — *"o ato 3 pega"* — e mediu que **o instrumento não estava no repositório**. Aplicado na corrida 6, fatia 1 (§15.1) |

---

## 14. Fechamento da corrida 5 — 24/08/2026 · os TRÊS atos do §12 passo 6

### Ato 1 — varredura do que a corrida MOVEU

Dois números mudaram e foram procurados no repositório inteiro, não só na vizinhança:

| o que mudou | onde foi varrido |
|---|---|
| **102 → 139 testes** | `README:75` · `docs/fluxo.md` (árvore de `tests/`, com as contagens por pasta refeitas **arquivo por arquivo**: dominio 26 · servicos 76 · motores 32 · infra 5) · `ferramentas/gera-fluxo.py` (a fonte do PNG, dois pontos) |
| **37 → 38 canais** | `docs/fluxo.md` (a linha de `ponte-projeto.ts` na tabela do teto, a soma, a promessa do §4 e a do §6) · `codigos/sistema/ponte/registra-tudo.ts:13` · a legenda do PNG · o cabeçalho de `ponte-projeto.ts` |
| **`inesperadas()` e `A8_SOCKET_NEOVIM` deixaram de existir** | 6 arquivos de teste, todos migrados para `assert.deepEqual(naoTratadas, [])` |
| **a A8 deixou de vazar** | 5 comentários de `servicos/` justificavam a montagem no corpo do módulo *"pela A8"*. A medição sobre o `node --test` continua verdadeira; **a rejeição não existe mais**. Anotados, e a simplificação virou a árvore **A11** |

⚠️ **TRÊS MENÇÕES AO 37 FORAM DELIBERADAMENTE NÃO ALTERADAS**, e a razão é que são registro
histórico, não afirmação viva: `fluxo.md:10` (*"Base medida: HEAD `ada7bfa` … 37 canais"*),
`fluxo.md:73` (a anatomia do monólito de 707 linhas) e `fluxo.md:360` (*"Conferido em campo,
duas vezes"*, sobre as fatias 5 e 6 da corrida 1). Reescrevê-las falsificaria o registro.

**O desenho foi refeito** — `fluxo.svg` + `fluxo.png`, **2843×1804**, e o md5 de duas gerações
seguidas é idêntico, então a regeração é conferível por `diff` e não por confiança.

#! ⚠️ E A RECEITA DO PNG, QUE ERA PENDÊNCIA DE DUAS CORRIDAS, NASCEU ERRADA. Ela agora mora no
#!   cabeçalho de `ferramentas/gera-fluxo.py` — mas a primeira versão que escrevi mandava
#!   `python3 ferramentas/gera-fluxo.py > docs/fluxo.svg`, e **isso corrompe o arquivo**: o
#!   script ABRE `docs/fluxo.svg` e escreve nele, e depois IMPRIME um resumo na saída padrão.
#!   O resumo caiu por cima dos primeiros **69 bytes** — a tag `<svg` sumiu, o `magick`
#!   respondeu `unable to read image data`, e **o PNG antigo ficou no lugar com o mesmo md5**.
#!   Só apareceu porque a receita foi **rodada** antes de ser commitada. Uma receita escrita e
#!   não executada é exatamente o tipo de instrução fabricada que a lei manda recusar.

### Ato 2 — vitrine conferida

| o que o README afirma | como foi conferido | resultado |
|---|---|---|
| `npm run teste` → *"139 testes"* | **rodado** | 139, 0 falhas ✔ |
| `npm run typecheck` → `tsc --noEmit` | **rodado** | exit 0 ✔ |
| `npm run portao` → *"as cinco pernas e o veredito"* | **rodado** | VERDE 5/5 ✔ |
| *"trava em cada um deles"* (M1–M4) | a catraca reprovaria fora do alvo | os quatro no alvo ✔ |
| **Estado: v0.0.7** | contra as **três** fontes do §12 passo 6 | `package.json` **v0.0.7** ✔ · changelog **v0.0.7** ✔ · **tag mais nova: v0.0.6** ✖ |

**A tag continua uma corrida atrás.** Não é afirmação falsa — as três fontes que **existem**
concordam —, então segue **listada** e não vira árvore: marcar mexe no histórico do
repositório, que é da lista negativa (§13.3a). Herdada da corrida 4.

**`npm run dev` e `npm run start` NÃO foram rodados**, e está declarado como nas corridas
anteriores: o portão já sobe o aplicativo de verdade na perna P5, e o `dev` deixou dois
processos vivos num despacho anterior.

### Ato 3 — varredura do que NINGUÉM moveu

**(a) exportado e canal sem chamador.**

| coluna | hoje | novos nesta corrida |
|---|:---:|:---:|
| símbolos exportados sem uso nenhum | **1** — `acharPython` (o **D4**, já registrado) | **0** |
| canais registrados sem invocação na porta | **0** de 38 | **0** |
| canais sem chamador **na tela** | **4** — `arquivo:ler` e `arquivo:gravar` (**A5**) e `neovim:parar` e `shell:pasta` (**A6**), os quatro **registrados** | **0** |

⚠️ **As duas colunas de canal respondem perguntas DIFERENTES, e confundi-las produziria um
número que contradiz as corridas 2 e 3 sem explicação.** *"Registrado no main mas nunca
invocado pela porta"* dá **0**; *"a porta publica, mas a tela nunca chama"* dá **4**. Foi a
segunda que as corridas anteriores contaram.

**(b) restos de produto anterior.** `.gitignore`, `tsconfig.json` e `electron.vite.config.ts`
conferidos linha a linha: **todo caminho citado existe**. Nenhuma pasta de ferramenta de outro
produto (`.vscode`, `.idea`, `.vs`) — as duas gerações de fóssil saíram na corrida 2. Os
herdados já listados seguem onde estavam, aguardando a cabeça.

#### ⚠️ O instrumento do 3º ato reprovou QUATRO vezes hoje — e uma delas era falha já escrita no meu diário

| # | o que ele respondeu errado | a causa |
|---|---|---|
| 1 | **17** símbolos órfãos, entre eles `$`, `fecharProjeto`, `prepararCampo` | `\b` não casa `$` (não é caractere de palavra), e o desconto da declaração deixava resto 1 |
| 2 | `porta.janela sem uso`, `porta.shell sem uso` — 10 canais | o regex casava o **namespace** de fora (`shell: { … }`) em vez do método de dentro |
| 3 | `porta.raiz sem uso`, `porta.nome sem uso` — 19 canais | sem âncora de início de linha, ele casava **parâmetro tipado** (`(raiz: string)`) como definição |
| 4 | **3** canais sem chamador, escondendo `neovim:parar` | procurava `parar\s*\(` solto — e `this.parar()` existe **quatro vezes** no reprodutor de papel de parede, em `codigos/design/` |

> ⚠️ **A quarta é a que dói: ela está escrita no meu próprio diário, do despacho 4, com o nome
> do arquivo.** Eu a reproduzi mesmo assim. Ler o registro não substituiu **validar contra um
> caso onde a resposta é conhecida** — e foi só isso que a pegou: a resposta conhecida era
> **4**, das corridas 2 e 3, e o instrumento dizia 3.

**Cada coluna foi validada onde a resposta é sabida, e isto agora tem regra:** os símbolos,
contra a árvore de `ada7bfa`, onde eu sabia haver **quatro** órfãos — achou os quatro. As duas
colunas de canal, contra uma **cópia** com um chamador conhecido removido — `projeto:fechar`
apareceu, e só ele. **A árvore base não serve para a coluna de canal** (o reino `porta/` nasceu
na corrida 1), então a validação dela tem de ser por cópia mutilada, não por commit antigo.

### 14.1 · Pendências vivas ao fim da corrida 5

| # | o que é | quem decide |
|---|---|---|
| **A11** | **NOVA.** A montagem de 5 suítes de `servicos/` mora no corpo do módulo por causa da A8, que **foi consertada hoje**. A forma sobreviveu à causa; voltar ao `before` idiomático é refatoração de andaime, fora da fatia | a cabeça |
| **A12** | **NOVA, achada sabotando o meu próprio conserto.** O renderer é o **único** chamador de `api.fecharPasta()`; removida a chamada, a suíte dá 139/139 e o portão dá VERDE. O **ato 3 pega** (medido), o **portão não** | a cabeça |
| **A5** | se o traceback clicável foi abandonado, `arquivo:ler` vira candidato a sair | a cabeça |
| **D4(b)** | apagar `localizador-do-python.ts` — só a cabeça sabe se era semente | a cabeça |
| **a tag v0.0.7 que não existe** | herdada da corrida 4. Marcar mexe no histórico, que é da lista negativa | a cabeça |
| herdados listados | `icon.svg:8`, `fluxo.md:314`, `tracker:150`, `tracker:162`, prosa de laboratório | a cabeça |
| do despacho 1 | o desvio de planta (sem `tests/arquitetura/` nem `tests/funcionais/`), o nome do arquivo do preload, o "empacote" descoberto na P3 | a cabeça |
| **o instrumento do 3º ato** | **quarta corrida seguida no scratchpad, e a primeira em que ele reprovou 4 vezes num dia só** — uma delas repetindo falha já escrita no diário. Virar ferramenta do repo é escopo novo; o custo de não fazê-lo já foi pago quatro vezes | a cabeça |
| **a receita do PNG** | **RESOLVIDA** — mora no cabeçalho de `ferramentas/gera-fluxo.py`, e nasceu errada e foi corrigida por execução | — |

### 14.2 · O que ficou DESCOBERTO, escrito porque preço não escrito é preço escondido

| descoberto | por quê |
|---|---|
| **o botão de Fechar pasta** | nada clica na tela. É a A12, e é o buraco que a P5 já declarava desde 23/08: *"não prova que o botão certo faz a coisa certa"* |
| **a P1 ficou 6× mais lenta** | 1,07 s → **6,5 s**, e o preço é intrínseco: provar que o canal desiste depois de ~3 s custa ~3 s, duas vezes. Declarado antes em §13.1a, e os dois ciclos moram em arquivos diferentes para rodarem em paralelo |
| **`neovim` sequestra o `console`** | medido hoje: `node_modules/neovim/lib/utils/logger.js:69` — *"Monkey-patch `console` so that it does not write to the RPC (stdio) channel"*. Qualquer `console.log` do processo principal, depois de o canal de controle carregar, **some**. Não foi tocado nesta corrida; fica escrito porque é o que matou uma sonda em silêncio no despacho anterior e custou uma bissecção inteira hoje |
| **queda do socket no MEIO da sessão** | o conserto da A8 põe tratador permanente de `error` no socket, o que **melhora** o caso (antes não havia nenhum), mas uma queda abrupta ainda faz o iterador do pacote `neovim` rejeitar com `Premature close`, sem tratador. Fora do escopo da A8, que é o socket **ausente**. Medido, não consertado |

---

## 15. Corrida 6 — 24/08/2026: A12 (registrar **e versionar**) e A11

A cabeça decidiu as duas árvores que a corrida 5 devolveu. Na A12 ela foi além do que eu
recomendei — eu pedi **(d) registrar**, ela mandou **registrar E versionar** — e a razão é
medição dela, não preferência.

### 15.1 · A12 APLICADA — o instrumento do 3º ato entra no repositório

#### O que a cabeça mediu, e é prova independente do buraco

Ela repetiu a sabotagem que eu tinha feito, sem olhar a minha: removeu a chamada
`api.fecharPasta()` do renderer e obteve **`tsc` exit 0, 139/139 verde, PORTÃO VERDE**.
**Reproduzi a medição dela** numa cópia (`git archive HEAD`, nada tocado no alvo vivo), com a
linha 432 de `arvore-de-arquivos.ts` trocada por um literal: `tsc` **exit 0**, suíte
**139 pass / 0 fail**. Duas medições independentes, o mesmo resultado — o buraco é real e é do
tamanho que a árvore diz.

#### E o achado que muda o desfecho: o controle compensatório não existia

A minha própria correção da árvore A12 dizia *"o ato 3 pega"*. Pega mesmo — mas o ato 3 é
rodado por um instrumento que **não estava em commit nenhum**. Quatro corridas seguidas o
reconstruíram do zero no scratchpad de quem o rodava.

> **É o mesmo defeito da receita do PNG que a corrida 5 acabou de consertar**, com outra roupa:
> um passo obrigatório do fechamento dependendo da memória de quem o executou da última vez.

| onde ele mora agora | `ferramentas/varre-orfaos.py` · `npm run orfaos` |
|---|---|
| as outras duas formas | `python3 ferramentas/varre-orfaos.py --ref <commit>` (uma árvore antiga, por `git`) e `--raiz <caminho>` (outra cópia) |
| **as três foram RODADAS antes de o cabeçalho que as promete ser commitado** | é a lição da receita do PNG, que nasceu errada na primeira linha por não ter sido executada |

#### ⚠️ As duas armadilhas de corpus — que são MINHAS, e o preço de versionar sem tratá-las

A cabeça foi específica: versionar sem tratar isto **reintroduz o defeito de forma permanente**,
que é pior que tê-lo tido de passagem. As duas estão no cabeçalho do arquivo, como C1 e C2.

| | o que era | como está tratada |
|---|---|---|
| **C1 — menção não é chamador** | a v1 varria `.md` junto com `.ts`, então uma linha de prosa no tracker escondia qualquer órfão **já registrado**: o documento que existe para anotar o órfão era o que o apagava do relatório | corpus de **código** (`.ts .mjs .js .cjs .py .html` em `codigos/ tests/ ferramentas/`) separado do de **prosa** (`.md`). A prosa virou **coluna própria**, e ela informa o contrário: órfão citado em doc é órfão **conhecido**. Hoje `acharPython` aparece com *"citado em doc: 11×"* |
| **C2 — a própria ferramenta não é chamador** | a v1 foi copiada para dentro da árvore que varria e o comentário dela citava `lerDoTwinny` — função órfã capaz de ler uma `apiKey`. O medidor se apagou do próprio relatório | exclusão por caminho **absoluto** de `__file__`, que é exatamente o caso histórico (a cópia rodava de dentro, e `__file__` era a cópia) |

⚠️ **E C2 não é teórica aqui, é a condição em que este arquivo vive:** ele mora **dentro** da
árvore que varre, `.py` **está** no corpus de código (`gera-fluxo.py` está ao lado), e o corpo
de prova dentro dele carrega **nomes de símbolo em literais de texto**. Sem a exclusão, esses
literais contam como chamador.

**Medido, e o número é honesto:** rodando hoje **com** e **sem** a exclusão, o resultado é o
**mesmo** — 1 órfão nos dois casos. Nenhum nome do corpo de prova colide com um símbolo real
**hoje**. Então a prova de que a exclusão segura alguma coisa **não está na árvore, está no
corpo de prova**, onde ela é derrubada de propósito e o órfão tem de sumir.

### 15.2 · Onde a lição foi morar — e por que não é o diário

> A cabeça pediu que isto ficasse **em algum lugar do projeto, não só no diário**: o instrumento
> reprovou **quatro vezes** num dia, e a quarta era uma falha **já escrita no meu próprio
> diário**, com o nome do arquivo, que eu repeti. *"Diário que não é relido não é memória — é
> arquivo morto."*

O melhor lugar não é outro texto. É **um corpo de prova que roda**: as seis armadilhas viraram
uma árvore de mentira dentro do próprio `varre-orfaos.py`, com a resposta escrita ao lado, e a
varredura roda sobre ela **antes de olhar o projeto**. Se um número não bate, o instrumento sai
com **exit 2 e não imprime relatório nenhum**.

**Prosa depende de alguém reler. Isto cobra sozinho.**

| # | a armadilha | o caso que a prende |
|---|---|---|
| **A1** | `\b` não casa `$` — todo símbolo chamado `$` saía como órfão | `export const $` usado por outro arquivo; se a fronteira voltar a ser `\b`, `$` reaparece na coluna de órfãos |
| **A2** | o **namespace** casava no lugar do método (10 canais falsamente órfãos) | `shell: { pasta: … }` chamado como `api.shell.pasta()` |
| **A3** | **parâmetro tipado** parecia definição (19 canais com o nome errado) | `ler: (arquivo: string) …` **com chamador** `api.ler(…)`: sem a âncora de início de linha o instrumento cobra `api.arquivo(…)`, não acha, e declara órfão um canal que tem chamador |
| **A4** | nome de método é genérico (`neovim:parar` escondido por `this.parar()`) | uma classe com `this.parar()` na mesma árvore, e o canal exposto como `neovim.parar()` |
| **ORD** | tirar bloco de comentário **antes** da linha: o sigilo da casa `//*` contém `/*`, e o regex come do cabeçalho até o primeiro `*/` (1320 de 1551 caracteres, medido) | o arquivo do órfão abre com `//*` e **fecha** com um bloco de verdade: invertida a ordem, os quatro `export` somem e a coluna de órfãos fica vazia |
| **C1/C2** | as duas de corpus, acima | são **sabotagens embutidas**: o corpo de prova derruba cada guarda de propósito e **exige que o órfão desapareça**. Se não desaparecer, a guarda não está segurando nada |

#### As sabotagens do próprio instrumento — 7 de 7 mordidas

Guarda que ninguém viu falhar é enfeite (§12·2), e isso vale para o corpo de prova também.
Sete cópias do instrumento, cada uma com **uma** armadilha reintroduzida:

| sabotagem | o corpo de prova respondeu |
|---|---|
| A1 → fronteira `\b` | `orfaos: esperado ['orfa'], obtido ['$', 'orfa']` |
| A2 → o grupo deixa de ser procurado | `sem_chamador: … obtido [… 'shell:pasta']` |
| A3 → a propriedade perde a âncora | `sem_chamador: … obtido [… 'arquivo:ler' …]` |
| A4 → o caminho do objeto some | `sem_chamador: esperado 2, obtido ['arquivo:gravar']` |
| ORD → bloco antes da linha | `orfaos: esperado ['orfa'], obtido []` |
| C2 → a sabotagem interna vira no-op | *"e ele NÃO sumiu: a guarda não está segurando nada"* |
| C1 → a sabotagem interna vira no-op | *"e ele NÃO sumiu: a guarda não está segurando nada"* |

**7 de 7, exit 2, sem relatório impresso.** As duas últimas provam que as sabotagens embutidas
não são decorativas — desligadas, o corpo de prova reprova.

### 15.3 · Validação contra resposta conhecida — a árvore e o número

A lição do despacho 5 continua valendo, e ela é o que pegou a quarta reprovação: **ler o
registro não impediu a repetição; validar contra resposta conhecida, sim.**

| coluna | árvore usada | resposta conhecida | o que o instrumento versionado deu |
|---|---|---|---|
| **símbolos** | `ada7bfa` — a base de 30 arquivos, antes da corrida 1 | **4** órfãos, contados nas corridas 2 e 3 | **4**, e são os quatro: `acharPython`, **`lerDoTwinny`**, `neovimRodando`, `shellEstaVivo` |
| **canais** | cópia de `HEAD` (`git archive`, nada tocado no vivo) com o único chamador de `api.fecharPasta()` removido | os **4** conhecidos **+ `projeto:fechar`**, e só ele | **5**: `arquivo:ler`, `arquivo:gravar`, `neovim:parar`, `shell:pasta`, **`projeto:fechar`** |

⚠️ **A árvore base NÃO serve para a coluna de canal** — `codigos/porta/` nasceu na corrida 1 —,
e é por isso que a segunda validação é por cópia mutilada. A regra, escrita na corrida 5, é que
*"rodei onde sei a resposta" não basta: é preciso saber **qual pergunta** aquela árvore responde.*

> **E repare no que a primeira validação devolveu:** o instrumento encontra `lerDoTwinny` — o
> símbolo cuja **desaparição** criou a armadilha C2. A resposta conhecida e a armadilha são o
> mesmo caso.

### 15.4 · ⚠️ O relatório do 3º ato mudou de FORMA — declarado, e a previsão que errei

O corpus de chamadores era só `codigos/`. Um símbolo que **só o teste usa** aparecia como
*"usado só dentro do próprio arquivo"*, misturado com export largo demais. São coisas
diferentes, e agora são colunas diferentes.

| | previsão, escrita **antes** de medir | medido |
|---|---|---|
| símbolos sem chamador em lugar nenhum | 1 (`acharPython` continua órfão) | **1** ✔ |
| saem de *"só em casa"* por terem chamador em `tests/` | **2** — `confinado` e `PACIENCIA_MS` | **3** ✘ — os dois **e `shellEstaOcioso`** |
| *"usados só dentro do próprio arquivo"* | 18 → 16 | 18 → **15** ✘ |
| canais sem chamador na tela | 4, sem mudança | **4** ✔ |

**Errei por contagem, não por regra.** Eu mesmo escrevi *"são de camadas que a suíte cobre"* e
`motor-do-shell-pty` é dessas camadas — nomeei dois e a minha própria razão dava três. Fica
escrito porque previsão existe para ser conferida, não para acertar.

**E um número subiu sem eu ter previsto: 171 → 175 exportados.** Fui medir em vez de aceitar, e
o motivo é que o regex antigo **não enxergava `export let`**: `doca`, `painelLateral`,
`lateralAberta` (conferidos com `grep`, os três existem) e o `$` de `base-da-tela.ts:19`.
Nenhum símbolo foi **perdido** na troca — o conjunto novo contém o antigo inteiro. Ou seja: o
instrumento antigo tinha um **quinto** ponto cego, e ele só apareceu ao versionar.

### 15.5 · O portão da fatia A12

Previsto **antes** de rodar, e escrito na catraca: nada em `codigos/` muda, então M1–M4 ficam
**2 · 0 · 0 · 13/13**.

| perna | resultado |
|---|---|
| P1 teste da peça | **139 passaram**, 0 falhas |
| P2 verificação de tipo | `tsc --noEmit` exit 0 |
| P3 build | ok |
| P4 alvo da corrida | M1 **2** ≤ 2 · M2 **0** ≤ 0 · M3 **0** ≤ 0 · M4 **13/13** ≥ 13 |
| P5 conduta | porta + renderer + ipc responderam |

**PORTÃO VERDE 5/5**, idêntico à previsão.

⚠️ **E ele continua NÃO sendo perna de portão, por decisão escrita no cabeçalho do próprio
arquivo.** A recusa é a mesma que eu já tinha medido e a cabeça manteve: **órfão transitório
entre fatias é estado legítimo** — uma peça extraída antes de o chamador ser religado fica órfã
por um commit, e travar nisso daria vermelho falso justamente no meio da refatoração. O lugar
dele é o **fechamento** (§12 passo 6), onde a pergunta é *"o que ficou parado"*, não *"esta
fatia quebrou algo"*. Consequência no código de saída: **achar órfão sai 0**; o único exit
diferente de zero é **2**, quando o corpo de prova reprova.

### 15.6 · A11 APLICADA — a forma perde o andaime

**A árvore A11 dizia:** cinco suítes de `servicos/` montam no **corpo do módulo** em vez de num
`before`, e a razão era a **A8** — `entrarNaPasta` disparava `cdNeovim`, `attach()` vazava
`connect ENOENT`, e o `node --test` reprova o arquivo quando a rejeição nasce dentro de um
gancho, **mesmo com tratador instalado**. A A8 morreu em 24/08; a forma sobreviveu à causa.

| **DESFECHO** | **APLICADA em 24/08 por decisão da cabeça.** As cinco normalizadas |
|---|---|

#### A premissa já estava provada no disco, e não por mim

Antes de mexer numa linha eu fui medir se o `before` funciona depois do conserto — e a resposta
não precisou de experimento: **`tests/servicos/fechamento-de-pasta.test.ts:46`**, escrito ontem
mesmo na fatia da A7, **depois** do conserto da A8, já chama `await entrarNaPasta(aberta)` dentro
de um `beforeEach`, e está verde desde então. Um arquivo irmão já era a prova.

#### As cinco, e o que mudou em cada uma

| arquivo | o que saiu do corpo do módulo | valor capturado |
|---|---|---|
| `exclusao-de-caminho.test.ts` | `entrarNaPasta` + espera | nenhum |
| `escrita-confinada.test.ts` | `entrarNaPasta` + espera | nenhum |
| `escrita-em-pasta-por-atalho.test.ts` | idem | `aberto` → `let` + `Awaited<ReturnType<…>>` |
| `abertura-de-projeto.test.ts` | **três** aberturas em ordem | `abertaPrimeira`, `abertaSegunda` |
| `criacao-de-projeto.test.ts` | `ondeSalvar` + `escolherECriar` + snapshot | `criado`, `chamadasDaCriacao` |

⚠️ **Nenhum `any` entrou.** Os tipos vieram de `Awaited<ReturnType<typeof …>>`, que acompanha a
assinatura em vez de duplicá-la — se `entrarNaPasta` mudar o que devolve, o teste segue junto.

⚠️ **E uma coisa NÃO foi normalizada, de propósito:** `tests/motores/controle-neovim-rpc-com-neovim.test.ts`
também monta no corpo do módulo, mas **não é A11** — a razão dele é outra e está escrita no
próprio arquivo (o socket precisa estar escutando antes do primeiro `obter()`). Fica listado
aqui porque a razão escrita lá **é discutível** — um `before` também roda antes de qualquer
teste —, e listar é o que a lei manda quando não se conserta.

#### Conduta preservada, e medida NOS DOIS SENTIDOS

O §12·3 manda que a lógica só mude de lugar. Verde não prova isso: uma suíte que parou de olhar
fica verde igual. Duas sabotagens, ambas com **`tsc` exit 0** — a regra que eu mesmo escrevi na
corrida 4, de que sabotagem que quebra a compilação é ruído.

| sabotagem, em cópia da árvore de trabalho | o que as cinco responderam |
|---|---|
| **`raizAberta` deixa de ser registrada** (`abertura-de-projeto.ts:78`) — a montagem passa a não montar nada | **23 falhas**: abertura **3**, criação **1**, escrita-confinada **12**, atalho **4**, exclusão **3**. As cinco enxergam |
| **o vazamento da A8 reintroduzido** (`void Promise.reject(new Error("connect ENOENT …"))` em `cdNeovim`) | **1 falha em cada uma** — e é a certa: *"NENHUMA rejeição não tratada vazou durante a suíte"* |

⚠️ **A comparação que eu ia afirmar, e a medição derrubou.** Eu ia escrever que a forma nova é
**mais estrita**, porque a rejeição passa a nascer dentro de um gancho e o runner reprova o
arquivo inteiro. Fui medir a forma antiga sob a mesma sabotagem: **1 falha em cada, idêntico**.
O que pega a regressão não é o runner, é a **asserção explícita** `naoTratadas == []` que as
cinco carregam — e ela funciona igual nos dois lugares. **Igual, não mais forte.** A
normalização é conduta preservada, que é exatamente o que o §12·3 pede, e nada além disso.

#### A tabela mudou de casa, e o motivo é o mesmo do §15.2

A tabela de cinco medições sobre o `node --test` morava no corpo de `escrita-confinada.test.ts`.
Ela é **fato sobre o runner**, não sobre aquela suíte, e agora vive em
`tests/apoio/rejeicoes-nao-tratadas.ts` — o módulo que existe para lidar com rejeição, que é
onde estará quem for tropeçar nisso de novo.

⚠️ **E junto dela foi a leitura ERRADA que ela permitia**, porque é a leitura que custou cinco
arquivos na forma esquisita: *a tabela **não** diz "monte no corpo do módulo". Diz "não deixe
vazar rejeição".* Enquanto a A8 vazava, o corpo do módulo era a única saída; consertada a A8,
não há do que fugir.

#### O portão da fatia A11

Previsto **antes**, na catraca: só `tests/` muda, então M1–M4 ficam **2 · 0 · 0 · 13/13** e a
contagem de testes fica em **139** — a montagem trocou de lugar, nenhum `test()` nasceu ou
morreu. Medido: **139 passaram**, `tsc` exit 0, build ok, M1–M4 nos quatro valores previstos,
P5 ok. **PORTÃO VERDE 5/5.**

---

## 16. Fechamento da corrida 6 — 24/08/2026 · os TRÊS atos do §12 passo 6

### Ato 1 — varredura do que a corrida MOVEU

| o que mudou | onde foi varrido |
|---|---|
| **`ferramentas/varre-orfaos.py` nasceu** | `docs/fluxo.md` (o nó de `ferramentas/` na árvore) · **`ferramentas/gera-fluxo.py`** (o rótulo do nó, que é a **fonte** do PNG — mudar só o `.md` deixaria o desenho mentindo) · `README.md` |
| **`npm run orfaos` nasceu** | `README.md`, ao lado dos outros três, **com a distinção escrita**: é no *fechamento*, não a cada mudança |
| **5 suítes trocaram de forma** | a contagem **não muda** (139), e foi conferida: nenhum `test()` nasceu ou morreu |
| **a tabela do `node --test` mudou de arquivo** | as 4 referências cruzadas *"ver `abertura-de-projeto.test.ts`, item 2"* foram reescritas nos 4 arquivos; nenhuma sobrou apontando para o parágrafo que saiu |

**O desenho foi refeito** — `fluxo.svg` + `fluxo.png`, **2843×1804**, duas gerações com **md5
idêntico**. E o recorte do nó novo foi **aberto e olhado**, não só gerado.

### 16.1 · ⚠️ A13 — a SEGUNDA receita do PNG, e ela é a errada — árvore de decisão (§12·3a)

> **De onde veio:** a varredura do ato 1. Procurando onde `ferramentas/` é citado, achei um
> lugar onde o PNG é ensinado — e não é o `gera-fluxo.py`.

| parte | |
|---|---|
| **o defeito** | `docs/fluxo.md:431`, sob o título **"Como refazer o `fluxo.png`"**, ensina `python3 ferramentas/gera-fluxo.py && magick -background none docs/fluxo.svg -strip docs/fluxo.png` — **sem `-density 150`**. É a receita antiga, de antes de a corrida 5 consolidá-la no cabeçalho de `gera-fluxo.py`. **Duas receitas no repositório, e a que está na PLANTA é a errada** |
| **a prova, executada em cópia isolada** (`git archive HEAD`, nada tocado no vivo) | a receita do `fluxo.md` → **1820×1155, 248 242 B**. A do `gera-fluxo.py` → **2843×1804, 453 177 B**, com **md5 idêntico** ao PNG versionado. O `magick` não reclama em nenhum dos dois casos |
| **o que custa deixar** | quem for refazer o desenho abre a **planta** — é o documento que o §11 chama de fonte da verdade — e encontra a receita errada primeiro. O PNG encolhe 1,5625× em cada lado (150/96), **com exit 0 e sem aviso**, e só quem abrir a imagem percebe. Já aconteceu uma vez, medido, em 24/08 |
| ⚠️ **e o agravante** | a corrida 5 escreveu no diário que a receita *"agora mora no cabeçalho de `gera-fluxo.py`"*. Isso é verdade e está incompleto: **ela também continuou morando aqui, errada.** A consolidação não varreu o duplicado — é a *emenda sem varredura* do §15.4 acontecendo dentro do conserto que existia para acabar com ela |
| **as opções** | **(a) apagar o bloco do `fluxo.md` e apontar para o cabeçalho de `gera-fluxo.py`** — uma fonte só, e é onde quem edita o gerador já está. Custa uma indireção a quem lê a planta. **(b) corrigir a receita no `fluxo.md`** (pôr o `-density 150`) — leitura direta, mas mantém **duas** cópias que vão divergir de novo: foi exatamente assim que este defeito nasceu. **(c) mover a receita inteira para o README**, na seção de comandos, e as duas outras apontarem para lá. **(d) deixar como está e REGISTRAR** |
| **minha recomendação** | **(a).** O defeito não é a receita estar errada, é ela estar **duplicada** — corrigir a cópia (opção b) conserta o sintoma e deixa a doença, e a doença já cobrou uma vez. A planta é mapa de navegação (§11): apontar para onde a receita mora é o serviço dela. E a indireção é curta, porque o nó de `ferramentas/` na mesma planta já diz o que o `gera-fluxo.py` faz |
| **se ficar para depois** | **fica mais caro devagar.** Cada corrida que refaz o desenho é uma chance de alguém abrir a planta primeiro. E o PNG errado passa pelo portão — nenhuma das cinco pernas olha para dimensão de imagem |
| **DESFECHO** | **EM ABERTO** — devolvida à cabeça |

### Ato 2 — vitrine conferida

| o que o README afirma | como foi conferido | resultado |
|---|---|---|
| `npm run teste` → *"139 testes"* | **rodado** | 139, 0 falhas ✔ |
| `npm run typecheck` → `tsc --noEmit` | **rodado** | exit 0 ✔ |
| `npm run portao` → *"as cinco pernas e o veredito"* | **rodado** | VERDE 5/5 ✔ |
| `npm run orfaos` — **novo hoje** | **rodado**, e as outras duas formas do cabeçalho (`--ref`, `--raiz`) também | corpo de prova OK, relatório impresso ✔ |
| **Estado: v0.0.7** | contra as **três** fontes do §12 passo 6 | `package.json` **0.0.7** ✔ · changelog **v0.0.7** ✔ · **tag mais nova: v0.0.6** ✖ |

**A tag segue uma corrida atrás — terceira corrida em que isto é listado.** Não é afirmação
falsa (as três fontes que **existem** concordam), então continua **listada** e não vira árvore:
marcar mexe no histórico do repositório, que é da lista negativa (§13.3a).

**`npm run dev` e `npm run start` NÃO foram rodados**, declarado como nas corridas anteriores:
o portão já sobe o aplicativo de verdade na perna P5, e o `dev` deixou dois processos vivos num
despacho anterior.

### Ato 3 — varredura do que NINGUÉM moveu · **agora pelo instrumento versionado**

> É o ponto desta corrida: o terceiro ato deixou de depender da memória de quem o rodou.
> `npm run orfaos`, com o corpo de prova aprovado antes de o relatório existir.

**(a) exportado e canal sem chamador.**

| coluna | hoje | novos nesta corrida |
|---|:---:|:---:|
| símbolos sem chamador em lugar nenhum | **1** — `acharPython` (o **D4**, registrado), citado em doc 14× | **0** |
| chamados **só por `tests/`** — coluna nova (§15.4) | **3** — `PACIENCIA_MS`, `confinado`, `shellEstaOcioso` | — |
| usados só dentro do próprio arquivo | **15** | **0** |
| canais registrados e **não expostos** pela porta | **0** de 38 | **0** |
| canais expostos e **sem chamador na tela** | **4** — `arquivo:ler`/`arquivo:gravar` (**A5**) e `neovim:parar`/`shell:pasta` (**A6**), os quatro registrados | **0** |

**(b) restos de produto anterior.** Reconferido item a item. `.gitignore`, `tsconfig.json` e
`electron.vite.config.ts`: **todo caminho citado existe ou é padrão de exclusão legítimo** —
os quatro `include` do `tsconfig` resolvem para 58 + 1 + 22 + 1 arquivos. Nenhuma pasta de
ferramenta de outro produto (`.vscode`, `.idea`, `.vs`). Os herdados já listados seguem onde
estavam: `media/icon.svg:8`, `docs/fluxo.md:314`, `tracker:150`, `tracker:162`, a prosa de
laboratório, e `*.ab1`/`*.fsa`/`*.scf`/`*.phd.1` **mantidos de propósito por decisão da cabeça**.

#### ⚠️ O instrumento reprovou UMA vez hoje — e a comparação com ontem é o número que interessa

| corrida | reprovações do instrumento no dia | onde ele morava |
|---|:---:|---|
| 2, 3, 4 | 3 acumuladas | scratchpad, reconstruído a cada vez |
| **5** | **4 num dia só**, uma delas repetindo falha **já escrita no diário** | scratchpad |
| **6 (hoje)** | **1** — e foi pega pelo **próprio corpo de prova**, não por mim relendo nada | `ferramentas/varre-orfaos.py`, versionado |

A única de hoje: o caso **C3** não mordia porque eu tinha posto o arquivo ignorado na raiz, e o
corpus de chamadores é restrito a `codigos/`, `tests/` e `ferramentas/` — ele nunca entraria,
com ou sem a guarda. **A sabotagem obrigatória é que a pegou**, não a leitura do código.

### 16.2 · Pendências vivas ao fim da corrida 6

| # | o que é | quem decide |
|---|---|---|
| **A13** | **NOVA.** `docs/fluxo.md:431` ensina a receita do PNG **sem `-density 150`** — segunda cópia, e é a errada. Medida em cópia isolada: 1820×1155 contra 2843×1804 | a cabeça |
| **A12** | **FECHADA** — instrumento versionado, `npm run orfaos` | — |
| **A11** | **FECHADA** — as cinco suítes normalizadas | — |
| **A5** | se o traceback clicável foi abandonado, `arquivo:ler` vira candidato a sair | a cabeça |
| **D4(b)** | apagar `localizador-do-python.ts` — só a cabeça sabe se era semente. **Quinta corrida como único órfão do repositório** | a cabeça |
| **a tag v0.0.7 que não existe** | herdada da corrida 4, terceira listagem | a cabeça |
| herdados listados | `icon.svg:8`, `fluxo.md:314`, `tracker:150`, `tracker:162`, prosa de laboratório | a cabeça |
| do despacho 1 | o desvio de planta (sem `tests/arquitetura/` nem `tests/funcionais/`), o nome do arquivo do preload, o "empacote" descoberto na P3 | a cabeça |
| **o `console` sequestrado pelo `neovim`** | `node_modules/neovim/lib/utils/logger.js:69`. Vale para o processo principal do produto, não só para sondas. Não tocado | a cabeça |
| **`controle-neovim-rpc-com-neovim.test.ts`** | monta no corpo do módulo por razão própria, **não A11** — e a razão escrita lá é discutível (um `before` também roda antes de qualquer teste). Listado, não mexido | a cabeça |

---

## 17. Corrida 7 — 24/08/2026: a janela preta em `npm run dev`

Defeito achado **em campo pela cabeça**, abrindo o programa. Não por perna de portão — e a
razão de nenhuma perna tê-lo pego é o assunto desta corrida.

### 17.1 · ⚠️ DECLARADO ANTES DA FATIA 1 (§12·4a) — a perna P6 e o que muda de número

**O defeito, medido antes de consertar.** Em `dev` o renderer é servido por HTTP. A config
declara `root: codigos` (`electron.vite.config.ts:18`) com a entrada em `interface/pagina.html`
(`:22`) — então a página **não fica na raiz do servidor**. Mas `janela-principal.ts:89-90`
carrega a raiz. Medido por mim, três vezes, por três caminhos independentes:

| como medi | `GET /` | `GET /interface/pagina.html` |
|---|---|---|
| arnês headless (`resolveConfig` + `vite.createServer`, o mesmo par que o `electron-vite dev` usa em `lib-t2ExBjL5.mjs:58`) | **HTTP 404, 0 bytes** | **HTTP 200, 7075 bytes** |
| o mesmo arnês contra `git archive 0ace461` (a base da corrida), em cópia isolada | **HTTP 404, 0 bytes** | **HTTP 200, 7075 bytes** |
| o **`npm run dev` de verdade**, nesta máquina, com `HOME` redirecionado | **HTTP 404, 0 bytes** | **HTTP 200, 7075 bytes** |

7075 = os 7020 bytes do arquivo em disco + os 55 do `<script src="/@vite/client">` que o Vite
injeta — conferido linha a linha contra o disco, não suposto.

⚠️ **Uma medição minha nasceu errada e o número denunciou:** a primeira sonda imprimiu **7003**
e eu ia registrar isso. `fetch().text().length` conta **unidade UTF-16, não byte**, e a página
tem acento. Refeita com `Buffer.byteLength`, deu 7075 — e só então bateu com a cabeça. Foi o
número surpreendente pedindo segunda fonte (§7·D1) que pegou o instrumento, não releitura.

**NÃO é regressão desta corrida — conferido, não aceito.** Os três determinantes do endereço em
`dev` são **byte a byte** os da base `0ace461`: as duas linhas de carga, o bloco `renderer` da
config (`diff` vazio) e o lugar de `pagina.html`. O defeito nasceu com o produto.

**A forma do conserto foi MEDIDA, não escolhida por gosto.** A pergunta era se o `electron-vite`
oferece o caminho completo por configuração. Não oferece:
`node_modules/electron-vite/dist/chunks/lib-t2ExBjL5.mjs:67` monta
`process.env.ELECTRON_RENDERER_URL = ${protocol}//${host}:${port}` — **origem pura, sem caminho**,
sem knob. Então o caminho tem de ser composto por nós, e o conserto é no código.

#### Por que nenhuma perna viu, e por que a perna nova NÃO ganha comando próprio

A P3 roda `electron-vite build`; a P5 sobe o app **construído**. O comando que o README manda um
recém-chegado usar — `npm run dev` — é o único que **nenhuma perna cobre**.

> **A lição, e ela decide a forma da P6:** o defeito sobreviveu porque a cobertura morava num
> comando que ninguém rodava. Dar à perna nova um **comando próprio** repetiria exatamente esse
> erro. Por isso a P6 anda dentro de `npm run teste`, que a P1 já obriga a estar verde.

**E o preço foi medido antes de decidir**, porque perna cara que ninguém roda é pior que perna
nenhuma:

| forma | custo medido | veredito |
|---|---|---|
| subir o `electron-vite dev` inteiro a cada fatia | build de main+preload + Electron + **janela abrindo na cara de quem roda** | recusada |
| **arnês headless** (`resolveConfig` + `createServer` + `fetch`) | **274 ms / 269 ms** em duas corridas | **escolhida** |
| — para comparar, a P1 hoje | **6,5 s** (`time npm run teste`) | a P6 é ~4% dela |

### P6 · CONDUTA EM DEV — a página que a janela carrega existe

```bash
npm run teste          # a P6 anda aqui dentro, junto da P1
# sozinha, para depurar:
node --import ./tests/apoio/gancho-de-modulos.ts --test tests/funcionais/carga-da-pagina-em-dev.test.ts
```

| | |
|---|---|
| **o que ela pergunta** | sobe o servidor de dev do renderer pelo **mesmo par de funções** que o `electron-vite dev` usa, chama a `criarJanela()` **de verdade** com o `electron` dublado, **captura a URL que a produção passou ao `loadURL`**, e faz `GET` nela exigindo **HTTP 200 e corpo não vazio**. |
| **por que capturar do `loadURL`, e não perguntar à função de domínio** | um teste que chamasse a função de domínio direto passaria **mesmo que `janela-principal.ts` nunca a chamasse** — mediria a peça, não a ligação. O defeito de hoje é exatamente uma ligação errada. A perna tem de morder onde dói. |
| **headless de propósito** | nada de tela, nada de GPU, nada de `xvfb`. O `BrowserWindow` é o duble; quem sobe de verdade é só o servidor HTTP. |
| **o que fica DESCOBERTO** | ela prova que **o endereço serve a página**; não prova que a página **renderiza** em dev. Renderização em dev continua sem rede — a P5 só cobre o app **construído**. Declarado, não resolvido. |

### 17.2 · Os números que MUDAM, escritos antes de rodar

| medida | hoje | previsto ao fim | por quê |
|---|:---:|:---:|---|
| **P1 · testes** | 139 | **145** | +4 unidade (`tests/dominio/endereco-da-pagina.test.ts`) +2 funcionais (`tests/funcionais/carga-da-pagina-em-dev.test.ts`) |
| M1 acoplamento | 2 | **2** | `janela-principal.ts` não é registrador (não tem `ipcMain`), e `dominio/` não fica sob `sistema/` |
| M2 ciclos | 0 | **0** | `dominio/` é folha do grafo; a seta nova é `janela → dominio`, sentido único |
| M3 pureza | 0 | **0** | o módulo novo importa **só `node:path`**, que é a lista-branca inteira (`portao.mjs:119`) |
| M4 nós da árvore | 13/13 | **13/13** | `tests/funcionais/` **não** está em `NOS_EXIGIDOS` (`portao.mjs:142-147`) — nascer não move o número |

**`tests/funcionais/` nasce aqui, e isso encosta no desvio de planta do despacho 1** — mas não o
fecha: a planta pedia `funcionais/` para **a conduta**, que hoje é a P5. Nasce a pasta, com um
morador; o desvio segue de pé e segue sendo da cabeça.
