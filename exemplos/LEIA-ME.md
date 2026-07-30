# Exemplos — dados **sintéticos**

> **Nada aqui é dado real.** Estes arquivos foram fabricados por
> `tools/make_ab1.py` para exercitar o visualizador. Não têm origem biológica,
> não vieram de sequenciador nenhum e não sustentam conclusão de nada.

A regra do projeto é que os **36 `.ab1` reais do LHV não entram em repositório,
mockup nem material que circula** — são dados não publicados. Esta pasta existe
justamente para que essa regra possa ser cumprida sem impedir o desenvolvimento:
sem um `.ab1` de exemplo não haveria como construir nem testar o cromatograma.

Se você chegou aqui procurando dado de verdade para uma análise, **este não é o
lugar** — e se algum arquivo real tiver sido colocado aqui por engano, ele deve
sair do histórico do git, não só da pasta.

## Como regenerar

```bash
python3 tools/make_ab1.py exemplos/sintetico_01.ab1
python3 tools/make_ab1.py exemplos/outro.ab1 --bases 900 --semente 3
python3 tools/make_ab1.py exemplos/curto.ab1 --sequencia ATGCGCGCTTAAGGCATGCAATTTGGCCA
```

O gerador produz um ABIF válido: o Biopython o abre com
`SeqIO.read(..., "abi")` como abriria um arquivo de sequenciador. A sequência é
sorteada, os picos são gaussianas regulares, o Phred sobe no começo e cai no
fim (a forma de uma corrida real) e há vazamento espectral leve entre canais,
para o desenho não ficar limpo demais para servir de teste.

## Como ler sem abrir a Bancada

```bash
~/miniforge3/envs/easycontig-demo/bin/python tools/ler_ab1.py \
    exemplos/sintetico_01.ab1 | jq .resumo
```
