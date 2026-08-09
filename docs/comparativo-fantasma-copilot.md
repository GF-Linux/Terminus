# O fantasma da Bancada contra o Copilot do VS Code

**Medido em 2026-08-04.** Reprodutível por `tools/comparativo-fantasma/`.

> **Estado (04/08, no mesmo dia):** os itens **1 e 2** da lista de correções
> foram implementados e verificados — ver a ADR 0024 no segundo cérebro e
> `tools/comparativo-fantasma/verificar-abas.mjs`, que dirige o
> `src/main/copilot.ts` **de verdade** e encena a dança de abas: 3/3 acertando a
> assinatura com a aba vizinha aberta, 3/3 com o erro antigo (`limiar=0.1`) sem
> ela. Os itens 3, 4 e 5 seguem abertos. O resto deste documento descreve o
> estado **anterior** à correção, que é o que ele mediu.

O autor relatou que a sugestão na Bancada está *"bem aquém"* da do VS Code.
Este documento mede a diferença em vez de supô-la, e diz de quem é a culpa em
cada caso.

## O método, e por que ele é justo

O motor é **o mesmo binário e a mesma conta**: `@github/copilot-language-server`
1.527.1, a autenticação de `~/.config/github-copilot/auth.db`. Os dois perfis
falam LSP com o mesmo processo, sobre os mesmos arquivos, na mesma posição de
cursor.

O que muda entre eles é só **o que o cliente conta ao servidor** e **o que o
cliente faz com a resposta**:

| | perfil `bancada` | perfil `vscode` |
|---|---|---|
| `rootUri` / `workspaceFolders` | `null` / `[]` (cópia fiel de `src/main/copilot.ts:125`) | a pasta aberta |
| `workspace/didChangeConfiguration` | nunca mandado | mandado |
| abas vizinhas (`didOpen`) | nenhuma — só o arquivo focado | todas as abertas |
| tratamento da resposta | descarta o `range`, corta o prefixo (`copilot.ts:246`) | honra o `range` |

Qualquer diferença medida aqui é, por construção, **diferença do cliente, não do
modelo**.

Uma armadilha que quase estragou a medida: **o servidor guarda resposta por
conteúdo + posição.** Perguntar duas vezes no mesmo processo devolve em ~7 ms o
que a primeira levou 800 ms — isso mede o cache, não o Copilot. Por isso cada
experimento dirigido roda com **processo novo**.

---

## Resultado 1 — o achado que explica quase tudo

**A Bancada nunca conta ao Copilot que existem outros arquivos abertos.**

`src/main/copilot.ts:173` (`sincronizar`) abre um documento só: o do cursor.
O Copilot monta o contexto dele a partir das abas que o editor declarou. Sem
`didOpen` das vizinhas, ele está adivinhando o que está do outro lado do
`import`.

Teste decisivo, com um `laboratorio.py` cuja assinatura **nenhum modelo pode
chutar** (`corte_phred`, `margem_bases`, e as constantes `PHRED_MINIMO_LHV = 17`
e `MARGEM_BASES_LHV = 8`). O arquivo em edição tem `from laboratorio import
aparar_pontas` e o cursor em `aparado = aparar_pontas(registro, `.

| perfil | o que veio | acerta? |
|---|---|---|
| `bancada` (hoje) | `aparar_pontas(registro, limiar=0.1)` | **não** — `limiar` não existe |
| `vscode` | `aparar_pontas(registro, corte_phred=17, margem_bases=8)` | **sim** — nomes e valores reais |

**5 corridas de cada, processo novo, 5/5 idênticas nos dois lados.** Não é
variação de modelo; é informação que não foi mandada.

E o custo não é "sugestão pior": é **sugestão que não roda**. `limiar=0.1` é
`TypeError: aparar_pontas() got an unexpected keyword argument 'limiar'`. Para o
público desta IDE — quem sabe ler Python e não sabe depurar — uma sugestão que
parece certa e quebra é pior do que sugestão nenhuma.

### Isolando a causa: não é a pasta, são as abas

