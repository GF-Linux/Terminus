"""Verificador de fora_da_lista(itens, permitidos) — Tópico 2."""

FUNCAO = "fora_da_lista"
ELOGIO = "Conjunto, e não lista: o mesmo erro dez vezes continua sendo um erro."


def verificar(mod):
    obtido = mod.fora_da_lista(["A", "C", "X", "G", "X", "Z"], {"A", "C", "G", "T"})
    assert isinstance(obtido, set), (
        f"devolveu {type(obtido).__name__}; o enunciado pede um conjunto (set). "
        "Um set não repete o que já viu — é isso que o exercício está treinando."
    )
    assert obtido == {"X", "Z"}, f"devolveu {obtido!r}; esperado {{'X', 'Z'}}"

    limpo = mod.fora_da_lista(["A", "C"], {"A", "C", "G", "T"})
    assert limpo == set(), f"sem nada de errado, devolveu {limpo!r}; esperado set()"
