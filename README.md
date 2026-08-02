# Bancada

**IDE própria** para o laboratório que facilita o uso do **Biopython**: um catálogo
navegável da biblioteca organizado **por tarefa** (não por módulo), com trechos
prontos para inserir no script, e pré-visualização de `.ab1` como cromatograma.

O problema que resolve: a documentação do Biopython é indexada por módulo, o que
só ajuda quem já sabe o nome do que procura. Aqui se procura pela tarefa —
"medir GC", "ler cromatograma", "montar árvore".

**Estado (2026-07-29):** a aplicação **começou a existir**. A base foi decidida —
Electron + CodeMirror 6 + xterm.js (ADR 0004) — e a primeira fatia roda de ponta a
ponta: abre uma pasta de corrida, edita `.py` com realce, grava, executa com o
Python do laboratório e mostra o stdout real. O protótipo preto fosco foi
**aprovado** em 29/07, com fidelidade total ao Cursor (casca sem acento verde).

Também já existem os gestos que separam um editor de um ambiente: criar,
renomear e excluir na árvore, **`Ctrl+P`** para abrir arquivo por nome, e
**traceback clicável** — o quadro de erro no terminal leva à linha do arquivo.

O **cromatograma de `.ab1`** existe: clicar num arquivo `.ab1` abre os quatro
traços com as letras alinhadas aos picos, barras de Phred, zoom e rolagem. Ele
abre numa **faixa embaixo do editor**, com uma aba por arquivo, e o **terminal
fica em pé à direita** — os dois de altura e largura arrastáveis (ADR 0006).
Escrever o script e olhar o traço acontecem na mesma tela, porque acontecem na
mesma corrida.

A **lateral abre e fecha** (`Ctrl+B`, ou clique no ícone já selecionado) e tem
largura arrastável — fechada, a área de escrita recebe os 250 px de volta. A
Bancada também **volta sozinha na última pasta aberta**, e as anteriores ficam
listadas na tela vazia do Explorer.

**Nenhuma barra de rolagem é desenhada** em lugar nenhum da casca. A rolagem
continua inteira: roda, trackpad, toque, teclado — e, no cromatograma, arrastar
o traço com o mouse.

O que ainda não existe: o painel da Bancada (pausado a pedido) e busca em
arquivos. O esqueleto da extensão do VSCodium está preservado em
`legado-extensao/`.

## Atalhos

