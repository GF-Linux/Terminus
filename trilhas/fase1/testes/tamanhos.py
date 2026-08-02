"""Verificador de tamanhos(registros) — Tópico 2."""

FUNCAO = "tamanhos"
ELOGIO = "Percorrer com .items() é como se lê um dicionário inteiro sem pedir licença."


def verificar(mod):
    entrada = {"BR-01": ["A", "C", "G"], "BR-02": ["T"], "BR-03": []}
    guarda = {k: list(v) for k, v in entrada.items()}
    obtido = mod.tamanhos(entrada)
    esperado = {"BR-01": 3, "BR-02": 1, "BR-03": 0}

    assert isinstance(obtido, dict), (
        f"tamanhos() devolveu {type(obtido).__name__}; o enunciado pede um dicionário"
    )
    assert obtido == esperado, f"tamanhos({guarda!r}) devolveu {obtido!r}; esperado {esperado!r}"
    assert entrada == guarda, "o dicionário que entrou foi alterado — devolva um novo"
    assert mod.tamanhos({}) == {}, "tamanhos({}) deve devolver {}"
