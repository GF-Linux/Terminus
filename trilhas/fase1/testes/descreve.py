"""Verificador de descreve(itens) — Tópico 1.

O mesmo teste serve para as quatro vestimentas do enunciado: o contrato é o
mesmo, só a roupa muda.
"""

FUNCAO = "descreve"
ELOGIO = "Índice começando em zero é a primeira pedra no caminho de todo mundo."


def verificar(mod):
    casos = [
        (["A", "C", "G", "T", "A", "A", "C"], (7, "G")),
        (["canino", "felino", "equino", "canino"], (4, "equino")),
        ([10, 20, 30], (3, 30)),
    ]
    for entrada, esperado in casos:
        copia = list(entrada)
        obtido = mod.descreve(copia)
        assert isinstance(obtido, tuple), (
            f"descreve({entrada!r}) devolveu {type(obtido).__name__}, e o enunciado pede uma tupla"
        )
        assert obtido == esperado, f"descreve({entrada!r}) devolveu {obtido!r}; esperado {esperado!r}"
