"""Verificador de ler_registros(caminho) — projeto final, Tópico 6.

Um verificador só para as quatro vestimentas: o formato é o mesmo (cabeçalho com
`>` e linhas embaixo), o que muda é o que os registros significam.
"""

import os
import tempfile

FUNCAO = "ler_registros"
ELOGIO = "Isto é um parser. É a mesma lógica que existe dentro do dna-contingency."


def verificar(mod):
    pasta = tempfile.mkdtemp()
    caminho = os.path.join(pasta, "registros.txt")
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(
            ">BR-000001 primeiro registro\n"
            "ACGTACGT\n"
            "ACGT\n"
            "\n"
            ">BR-000002 segundo registro\n"
            "TTGG\n"
        )

    esperado = {
        "BR-000001 primeiro registro": "ACGTACGTACGT",
        "BR-000002 segundo registro": "TTGG",
    }

    try:
        obtido = mod.ler_registros(caminho)
        assert isinstance(obtido, dict), (
            f"devolveu {type(obtido).__name__}; o enunciado pede um dicionário"
        )
        assert set(obtido) == set(esperado), (
            f"os nomes dos registros saíram como {sorted(obtido)}; esperado {sorted(esperado)}. "
            "O nome é o que vem depois do '>', sem o '>' e sem espaços nas pontas."
        )
        for nome, conteudo in esperado.items():
            assert obtido[nome] == conteudo, (
                f"o registro {nome!r} veio como {obtido[nome]!r}; esperado {conteudo!r} — "
                "as linhas do registro emendadas numa string só"
            )
    finally:
        os.remove(caminho)

    vazio = os.path.join(pasta, "vazio.txt")
    open(vazio, "w").close()
    try:
        assert mod.ler_registros(vazio) == {}, "um arquivo vazio deve devolver {}"
    finally:
        os.remove(vazio)
