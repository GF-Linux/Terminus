"""Verificador de inverte(itens) — Tópico 1.

Testa também que a lista original não foi alterada: função que estraga o que
recebeu é defeito silencioso, e é cedo para aprender isso errado.
"""

FUNCAO = "inverte"
ELOGIO = "E a lista original ficou intacta — isso é o que separa função de armadilha."


def verificar(mod):
    original = ["A", "C", "G", "T"]
    guarda = list(original)
    obtido = mod.inverte(original)

    assert obtido == ["T", "G", "C", "A"], (
        f"inverte({guarda!r}) devolveu {obtido!r}; esperado ['T', 'G', 'C', 'A']"
    )
    assert original == guarda, (
        f"a lista que entrou foi alterada: virou {original!r}. "
        "Devolva uma lista nova em vez de mexer na que você recebeu."
    )
    assert mod.inverte([]) == [], "inverte([]) deve devolver uma lista vazia"
    assert mod.inverte([1]) == [1], "inverte([1]) deve devolver [1]"
