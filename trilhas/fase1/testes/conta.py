"""Verificador de conta(itens, alvo) — Tópico 1."""

FUNCAO = "conta"
ELOGIO = "O laço é o músculo; .count() é o elevador. Você subiu de escada."


def verificar(mod):
    casos = [
        ((["A", "C", "A", "T", "A"], "A"), 3),
        ((["canino", "felino", "canino"], "felino"), 1),
        ((["x", "y"], "z"), 0),
        (([], "A"), 0),
    ]
    for (itens, alvo), esperado in casos:
        obtido = mod.conta(list(itens), alvo)
        assert obtido == esperado, (
            f"conta({itens!r}, {alvo!r}) devolveu {obtido!r}; esperado {esperado!r}"
        )