| Atalho | O que faz |
|---|---|
| `Ctrl+P` | abrir arquivo por nome (casa por subsequência: `mgc` → `medir_gc.py`) |
| `Ctrl+Espaço` | sugerir (catálogo do Biopython + pyright) |
| `Tab` | **indentar** quando o cursor está no branco do começo da linha; aceitar a sugestão da caixa quando não está |
| `Shift+Tab` | tirar um nível de indentação |
| `F12` | ir para a definição |
| `Ctrl+N` | novo arquivo, já com `.py` preenchido |
| `Ctrl+S` | gravar |
| `Ctrl+Enter` | grava e executa o script aberto |
| `Alt+Enter` ou `Ctrl+→` | aceitar a sugestão do texto fantasma (IA) |
| `Ctrl+W` | fechar aba (a do cromatograma quando a mão está no painel de baixo) |
| ``Ctrl+` `` | abrir/fechar o terminal (coluna da direita) |
| `Ctrl+B` | abrir/fechar a lateral — clicar no ícone já selecionado faz o mesmo |
| `F2` / `Delete` | renomear / excluir a linha em foco na árvore |

Clicar num `File "...", line N` do traceback abre o arquivo naquela linha —
inclusive quadros dentro de bibliotecas, que abrem para leitura.

## O autocomplete que só a Bancada tem

O catálogo alimenta o autocomplete do editor. A diferença para um language
server não é a assinatura — é a **nota de curadoria**: digitar `gc_` oferece
`gc_fraction` e a caixa de detalhe diz, junto com a assinatura real, que ela
*devolve fração de 0 a 1, não porcentagem*, e que substitui a `Bio.SeqUtils.GC`
removida. Aceitar acrescenta o `import` que falta no topo do arquivo e anuncia
isso na barra de estado.

A linha de `import` não é deduzida do caminho pontilhado — sai do trecho
verificado do próprio catálogo, porque `Bio.SeqIO.parse` se escreve
`SeqIO.parse` e `Bio.SeqUtils.gc_fraction` se escreve só `gc_fraction`, e só o
trecho sabe qual é qual.

Entradas depreciadas continuam aparecendo — o catálogo as inclui para serem
reconhecidas em código antigo — mas sempre no fim da lista.

## Análise de tipos: pyright

O erro aparece **antes de rodar**. `"GC: " + gc_fraction(s)` é sublinhado com
`Operator "+" not supported for "Literal['GC: ']" and "float | Literal[0]"`, que
é a armadilha do `gc_fraction` pega na origem em vez de virar traceback.

A escolha foi medida, não assumida: o pyright resolveu o Biopython do miniforge
neste ambiente. `jedi-language-server` seria mais leve e não faz checagem de
tipo. A **Pylance faria melhor e está juridicamente fora** — a licença dela
permite uso *"only with Visual Studio Products and Services"*.

O servidor é um pacote npm com `typeshed` embutido, então **viaja com o
aplicativo**: nenhum laboratório precisa instalar language server no próprio
env. Roda pelo binário do Electron com `ELECTRON_RUN_AS_NODE`, sem exigir node
na máquina. O modo é `basic`, não `strict` — código de análise científica é
quase todo sem anotação de tipo, e o estrito viraria ruído.

Sem o servidor o editor continua inteiro; só perde os avisos.

## Texto fantasma (opcional, e sai da máquina)

Sugestão de código por IA em cinza à frente do cursor; **`Alt+Enter`** (ou
`Ctrl+→`) aceita, `Esc` dispensa. Dois motores possíveis: a **DeepSeek** por
**FIM** (fill-in-the-middle) — manda o que vem antes e o que vem depois do
cursor, então a sugestão encaixa no meio de uma linha — ou o **GitHub Copilot**,
descrito no fim desta seção.

**Este é o único recurso que envia código para fora.** O trecho em volta do
cursor vai para o modelo. O painel *Configurações* diz isso na cara, tem
interruptor e um botão para esquecer a chave. Vem desligado até haver chave.

A chave fica em `~/.config/bancada/config.json`, **cifrada pelo `safeStorage` do
Electron** (chaveiro do sistema), com o arquivo em `0600`. Se a máquina não
oferecer chaveiro, a chave vai em texto puro — e a tela avisa, em vez de fingir
que guardou bem.

Quem já usa **Twinny no VS Code** pode importar o provedor FIM com um botão. A
Bancada passa a ter cópia própria: desinstalar o Twinny não a quebra. A leitura
do `state.vscdb` acontece **só** nesse clique, nunca em tempo de execução.

O fantasma nunca aparece junto da caixa do catálogo: o catálogo é verificado, o
fantasma é adivinhado, e as duas coisas não podem disputar a mesma tecla.

**O fantasma tem tecla própria: `Alt+Enter` (ou `Ctrl+→`).** Ele já morou no
`Tab`, por último numa cascata, o que parecia inofensivo — mas sempre que a caixa
não estava aberta, que é a maioria do tempo, o `Tab` caía nele. Num arquivo `.py`
isso chegou a inserir uma função inteira em **bash**. O `Tab` ficou com o que não
é adivinhado: indentar, e aceitar a sugestão da caixa.

E a indentação ganha de tudo: com o cursor no branco do começo da linha, `Tab`
indenta — sempre. Indentação errada quebra o Python; sugestão recusada só custa
um `Esc`.

### Trocar o motor: DeepSeek ou GitHub Copilot

Quem tem assinatura do **Copilot** pode usá-lo no lugar da DeepSeek. Em
`~/.config/bancada/config.json`, dentro de `fantasma`:

```json
{ "fantasma": { "motor": "copilot", "ligado": true } }
```

O pacote é uma **dependência opcional** — clonar a Bancada não baixa os 111 MB
dele. Para usar:

```bash
npm install @github/copilot-language-server
```

Na primeira vez é preciso autorizar pelo GitHub (fluxo de código de dispositivo);
a Bancada nunca vê senha nem token, e o `checkStatus` diz com qual conta entrou.
Sem o pacote instalado, ou sem assinatura, a Bancada **abre e funciona igual** —
só o fantasma fica quieto; catálogo, pyright e o resto seguem inteiros.

O que muda de verdade: o Copilot enxerga o arquivo aberto e o projeto, então
sugere o corpo de uma função a partir do nome e do docstring, e não só o miolo da
linha. Em compensação, ele é o único caminho que exige conta paga de terceiro —
a DeepSeek continua sendo o motor padrão.

## Instalar o lançador (Linux/KDE)

A marca vira o ícone da barra de tarefas por meio do arquivo `.desktop` — no
Plasma, janela XWayland pega o ícone do lançador, não da própria janela (a
propriedade `_NET_WM_ICON` fica vazia).

```bash
# 1. o lançador: chama o BINÁRIO do Electron, não o atalho em .bin/
install -Dm755 /dev/stdin ~/.local/bin/bancada <<'EOF'
#!/usr/bin/env bash
raiz="$HOME/projetos/bancada"
exec "$raiz/node_modules/electron/dist/electron" "$raiz" "$@"
EOF

