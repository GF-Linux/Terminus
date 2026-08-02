"""Verificador de troca(itens, mapa) — Tópico 3."""

FUNCAO = "troca"
ELOGIO = "O que não estava no mapa sobreviveu — é isso que separa trocar de estragar."


def verificar(mod):
    mapa = {"A": "T", "T": "A", "C": "G", "G": "C"}
    entrada = ["A", "C", "G", "T"]
    guarda = list(entrada)

    obtido = mod.troca(entrada, mapa)
    assert obtido == ["T", "G", "C", "A"], (
        f"troca({guarda!r}, mapa) devolveu {obtido!r}; esperado ['T', 'G', 'C', 'A']"
    )
    assert entrada == guarda, "a lista que entrou foi alterada — devolva uma nova"

    # O que não está no mapa fica como está. Virar None é o erro clássico do
    # dicionário acessado com .get() sem valor padrão.
    com_estranho = mod.troca(["A", "N"], mapa)
    assert com_estranho == ["T", "N"], (
        f"troca(['A', 'N'], mapa) devolveu {com_estranho!r}; esperado ['T', 'N'] — "
        "o que não está no mapa tem de sobreviver intacto"
    )
