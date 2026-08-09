# -*- coding: utf-8 -*-
"""Casos do comparativo. Código de bancada de verdade, não exemplo de tutorial."""
import json

C = "⟦⟧"  # onde o cursor está

casos = []


def caso(id_, descricao, arquivo, texto, vizinhos=None):
    casos.append(
        {
            "id": id_,
            "descricao": descricao,
            "arquivo": arquivo,
            "texto": texto,
            "vizinhos": vizinhos or [],
        }
    )


caso(
    "1-corpo-de-def",
    "corpo vazio depois de def + docstring (o caso mais comum)",
    "analise.py",
    f'''from Bio import SeqIO


def media_phred(caminho):
    """Devolve a media de Phred de um .ab1."""
    {C}
''',
)

caso(
    "2-meio-de-linha",
    "cursor no meio de uma chamada, com ')' depois dele",
    "analise.py",
    f'''from Bio import SeqIO
from Bio.SeqUtils import gc_fraction

registro = SeqIO.read("amostra28_F_BTF2.ab1", "abi")
gc = gc_fraction({C})
print(f"GC: {{gc:.1%}}")
''',
)

caso(
    "3-comentario-guia",
    "comentario descrevendo o que fazer, linha seguinte vazia",
    "analise.py",
    f'''from Bio import SeqIO

registro = SeqIO.read("amostra28_F_BTF2.ab1", "abi")

# cortar as pontas ate a primeira base com Phred >= 20 dos dois lados
{C}
''',
)

caso(
    "4-vizinho-define",
    "usa funcao definida em OUTRO arquivo aberto (utilitarios.py)",
    "analise.py",
    f'''from utilitarios import ler_ab1, cortar_por_qualidade

registro = ler_ab1("amostra28_F_BTF2.ab1")
aparado = {C}
''',
    vizinhos=["utilitarios.py"],
)

caso(
    "5-padrao-repetido",
    "dicionario de primers pela metade (onde o Copilot brilha)",
    "analise.py",
    f'''PRIMERS = {{
    "27F": "AGAGTTTGATCMTGGCTCAG",
    "1492R": "TACGGYTACCTTGTTACGACTT",
    "BTF2": {C}
}}
''',
)

caso(
    "6-texto-depois-do-cursor",
    "cursor no meio da linha com codigo depois dele, na mesma linha",
    "analise.py",
    f'''import csv

linhas = []
for nome, gc in resultados:
    linhas.{C}(nome)
''',
)

caso(
    "7-dentro-de-for",
    "corpo de for, dentro de bloco indentado",
    "analise.py",
    f'''from pathlib import Path
from utilitarios import ler_ab1, qualidade_media

for arquivo in Path("corrida").glob("*.ab1"):
    registro = ler_ab1(arquivo)
    {C}
''',
    vizinhos=["utilitarios.py"],
)

caso(
    "8-fim-de-arquivo",
    "cursor no fim do arquivo, logo depois de um print( ) fechado",
    "analise.py",
    f'''from utilitarios import ler_ab1, conteudo_gc

registro = ler_ab1("amostra28_F_BTF2.ab1")
print(conteudo_gc(registro)){C}''',
    vizinhos=["utilitarios.py"],
)

caso(
    "9-arquivo-longo",
    "definicao relevante 60 linhas acima do cursor",
    "analise.py",
    "from Bio import SeqIO\n\n\ndef ler(caminho):\n    return SeqIO.read(caminho, \"abi\")\n\n\n"
    + "\n".join(f"CONSTANTE_{i} = {i}" for i in range(60))
    + f'''


def relatorio(pasta):
    """Tabela com nome, tamanho e Phred medio de cada .ab1 da pasta."""
    {C}
''',
)

caso(
    "10-classe-metodo",
    "metodo novo dentro de uma classe ja escrita",
    "analise.py",
    f'''class Corrida:
    def __init__(self, pasta):
        self.pasta = pasta
        self.arquivos = sorted(pasta.glob("*.ab1"))

    def quantidade(self):
        return len(self.arquivos)

    def {C}
''',
)

print(json.dumps(casos, ensure_ascii=False, indent=1))
