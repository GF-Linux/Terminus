#!/usr/bin/env python3
"""Roda o verificador de um exercício da trilha contra o arquivo do aluno.

    python3 trilhas/verificar.py <teste.py> <arquivo_do_aluno.py>

Sai com 0 quando passa e 1 quando não passa, e escreve em linguagem de gente —
esta saída aparece no terminal da Bancada, para quem está aprendendo ler.

## Por que testar comportamento e não texto

O verificador **importa a função do aluno e chama** com entradas conhecidas.
Nunca lê o código dele procurando palavra-chave. Duas razões: a primeira é que
existem muitos jeitos certos de escrever a mesma função, e corretor que exige um
jeito ensina a adivinhar o gabarito em vez de resolver o problema; a segunda é
que o mesmo verificador serve para todas as vestimentas do enunciado — o
contrato é o mesmo, a roupa é que muda.
"""

from __future__ import annotations

import importlib.util
import sys
import traceback
from pathlib import Path

VERDE = "\033[32m"
VERMELHO = "\033[31m"
CINZA = "\033[90m"
FIM = "\033[0m"


def carregar(caminho: Path, nome: str):
    """Importa o arquivo do aluno como módulo, sem exigir que ele seja pacote."""
    spec = importlib.util.spec_from_file_location(nome, caminho)
    if spec is None or spec.loader is None:
        raise SystemExit(f"não consegui abrir {caminho}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)

    teste = Path(sys.argv[1])
    aluno = Path(sys.argv[2])

    if not aluno.exists():
        print(f"{VERMELHO}O arquivo {aluno.name} ainda não existe.{FIM}")
        return 1

    verificador = carregar(teste, "verificador")
    funcao = getattr(verificador, "FUNCAO", None)

    # O código do aluno roda aqui. Se ele tiver erro de sintaxe ou estourar na
    # importação, isso é o resultado do exercício — não um defeito da Bancada.
    try:
        modulo = carregar(aluno, "exercicio")
    except Exception:
        print(f"{VERMELHO}O seu arquivo não chegou a rodar:{FIM}\n")
        # Na saída padrão, e não na de erro: as duas se misturam fora de ordem no
        # terminal, e o aviso apareceria depois do traceback que ele explica.
        traceback.print_exc(limit=2, file=sys.stdout)
        return 1

    if funcao and not hasattr(modulo, funcao):
        print(f"{VERMELHO}Não achei a função {funcao}() em {aluno.name}.{FIM}")
        print(f"{CINZA}O enunciado pede uma função com esse nome exato — é por ela")
        print(f"que a correção chama o seu código.{FIM}")
        return 1

    try:
        verificador.verificar(modulo)
    except AssertionError as erro:
        print(f"{VERMELHO}Ainda não:{FIM} {erro}")
        return 1
    except Exception:
        print(f"{VERMELHO}A sua função estourou durante o teste:{FIM}\n")
        # Na saída padrão, e não na de erro: as duas se misturam fora de ordem no
        # terminal, e o aviso apareceria depois do traceback que ele explica.
        traceback.print_exc(limit=2, file=sys.stdout)
        return 1

    print(f"{VERDE}Passou.{FIM} {getattr(verificador, 'ELOGIO', '')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
