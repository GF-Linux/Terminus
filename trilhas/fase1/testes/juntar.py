"""Verificador de juntar(caminho) — Tópico 5."""

import os
import tempfile

FUNCAO = "juntar"
ELOGIO = "Metade do parser da semana que vem já está escrita."


def verificar(mod):
    caminho = os.path.join(tempfile.mkdtemp(), "quebrado.txt")
    with open(caminho, "w", encoding="utf-8") as f:
        f.write("ACGTACGT\n\nTTGGCCAA\n   \nGGGG\n")

    try:
        obtido = mod.juntar(caminho)
        assert obtido == "ACGTACGTTTGGCCAAGGGG", (
            f"devolveu {obtido!r}; esperado 'ACGTACGTTTGGCCAAGGGG' — "
            "as linhas emendadas, sem as vazias e sem as quebras"
        )
    finally:
        os.remove(caminho)
