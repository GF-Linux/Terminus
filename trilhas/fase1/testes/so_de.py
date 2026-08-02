"""Verificador de so_de(itens, alvos) — Tópico 4."""

FUNCAO = "so_de"
ELOGIO = "Filtrar sem mexer no original é o hábito que evita bug de madrugada."


def verificar(mod):
    entrada = ["G", "A", "C", "T", "G"]
    guarda = list(entrada)

    obtido = mod.so_de(entrada, {"G", "C"})
    assert obtido == ["G", "C", "G"], (
        f"so_de({guarda!r}, {{'G','C'}}) devolveu {obtido!r}; esperado ['G', 'C', 'G'] "
        "(na ordem em que apareceram)"
    )
    assert entrada == guarda, "a lista que entrou foi alterada — devolva uma nova"
    assert mod.so_de([], {"G"}) == [], "so_de([], …) deve devolver []"
    assert mod.so_de(["A"], {"G"}) == [], "sem nenhum item do alvo, devolva lista vazia"
