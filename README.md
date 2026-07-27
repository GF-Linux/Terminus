# Bancada

**IDE própria** para o laboratório que facilita o uso do **Biopython**: um catálogo
navegável da biblioteca organizado **por tarefa** (não por módulo), com trechos
prontos para inserir no script, e pré-visualização de `.ab1` como cromatograma.

O problema que resolve: a documentação do Biopython é indexada por módulo, o que
só ajuda quem já sabe o nome do que procura. Aqui se procura pela tarefa —
"medir GC", "ler cromatograma", "montar árvore".

**Estado (2026-07-26):** o catálogo verificado e a referência de leitura estão
prontos e são o que há de mais sólido no repo. A aplicação em si **não começou** —
em 26/07 o projeto deixou de ser extensão do VSCodium e virou aplicação própria
(ADR 0003 no segundo cérebro), e a base (Tauri / Electron / Qt+Python) ainda não
foi escolhida. Existe protótipo visual em `design/`. O esqueleto de extensão em
`src/` é de antes da virada e está preservado, não descartado.

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

## Compilar a extensão

```bash
npm install
npm run compile     # tsc em modo strict, saída em out/
```

## Pendências conhecidas

- **VSCodium não está instalado nesta máquina** — o que existe é VS Code flatpak
  (`com.visualstudio.code`). A API de extensão é a mesma, então o esqueleto serve
  aos dois, mas o teste no alvo real (VSCodium) ainda não foi feito.
- **Sem dados de exemplo.** 14 trechos leem arquivos (`entrada.fasta`,
  `resultado.xml`, `amostra.ab1`) que não existem no repo, então não rodam como
  estão. Ficheiros FASTA/XML sintéticos resolveriam a maioria. Para `.ab1`,
  **não usar** os 36 arquivos reais do LHV — são dados não publicados.
- **Licença e nome não decididos.** `package.json` está como `UNLICENSED` por ora;
  "Bancada" segue sendo sugestão. Distribuição por Open VSX **deixou de se aplicar**
  com a virada para aplicação própria (ADR 0003) — não há mais marketplace no
  caminho, e como distribuir passou a ser pergunta aberta.
- **Base da aplicação não escolhida** (Tauri vs Electron vs Qt/Python). Decisão
  adiada de propósito; ver ADR 0003.
- **Sem testes automatizados do lado TypeScript.** O `catalog.ts` foi verificado
  à mão no node (carga e caminho de erro); `extension.ts` só foi verificado por
  compilação.
- A pré-visualização de `.ab1` como cromatograma (processo Python auxiliar +
  webview) não foi começada.

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

O `package.json` de extensão e `src/extension.ts` são de antes da mudança de rumo.
O que sobrevive sem alteração para a IDE própria é o que importa: o catálogo
gerado e as duas ferramentas de verificação, que não dependem da casca.
