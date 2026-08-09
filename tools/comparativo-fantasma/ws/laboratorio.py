"""Parametros de corte do LHV/UFRRJ, acordados na bancada em julho de 2026."""

PHRED_MINIMO_LHV = 17
MARGEM_BASES_LHV = 8


def aparar_pontas(registro, corte_phred, margem_bases):
    """Apara as duas pontas do registro.

    `corte_phred` e a nota minima aceita; `margem_bases` e quantas bases extras
    sao descartadas depois do corte, porque a primeira base boa costuma vir
    acompanhada de vizinhas ruins.
    """
    notas = registro.letter_annotations["phred_quality"]
    inicio = next(i for i, q in enumerate(notas) if q >= corte_phred) + margem_bases
    fim = len(notas) - next(i for i, q in enumerate(reversed(notas)) if q >= corte_phred) - margem_bases
    return registro[inicio:fim]
