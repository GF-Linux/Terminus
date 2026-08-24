#* A PLANTA do Terminus — o prédio pronto, desenhado antes de mover código (PADRAO §11).

# Schema de fluxo — Terminus v0500

> **O que este arquivo é:** a planta do prédio. Mostra o **alvo pronto**, não o estado parcial.
> Nada aqui é semáforo de "feito/a fazer" — o progresso mora em `docs/tracker.md` (§12·5).
> **Fonte da verdade** desta planta é este `.md`; o `fluxo.png` é derivado dele.
>
> **Base medida:** HEAD `ada7bfa`, 34 arquivos em `codigos/`, **5.683 linhas** de texto
> (5.152 em `.ts`, 531 em `.css`/`.html`), 37 canais de IPC, **2 ciclos de import**,
> conformidade com o §1.3 = **5 de 13 nós**.
>
> ✅ **A planta foi CONSTRUÍDA** (2026-08-23, fatias 0–7 + fechamento). Ela continua sendo o
> desenho do alvo, não o registro do progresso — esse vive em `docs/tracker.md`.
>
> ⚠️ **UM DESVIO da planta aprovada, e ele é meu:** o desenho original trazia
> `tests/arquitetura/` (quatro testes: camadas, pureza, teto, ciclos) e `tests/funcionais/`
> (a conduta). **Não construí nenhum dos dois.** As quatro verificações de arquitetura são
> M1–M4 dentro de `ferramentas/portao.mjs`, e a conduta é a perna P5 do mesmo arquivo.
> **O motivo:** duplicar a medição em dois lugares cria duas fontes da verdade que divergem —
> e a catraca por fatia (`docs/catraca.json`) é mais expressiva que uma asserção fixa, porque
> deixa a fatia intermediária fechar com o valor que ela prometeu. O efeito colateral honesto:
> `npm run teste` **não** pega quebra de arquitetura; só `npm run portao` pega.
> **Isto é desvio de planta aprovada, e a decisão de mantê-lo ou não é da cabeça.**
>
> ⚠️ **Uma correção de medida, feita depois da aprovação:** onde estava escrito `M1 = 7`, o certo
> é **8**. O E2 diz *"quantos módulos de `sistema/` o registrador **importa**"*, e isso é
> contagem de arquivo. O 7 era o alcance do CORPO de `registrarPonte`, que deixa de fora
> `kits-embutidos` — usado só pela partida. O número corrigido é maior, ou seja, pior:
> a correção não favorece o resultado.

---

## 1. ANTES — a árvore de hoje, e onde ela dói

```
codigos/                            34 arquivos · 5.683 linhas
├── compartilhado/tipos.ts          os tipos que os três reinos falam            85
├── design/                         css, temas, papel de parede, fontes
├── interface/   (renderer)         a casca e as telas — 14 arquivos       ⚠ 2 ciclos
├── ponte/       (preload)          contextBridge — o nome colide com o §1.3     186
└── sistema/     (main)             10 arquivos, TODOS irmãos, sem camada
    └── janela-principal.ts         ⚠ O MONÓLITO — 707 linhas, 5 papéis num arquivo
```

**O que dói, medido:**

| dor | medida de hoje | por que dói |
|---|---|---|
| um registrador só, para tudo | **8 módulos** de `sistema/` (teto do E2 = 2) | mexer no shell obriga a abrir o arquivo do projeto |
| o monólito | **707 linhas**, **359** só de `registrarPonte` | cinco razões-para-mudar no mesmo arquivo |
| `dominio/` não existe | **0 arquivos** puros | a regra de confinamento não é testável sem Electron |
| `sistema/` é plano | **0 de 5** subcamadas do §1.3 | motor, I/O e caso de uso indistinguíveis |
| ciclos de import | **2** (ambos em `interface/`) | ordem de carga vira armadilha silenciosa |
| rede de teste | **0 testes**, `tests/` não existe | nada trava a conduta que a refatoração promete preservar |

**Os cinco papéis dentro de `janela-principal.ts`** — é por isso que ele é o alvo:

```
janela-principal.ts (707)
├─ 1. partida do app        app.whenReady, ligarKits, window-all-closed   → sistema/janela/
├─ 2. ciclo da janela       criarJanela, ligarZoom, ligarAtalhosNeovim    → sistema/janela/
├─ 3. a guarda de caminho   confinado, protegerPastaDeTrabalho,           → dominio/ + infra/
│                           aLixeiraAlcanca, raizesDeEscrita
├─ 4. o caso de uso         entrarNaPasta (infra + motor + persistência)  → sistema/servicos/
└─ 5. os 37 handlers        registrarPonte, 359 linhas                    → sistema/ponte/
```