Duas correções possíveis, medidas separadamente:

| perfil | manda a pasta? | abre a vizinha? | acerta a assinatura |
|---|---|---|---|
| `bancada` | não | não | 0/3 |
| `so-raiz` | **sim** | não | **0/3** |
| `so-vizinho` | não | **sim** | **3/3** |
| `vscode` | sim | sim | 3/3 |

**Mandar `rootUri` e `workspaceFolders` não muda nada.** O que conserta é o
`didOpen` das outras abas. Isso é bom: a Bancada já tem a lista de abas
(`abas[]` em `src/renderer/src/main.ts`), e a correção é sincronizá-la, não
construir um indexador de projeto.

---

## Resultado 2 — a dança de abas corrompe a cópia do Copilot

Pior do que não mandar as vizinhas: **mandar o texto errado sob o nome errado.**

`definirArquivoDoFantasma` só é chamado de `ipcMain.on("lsp:abrir")`
(`src/main/index.ts:491`), e `lsp:abrir` só acontece quando um arquivo é aberto
pela **primeira vez** na sessão (`main.ts:1609`). Trocar de aba chama
`focarNoServidor` → `definirArquivoAtual`, que é outra coisa, **só do renderer**,
e serve ao pyright.

Ou seja, o gesto normal de quem programa:

1. abre `analise.py` → `arquivoAtual = analise.py` ✔
2. abre `laboratorio.py` para conferir o helper → `arquivoAtual = laboratorio.py`
3. volta para a aba do `analise.py` e digita
4. a Bancada manda **o texto do `analise.py` com a URI do `laboratorio.py`**

O `didChange` sobrescreve a cópia que o Copilot tinha do `laboratorio.py`. A
partir daí ele não tem mais o arquivo bom em lugar nenhum.

| cenário | sugestão | acerta? |
|---|---|---|
| URI certa | `aparar_pontas(registro, corte_phred=17, margem_bases=8)` | 3/3 |
| depois da dança de abas | `aparar_pontas(registro, limiar=0.05, min_length=100, min_quality=20)` | **0/3** |

Repare que aqui é **pior que o Resultado 1**: sem contexto ele inventa um
argumento; com contexto corrompido ele inventa quatro. E abrir um arquivo que
não é `.py` (um `LEIA-ME.md`, um `.csv`) não chama `lsp:abrir` de jeito nenhum —
o `arquivoAtual` fica preso no último `.py` aberto, indefinidamente.

**É esta a explicação mais provável do "às vezes sim, às vezes não":** funciona
enquanto há um arquivo só aberto, e degrada assim que se abre o segundo.

---

## Resultado 3 — a janela em que a sugestão pode sobreviver é curta demais

Latência medida da **primeira** pergunta, 10 casos × 2 perfis, só quando veio
sugestão: mediana **886 ms**, p90 **1,8 s**, pior caso **6,6 s**.

Somando a espera de `ESPERA = 300` (`src/renderer/src/fantasma.ts:32`), a pessoa
precisa ficar **parada de 1,2 s a 2,1 s** para o fantasma aparecer. E qualquer
tecla ou movimento de cursor dentro dessa janela joga tudo fora, em dois lugares:

- `fantasma.ts:48` — `if (tr.docChanged || tr.selection) return null` apaga a
  sugestão já na tela;
- `fantasma.ts:123` — `if (this.view.state.selection.main.head !== cursor.head)
  return` descarta a resposta que chegou.

O VS Code não descarta: ele **re-ancora**. O `range` que o Copilot devolve começa
no início da linha, justamente para o cliente poder recortar de novo o que ainda
falta escrever conforme a pessoa digita. Quem digita `cor` em cima de
`corte_phred=17` continua vendo `te_phred=17` em cinza — na Bancada, some.

Isso também é o que sustenta o **aceite parcial** (aceitar só a próxima palavra,
só a próxima linha) que o VS Code tem e a Bancada não: `Alt-Enter` aceita as 14
linhas ou nenhuma.

