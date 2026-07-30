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

O que ainda não existe: o cromatograma de `.ab1`, o painel da Bancada (pausado a
pedido) e o autocomplete. O esqueleto da extensão do VSCodium está preservado em
`legado-extensao/`.

## Atalhos

| Atalho | O que faz |
|---|---|
| `Ctrl+P` | abrir arquivo por nome (casa por subsequência: `mgc` → `medir_gc.py`) |
| `Ctrl+Espaço` | sugerir (catálogo do Biopython + pyright) |
| `Tab` | aceitar a sugestão (o `Enter` **não** aceita — quebra linha) |
| `F12` | ir para a definição |
| `Ctrl+N` | novo arquivo, já com `.py` preenchido |
| `Ctrl+S` | gravar |
| `Ctrl+Enter` | grava e executa o script aberto |
| `Ctrl+W` | fechar aba |
| ``Ctrl+` `` | abrir/fechar o terminal |
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
- **Licença e nome não decididos.** `package.json` está como `UNLICENSED` por ora;
  "Bancada" segue sendo sugestão. Distribuição por Open VSX **deixou de se aplicar**
  com a virada para aplicação própria (ADR 0003) — não há mais marketplace no
  caminho, e como distribuir passou a ser pergunta aberta.
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
