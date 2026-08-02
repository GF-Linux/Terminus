"""Verificador de ler_limpo(caminho) — Tópico 5.

O arquivo de teste é criado aqui, e apagado no fim: exercício de leitura não
pode depender de o aluno ter criado um arquivo com o nome certo antes.
"""

import os
import tempfile

FUNCAO = "ler_limpo"
ELOGIO = "A quebra de linha invisível no fim do arquivo já estragou muita comparação."


def verificar(mod):
    caminho = os.path.join(tempfile.mkdtemp(), "amostra.txt")
    with open(caminho, "w", encoding="utf-8") as f:
        f.write("  ACGTACGT  \n")

    try:
        obtido = mod.ler_limpo(caminho)
        assert obtido == "ACGTACGT", (
            f"o arquivo tinha '  ACGTACGT  \\n' e a função devolveu {obtido!r}; "
            "esperado 'ACGTACGT' — sem espaços e sem a quebra de linha"
        )
    finally:
        os.remove(caminho)