# 2. os ícones, em vários tamanhos
for t in 512 256 128 64 48 32; do
  ffmpeg -y -i media/icon.png -vf scale=$t:$t /tmp/b.png
  install -Dm644 /tmp/b.png ~/.local/share/icons/hicolor/${t}x${t}/apps/bancada.png
done

# 3. o .desktop, com CAMINHO ABSOLUTO no Exec
sed "s|^Exec=bancada|Exec=$HOME/.local/bin/bancada|" media/bancada.desktop \
  > ~/.local/share/applications/bancada.desktop
update-desktop-database ~/.local/share/applications
```

**Duas armadilhas aqui, e as duas só aparecem lançando pelo menu.**

A primeira: `node_modules/.bin/electron` é um **script Node**
(`#!/usr/bin/env node`), e a sessão gráfica não tem `node` no `PATH` quando ele
vem do nvm — que mora no perfil do shell. Pelo menu, o aplicativo abria e fechava
na hora, sem mensagem nenhuma. Chamar `node_modules/electron/dist/electron`, que
é binário de verdade, resolve.

A segunda: **o caminho absoluto no `Exec` não é preciosismo.** A sessão do Plasma não tem
`~/.local/bin` no `PATH` — quem coloca isso é o perfil do shell, que um lançador
gráfico não lê. Com `Exec=bancada`, o menu responde *"could not find program
'bancada'"*. Num pacote de verdade o binário vai para um diretório do `PATH` e
aí o nome simples volta a funcionar.

## A trilha de estudo

Painel próprio na barra de atividades: seis tópicos, cada um com abertura,
conceitos, recursos e exercícios com correção automática.

**Um exercício é conceito + contrato + vestimenta.** O conceito é o que se
aprende; o contrato é a função a escrever (`conta(itens, alvo)`); a vestimenta é
a roupa do enunciado — sequências, clínica, campo ou laboratório. O mesmo
`conta()` conta bases, atendimentos, avistamentos ou quadrantes, e **o
verificador é um só**, porque o contrato não muda. O progresso é por conceito:
trocar de vestimenta no meio não perde nada.

Isso não é enfeite. Conceito que só aparece numa roupa vira receita — quem só viu
dicionário contando bases aprendeu a contar bases, não aprendeu dicionário.

**A correção roda o seu código.** `praticar` cria o arquivo em `trilha/` dentro
da pasta da corrida, com o enunciado no topo e a assinatura pronta; `corrigir`
importa a sua função e chama com entradas conhecidas, no Python do laboratório,
com a saída no terminal de sempre. Nunca varre o código atrás de palavra-chave:
há muitos jeitos certos de escrever a mesma função, e corretor que exige um jeito
ensina a adivinhar gabarito.

Conteúdo em `trilhas/fase1/*.md` (versionado, editável por você); progresso em
`~/.config/bancada/trilha.json`, que é seu.

## O mascote

Companhia de bancada, **explicitamente pessoal**: não analisa nada, não abre
arquivo e não opina sobre o código. Flutua num canto da área de escrita,
arrastável, e sai da frente no `✕` — volta pelo botão *Mascote* na barra de
estado.