### O que **não** é problema (medido, para não gastar trabalho à toa)

- **Não mandar `$/cancelRequest` não custa nada.** Seis pedidos em 150 ms, com e
  sem cancelamento: os cinco primeiros voltam **todos no mesmo instante e com
  zero itens** — o servidor já descarta pedido superado sozinho. Os tempos são
  indistinguíveis entre os dois modos.
- **Truncar contexto não é problema no caminho do Copilot.** O `ANTES = 2400` /
  `DEPOIS = 800` de `src/main/fantasma.ts:17` valem só para o FIM da DeepSeek; o
  Copilot recebe o documento inteiro.
- **Não há sugestões para alternar.** Todas as respostas vieram com `items`
  de tamanho 1. Não vale implementar `Alt+]` / `Alt+[`.

---

## Resultado 4 — o que o servidor recusa, recusa nos dois

Três dos dez casos voltaram vazios **nos dois perfis**, de forma reprodutível
(0/3 e 0/3). Não é defeito da Bancada:

| caso | o que é | quem recusa |
|---|---|---|
| cursor no meio da linha com `(nome)` depois | `linhas.⟦⟧(nome)` | o servidor, em **3 ms** — nem chega a perguntar |
| comentário-guia com linha vazia embaixo | `# cortar as pontas… ⟦⟧` | o modelo, ~600 ms, resposta vazia |
| fim de arquivo logo depois de `print(...)` | `print(conteudo_gc(registro))⟦⟧` | o modelo, ~600 ms, resposta vazia |

O terceiro é interessante: é exatamente a situação que originou o
`acertarAQuebra` de `src/main/fantasma.ts:63`. Aquela correção continua
necessária **para o FIM**; para o Copilot ela nunca é exercitada, porque o
Copilot simplesmente não sugere ali.

---

## Matriz dos dez casos

Primeira pergunta de cada caso (as repetições 2 e 3 vêm do cache do servidor).

| # | caso | `bancada` | `vscode` | veredito |
|---|---|---|---|---|
| 1 | corpo vazio de `def` + docstring | 5 linhas, `with open(...)` | as mesmas 5 linhas | empate |
| 2 | meio de chamada, `)` depois | `registro.seq)` | idem | empate |
| 3 | comentário-guia | vazio 0/3 | vazio 0/3 | o modelo recusa nos dois |
| 4 | função definida em outra aba | `cortar_por_qualidade(registro, 20)` | `cortar_por_qualidade(registro, minimo=20)` | empate **nesta corrida** — ver abaixo |
| 5 | dicionário de primers pela metade | `"TGCTGCCTCCCGTAGGAGT"` | `"AGAGTTTGATCCTGGCTCAG"` (repete o 27F, sem o código M) | os dois erram: nenhum sabe o que é BTF2 |
| 6 | texto depois do cursor na mesma linha | vazio 0/3, em 3 ms | vazio 0/3, em 3 ms | o servidor recusa nos dois |
| 7 | corpo de `for` indentado | `qualidade = qualidade_media(registro)` | `media = qualidade_media(registro)` | empate |
| 8 | fim de arquivo depois de `print()` | vazio 0/3 | vazio 0/3 | o modelo recusa nos dois |
| 9 | definição 60 linhas acima | 14 linhas, inventa `import pandas as pd` | 11 linhas, usa `from utilitarios import ler_ab1, qualidade_media` | **Bancada perde** |
| 10 | método novo dentro de classe | `get_arquivos(self): return self.arquivos` | `ler_todas(self)` chamando o `ler_ab1` do vizinho | **Bancada perde** |

Nos seis casos em que só o arquivo aberto importa (1, 2, 3, 6, 7, 8), os dois
lados dão **exatamente a mesma resposta**. O motor está bem; a ponte é que está
estreita.

