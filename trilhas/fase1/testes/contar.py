"""Verificador de contar(itens) — Tópico 2."""

FUNCAO = "contar"
ELOGIO = ".get(chave, 0) é o que faz o contador aguentar o que você não previu."


def verificar(mod):
    casos = [
        (["A", "C", "A", "T", "A", "C"], {"A": 3, "C": 2, "T": 1}),
        (["canino", "felino", "canino"], {"canino": 2, "felino": 1}),
        ([], {}),
    ]
    for entrada, esperado in casos:
        obtido = mod.contar(list(entrada))
        assert isinstance(obtido, dict), (
            f"contar({entrada!r}) devolveu {type(obtido).__name__}; o enunciado pede um dicionário"
        )
        assert obtido == esperado, f"contar({entrada!r}) devolveu {obtido!r}; esperado {esperado!r}"

    # Um valor que não estava previsto não pode quebrar a contagem.
    obtido = mod.contar(["A", "N", "N"])
    assert obtido == {"A": 1, "N": 2}, (
        f"com um item novo (N) a contagem saiu {obtido!r}; esperado {{'A': 1, 'N': 2}}"
    )