Ele tem **dois canais, e a separação entre eles é a regra**:

- **Reação — local, sem rede.** Rodou, deu certo, deu erro, gravou, abriu
  cromatograma: troca de cara e solta uma frase curta. O widget recebe só o
  **tipo** do evento, nunca o nome do arquivo, o caminho ou a mensagem de erro —
  nome de arquivo numa pasta de corrida costuma ser identificação de amostra.
- **Conversa — sai da máquina, e só quando ligada.** Vai o que você escreve e o
  resumo em `~/.config/bancada/contexto.md`, escrito à mão e fora de qualquer
  repositório. **Nada da sessão.** Vem desligada; o painel diz o que sai.

Usa a mesma chave do texto fantasma, num endereço de conversa
(`/chat/completions`) derivado do que já está configurado.

### A memória dela

Ela guarda o que aprende sobre você em `~/.config/bancada/fern/`:

| arquivo | o que é |
|---|---|
| `perfil.md` | o que não muda toda semana. **Reescrito ao fim de cada conversa** |
| `diario/<data>.md` | o que aconteceu naquele dia, cru |
| `notas/<nome>.md` | o que você mandou guardar: datas, listas, ideias |

Ela escreve sozinha, com quatro ferramentas (`lembrar`, `anotar`, `ler_nota`,
`listar_notas`). **Não existe ferramenta que leia arquivo do computador, liste
pasta ou rode comando** — ela escreve na memória dela e lê a memória dela, e
nada mais alcança o disco.

O botão *memória* na conversa lista tudo, e clicar **abre o Markdown no editor da
Bancada**: você corrige e grava com `Ctrl+S` como em qualquer arquivo. É isso que
torna "ela decide o que guardar" aceitável.

**O que ela guarda volta para a API a cada conversa** — é assim que a memória
serve para alguma coisa, e é por isso que o perfil tem teto de 25 linhas, o
diário entra só dos últimos quatro dias e a instrução dela proíbe guardar dado de
laboratório.

O sprite mora em `~/.config/bancada/mascote/*.png` (`parado`, `piscando`,
`feliz`, `preocupado`, `pensando`), **fora do repositório**: o personagem é de
gosto pessoal e pode ser de outra pessoa, e versionar o desenho junto do código
faria a licença dele decidir a da Bancada. Sem sprite, a Bancada desenha um
erlenmeyer de reserva.

Para trocar de personagem basta um quadro parado; as outras quatro expressões
saem dele:

```bash
python3 tools/expressoes_mascote.py parado.png --mapa       # ler onde estão os olhos
python3 tools/expressoes_mascote.py parado.png 37,42,27,34 50,56,27,34
```

As expressões são **editadas no pixel, não geradas**: gerar variação de um rosto
de 96 px devolve o mesmo desenho (com força alta) ou outro personagem (com força
baixa) — foi medido. Mexer nos olhos mantém a identidade por construção. Só os
olhos mudam: boca de chibi tem dois pixels e não sustenta expressão.

## Papel de parede e temas

Em *Configurações → Aparência*: uma imagem atrás do editor, com escurecimento e
desfoque no deslizador, e temas de cor — incluindo **um gerado a partir da sua
imagem** (ele tira a cor escura mais frequente para o fundo e a mais saturada
para o acento).

**Papel de parede animado (GIF/WebP):** GIF de wallpaper quase nunca é um loop
fechado — o último quadro não casa com o primeiro e a volta dá um tranco. A
Bancada decodifica os quadros e desenha ela mesma, com três modos de volta:
*dissolver* (padrão — o fim entra por cima do começo), *vai-e-vem* (toca de trás
para a frente, sem volta para esconder) e *corte seco*. Medido num GIF real, o
salto da volta cai de **9,8 para 2,8** — o nível do movimento normal da animação.

Três limites, que são a decisão e não detalhe:

- o papel de parede aparece **só atrás da área de escrita** — nunca atrás do
  cromatograma, da árvore, do terminal ou das abas;
- nasce escurecido em 82 %, porque a casca existe para as quatro bases serem a
  cor mais forte da tela;
- o tema gerado tem o fundo **preso no escuro** e não toca nas cores das bases.

## A pasta da corrida fica lembrada