---

## 2. DEPOIS — o prédio pronto

**Regra de camada (uma seta = "pode importar"):**

```
interface ──▶ porta ──▶ sistema/ponte ──▶ sistema/servicos ──▶ sistema/{janela,motores,infra} ──▶ dominio
                                     └────────────────────────────────────────────────────────▶ dominio
   │                                                                                                ▲
   └──▶ design ──▶ compartilhado ◀── porta ◀── sistema (todos) ───────────────────────────────────┘
```

- **`dominio/` não importa ninguém de fora** — nem `electron`, nem `node:fs`, nem `node-pty`.
  Só `node:path`, que é conta de string sem I/O. Recebe caminho **já resolvido** e só decide.
- **`porta/` é o único ponto renderer↔main.** A interface não tem `require`, `fs` nem
  `child_process`; toda a superfície está lá.
- **`sistema/ponte/` não faz trabalho** — só recebe do IPC, valida a forma e delega.

### 2.1 A árvore-alvo — uma linha por nó que executa processo

```
Terminus/
├── codigos/
│   ├── compartilhado/
│   │   └── tipos.ts                    a forma dos dados que atravessam a porta (3 reinos leem)
│   │
│   ├── dominio/                        REGRA PURA — só node:path; sem fs, sem electron, sem pty
│   │   ├── guarda-de-caminho.ts        decide: caminho JÁ RESOLVIDO cai dentro das raízes?
│   │   ├── entrada-recusada.ts         recusa string vazia, com \0, ou que comece com "-"
│   │   ├── protecao-da-pasta-aberta.ts decide: o alvo é a pasta aberta, ou está acima dela?
│   │   ├── escolha-da-pasta-inicial.ts decide qual pasta abrir: argumento ganha da memória
│   │   └── fluxo-conhecido.ts          decide se um rótulo é fluxo válido (cpp|python|csharp)
│   │
│   ├── porta/          (preload)       O REINO DA PORTA — a ÚNICA passagem renderer↔main
│   │   └── ponte-para-a-interface.ts   contextBridge: publica window.terminus e mais nada
│   │
│   ├── sistema/        (main)          O REINO DO PROCESSO PRINCIPAL
│   │   ├── janela/
│   │   │   ├── janela-principal.ts     cria a BrowserWindow sem moldura e carrega a página
│   │   │   ├── janela-viva.ts          guarda QUAL janela existe agora; quem precisa, pergunta
│   │   │   ├── zoom-da-janela.ts       Ctrl+= / Ctrl+- / Ctrl+0 e o zoom lembrado da sessão
│   │   │   ├── atalhos-da-casca.ts     Ctrl+S, Ctrl+Z, Ctrl+Shift+Z e Ctrl+` antes do Neovim
│   │   │   ├── dialogos-do-sistema.ts  abre/salva/pergunta pelo diálogo nativo do sistema
│   │   │   └── partida.ts              app.whenReady: registra as pontes, liga kits, abre janela
│   │   │
│   │   ├── motores/                    CONDUZEM ALGO VIVO — processo, sessão, estado lembrado
│   │   │   ├── motor-do-shell-pty.ts   sobe o bash em pseudo-terminal e transporta bytes
│   │   │   ├── motor-neovim-pty.ts     sobe o Neovim em pseudo-terminal e transporta bytes
│   │   │   ├── controle-neovim-rpc.ts  fala com o Neovim vivo por socket (abrir, cd, salvar)
│   │   │   └── configuracao-salva.ts   o estado que a casca lembra entre sessões, no disco
│   │   │
│   │   ├── infra/                      TOCA O DISCO E VOLTA — I/O concreto que não é motor
│   │   │   ├── arquivos-do-projeto.ts  listar, ler, gravar, criar e renomear na pasta aberta
│   │   │   ├── molde-de-projeto.ts     cria a pasta nova já pronta para a linguagem escolhida
│   │   │   ├── como-rodar-o-projeto.ts detecta no disco qual linha roda este projeto
│   │   │   ├── kits-embutidos.ts       liga os kits do Terminus por symlink no config do Neovim
│   │   │   ├── localizador-do-python.ts acha o interpretador que este projeto usa
│   │   │   ├── resolucao-de-caminho.ts realpath: transforma texto em caminho real do disco
│   │   │   ├── alcance-da-lixeira.ts   statSync .dev: a lixeira do sistema alcança este caminho?
│   │   │   └── argumentos-da-partida.ts lê process.argv e devolve a pasta pedida na linha
│   │   │
│   │   ├── servicos/                   CASO DE USO — chama infra+motor+persistência na ordem
│   │   │   ├── abertura-de-projeto.ts  entrar na pasta: abre, aponta o Neovim, registra recente
│   │   │   ├── criacao-de-projeto.ts   projeto novo: molda a pasta e entra nela
│   │   │   ├── leitura-de-arquivo.ts   recusa o config.json e o não-texto, depois lê
│   │   │   ├── escrita-confinada.ts    resolve, exige a guarda do domínio, e só então grava
│   │   │   └── exclusao-de-caminho.ts  protege a pasta aberta e escolhe lixeira ou apagar
│   │   │
│   │   └── ponte/                      HANDLERS ipcMain — teto de 2 módulos de sistema/ cada
│   │       ├── janela-exigida.ts       entrega a janela viva, ou a recusa que a tela sabe exibir
│   │       ├── registra-tudo.ts        o único ponto de entrada: chama os 8 registradores
│   │       ├── resposta-segura.ts      embrulha o handler: exceção vira {ok:false, erro}
│   │       ├── ponte-projeto.ts        6 canais: escolher, entrar, inicial, novo, recentes...
│   │       ├── ponte-arquivo.ts        8 canais: abrir, listar, arquivos, ler, gravar, criar...
│   │       ├── ponte-exclusao.ts       1 canal: caminho:excluir
│   │       ├── ponte-como-rodar.ts     1 canal: projeto:como-rodar
│   │       ├── ponte-aparencia.ts      4 canais: estado, definir, escolher, tirar
│   │       ├── ponte-shell.ts          7 canais: iniciar, enviar, redimensionar, linha, konsole
│   │       ├── ponte-neovim.ts         7 canais: iniciar, abrir, cd, plugins, enviar, parar
│   │       └── ponte-janela.ts         3 canais: minimizar, alternar-máximo, fechar
│   │
│   ├── interface/      (renderer)      A CASCA — árvore, terminal, painéis, telas
│   │   ├── base-da-tela.ts             pega a porta e acha elemento por id (estoura se sumiu)
│   │   ├── nucleo-da-casca.ts          o estado da tela e o que todo painel usa
│   │   ├── casca-principal.ts          liga os eventos aos botões e roda a partida da tela
│   │   ├── arvore-de-arquivos.ts       o explorador: abrir, criar, renomear, excluir
│   │   ├── barra-lateral.ts            os ícones da lateral e qual painel está aberto
│   │   ├── painel-lateral.ts           NOVO: sabe qual painel desenhar, sem que os painéis
│   │   │                               precisem se conhecer — é o que desfaz os 2 ciclos
│   │   ├── painel-de-plugins.ts        a lista de plugins do lazy.nvim
│   │   ├── tela-de-configuracoes.ts    a tela de ajustes de aparência
│   │   ├── aparencia-da-casca.ts       aplica tema, papel de parede e véu na casca
│   │   ├── busca-rapida-de-arquivo.ts  a paleta de busca por nome
│   │   ├── doca-do-terminal.ts         a doca inferior e o divisor do terminal
│   │   ├── tela-do-terminal.ts         o xterm.js: desenha bytes e devolve teclado
│   │   ├── vista-do-neovim.ts          a área onde o Neovim aparece
│   │   ├── fluxo-de-projeto.ts         o botão de linguagem e o botão Rodar
│   │   ├── tipos-da-janela.d.ts        declara window.terminus para o TypeScript
│   │   └── pagina.html                 o esqueleto estático da casca
│   │
│   └── design/                         css, temas, papel de parede, fontes embutidas
│
├── tests/                              ESPELHA codigos/ (§6·R5) — 99 testes
│   ├── apoio/                          o andaime: nao e teste, e o que deixa testar
│   │   ├── gancho-de-modulos.ts            electron -> duble, ./x.js -> ./x.ts, HOME temp
│   │   ├── electron-duble.ts               as 6 portas do main + o registro de ORDEM
│   │   ├── casa-de-teste.ts                fixtures em disco dentro da casa temporaria
│   │   └── rejeicoes-nao-tratadas.ts       captura a rejeicao da A8 em vez de esconder
│   ├── dominio/                        unidade: a regra pura, sem subir Electron   26
│   │   ├── guarda-de-caminho.test.ts       6 testes
│   │   ├── entrada-recusada.test.ts        6
│   │   ├── protecao-da-pasta-aberta.test.ts 6
│   │   ├── escolha-da-pasta-inicial.test.ts 4
│   │   └── fluxo-conhecido.test.ts          4
│   ├── servicos/                       caso de uso: a ORDEM e a DECISAO             61
│   │   ├── escrita-confinada.test.ts       21  as 3 etapas do confinado + A3(a)
│   │   ├── leitura-de-arquivo.test.ts      10  as 2 recusas e a NAO-recusa proposital
│   │   ├── abertura-de-projeto.test.ts      9  a ordem: ler a pasta antes de registrar
│   │   ├── exclusao-de-caminho.test.ts      8  a unica operacao sem volta: os 2 ramos
│   │   ├── criacao-de-projeto.test.ts       8  moldar antes de entrar
│   │   └── escrita-em-pasta-por-atalho.test.ts 5  trava a A9 e o que a A3(a) alargou
│   ├── motores/                        o que conduz processo vivo                    7
│   │   └── motor-do-shell-pty.test.ts       7  a conduta da A2: sem konsole, RECUSA
│   └── infra/                          I/O concreto que nao e motor                  5
│       └── kits-embutidos.test.ts           5  os 4 casos de ligacao da A4(b)
│
├── ferramentas/
│   ├── portao.mjs                      roda as 5 pernas do portão e dá o veredito (§12·4)
│   └── gera-fluxo.py                   refaz o fluxo.png; recusa desenho sobreposto
│
├── docs/
│   ├── fluxo.md                        esta planta (fonte da verdade)
│   ├── fluxo.png                       o relance, derivado do .md
│   ├── tracker.md                      as pernas do portão e o progresso das fatias
│   └── diario.md                       a memória de trabalho do agente
│
├── kits/                               dev-kits embutidos (argumento de venda)
└── package.json
```

---

## 3. Os fluxos de dado que mais quebram

São seis. Cada um está aqui porque **já quebrou** ou porque é o caminho que a refatoração
mais arrisca. Achar defeito aqui é seguir a seta, não varrer pasta.

### F1 — Gravar arquivo: o confinamento (o caminho de maior risco)

```
interface/arvore-de-arquivos
   │ api.arquivo.gravar(caminho, conteudo)
   ▼
