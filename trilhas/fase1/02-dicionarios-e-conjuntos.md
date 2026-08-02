# Dicionários e conjuntos
semana: 2
entrega: um contador feito com dicionário

O dicionário guarda pares — um nome apontando para um valor — e é o que
transforma uma lista solta em informação: quantos de cada, qual pertence a quem.
Conjunto responde outra pergunta, a de "quais são os diferentes aqui".

## conceitos
- criar `{}` e acessar `d['chave']`
- `.get()` com padrão, para não estourar no que falta
- percorrer com `.items()`
- `in` testa a chave
- `set`: únicos, união, interseção

## recursos
- Curso em Vídeo — Python Mundo 3, aula de dicionários :: https://www.cursoemvideo.com/curso/python-3-mundo-3/
- Real Python — Dictionaries in Python :: https://realpython.com/python-dicts/
- Docs oficiais — tutorial, "Dicionários" :: https://docs.python.org/pt-br/3/tutorial/datastructures.html#dictionaries

## exercício contar
função: contar(itens)
o que faz: devolve um dicionário com quantas vezes cada item aparece

### neutro
Devolva um dicionário com quantas vezes cada item aparece. Use `.get(item, 0)`
para somar sem precisar saber de antemão o que vai aparecer.

### sequências
Dada uma sequência como lista de bases, devolva `{'A': 3, 'C': 2, ...}`. Use
`.get(base, 0)` para somar sem precisar saber de antemão quais bases existem — é
isso que faz a função continuar funcionando quando aparece um `N`.

### clínica
Dada a lista de espécies atendidas no dia, devolva `{'canino': 3, 'felino': 2,
...}`. Use `.get(especie, 0)` para somar sem precisar saber de antemão quais
espécies apareceram — amanhã aparece uma que hoje não veio.

### campo
Dada a lista de espécies avistadas no transecto, devolva quantos indivíduos de
cada. Use `.get(especie, 0)` para somar sem saber de antemão o que apareceu — é
o transecto que decide, não você.

### laboratório
Dada a lista de resultados das lâminas (`'positivo'`, `'negativo'`,
`'inconclusivo'`), devolva quantos de cada. Use `.get(resultado, 0)` para somar
sem listar antes os resultados possíveis — um valor novo não deve quebrar a
contagem.

## exercício tamanhos
função: tamanhos(registros)
o que faz: recebe um dicionário {nome: lista} e devolve {nome: quantidade de itens}

### neutro
Recebe `{nome: lista}` e devolve `{nome: quantos itens}`. Percorra com
`.items()` e monte um dicionário novo, sem alterar o que entrou.

### sequências
Você tem `{'BR-01': ['A','C','G'], 'BR-02': [...]}` e quer o comprimento de cada
sequência sem imprimir uma por uma. Percorra com `.items()` e monte um
dicionário novo.

### clínica
Você tem `{'Rex': ['vacina', 'vermífugo'], 'Mel': [...]}` — os procedimentos de
cada animal — e quer quantos cada um recebeu. Percorra com `.items()` e monte um
dicionário novo.

### campo
Você tem `{'ponto 1': ['sabiá', 'bem-te-vi'], 'ponto 2': [...]}` e quer quantas
espécies foram vistas em cada ponto. Percorra com `.items()` e monte um
dicionário novo.

### laboratório
Você tem `{'placa A': [0.12, 0.34], 'placa B': [...]}` — as leituras de cada
placa — e quer quantos poços foram lidos em cada uma. Percorra com `.items()` e
monte um dicionário novo.

## exercício fora_da_lista
função: fora_da_lista(itens, permitidos)
o que faz: devolve um conjunto (set) com os itens que não estão em `permitidos`

### neutro
Devolva um conjunto com os itens que não estão na lista de permitidos.
Conjunto, e não lista: o mesmo item errado dez vezes é um problema só.

### sequências
Antes de analisar, confira: a sequência tem alguma letra que não seja A, C, G ou
T? Devolva o conjunto do que apareceu de errado — conjunto, e não lista, porque
a mesma letra errada dez vezes é um problema só.

### clínica
Confira a planilha: alguma espécie foi digitada fora da lista aceita pelo
sistema? Devolva o conjunto do que apareceu de errado — conjunto, e não lista,
porque o mesmo erro de digitação dez vezes é um problema só.

### campo
Confira a lista do transecto: apareceu alguma espécie fora da lista de
referência da região? Devolva o conjunto do que apareceu de fora — conjunto, e
não lista, porque o mesmo registro estranho dez vezes é um caso só.

### laboratório
Confira as leituras: apareceu algum resultado fora dos valores que o protocolo
aceita? Devolva o conjunto do que apareceu de errado — conjunto, e não lista,
porque o mesmo valor inválido dez vezes é um problema só.