Sem argumento na linha de comando, a Bancada reabre **a última pasta que ficou
aberta**; as anteriores (até oito) aparecem na tela vazia do Explorer, com um
`✕` para tirar da lista. Pasta que sumiu do disco some da lista sozinha, e uma
que existe mas não abre — permissão, disco removido — diz o porquê no terminal
em vez de deixar a tela vazia sem explicação.

A lista mora no mesmo `~/.config/bancada/config.json` do segredo, com o arquivo
em `0600`, e **não** em armazenamento do navegador: caminho de pasta de corrida
já é dado sensível — diz sob que nome o laboratório guarda material não
publicado. Medida de painel é preferência de tela e essa sim fica no
`localStorage`.

`bancada ~/corridas/18S` continua ganhando da memória: quem digitou a pasta
disse o que quer agora.

## Cromatograma

Clicar num `.ab1` abre o visualizador **na faixa de baixo**, com uma aba por
arquivo — o editor continua na tela inteira acima dele. **É o único lugar do
aplicativo com cor saturada** — a casca é monocromática justamente para que as
quatro bases (A `#3fc46b`, C `#4d96ff`, G `#e9b949`, T `#f0574f`) sejam as cores
mais fortes da tela. `Ctrl`+roda amplia; a roda sozinha rola.

A altura da faixa é arrastável e fica guardada entre sessões; o duplo clique no
divisor volta ao padrão. O mínimo (260px) não é gosto: abaixo dele o desenho só
caberia com barra de rolagem **vertical**, e a leitura de um cromatograma é para
o lado.

A leitura é feita por `tools/ler_ab1.py`, com o Biopython do laboratório —
conforme a ADR 0003, quem entende de dado biológico é o Python, não a casca. O
script não importa nada da Bancada e roda sozinho:

```bash
python3 tools/ler_ab1.py amostra.ab1 | jq .resumo
```

Duas escolhas que mudam o que se vê:

- **Reamostragem por máximo, nunca por média.** Um `.ab1` tem 10 a 15 mil pontos
  por canal; a redução para 6000 usa o máximo de cada balde, porque média achata
  pico — e pico é exatamente o que se foi olhar.
- **Sem a marca `FWO_1`, o leitor falha** em vez de assumir `GATC`. Adivinhar a
  ordem dos canais produziria um cromatograma bonito e errado, que é pior do que
  nenhum.

### Dados de exemplo

Os 36 `.ab1` reais do LHV **não entram em repositório** — são dados não
publicados. Para desenvolver e testar há um gerador de arquivos sintéticos:

```bash
python3 tools/make_ab1.py exemplos/sintetico_01.ab1 --bases 900
```

O que sai é um ABIF válido (o Biopython abre como abriria um de sequenciador),
mas **não é biologia**. Ver `exemplos/LEIA-ME.md`.

## O catálogo nunca é escrito à mão

Esta é a regra central do projeto. `data/biopython-catalog.json` é **gerado** por
introspecção do Biopython instalado. Em `tools/build_catalog.py` só se declara a
curadoria (quais tarefas existem, quais caminhos entram, qual trecho inserir);
tipo, assinatura, docstring e estado de depreciação saem sempre do pacote real.

Se um caminho declarado não existir, o gerador **falha** em vez de gravar um
catálogo que promete algo inexistente. Foi assim que se confirmou, contra o
Biopython 1.87 instalado, que:

| Caminho | Situação real (1.87) |
|---|---|
| `Bio.SeqUtils.GC` | **removido** — use `Bio.SeqUtils.gc_fraction` (devolve fração 0–1, não %) |
| `Bio.Application` | **removido** por inteiro |
| `Bio.Alphabet` | **removido** por inteiro |
| `Bio.pairwise2` | importa, mas emite `BiopythonDeprecationWarning` — use `Bio.Align.PairwiseAligner` |
| `Bio.Align.AlignInfo.SummaryInfo` | marcado como depreciado no próprio docstring |

Nenhum desses fatos veio de memória de modelo de linguagem: todos saíram da
instalação.

## Gerar e verificar o catálogo

Precisa de um Python **com Biopython instalado**. Nesta máquina é o env
`easycontig-demo` do miniforge:

