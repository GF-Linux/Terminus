"""Verificador de padroniza(texto) — Tópico 4."""

FUNCAO = "padroniza"
ELOGIO = "Uma linha faz o que três faziam, e continua legível."


def verificar(mod):
    casos = [("acgt ", ["A", "C", "G", "T"]), (" a b ", ["A", "B"]), ("", [])]
    for entrada, esperado in casos:
        obtido = mod.padroniza(entrada)
        assert isinstance(obtido, list), (
            f"padroniza({entrada!r}) devolveu {type(obtido).__name__}; o enunciado pede uma lista"
        )
        assert obtido == esperado, (
            f"padroniza({entrada!r}) devolveu {obtido!r}; esperado {esperado!r}"
        )
