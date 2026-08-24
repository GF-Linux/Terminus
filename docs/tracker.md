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
| P1 teste | `npm run teste` | **0 testes** | verde, e a peça movida tem teste |
| P2 tipo | `npm run typecheck` | exit 0 | exit 0 |
| P3 build | `npx electron-vite build` | exit 0 | exit 0 |
| P4 alvo | `node ferramentas/portao.mjs --medidas` | M1=7 M2=2 M3=n/a M4=5/13 | ≤ o declarado da fatia (catraca) |
| P5 conduta | `node ferramentas/portao.mjs --conduta` | VIVA | VIVA |

**Sem as cinco verdes, não avança.**

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
| maior arquivo de `sistema/` | **707 linhas** (o monólito) | **289** — e é o `configuracao-salva`, que já tinha 289 antes |
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


---

## 8. Corrida 2 — 24/08/2026: as árvores e os seus DESFECHOS (§12·3a·5)

> **Por que esta seção existe:** em 24/08 o §12·3a ganhou o **quinto dever** — *toda árvore
> devolvida tem desfecho registrado: aplicada, recusada ou adiada, com quem decidiu e quando*.
> O D4 da seção 7 é o caso que fez a regra nascer (recomendou "(c) agora" e a marca nunca foi
> posta nem recusada). Aqui nenhuma árvore sai sem a linha de desfecho.

| árvore | o que era | desfecho |
|---|---|---|
| **A3** | criar/renomear confinam contra a raiz que o CHAMADOR envia, por comparação textual; `gravar` usa realpath + raízes do dono | **(b) aplicada em 24/08/2026, decidida pela cabeça:** conduta fica, comentário passa a dizer a verdade (P4), e o fundo fica registrado aqui. **(a) — uniformizar — segue em aberto** para corrida futura, depois que `servicos/` tiver rede de teste |

### A3 · o confinamento assimétrico — árvore de decisão (§12·3a)

| parte | |
|---|---|
| **o defeito** | `arquivos-do-projeto.ts:134-139` (`dentroDe`) compara **texto**, sem `realpath`, contra a `raiz` que veio do renderer; `escrita-confinada.ts:18-25` (`confinado`) resolve o link e confere contra `raizesDeEscrita()` — as raízes que o **dono** conhece. Os dois caminhos saem do mesmo registrador (`ponte-arquivo.ts`). **Herdado**: a infra é byte-idêntica à linha de base fora dois imports |
| **o que custa deixar** | um renderer **já comprometido** cria ou renomeia fora da pasta aberta passando uma raiz arbitrária. Risco baixo — exige o renderer comprometido antes — e uma assimetria real entre canais vizinhos. Com o P4 aplicado, o custo de **ilusão** morre: o comentário deixa de prometer o que o código não faz |
| **as opções** | **(a) uniformizar** — os três `*NoProjeto` resolvem a raiz pelo dono e validam com `confinado()` antes de delegar. **Muda conduta**: pedido com raiz fora das abertas passa a ser recusado, e a frase de recusa e o comportamento da árvore da interface precisam ser decididos. E hoje **não há teste de serviço** — pela ordem do §12, primeiro a rede, depois o movimento. **(b) deixar como está + P4 + registrar** aqui como herdado conhecido. **(c) deixar sem registro** — não é opção |
| **minha recomendação** | **(b) agora**; (a) como candidata de corrida futura, quando `servicos/` tiver teste — aí o §12 se cumpre inteiro (rede antes da mudança de conduta) |
| **se ficar para depois** | **fica mais BARATA depois** da rede de teste de serviço |