```bash
PY=~/miniforge3/envs/easycontig-demo/bin/python

$PY tools/build_catalog.py            # grava data/biopython-catalog.json
$PY tools/build_catalog.py --check    # só valida, não grava
$PY tools/check_snippets.py           # executa os trechos de verdade
```

### Referência de leitura

```bash
python3 tools/build_reference.py     # gera docs/biopython-por-tarefa.md
```

`docs/biopython-por-tarefa.md` é o catálogo em forma de documento: cola rápida com
uma função por tarefa, tabela do que saiu do Biopython, e as 55 funções com
assinatura, docstring e trecho. Também é gerado — não editar à mão. O gerador
falha se a cola rápida citar um caminho que não está no catálogo.

`check_snippets.py` é a verificação forte: resolver o símbolo prova que a função
existe, mas não que o trecho oferecido está correto. Ele executa cada trecho e
classifica o desfecho (`ok`, `precisa-contexto`, `precisa-arquivo`,
`pulado-rede`); qualquer outro desfecho é defeito e o script sai com código 1.
Trechos que fariam requisição ao NCBI nunca são executados.

Estado atual: 12 tarefas, 55 entradas, 22 trechos executando de ponta a ponta,
0 defeitos.

## Rodar a aplicação

```bash
npm install
npm run dev                 # janela com recarga a quente
npm run dev -- ~/corridas/18S   # já abrindo uma pasta
npm run build && npm start  # produção
```

`npm run typecheck` roda o `tsc` em modo strict sobre os três lados (principal,
preload e interface).

### Arquitetura

| Diretório | Papel |
|---|---|
| `src/main/` | processo principal: janela, catálogo, detecção de ambiente, execução |
| `src/preload/` | a **única** superfície exposta à interface (`contextBridge`) |
| `src/renderer/` | a casca: HTML/CSS aprovados, CodeMirror 6, xterm.js |
| `src/shared/` | tipos que atravessam o IPC — sem `electron`, sem `node:*`, sem DOM |

`contextIsolation` ligado e `nodeIntegration` desligado: a interface não tem
`require`, `fs` nem `child_process`. Tudo o que ela pode fazer está listado em
`src/preload/index.ts`.

### O terminal não tem PTY, e é decisão forçada

`node-pty` é módulo nativo e precisa compilar contra o ABI do Electron. A máquina
de desenvolvimento (SteamOS) **não tem `gcc` nem `make`** e tem a raiz
somente-leitura. Então a execução usa canos comuns (`python -u`) e o xterm.js
serve só de tela.

O que se perde: `input()` trava, não há cor de programas que checam `isatty`, e
não há barra de progresso reescrevendo a linha. Para rodar um script de análise e
ler o stdout — que é o caso de uso — basta. Trocar isso por PTY passa a exigir
toolchain nativo na máquina de quem compila.

### As fontes vêm do mockup aprovado

```bash
python3 tools/extract_fonts.py    # mockup de 23/07 -> src/renderer/fontes/
```

O gerador avisa de um achado de 29/07: os três "pesos" do IBM Plex Sans no mockup
(400, 500 e 600) são **o mesmo arquivo**. Como cada `@font-face` declarava um peso
exato, o navegador não sintetizava negrito — todo `font-weight:600` da casca vinha
sendo desenhado em peso regular desde 23/07. O gerador agora declara o intervalo
`400 600` numa face só, o que diz a verdade e preserva a aparência aprovada.
Corrigir de fato exige trazer os `.woff2` reais dos pesos 500 e 600.

## Pendências conhecidas

- **Sem dados de exemplo.** 14 trechos leem arquivos (`entrada.fasta`,
  `resultado.xml`, `amostra.ab1`) que não existem no repo, então não rodam como
  estão. Ficheiros FASTA/XML sintéticos resolveriam a maioria. Para `.ab1`,
  **não usar** os 36 arquivos reais do LHV — são dados não publicados.
- **Como distribuir segue em aberto.** Open VSX **deixou de se aplicar** com a
  virada para aplicação própria (ADR 0003) — não há mais marketplace no caminho.
  A licença, essa sim, está decidida: ver abaixo.
- **Sem empacotamento.** Não há `electron-builder` nem AppImage: hoje só roda a
  partir do repo.
