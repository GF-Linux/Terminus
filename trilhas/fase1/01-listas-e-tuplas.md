# Listas e tuplas
semana: 1
entrega: os três exercícios do tópico rodando

Lista é a primeira estrutura que guarda várias coisas em ordem — e quase todo
dado de bancada chega em ordem: a fila de amostras, as leituras do dia, as
letras de uma sequência. Tupla é a prima que não muda depois de criada, boa para
o que não deveria mudar mesmo.

## conceitos
- criar `[]` e indexar `itens[0]`, `itens[-1]`
- fatiar `itens[1:3]`
- percorrer com `for` e contar
- `len()`, `.append()`, `.count()`
- tupla `( )`: por que existe algo que não se altera

## recursos
- Curso em Vídeo — Python Mundo 3, aulas de listas e tuplas :: https://www.cursoemvideo.com/curso/python-3-mundo-3/
- Docs oficiais — tutorial, "Estruturas de dados" :: https://docs.python.org/pt-br/3/tutorial/datastructures.html
- pythontutor.com — cole a lista e veja o índice andando :: https://pythontutor.com/

## exercício descreve
função: descreve(itens)
o que faz: devolve uma tupla com (quantidade de itens, o terceiro item)

### neutro
Dada uma lista qualquer, devolva quantos itens ela tem e qual é o terceiro.
Índice começa em zero — o terceiro item não é `itens[3]`.

### sequências
Você recebeu a leitura de uma fita como lista de bases:
`['A','C','G','T','A','A','C']`. Escreva `descreve(itens)` que devolva quantas
bases existem e qual é a terceira. Índice começa em zero — a terceira base não
é `itens[3]`.

### clínica
A recepção passou a fila de atendimentos do dia como lista de espécies:
`['canino','felino','equino','canino']`. Escreva `descreve(itens)` que devolva
quantos atendimentos houve e qual foi o terceiro. Índice começa em zero — o
terceiro atendimento não é `itens[3]`.

### campo
O transecto rendeu uma lista de indivíduos avistados, na ordem em que
apareceram. Escreva `descreve(itens)` que devolva quantos foram avistados e
qual foi o terceiro. Índice começa em zero — o terceiro avistamento não é
`itens[3]`.

### laboratório
A leitura da câmara de Neubauer saiu como lista de contagens por quadrante.
Escreva `descreve(itens)` que devolva quantos quadrantes foram lidos e qual foi
o terceiro valor. Índice começa em zero — o terceiro quadrante não é `itens[3]`.

## exercício conta
função: conta(itens, alvo)
o que faz: devolve quantas vezes `alvo` aparece em `itens`, usando `for` e um contador

### neutro
Conte quantas vezes um valor aparece na lista — sem usar `.count()`, que é o
atalho. O objetivo aqui é o laço: percorra, compare, some.

### sequências
Conte quantas vezes uma base aparece na fita — sem usar `.count()`, que é o
atalho. Aqui o objetivo é o laço: percorra a lista, compare, some.

### clínica
Conte quantos atendimentos foram de uma espécie — sem usar `.count()`. Aqui o
objetivo é o laço: percorra a lista, compare, some.

### campo
Conte quantas vezes uma espécie apareceu no transecto — sem usar `.count()`.
Aqui o objetivo é o laço: percorra a lista, compare, some.

### laboratório
Conte quantos quadrantes deram exatamente um certo valor — sem usar `.count()`.
Aqui o objetivo é o laço: percorra a lista, compare, some.

## exercício inverte
função: inverte(itens)
o que faz: devolve uma nova lista com os itens na ordem contrária, sem alterar a original

### neutro
Devolva uma lista nova com os itens na ordem contrária. A original tem de
continuar como estava — função que altera o que recebeu é armadilha.

### sequências
O reverso de uma fita é o primeiro passo do complemento reverso, que você vai
usar de verdade mais adiante: de `['A','C','G','T']` para `['T','G','C','A']`.
A lista original tem de continuar como estava — quem recebe um dado bruto não
espera que ele mude na sua mão.

### clínica
Inverta a ordem da fila de atendimentos para ler do último para o primeiro. A
lista original tem de continuar como estava — quem recebe um dado bruto não
espera que ele mude na sua mão.

### campo
Inverta a ordem dos avistamentos para refazer o transecto de trás para frente.
A lista original tem de continuar como estava — quem recebe um dado bruto não
espera que ele mude na sua mão.

### laboratório
Inverta a ordem das leituras dos quadrantes. A lista original tem de continuar
como estava — quem recebe um dado bruto não espera que ele mude na sua mão.
