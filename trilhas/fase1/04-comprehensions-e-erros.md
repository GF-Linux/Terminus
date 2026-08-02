# Comprehensions e tratamento de erros
semana: 4
entrega: uma função que valida a entrada e avisa em vez de quebrar

Comprehension é o jeito curto de transformar uma lista inteira. E `try/except` é
o que impede o seu programa de morrer quando alguém abre um arquivo torto — que
é o que acontece com dado de verdade, sempre.

## conceitos
- list comprehension `[x for x in itens]`
- comprehension com filtro `[x for x in itens if ...]`
- `try` / `except` / `finally`
- `raise` e tipos de exceção (`ValueError`…)

## recursos
- Real Python — When to Use a List Comprehension :: https://realpython.com/list-comprehension-python/
- Real Python — Python Exceptions: An Introduction :: https://realpython.com/python-exceptions/
- Docs oficiais — tutorial, "Erros e exceções" :: https://docs.python.org/pt-br/3/tutorial/errors.html

## exercício padroniza
função: padroniza(texto)
o que faz: devolve uma lista com os caracteres em maiúsculas, sem espaços, usando uma comprehension

### sequências
Sequência copiada de e-mail vem torta: `"acgt "` com minúscula e espaço no fim.
Devolva `['A','C','G','T']`. Numa comprehension só — é para praticar a forma
curta, não o `for` de três linhas.

### clínica
Código digitado na recepção vem torto: `"ab c "` com minúscula e espaço.
Devolva `['A','B','C']`. Numa comprehension só — é para praticar a forma curta,
não o `for` de três linhas.

### campo
Código de anilha vem torto do caderno de campo: `"xy z"` com minúscula e espaço.
Devolva `['X','Y','Z']`. Numa comprehension só — é para praticar a forma curta,
não o `for` de três linhas.

### laboratório
Rótulo de poço vem torto do equipamento: `"a1 b2 "`. Devolva a lista dos
caracteres em maiúsculas, sem espaços. Numa comprehension só — é para praticar a
forma curta, não o `for` de três linhas.

## exercício so_de
função: so_de(itens, alvos)
o que faz: devolve uma lista nova só com os itens que estão em `alvos`, com comprehension e filtro

### sequências
Filtre da sequência só as bases G e C — é o mesmo filtro que existe dentro do
cálculo de GC, agora isolado. Uma comprehension com `if`, e a lista original
intacta.

### clínica
Filtre da fila só os atendimentos das espécies que interessam ao relatório. Uma
comprehension com `if`, e a lista original intacta.

### campo
Filtre do transecto só as espécies da lista de interesse. Uma comprehension com
`if`, e a lista original intacta.

### laboratório
Filtre das lâminas só os resultados que entram na estatística. Uma comprehension
com `if`, e a lista original intacta.

## exercício valida
função: valida(itens, permitidos)
o que faz: devolve True se está tudo certo; se houver item fora de `permitidos`, faz `raise ValueError` com uma mensagem que diz qual é

### sequências
Antes de rodar qualquer análise, valide: se aparecer letra fora de ACGT, levante
`ValueError` dizendo qual apareceu. Deixar passar aqui é pior que quebrar aqui —
o resultado errado só aparece três passos adiante, sem aviso.

### clínica
Antes de salvar a ficha, valide: se aparecer espécie fora da lista aceita,
levante `ValueError` dizendo qual. Deixar passar aqui é pior que quebrar aqui —
o erro só aparece no relatório do fim do mês, sem aviso.

### campo
Antes de fechar a planilha do transecto, valide: espécie fora da lista de
referência levanta `ValueError` dizendo qual. Deixar passar aqui é pior que
quebrar aqui — o erro só aparece na análise, meses depois.

### laboratório
Antes de calcular, valide: resultado fora dos valores do protocolo levanta
`ValueError` dizendo qual. Deixar passar aqui é pior que quebrar aqui — a média
sai errada e ninguém percebe.