porta/ponte-para-a-interface ── ipcRenderer.invoke("arquivo:gravar") ──▶ sistema/ponte/ponte-arquivo
                                                                                   │
                                                    servicos/escrita-confinada ◀────┘
                                                       │
                    ┌──────────────────────────────────┼───────────────────────────────┐
                    ▼                                  ▼                               ▼
        dominio/entrada-recusada          infra/resolucao-de-caminho        dominio/guarda-de-caminho
        recusa "", "\0", "-…"             realpath: texto → caminho real     decide: caí na raiz?
                                                                                       │
                                                                    infra/arquivos-do-projeto ◀┘
                                                                    grava no disco
```

**Onde quebra:** symlink dentro do projeto apontando para fora (por isso o realpath vem
**antes** da decisão); caminho começando com `-` (recusado **antes** de resolver, senão
`path.resolve("-c")` cai dentro da raiz e passa); `raizesDeEscrita()` vazio quando não há pasta
aberta — nesse caso **nada** é gravável, e é de propósito.

**Por que a divisão em dois:** hoje `confinado` mistura decisão e disco num só lugar, e por isso
só é testável subindo o Electron. Depois, `dominio/guarda-de-caminho` decide sobre um caminho
que já chegou resolvido, e roda em teste de unidade em milissegundos.

### F2 — Abrir pasta: o caso de uso de três camadas

```
interface ─▶ porta ─▶ ponte-projeto ─▶ servicos/abertura-de-projeto
                                            │
                    ┌───────────────────────┼──────────────────────────┐
                    ▼                       ▼                          ▼
    infra/arquivos-do-projeto   motores/controle-neovim-rpc   motores/configuracao-salva
    abre e lista (PRIMEIRO)     aponta o Neovim (cd)          registra nos recentes (POR FIM)
