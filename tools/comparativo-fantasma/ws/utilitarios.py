"""Funções de apoio do laboratório (LHV/UFRRJ).

Escritas para as corridas de Sanger: leitura de .ab1, corte por qualidade e
conferência de primers.
"""

from Bio import SeqIO
from Bio.SeqUtils import gc_fraction

TRIM_PADRAO = 4
PRIMERS_16S = {
    "27F": "AGAGTTTGATCMTGGCTCAG",
    "1492R": "TACGGYTACCTTGTTACGACTT",
}


def ler_ab1(caminho):
    """Devolve o registro Biopython de um arquivo .ab1."""
    return SeqIO.read(caminho, "abi")


def qualidade_media(registro):
    """Média de Phred do registro inteiro."""
    notas = registro.letter_annotations["phred_quality"]
    return sum(notas) / len(notas)


def cortar_por_qualidade(registro, minimo=20):
    """Corta as pontas até a primeira base com Phred >= minimo dos dois lados."""
    notas = registro.letter_annotations["phred_quality"]
    inicio = next(i for i, q in enumerate(notas) if q >= minimo)
    fim = len(notas) - next(i for i, q in enumerate(reversed(notas)) if q >= minimo)
    return registro[inicio:fim]


def conteudo_gc(registro):
    """Fração de GC (0-1, não porcentagem — a Bio.SeqUtils.GC foi removida)."""
    return gc_fraction(registro.seq)
