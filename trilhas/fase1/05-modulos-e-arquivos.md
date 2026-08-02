# Módulos, imports e ler/escrever arquivos
semana: 5
entrega: abrir e ler um arquivo de verdade

A biblioteca padrão vem com pilhas incluídas, e ler arquivo é o que separa um
programa que roda com dado colado de um que abre o arquivo que veio do
equipamento.

## conceitos
- `import` e `from … import`
- módulos úteis: `os`, `collections`, `statistics`
- `with open(arquivo) as f`
- ler: `.read()`, `.readlines()`, `for linha in f`
- escrever `'w'` × acrescentar `'a'`, e `.strip()`

## recursos
- Curso em Vídeo — Python Mundo 3, arquivos e módulos :: https://www.cursoemvideo.com/curso/python-3-mundo-3/
- Automatize tarefas maçantes — livre, do próprio autor :: https://automatetheboringstuff.com/
- Docs oficiais — tutorial, "Entrada e saída" :: https://docs.python.org/pt-br/3/tutorial/inputoutput.html

## exercício ler_limpo
função: ler_limpo(caminho)
o que faz: abre o arquivo, devolve o conteúdo como texto sem espaços nem quebras de linha nas pontas

### sequências
Abra um arquivo com uma sequência dentro e devolva o texto limpo. A quebra de
linha do fim do arquivo é invisível na tela e estraga qualquer comparação
depois — `.strip()` existe por isso. Use `with open(...)`, que fecha o arquivo
mesmo se der erro no meio.

### clínica
Abra um arquivo com uma anotação da ficha e devolva o texto limpo. A quebra de
linha do fim é invisível na tela e estraga qualquer comparação depois —
`.strip()` existe por isso. Use `with open(...)`, que fecha o arquivo mesmo se
der erro no meio.

### campo
Abra o arquivo da anotação de campo e devolva o texto limpo. A quebra de linha
do fim é invisível e estraga qualquer comparação depois — `.strip()` existe por
isso. Use `with open(...)`, que fecha o arquivo mesmo se der erro no meio.

### laboratório
Abra o arquivo com o rótulo da corrida e devolva o texto limpo. A quebra de
linha do fim é invisível e estraga qualquer comparação depois — `.strip()`
existe por isso. Use `with open(...)`, que fecha o arquivo mesmo se der erro no
meio.

## exercício contar_rapido
função: contar_rapido(itens)
o que faz: devolve um dicionário com a contagem de cada item, usando `Counter` de `collections`

### sequências
Refaça o contador do Tópico 2 em uma linha, com `from collections import
Counter`. Compare com o seu: o resultado é o mesmo, e a biblioteca padrão já
tinha isso pronto. Devolva um `dict` de verdade — `dict(Counter(itens))`.

### clínica
Refaça o contador de espécies do Tópico 2 em uma linha, com `Counter`. Compare
com o seu: o resultado é o mesmo, e a biblioteca padrão já tinha isso pronto.
Devolva um `dict` de verdade — `dict(Counter(itens))`.

### campo
Refaça a contagem do transecto em uma linha, com `Counter`. Compare com a sua: o
resultado é o mesmo, e a biblioteca padrão já tinha isso pronto. Devolva um
`dict` de verdade — `dict(Counter(itens))`.

### laboratório
Refaça a contagem de resultados em uma linha, com `Counter`. Compare com a sua:
o resultado é o mesmo, e a biblioteca padrão já tinha isso pronto. Devolva um
`dict` de verdade — `dict(Counter(itens))`.

## exercício juntar
função: juntar(caminho)
o que faz: lê o arquivo e devolve uma string com todas as linhas emendadas, ignorando as vazias

### sequências
Sequência em arquivo vem quebrada em várias linhas de 60 ou 70 caracteres — é o
padrão do formato. Junte tudo numa string só, pulando linha vazia. Este
exercício é meio caminho do parser de FASTA da semana que vem.

### clínica
Anotação de ficha vem quebrada em várias linhas, com linha em branco entre
parágrafos. Junte tudo numa string só, pulando as vazias. Este exercício é meio
caminho do leitor de fichas da semana que vem.

### campo
Caderno de campo vem quebrado em várias linhas, com linha em branco entre
trechos. Junte tudo numa string só, pulando as vazias. Este exercício é meio
caminho do leitor de planilha da semana que vem.

### laboratório
Saída do equipamento vem quebrada em várias linhas, com linha em branco entre
blocos. Junte tudo numa string só, pulando as vazias. Este exercício é meio
caminho do leitor de placa da semana que vem.