```

**A ordem é a regra, e ela é conduta a preservar:** a leitura vem primeiro de propósito — se a
pasta não existe mais, o erro sobe e ela **não** é registrada de novo nos recentes.

**Onde quebra:** socket do Neovim morto (o `cd` falha em silêncio, de propósito — abrir a pasta
não pode depender do editor estar de pé).

### F3 — Excluir: a lixeira que mente

```
ponte-exclusao ─▶ servicos/exclusao-de-caminho
                        │
      ┌─────────────────┼──────────────────────┬─────────────────────┐
      ▼                 ▼                      ▼                     ▼
dominio/protecao   infra/alcance-da-lixeira  janela/dialogos    shell.trashItem
da-pasta-aberta    statSync().dev compara    pergunta e avisa   OU rmSync recursivo
recusa a raiz      com o disco de casa       qual dos dois é
```

**Onde quebra:** `shell.trashItem` **mente** fora do disco de casa — apaga de vez e devolve
sucesso. Por isso `alcance-da-lixeira` existe e a caixa de diálogo muda de texto: em pendrive
ela diz "NÃO TEM VOLTA" em vez de prometer recuperação.

### F4 — Terminal: bytes nos dois sentidos

```
teclado ─▶ interface/tela-do-terminal ─▶ porta ─▶ ponte-shell ─▶ motores/motor-do-shell-pty ─▶ PTY
                       ▲                                                     │
                       └──── webContents.send("shell:saida") ◀───────────────┘