- **Sem testes automatizados do lado TypeScript.** A fatia atual foi verificada
  rodando o aplicativo de verdade (abrir pasta → abrir `.py` → executar → ler o
  stdout) e por `tsc` strict, não por suíte.
- **O interpretador está fixo no código** (`src/main/ambiente.ts`): tenta o env
  `easycontig-demo` do miniforge e cai para `/usr/bin/python3`. Vira configuração
  quando a tela de Configurações existir.
- A pré-visualização de `.ab1` como cromatograma (processo Python auxiliar) não
  foi começada — e, pela ADR 0003, é o **coração** da IDE, não um acréscimo.
- **O painel da Bancada está pausado** a pedido do autor, atrás da constante
  `BANCADA_PAUSADA` em `src/renderer/src/main.ts`. Virar para `false` devolve a
  navegação pelas 12 tarefas.
- **Autocomplete (P1.4) não começou.** A decisão pendente é *construir ou herdar* —
  o autor já tem o problema resolvido com Twinny + API da DeepSeek no VS Code.

## Protótipo visual da IDE própria (preto fosco)

Em 2026-07-26 o projeto virou **aplicação própria**, fora do VSCodium (ver ADR 0003
no segundo cérebro). O protótipo visual fica em `design/`:

```bash
python3 tools/build_prototype.py     # gera design/prototipo-preto-fosco.html
```

O gerador junta o template (`design/prototipo.template.html`), o catálogo
verificado (`data/biopython-catalog.json`) e as fontes IBM Plex em base64
reaproveitadas do mockup aprovado de 23/07 — nada é copiado à mão. As versões da
barra de estado são **detectadas na máquina** na hora de gerar.

Abra o HTML direto no navegador; é arquivo único e funciona offline.

### A paleta vem do Cursor instalado, não de estimativa

O tema **Cursor Dark** fica em cache no SQLite de configuração do Cursor. Para
reextrair (útil se o tema mudar):

```bash
python3 -c "
import sqlite3, glob, json
for x in glob.glob('$HOME/.config/Cursor/**/state.vscdb', recursive=True):
    v = sqlite3.connect(x).execute(\"select value from ItemTable where key='colorThemeData'\").fetchone()
    if v: print(json.dumps(json.loads(v[0])['colorMap'], indent=2)); break
"
```

O que importa reproduzir é o **método**, não os hex isolados: uma cor base
`#f0f0f0` com canal alfa para todo primeiro plano, borda, hover e seleção, sobre
dois fundos — `#141414` (casca) e `#181818` (editor). Todas as bordas são um
token único, `#f0f0f013`.

Histórico de design em `design/`:
- `mockup-1-descartado-app-propria.html` — 1ª direção (23/07), descartada
- `mockup-2-aprovado-vscodium.html` — direção aprovada (23/07), casca do VSCodium
- `prototipo-preto-fosco.html` — IDE própria em preto fosco (26/07), gerado

> Os dois mockups de 23/07 nunca tinham sido versionados e foram achados na
> lixeira em 26/07 (apagados às 21:12 daquele dia). Estão no repo desde então.

### O esqueleto de extensão continua no repo

Em `legado-extensao/`: o `package.json` de extensão e o `extension.ts` de antes da
mudança de rumo. Não compilam mais e não fazem parte do build — ficam como
registro. O que sobreviveu sem alteração é o que importa: o catálogo gerado e as
duas ferramentas de verificação, que nunca dependeram da casca.

## Licença

**PolyForm Noncommercial 1.0.0** — texto integral em [`LICENSE`](LICENSE).

Uso não comercial é livre: universidade, instituto de pesquisa, órgão público,
ensino, estudo pessoal, projeto de hobby. **Uso comercial exige licença
separada** — contato em `LICENSE`.

É a mesma escolha feita no DNA Contingency, e pelo mesmo motivo: a ferramenta
nasceu para o laboratório público e deve continuar chegando de graça a quem
trabalha como ele, sem virar insumo gratuito de produto pago.

As bibliotecas de terceiros (Electron, CodeMirror 6, xterm.js, pyright) mantêm
cada uma a sua licença própria; esta cobre apenas o código da Bancada.
