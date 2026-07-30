#!/usr/bin/env python3
"""Lê um `.ab1` e devolve JSON para o cromatograma da Bancada.

Este é o processo auxiliar que a ADR 0003 chamou de **coração** da IDE: a casca
é TypeScript, mas quem entende de dado biológico é o Python do laboratório, com
o Biopython que já está instalado.

Roda como subprocesso, escreve JSON no stdout e erro legível no stderr. Não
importa nada da Bancada e não sabe que ela existe — dá para chamar na mão:

    python3 tools/ler_ab1.py amostra.ab1 | jq .resumo

Sobre reamostragem: um `.ab1` tem tipicamente 10 a 15 mil pontos por canal, e
mandar 4 canais inteiros para a interface a cada abertura são centenas de
milhares de números. O `--max-pontos` reduz por **máximo por balde**, nunca por
média: média achata pico, e pico é exatamente o que se foi olhar. Por padrão não
reduz nada — quem pede redução é quem desenha.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BASES = ("A", "C", "G", "T")


def erro(mensagem: str) -> None:
    print(mensagem, file=sys.stderr)
    raise SystemExit(1)


def reamostrar(valores: list[int], maximo: int) -> tuple[list[int], int]:
    """Reduz mantendo o máximo de cada balde. Devolve (série, fator)."""
    if maximo <= 0 or len(valores) <= maximo:
        return valores, 1
    fator = (len(valores) + maximo - 1) // maximo
    return [max(valores[i : i + fator]) for i in range(0, len(valores), fator)], fator


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("arquivo", type=Path)
    p.add_argument("--max-pontos", type=int, default=0, help="0 = não reduzir")
    args = p.parse_args()

    if not args.arquivo.exists():
        erro(f"Arquivo não encontrado: {args.arquivo}")

    try:
        from Bio import SeqIO
    except ImportError:
        erro(
            "Biopython não está instalado neste interpretador. "
            "A Bancada usa o Python do laboratório; veja src/main/ambiente.ts."
        )

    try:
        registro = SeqIO.read(str(args.arquivo), "abi")
    except Exception as e:  # noqa: BLE001 — o motivo real é o que interessa mostrar
        erro(f"Não consegui ler como .ab1: {type(e).__name__}: {e}")

    bruto = registro.annotations.get("abif_raw", {})

    # FWO_ diz qual DATA é qual base. Sem ele não dá para saber, e adivinhar
    # "GATC" produziria um cromatograma bonito e errado — o pior desfecho.
    ordem_bruta = bruto.get("FWO_1")
    if not ordem_bruta:
        erro("O arquivo não tem a marca FWO_1, que diz a ordem dos canais.")
    ordem = ordem_bruta.decode() if isinstance(ordem_bruta, bytes) else str(ordem_bruta)
    if sorted(ordem) != ["A", "C", "G", "T"]:
        erro(f"Ordem de canais inesperada em FWO_1: {ordem!r}")

    faltando = [f"DATA{9 + i}" for i in range(4) if f"DATA{9 + i}" not in bruto]
    if faltando:
        erro(f"O arquivo não tem os canais processados: {', '.join(faltando)}")

    tracos_brutos = {base: list(bruto[f"DATA{9 + i}"]) for i, base in enumerate(ordem)}
    picos = list(bruto.get("PLOC2") or bruto.get("PLOC1") or [])
    sequencia = str(registro.seq)
    qualidade = list(registro.letter_annotations.get("phred_quality", []))

    n_amostras = len(next(iter(tracos_brutos.values())))
    tracos = {}
    fator = 1
    for base in BASES:
        serie, fator = reamostrar(tracos_brutos[base], args.max_pontos)
        tracos[base] = serie

    # Com redução, a posição de cada pico tem de ser reescalada junto, senão as
    # letras deslizam para longe dos picos que rotulam.
    picos_saida = [p // fator for p in picos] if fator > 1 else picos

    amostra = bruto.get("SMPL1", b"")
    if isinstance(amostra, bytes):
        amostra = amostra.decode("latin-1", "replace").strip()

    saida = {
        "arquivo": str(args.arquivo),
        "amostra": amostra or registro.id,
        "ordem_canais": ordem,
        "sequencia": sequencia,
        "qualidade": qualidade,
        "picos": picos_saida,
        "tracos": tracos,
        "n_amostras": n_amostras,
        "fator_reducao": fator,
        "resumo": {
            "bases": len(sequencia),
            "phred_medio": round(sum(qualidade) / len(qualidade), 1) if qualidade else None,
            "phred_min": min(qualidade) if qualidade else None,
            "phred_max": max(qualidade) if qualidade else None,
            "bases_boas": sum(1 for q in qualidade if q >= 20),
            "ambiguas": sum(1 for b in sequencia.upper() if b not in "ACGT"),
        },
    }

    # `separators` sem espaço: são centenas de milhares de números, e cada
    # espaço a mais é um byte a mais atravessando o cano.
    json.dump(saida, sys.stdout, separators=(",", ":"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
