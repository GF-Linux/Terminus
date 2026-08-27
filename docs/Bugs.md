## bugs encontrados dia 25/08/2026

1. Terminal dentro do Terminus nao apaga oq foi digitado 

> **Estado (25/08, despacho 10): NÃO REPRODUZIU em 9 cenários — matriz em `tracker.md §21.1`.**
> PTY, fiação, DOM e **pixels** apagam certo nas duas casas (limpa e Starship), no painel e no
> `:terminal` do Neovim com o LazyVim real. Para fechar, falta UMA resposta da cabeça:
> **(1)** qual terminal era — o painel, o `:terminal` do editor (Ctrl+`), ou o Konsole do ↗;
> **(2)** o que estava digitado/rodando; **(3)** uma foto; **(4)** Fedora ou Steam Deck?
> ⚠️ O Deck roda a **v0.0.6 pré-PTY** (desenho antigo) — lá o comportamento é outro por construção.
> De brinde a caça achou dois defeitos vizinhos, devolvidos como árvores:
> **A18** (`tracker.md §21.2`): o lançador do menu aponta para `~/projetos/terminus`, apagada em
> 24/08 — **abrir pelo menu está quebrado**. **A19** (`§21.3`): o tooltip promete `Ctrl+\`` para o
> painel, mas o main intercepta a tecla e abre o terminal do editor.



## Features a melhorar 

1. Implementar integracao GIT 
2. Melhorar o Fluxo das pastas criadas 
3. Melhorar as funcoes nativas -> principalmente relacionadas a Design para o Konsole para interfaces de aplicativos serem mais bonitas
4. Melhorar Sugestor inline sugestions
   - Detalhado pela cabeça em 25/08: o que faz falta é o refatorar automático do VSCode —
     diante de erro de indentação/sintaxe/escrita, ele propõe a correção NOS PONTOS errados, e
     ao aceitar com Tab vai corrigindo os demais um a um, em cascata. O inline suggestion do
     Terminus está bom, mas não tem esse ciclo de correção guiada por erro.

---

## 2026-08-26 · Dois relatos de campo — AMBOS REPRODUZIDOS E CORRIGIDOS

> Relato da cabeça: **1.** *"Arquivo Csharp não é lido"* · **2.** *"inline completions → não
> sugere nada [copilot não deve estar conectado provavelmente]"*.
> Portão **verde 6/6**, 156 testes. Cada defeito tem teste próprio que falha sozinho.

### B1 — o `.cs` não abria, e eram DEZ linguagens, não uma

| parte | conteúdo |
|---|---|
| **a medição** | `ehTexto` recusava **10 de 14**: `Program.cs`, `app.ts`, `main.cpp`, `kit.lua`, `pagina.html`, `estilo.css`, `roda.sh`, `projeto.csproj`, `Dockerfile`, `.gitignore`. Abriam só `.py`, `.md`, `.json`, `.txt` e os formatos de laboratório |
| **a causa** | `ehTexto` era **lista branca de 14 extensões, herdada da Bancada** — o projeto de bioinformática que o Terminus substituiu (daí `.fasta`, `.fa`, `.fastq`). Ela **nunca doeu** porque o canal que a usava, `arquivo:ler`, **não tinha chamador**: quem abria arquivo era o Neovim, lendo o disco por conta própria. Quando o editor virou o Monaco e eu ressuscitei o canal (26/08), a lista virou o portão de TUDO |
| **o meu erro, nomeado** | escrevi no `ponte-arquivo.ts` que *"a porta ganhou leitura de TEXTO, não leitura de disco"* — **confiando na guarda sem ler a lista dela** |
| **a contradição que ninguém viu** | `dominio/linguagem-do-arquivo.ts`, que eu escrevi na mesma corrida, **sabe** que `.cs` é csharp e que `Dockerfile` é dockerfile. A infra recusava os dois. Duas peças da mesma casa discordando, com a infra ganhando em silêncio |
| **o conserto** | a regra **inverteu**: texto é o PADRÃO. Recusa por extensão binária conhecida (56 delas) **e** farejo de byte zero nos primeiros 8 KB — porque extensão mente, e binário com nome de `.txt` existe |
| **prova** | 7 testes em `tests/infra/arquivo-de-texto.test.ts` (5 falhavam antes) + `Program.cs` aberto no app de verdade, com foto |

### B2 — o Copilot não sugeria: DUAS causas em série

| parte | conteúdo |
|---|---|
| **causa 1** | `spawn(process.execPath, [servidor])` — e **dentro do Electron `process.execPath` é o binário do Electron**, não o Node (medido: `/…/electron/dist/electron`). Isso sobe um SEGUNDO APLICATIVO em vez de rodar o script, e ele morre |
| **por que a minha prova não pegou** | provei o motor **importando-o num `node` puro**, onde `execPath` É o node. **A prova passou pelo motivo errado.** Estava escrito no diário como `[não medido] o Copilot dentro do app montado` — e o defeito morava exatamente no buraco declarado |
| **causa 2, atrás da primeira** | com `ELECTRON_RUN_AS_NODE=1` o servidor rodou — e morreu dizendo **"Node.js 22.13 is required to run GitHub Copilot but found 20.18.3"**. O **Electron 33 embute Node 20**; o Copilot exige 22. A máquina tem 22.23 |
| **como eu vi isso** | o `stderr` do servidor era **drenado em silêncio**. Tive de abrir o cano para saber. Virou fio permanente (`TERMINUS_COPILOT_LOG=1`), e a **última linha do stderr passou a ser a frase da barra** — no lugar do inútil *"o servidor encerrou"* |
| **o conserto** | o servidor roda pelo **`node` do sistema** (varrido no `PATH`), com queda para o executável próprio + `ELECTRON_RUN_AS_NODE`. Amarrar o Copilot ao Node que o Electron carrega faria atualizar o editor quebrar a sugestão |
| **prova** | `pronto: true`, e o fantasma na tela: `return (4 / 3) * math.pi * raio ** 3` para `volume_da_esfera(raio)`. Foto com o indicador verde na barra |

### ⚠️ O que estes dois defeitos têm em comum, e vale mais que os consertos

**Os dois moravam no espaço entre o que eu provei e o que o produto faz.** O primeiro: provei que
o canal lê texto, sem conferir o que "texto" queria dizer naquela casa. O segundo: provei o motor
fora do aplicativo, e o único elo diferente — qual binário roda o servidor — era o defeito.

**Nos dois casos a lacuna estava DECLARADA no diário e eu não a fechei.** A coluna
`[não medido]` apontou para o lugar certo das duas vezes. Declarar não basta; o que fecha é medir
**pelo caminho que a pessoa usa**.

---

## 2026-08-26 · Corrida 15 — o NES medido até o esquema, e o C# que ficou a um elo

> Relatos: **1.** *"Testado NES → não funciona. Não existe a seta para corrigir blocos
> passados."* · **2.** *"escrevi diversos erros e o código não acusou os erros e sugeriu uma
> correção"* · **3.** *"deixe a cor verde piscando na bolinha quando o Copilot estiver
> carregando uma sugestão"*. Portão **verde 6/6**, 163 testes.

### B3 — o NES: agora sei o formato exato, e ainda volta vazio

**Achei a fonte da verdade na própria máquina:** o `main.js` do servidor (10,5 MB) carrega o
validador de esquema. Lendo `xQc` (o tratador de `textDocument/copilotInlineEdit`) e `fIn` (o
esquema), o formato ficou **conhecido, não deduzido**:

```
fIn = { textDocument: {uri, version}, position: {line, character},
        diagnostics?: [{ severity: "error"|"warning", message, range, code?, source? }] }
```

⚠️ **`severity` é STRING, não o número do LSP** — foi o que o validador respondeu.
⚠️ **O campo `diagnostics` É o `nextEditSuggestions.fixes` da documentação:** o tratador começa
com `setForRequest(uri, r.diagnostics ?? [])`. **Era isso que você queria** — o editor manda os
erros, o Copilot propõe a correção. Eu mandava a lista vazia.

**E mesmo assim volta `{edits: []}`.** As saídas antecipadas do tratador, lidas no código:
`if (!workspace.getDocument(id)) return` e `if (result == null) return`. Tentei, e nenhuma
mudou o resultado: `didFocus`, `didChange` com renomeação pendente, `diagnostics` bem formados,
`nextEditSuggestions.enabled` e `capabilities.textDocument.inlineEdit`.

**O que sobra como lead:** o provedor é criado com `updateTreatmentVariables(exp.variables)` —
**variáveis de experimento vindas da conta**. Há um gancho `testing/overrideExpFlags` que
forçaria; não o usei, porque provar com a régua forçada não prova para você.

### B4 — o C# não acusava erro: DUAS causas, e a segunda é minha

| parte | conteúdo |
|---|---|
| **a medição** | Python **5 sublinhados**, C# **zero**, com o Roslyn **de pé**. O seu relato era C#, não Python |
| **causa 1** | o Roslyn **não descobre o projeto sozinho**: espera `solution/open` (ou `project/open`). ⚠️ `--autoLoadProjects` **não basta** — estava na linha de comando desde a corrida 12 |
| **causa 2, minha** | eu tinha removido a capacidade de **pull** de TODOS os clientes, para o pyright voltar a empurrar. **O Roslyn só sabe pull.** A remoção geral o calou por completo |
| **a fonte da verdade** | `nvim-lspconfig/lsp/roslyn_ls.lua` — a configuração que faz o Roslyn funcionar no **seu Neovim**. Ela manda `solution/open`, escuta `workspace/projectInitializationComplete` e **só então** pede os diagnósticos. Copiei o gesto |
| **o conserto** | `solution/open`/`project/open` implementado (7 testes); a remoção do pull virou **por linguagem** |
| **✅ o que já funciona** | **[provado]** `csharp: projeto carregado` — a notificação de fim de carga do projeto **chega**. O Roslyn abriu a solução |
| **⛔ o que falta** | o sublinhado ainda não aparece: o pedido de diagnóstico que disparo depois da carga **não encontra o provedor de pull**, e o log que conta isso não chegou a imprimir — ou seja, a chamada estoura antes. É **um elo**, e é o próximo lugar a olhar |

### B5 — ⚠️ o CSP estava recusando as extensões de linguagem

**[provado]** no console: *"Refused to connect to 'data:application/json;base64,…' because it
violates the document's Content Security Policy"* — e o recusado eram os **manifestos** do
*Python Language Basics* e do *C# Language Basics*, que o empacotador inlina como `data:`
**dentro do próprio pacote**.

O CSP ganhou `connect-src 'self' data:` e `worker-src 'self' blob:`. **O que isso abre, dito por
inteiro:** `data:` é conteúdo que já está dentro da página — não sai da máquina, não tem servidor
do outro lado, não exfiltra. **`connect-src` não ganhou `https:` nem `*`**: a tela continua sem
poder falar com a rede, e quem sai da máquina segue sendo só o `main`.

### ✅ B6 — a bolinha que pisca (pedido 3)

**[provado]** `pensando` em 4/30 amostras durante o pedido, sólida depois.
**Contador, e não bandeira:** o editor cancela e refaz o pedido a cada tecla, então há vários
em voo; uma bandeira booleana seria apagada pelo primeiro que terminasse. `try/finally` no
decremento, senão um pedido que falha deixa a bolinha piscando para sempre — dizendo o
contrário do que aconteceu. E `prefers-reduced-motion` desliga a animação sem perder a
informação, que continua na cor.

---

## 2026-08-26 · Corrida 16 — o NES forçado (e o veredito), e o C# CONSERTADO

> A cabeça autorizou forçar o que fosse preciso. Portão **verde 6/6**, 163 testes.

### ✅ B4 (continuação) — o C# acusa erro agora

**[provado]** `Program.cs` com três erros → **três sublinhados vermelhos** nas linhas 9, 10 e 11,
com o CodeLens `0 references` do Roslyn junto. Python segue com 5. Foto guardada.

**Foram TRÊS tentativas para puxar o diagnóstico, e as duas primeiras estão registradas no código
porque explicam a terceira:**

| # | tentativa | por que falhou |
|---|---|---|
| 1 | deixar o cliente puxar sozinho | **nunca puxava** — ele pede para documentos num editor **visível do workbench**, e a nossa área de escrita é do Monaco: a lista é sempre vazia |
| 2 | disparar o emissor interno do `DiagnosticFeature` | **puxava e voltava vazio** — ele manda `previousResultId`, o servidor responde *"não mudou"*, e o conjunto anterior (vazio) fica de pé |
| 3 | **pedir direto e escrever os marcadores** | ✅ sem `previousResultId`, o servidor devolve o relatório inteiro. É o que o `nvim-lspconfig` faz, pela mesma razão |

**E o pedido INSISTE** (0 ms, 1,5 s, 4 s, 9 s) e **segue as edições** (debounce de 400 ms, um
relógio por linguagem). Medido: o Roslyn produz os diagnósticos, mas **não no instante em que
anuncia `projectInitializationComplete`** — pedindo uma vez só, no aviso, a resposta vem vazia e
a tela fica limpa **para sempre**, porque nada mais dispara um novo pedido.

### ⛔ B3 (veredito) — o NES: o nosso lado está PROVADO CERTO; o que não produz é o modelo

A cabeça autorizou forçar. Forcei, e a resposta é definitiva.

**1. A flag de experimento NÃO é o portão.** Li as **54** variáveis que o servidor consulta; a
única de NES é `copilotnesxtab` (o código a lê como `?? false`). Forcei-a com
`testing/overrideExpFlags` — o servidor respondeu `"OK"` — e o resultado continuou `{edits: []}`.

**2. ⚠️ E o nosso lado está PROVADO CERTO, por bisseção.** O servidor tem um gancho
`testing/setNextEditDocument` que injeta uma edição pronta. Injetei, e ela **voltou inteira**:

```
{ text, textDocument: {uri, version}, range,
  command: { command: "github.copilot.didAcceptNextEditSuggestionItem", arguments: [id] } }
```

**Ou seja: esquema, transporte, versão, posição, diagnósticos e caminho de resposta estão todos
corretos.** O que não produz é o **modelo de NES da conta** — nada que se implemente aqui muda isso.

**3. O que isso destrava, e é a notícia boa:** com o gancho de injeção existe **como verificar**
uma implementação de NES de ponta a ponta. Ela deixou de ser encanamento cego — o §13.5 não
proíbe mais construí-la, porque agora dá para provar o caminho inteiro sem depender do modelo.
**Fica como decisão da cabeça**, com o preço dito: interface nova (seta na calha, salto por
`Tab`, visão lado-a-lado) que só mostra algo quando a conta começar a produzir.

---

## 2026-08-26 (noite) · "tela inicial não pegou o tema" — o relato estava certo, e a causa não era a que eu media

> Relato da cabeça, com foto. Portão **verde 6/6**.

### O que eu medi primeiro, e por que quase me enganou

Reproduzi com a **configuração dela** (`cursor-dark`, escurecer 0,82) e li as cores da tela:
caixa `rgba(12,14,22,.8)`, comentário `#aab1d2`, palavra-chave `#a3a9e6`. **Todos batiam com o
`tema.lua`.** A tentação era responder *"está aplicado"* — que teria sido tecnicamente verdade e
completamente inútil.

### A causa real: eu apliquei a PALETA, não o TEMA

| medida | valor |
|---|---|
| cores que o `tema.lua` sobrescreve | **17** |
| cores que o catppuccin-mocha tem | **26** |
| grupos que o catppuccin deriva delas | **69** |
| regras que eu escrevi à mão | **8** |

⚠️ **As nove cores que o kit NÃO toca são justamente as coloridas** — `peach`, `green`, `teal`,
`flamingo`, `yellow`, `pink`, `red`, `maroon`, `rosewater`. E são elas que o catppuccin usa para
o que mais aparece: **`String` = verde, `Number` = pêssego, `Type` = amarelo, `Identifier` =
flamingo**.

Eu peguei os 17 tons de azul-lavanda do kit e distribuí à mão pelos tokens. **Ficou tudo da mesma
cor** — e é exatamente isso que a cabeça viu. O tema dela é colorido; o meu era monocromático.

### O conserto

1. A paleta passou a ser **mocha + os 17 do kit por cima** (mescla, não substituição). As nove
   coloridas voltam a existir.
2. As regras de token vieram do **`catppuccin/lua/catppuccin/groups/syntax.lua`**, lido do disco —
   20 regras no lugar das 8 que eu inventei.
3. A caixa da amostra virou **opaca**: amostra que deixa o fundo passar mostra a mistura, não o tema.

**[provado]** as cores lidas da tela depois: comentário `#8b93b5` (overlay2), palavra-chave
`#c9cdf8` (mauve), **tipo `#f9e2af` (amarelo do mocha)**, função `#a3a9e6` (blue).

### ⚠️ A lição, e é a terceira vez hoje

**A minha medição confirmava a minha própria hipótese, e por isso não achava o defeito.** Eu medi
*"as cores do kit foram aplicadas?"* — sim. A pergunta certa era *"a tela parece o Neovim dela?"* —
não. Medir o que se implementou prova que se implementou; não prova que está certo.

---

## 2026-08-26 (noite) · "vc acha que o tema inicial é isso aí?" — eu tinha entendido o PEDIDO errado

> A cabeça mandou foto do Neovim dela. Portão **verde 6/6**.

### O erro não era de cor. Era de leitura do pedido — duas vezes.

Pediram: *"adicione o meu tema do Neovim ao abrir o programa, em vez do ícone e da mensagem"*.

| tentativa | o que entreguei | por que era absurdo |
|---|---|---|
| 1ª | o ícone + "Nenhuma pasta aberta", centralizado | **anuncia uma ausência** na primeira coisa que se vê |
| 2ª | uma amostra de código com a frase *"o tema vem do seu kit"* | **um tema que explica a si mesmo é um bilhete**, não um tema. E mostrava as MINHAS tentativas de acertar a cor |
| 3ª | ⟵ o `dashboard.lua` dela | o que sempre foi pedido |

⚠️ **E a foto que EU gerei mostrava o absurdo.** Eu a anexei na resposta sem ler o que estava
escrito nela. A cabeça leu.

### O que existia, e onde

`~/.config/nvim/lua/plugins/dashboard.lua` — o arquivo dela. Tem **tudo**: o `wordmark` JARED em
blocos, a paleta própria daquela tela (`ink`/`deep`/`tide`/`glow`/`mist`/`foam` — **não** a do
`tema.lua`, que é outra), a ficha lida de `/proc` e `/etc`, a régua com `L I N U X` e o
"bem-vindo, jared".

⚠️ **E ele já tinha decidido como esta tela deve ser dentro do Terminus:** a variante
`dentro_da_bancada` (`BANCADA == "1"`) **corta o menu** e deixa só identidade e ficha, com a razão
escrita — *"abrir/entrar em pasta é trabalho da casca"*. Eu passei duas rodadas inventando uma
tela enquanto a decisão estava tomada, por escrito, por quem tinha o direito de tomá-la.

### O que foi construído

`sistema/infra/tela-de-abertura.ts` lê o `dashboard.lua` dela (logotipo + cores) e monta a ficha
das **mesmas fontes** que ele usa (`/etc/os-release`, `/proc/uptime`, `$SHELL`, `/proc/cpuinfo`,
`lspci`) — se as duas telas discordassem sobre a mesma máquina, seriam duas telas erradas.

**[provado]** na tela: logotipo de 35 faixas, `Fedora Linux 44 (KDE Plasma Desktop Edition)`,
`3d 7h 6m`, `bash`, `AMD Ryzen 7 7800X3D`, `GeForce RTX 4080`.

### ⚠️ E três defeitos que só apareceram OLHANDO a captura

Depois de acertar o conteúdo, o desenho ainda estava errado — e cada conserto veio de abrir a
imagem, não de raciocinar sobre o código:

1. **Listrado**: `line-height:1.15` deixava as linhas de `█` sem se tocar, com faixas de fundo
   atravessando as letras. → `line-height:1`.
2. **Franja rosa e azul** nas bordas: suavização por subpixel. Invisível em texto comum, suja
   numa parede de blocos. → `-webkit-font-smoothing:antialiased`.
3. **Ainda quadriculado**: a fonte não fecha `█` como o terminal fecha. → **o logotipo virou
   SVG**: blocos vizinhos viram uma faixa só (a costura deixa de ser desenhada, não é
   escondida) + `shape-rendering="crispEdges"`.

O `dashboard.lua` já dizia isto de outro jeito, e eu levei três tentativas para entender:
*"a resolução de uma imagem de fundo é a da tela; a de arte de células é a da grade"*.

### ⚠️ E um quarto defeito na mesma tela: o nome ESTICADO em 2× — apontado pela cabeça

Depois de o logotipo ficar sólido, ele ainda estava **errado de proporção**, e dá para provar
por aritmética antes de olhar:

| desenho | proporção |
|---|---|
| a arte, no terminal (58 col × 5 lin, célula ~0,46 de largura por altura) | **5,3:1** |
| o que eu desenhei (célula quadrada, 1×1) | **11,6:1** |

**Esticado exatamente 2×.** A causa: eu tratei a célula como um quadrado. **Num terminal ela é
cerca de duas vezes mais alta que larga** — e é para essa célula que a arte foi desenhada.

⚠️ **E a proporção passou a ser MEDIDA, não escrita.** Um `0.5` no código funcionaria hoje e
mentiria no dia em que a fonte mudasse — e este projeto já usa duas (`IBM Plex Mono`, com
`Adwaita Mono` de reserva para os octantes). A medição usa `line-height: normal`, e não `1`:

| como medi | proporção que dá |
|---|---|
| `line-height: 1` (a caixa justa) | 6,96:1 — ainda ~20% esticado |
| **`line-height: normal`** (a célula que o terminal usa) | **5,32:1** ✅ |

A diferença entre as duas é a entrelinha natural da fonte, que é o que faz a célula de um
terminal ser mais alta que o desenho da letra. **[provado]** logotipo em 341×64 px, 5,32:1.

⚠️ **Eu tinha olhado essa mesma captura e não vi.** A cabeça viu. Olhar não é o suficiente se
não se sabe o que medir — a pergunta que faltava era *"qual é a proporção do original?"*, e ela
é aritmética, não impressão.
