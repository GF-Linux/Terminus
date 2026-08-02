# Consolidação
semana: 6
entrega: o projeto final rodando

Sem conteúdo novo. Uma semana para juntar tudo no projeto e voltar no que ficou
frágil. Se algum tópico não colou, é agora — e o projeto vai mostrar qual foi.

## conceitos
- ler arquivo linha a linha e decidir o que fazer com cada uma
- acumular num dicionário enquanto percorre
- juntar pedaços que pertencem ao mesmo registro
- explicar cada linha em voz alta (o teste do pato de borracha)

## recursos
- pythontutor.com — releia o próprio código passo a passo :: https://pythontutor.com/
- Pense em Python (livre, Allen Downey) :: https://penseallen.github.io/PensePython2e/
- Automatize tarefas maçantes — livre, do próprio autor :: https://automatetheboringstuff.com/

## exercício ler_registros
função: ler_registros(caminho)
o que faz: lê o arquivo e devolve um dicionário {nome do registro: conteúdo emendado numa string}

### neutro
**Projeto final.** O arquivo é texto puro: uma linha de cabeçalho começando com
`>` e uma ou mais linhas de conteúdo embaixo, com vários registros empilhados.

    >primeiro registro
    conteudo em duas
    linhas
    >segundo registro
    outro conteudo

O nome é o que vem depois do `>` (sem o `>`, sem espaços nas pontas). O conteúdo
são as linhas seguintes emendadas numa string só.

### sequências
**Projeto final — leitor de FASTA.** O formato é texto puro: uma linha de
cabeçalho começando com `>` seguida de uma ou mais linhas de sequência, e vários
registros empilhados no mesmo arquivo.

    >BR-000001 Babesia vogeli 18S
    ACGTACGTACGT
    ACGTACGT
    >BR-000002 Hepatozoon canis 18S
    TTGGCCAATTGG

O nome do registro é o que vem depois do `>` (sem o `>`, sem espaços nas
pontas). O conteúdo são as linhas seguintes emendadas numa string só. É a mesma
lógica que existe dentro do dna-contingency.

### clínica
**Projeto final — leitor de fichas.** O formato é texto puro: uma linha de
cabeçalho começando com `>` com o nome do animal, seguida de uma ou mais linhas
de anotação, e várias fichas empilhadas no mesmo arquivo.

    >Rex 4a canino
    vacina V10 aplicada
    retorno em 21 dias
    >Mel 2a felino
    vermifugo aplicado

O nome do registro é o que vem depois do `>` (sem o `>`, sem espaços nas
pontas). O conteúdo são as linhas seguintes emendadas numa string só.

### campo
**Projeto final — leitor de caderno de campo.** O formato é texto puro: uma
linha de cabeçalho começando com `>` com o ponto de coleta, seguida de uma ou
mais linhas de observação, e vários pontos empilhados no mesmo arquivo.

    >ponto 1 mata ciliar
    sabia laranjeira
    bem-te-vi
    >ponto 2 borda
    quero-quero

O nome do registro é o que vem depois do `>` (sem o `>`, sem espaços nas
pontas). O conteúdo são as linhas seguintes emendadas numa string só.

### laboratório
**Projeto final — leitor de corrida.** O formato é texto puro: uma linha de
cabeçalho começando com `>` com o identificador da placa, seguida de uma ou mais
linhas de leitura, e várias placas empilhadas no mesmo arquivo.

    >placa A 450nm
    0.12 0.34 0.55
    0.09 0.41
    >placa B 450nm
    0.77 0.81

O nome do registro é o que vem depois do `>` (sem o `>`, sem espaços nas
pontas). O conteúdo são as linhas seguintes emendadas numa string só.
