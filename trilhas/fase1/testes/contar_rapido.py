"""Verificador de contar_rapido(itens) — Tópico 5."""

FUNCAO = "contar_rapido"
ELOGIO = "A biblioteca padrão já tinha isso pronto — saber o que existe é metade do trabalho."


def verificar(mod):
    obtido = mod.contar_rapido(["A", "C", "A", "T", "A"])
    assert isinstance(obtido, dict), (
        f"devolveu {type(obtido).__name__}. Counter é quase um dict, mas o enunciado "
        "pede um dicionário de verdade: dict(Counter(itens))."
    )
    assert type(obtido) is dict, (
        "devolveu um Counter. Converta com dict(...) — o enunciado pede um dicionário comum."
    )
    assert obtido == {"A": 3, "C": 1, "T": 1}, (
        f"devolveu {obtido!r}; esperado {{'A': 3, 'C': 1, 'T': 1}}"
    )
    assert mod.contar_rapido([]) == {}, "com lista vazia, devolva {}"