**O caso 4 merece uma nota honesta.** Nesta corrida ele empatou: a Bancada
acertou `cortar_por_qualidade(registro, 20)`. Numa corrida anterior a mesma
Bancada respondeu `cortar_por_qualidade(registro, 0.5)`, que quebra. Um nome como
`cortar_por_qualidade` com um parâmetro chamado `minimo` é adivinhável — às vezes
o chute sai certo. **É por isso que o teste decisivo do Resultado 1 usa uma
assinatura inadivinhável:** lá o resultado é 5/5 contra 5/5, sem sorte no meio.
O que a matriz mostra não é que a Bancada erra sempre; é que ela **depende de
chute onde o VS Code depende de leitura**.

---

## Um quinto problema, este não medido: sugestão de várias linhas na tela

Três dos dez casos devolveram **3, 5 e 14 linhas**. O fantasma desenha isso como
um `<span>` embutido na linha (`fantasma.ts:62`), com `white-space: pre-wrap`
(`casca.css:600`) e `estimatedHeight = -1`.

Widget embutido do CodeMirror é para caber **numa linha**. Um `\n` dentro dele
quebra a linha visualmente sem o CodeMirror contar essa altura, e as linhas 2+ da
sugestão não saem na indentação do código — saem na coluna onde o widget começou.

Isto está marcado como **suspeita, não medida**: o jeito de confirmar é olhar, e
a receita de dirigir a interface (`--remote-debugging-port`) não deve ser usada
com a máquina em uso. **Confirmação de 10 segundos, com os olhos:** abrir um
`.py`, escrever `def media_phred(caminho):` com uma docstring, parar o cursor no
corpo vazio e esperar. Se a sugestão de 5 linhas sair torta, é isto.

---

## O que corrigir, na ordem do retorno

1. **Sincronizar todas as abas abertas com o Copilot** (`didOpen` de cada `.py`
   aberto, `didClose` ao fechar). É a maior parte da diferença — medido 3/3 no
   teste decisivo, e é o que separa os casos 9 e 10 na matriz. A Bancada já tem
   a lista de abas (`abas[]`); falta mandá-la.
2. **Consertar o arquivo focado na troca de aba.** `focarNoServidor` precisa
   avisar o processo principal, e o `didFocus` precisa ser remandado. Sem isto, a
   correção 1 é sabotada pela dança de abas. *(Fica registrado: hoje a Bancada
   sobrescreve a cópia de um arquivo com o conteúdo de outro.)*
3. **Não jogar a sugestão fora a cada tecla.** Honrar o `range`, e quando o que
   foi digitado for prefixo do que estava sugerido, recortar em vez de apagar.
   É o que faz a sugestão parecer "consistente" em vez de "às vezes sim, às
   vezes não".
4. **Desenhar sugestão de várias linhas direito** (widget de bloco para a segunda
   linha em diante), depois de confirmar o item anterior com os olhos.
5. **Aceite parcial** (`Ctrl+→` uma palavra, `Ctrl+↓` uma linha). Só faz sentido
   depois do 3, e é o que torna suportável uma sugestão de 14 linhas.

O que **não** entra na lista, por medição: `$/cancelRequest`, `rootUri`,
alternar entre sugestões, e mexer no tamanho do contexto.

## Como repetir a medida

```
cd tools/comparativo-fantasma
python3 casos.py > casos.json
REPETICOES=3 node comparar.mjs "$PWD/ws" casos.json bancada > r3-bancada.json
REPETICOES=3 node comparar.mjs "$PWD/ws" casos.json vscode  > r3-vscode.json

# experimentos dirigidos, um processo por corrida
node experimentos.mjs "$PWD/ws" A bancada      # sem vizinho
node experimentos.mjs "$PWD/ws" A so-raiz      # só a pasta
node experimentos.mjs "$PWD/ws" A so-vizinho   # só a aba vizinha
node experimentos.mjs "$PWD/ws" B bancada certo
node experimentos.mjs "$PWD/ws" B bancada bancada
node experimentos.mjs "$PWD/ws" C bancada      # tempestade de teclas
node experimentos.mjs "$PWD/ws" C cancelando
```

Precisa do `node` do nvm (a sessão gráfica do Plasma não o tem no `PATH`) e da
conta do Copilot já autenticada.