```

**Onde quebra:** fechar a janela destrói a `WebContents`, mas o PTY segue vivo alguns
milissegundos e ainda emite bytes — `send` para objeto destruído lança e vira caixa de erro em
cima de quem já mandou fechar. A guarda `if (!alvo.isDestroyed())` é conduta a preservar, e vale
igual no caminho do Neovim.

### F5 — Partida: o que sobe, em que ordem, e o que pode falhar sem derrubar

```
app.whenReady
   ├─▶ ponte/registra-tudo        os 8 registradores, ANTES da janela existir
   ├─▶ motores/configuracao-salva limpa o histórico antigo de comando (dado sensível)
   ├─▶ infra/kits-embutidos       symlinks no config do Neovim — FALHA NÃO DERRUBA
   └─▶ janela/janela-principal    cria a janela e carrega a página
```

**Onde quebra:** os kits escrevem **fora do repositório** (`~/.config/nvim/…`). Qualquer teste
que suba o app precisa de `HOME` redirecionado, ou suja a máquina de quem roda — medido nesta
corrida, e é por isso que a perna de conduta do portão exporta `HOME`.

### F6 — Aparência: o estado que sobrevive ao fechamento

```
interface/aparencia-da-casca ─▶ porta ─▶ ponte-aparencia ─▶ motores/configuracao-salva ─▶ disco
```

**Onde quebra:** o Electron reinicia o fator de zoom a cada navegação — aplicar o zoom lembrado
antes do `did-finish-load` faz ele ser descartado sem aviso.

---

## 4. Como o teto do registrador fecha — a conta, canal por canal

O E2 mede **acoplamento**, não contagem de canais: *quantos módulos de `sistema/` o registrador
importa — teto 2*. A contagem de canais fica como guarda secundária (~10).

| registrador | canais | módulos de `sistema/` que importa | teto |
|---|---:|---|:---:|
| `ponte-projeto.ts` | 6 | `servicos/abertura-de-projeto` · `servicos/criacao-de-projeto` | 2 ✔ |
| `ponte-arquivo.ts` | 8 | `servicos/leitura-de-arquivo` · `servicos/escrita-confinada` | 2 ✔ |
| `ponte-exclusao.ts` | 1 | `servicos/exclusao-de-caminho` | 1 ✔ |
| `ponte-como-rodar.ts` | 1 | `infra/como-rodar-o-projeto` | 1 ✔ |
| `ponte-aparencia.ts` | 4 | `janela/dialogos-do-sistema` · `motores/configuracao-salva` | 2 ✔ |
| `ponte-shell.ts` | 7 | `motores/motor-do-shell-pty` | 1 ✔ |
| `ponte-neovim.ts` | 7 | `motores/motor-neovim-pty` · `motores/controle-neovim-rpc` | 2 ✔ |
| `ponte-janela.ts` | 3 | — (recebe a janela, não importa módulo) | 0 ✔ |
| **soma** | **37** | **máximo = 2** (hoje: 7) | |

Os 37 canais de hoje continuam 37 depois: **a lógica muda de lugar, a conduta é preservada**
(§12·3). Nenhum canal nasce, nenhum morre, nenhum troca de nome.

✅ **Conferido em campo, duas vezes:** os nomes dos 37 canais foram extraídos por script antes e
depois da fatia 5 e da fatia 6, e comparados com `diff`. **Idênticos nas duas.**

`ponte-arquivo` importa dois serviços e **não** importa `infra/arquivos-do-projeto` direto —
é o serviço que fala com a infra. Foi isso que derrubou o acoplamento de 7 para 2: a camada de
caso de uso absorve a orquestração que hoje mora solta dentro dos handlers.

---

## 5. O que sai de dentro do monólito, e para onde

| o que era, em `janela-principal.ts` | vira | onde |
|---|---|---|
| `confinado` (decisão) | `dentroDaRaiz` | `dominio/guarda-de-caminho.ts` |
| `confinado` (validação de entrada) | `recusarEntrada` | `dominio/entrada-recusada.ts` |
| `confinado` (realpath) | `resolverReal` | `infra/resolucao-de-caminho.ts` |
| `protegerPastaDeTrabalho` | `ehPastaProtegida` | `dominio/protecao-da-pasta-aberta.ts` |
| `aLixeiraAlcanca` | igual | `infra/alcance-da-lixeira.ts` |
| `pastaDaLinhaDeComando` (leitura de argv) | `pastaPedidaNaLinha` | `infra/argumentos-da-partida.ts` |
| `pastaDaLinhaDeComando` (a escolha) | `pastaInicial` | `dominio/escolha-da-pasta-inicial.ts` |
| a checagem `cpp\|python\|csharp` (2 lugares) | `ehFluxoConhecido` | `dominio/fluxo-conhecido.ts` |
| `entrarNaPasta` | igual | `servicos/abertura-de-projeto.ts` |
| `raizAberta` + `raizesDeEscrita` | o dono da raiz aberta | `servicos/abertura-de-projeto.ts` |
| `seguro` | `respostaSegura` | `sistema/ponte/resposta-segura.ts` |
| `criarJanela`, `janela` | igual + `janelaViva()` | `sistema/janela/` |
| `ligarZoom` | igual | `janela/zoom-da-janela.ts` |
| `ligarAtalhosNeovim` | igual | `janela/atalhos-da-casca.ts` |
| `dialog.*` (4 chamadas) | `escolherPasta`, `salvarComo`, `perguntar` | `janela/dialogos-do-sistema.ts` |
| `registrarPonte` (359 linhas) | 8 registradores + 1 índice | `sistema/ponte/` |
| `app.whenReady`, `window-all-closed` | igual | `janela/partida.ts` |

**O estado que hoje é variável de módulo** (`janela`, `raizAberta`) é o que mais amarra o
monólito: `raizAberta` é lido pela guarda e escrito pelo caso de uso, e `janela` é lido por 8
handlers. Na planta, cada um ganha **um dono só** — `servicos/abertura-de-projeto` e
`janela/janela-viva` — e quem precisa **pergunta**, em vez de alcançar a variável.

---

## 6. O que esta planta NÃO muda

Fica escrito para o portão não ser cobrado do que não prometeu:

- **Os 37 canais de IPC**, com os mesmos nomes e as mesmas cargas. A interface não sabe que
  houve refatoração.
- **`interface/` e `design/`**, salvo o desfazer dos 2 ciclos (`painel-lateral.ts`).
- **`compartilhado/tipos.ts`** — a forma dos dados não muda.
- **A conduta de cada guarda**: o que recusa hoje, recusa depois; o que aceita hoje, aceita
  depois. Defeito encontrado no caminho **não é consertado dentro da fatia** — vira árvore de
  decisão no `tracker.md` (§12·3a).

---

## 7. Como refazer o `fluxo.png`

```bash
python3 ferramentas/gera-fluxo.py && magick -background none docs/fluxo.svg -strip docs/fluxo.png
```

O `.png` é **derivado**; a árvore vive no gerador, e este `.md` é a fonte da verdade (§11).

**Duas coisas medidas nesta corrida, que valem para quem mexer depois:**

- **O gerador RECUSA desenho torto.** A descrição de um nó com filhos não pode invadir a coluna
  dos filhos; se invadir, ele imprime `DESENHO RECUSADO` e sai com erro em vez de gerar um PNG
  com texto sobreposto. A trava pegou uma sobreposição real antes de ela ser publicada.
- **`-strip` não é enfeite.** Sem ele o PNG muda de bytes a cada geração — **0 pixels diferentes,
  medido com `magick compare -metric AE`**, só o carimbo de data que o ImageMagick embute. Com
  `-strip` o md5 é estável, e o `git diff` só acusa a imagem quando o desenho mudou de verdade.
