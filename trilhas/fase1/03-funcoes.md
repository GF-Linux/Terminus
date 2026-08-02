# Funções a fundo
semana: 3
entrega: duas funções que devolvem valor, não imprimem

Você já viu `def`. Agora é dominá-lo: função é o bloco reutilizável de que todo
projeto seu vai ser feito, e a diferença entre `return` e `print` é a que mais
custa caro para quem está começando — o que a função `print`a some; o que ela
`return`a você guarda, soma, escreve em arquivo.

## conceitos
- parâmetros e argumentos
- `return` (≠ `print`!)
- escopo local × global
- valores padrão `def f(x, casas=1)`
- docstring

## recursos
- Curso em Vídeo — Python Mundo 3, módulo de funções :: https://www.cursoemvideo.com/curso/python-3-mundo-3/
- Real Python — Defining Your Own Python Function :: https://realpython.com/defining-your-own-python-function/
- pythontutor.com — veja o escopo aparecer e sumir a cada chamada :: https://pythontutor.com/

## exercício proporcao
função: proporcao(itens, alvos)
o que faz: devolve a porcentagem (0 a 100) de itens que estão em `alvos`; lista vazia devolve 0.0

### neutro
Devolva a porcentagem (0 a 100) de itens que estão no conjunto de alvos. Lista
vazia devolve 0.0. Devolva o número — quem quiser imprimir que imprima.

### sequências
Esta é a conta do **conteúdo GC**, que você vai usar de verdade: a porcentagem
de bases que são G ou C. Escreva genérica — recebe a sequência e o conjunto de
bases que contam — e o GC vira `proporcao(seq, {'G','C'})`. Devolva o número;
quem quiser imprimir que imprima.

### clínica
Que porcentagem dos atendimentos do dia foi de uma lista de espécies? Escreva
genérica — recebe a lista e o conjunto que conta — e você responde qualquer
recorte com a mesma função. Devolva o número; quem quiser imprimir que imprima.

### campo
Que porcentagem dos avistamentos foi de espécies da lista de interesse? Escreva
genérica — recebe a lista e o conjunto que conta — e serve para qualquer recorte
do transecto. Devolva o número; quem quiser imprimir que imprima.

### laboratório
Que porcentagem das lâminas deu um dos resultados que interessam? Escreva
genérica — recebe a lista e o conjunto que conta — e a mesma função responde
positividade, inconclusivos, o que for. Devolva o número; quem quiser imprimir
que imprima.

## exercício troca
função: troca(itens, mapa)
o que faz: devolve uma lista nova com cada item trocado pelo valor em `mapa`; o que não estiver no mapa fica como está

### neutro
Devolva uma lista nova com cada item trocado pelo valor no mapa. O que não
estiver no mapa fica como está — não pode virar `None`.

### sequências
Este é o **complemento** da fita: `{'A':'T','T':'A','C':'G','G':'C'}`. Escreva a
função genérica — ela recebe o mapa — e o complemento vira uma chamada. O que
não estiver no mapa (um `N`, por exemplo) tem de sobreviver intacto, não virar
`None`.

### clínica
Padronize a planilha: `{'cão':'canino', 'gato':'felino'}`. Escreva a função
genérica — ela recebe o mapa de troca — e serve para qualquer padronização. O
que não estiver no mapa tem de sobreviver intacto, não virar `None`.

### campo
Troque os apelidos de campo pelos nomes científicos usando um mapa. Escreva a
função genérica — ela recebe o mapa — e serve para qualquer lista. O que não
estiver no mapa tem de sobreviver intacto, não virar `None`.

### laboratório
Troque os códigos do equipamento pelos rótulos legíveis usando um mapa. Escreva
a função genérica — ela recebe o mapa — e serve para qualquer leitura. O que não
estiver no mapa tem de sobreviver intacto, não virar `None`.

## exercício resumo
função: resumo(itens, rotulo="itens")
o que faz: devolve a string "N rotulo", usando o valor padrão quando o rótulo não é passado

### neutro
Devolva a string `"N rotulo"`, com `rotulo` valendo `"itens"` quando não for
passado. A função tem de funcionar chamada dos dois jeitos.

### sequências
Uma linha de resumo para imprimir depois: `resumo(['A','C','G'])` devolve
`"3 itens"`, e `resumo(seq, "bases")` devolve `"3 bases"`. O valor padrão é o
conceito aqui — a função tem de funcionar chamada dos dois jeitos.

### clínica
Uma linha de resumo para o relatório: `resumo(fila)` devolve `"4 itens"`, e
`resumo(fila, "atendimentos")` devolve `"4 atendimentos"`. O valor padrão é o
conceito aqui — a função tem de funcionar chamada dos dois jeitos.

### campo
Uma linha de resumo da saída de campo: `resumo(avistamentos)` devolve
`"7 itens"`, e `resumo(avistamentos, "avistamentos")` devolve `"7 avistamentos"`.
O valor padrão é o conceito aqui — chamada dos dois jeitos, tem de funcionar.

### laboratório
Uma linha de resumo da corrida: `resumo(leituras)` devolve `"8 itens"`, e
`resumo(leituras, "poços")` devolve `"8 poços"`. O valor padrão é o conceito
aqui — chamada dos dois jeitos, tem de funcionar.
