#!/usr/bin/env python3
"""Executa os trechos do catálogo para provar que são Biopython válido.

Resolver o símbolo (build_catalog.py) prova que a função existe. Não prova que
o trecho que se oferece ao usuário está certo — um argumento renomeado ou um
método que não existe mais só aparece na execução. É o que este script faz.

Desfechos aceitos:
  ok               — o trecho rodou até o fim
  precisa-contexto — NameError num placeholder declarado (ex. `alinhamento`)
  precisa-arquivo  — FileNotFoundError (o trecho lê arquivo de exemplo)
  pulado-rede      — trecho que faria requisição ao NCBI; nunca é executado

Qualquer outro desfecho é defeito no trecho e faz o script sair com código 1.

Uso:
    python tools/check_snippets.py
"""

from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CATALOG = REPO_ROOT / "data" / "biopython-catalog.json"

# Trechos que fariam requisição de rede. Nunca executados: um script de
# verificação não deve bater no servidor do NCBI.
NETWORK_PATHS = {
    "Bio.Entrez.esearch",
    "Bio.Entrez.efetch",
    "Bio.Entrez.read",
    "Bio.Entrez.esummary",
    "Bio.Blast.qblast",
    "Bio.Blast.NCBIWWW.qblast",
}

# Nomes que os trechos usam de propósito como "aqui entra o seu objeto".
# NameError em um destes é documentação, não defeito.
PLACEHOLDERS = {
    "registros",
    "registro",
    "alinhamento",
    "alinhamentos",
    "arvore",
    "arvores",
    "sequencia",
    "handle",
}


def run_snippet(snippet: str) -> tuple[str, str]:
    """Executa um trecho isolado. Devolve (desfecho, detalhe)."""
    namespace: dict = {}
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            exec(compile(snippet, "<trecho>", "exec"), namespace)
        return "ok", ""
    except NameError as exc:
        missing = str(exc).split("'")[1] if "'" in str(exc) else ""
        if missing in PLACEHOLDERS:
            return "precisa-contexto", missing
        return "DEFEITO", f"NameError inesperado: {exc}"
    except FileNotFoundError as exc:
        return "precisa-arquivo", Path(str(exc.filename or "")).name
    except Exception as exc:
        return "DEFEITO", f"{type(exc).__name__}: {exc}"


def main() -> int:
    if not CATALOG.exists():
        print(f"ERRO: catálogo ausente ({CATALOG}). Rode tools/build_catalog.py.", file=sys.stderr)
        return 2

    catalog = json.loads(CATALOG.read_text())
    tally: dict[str, int] = {}
    defects: list[tuple[str, str]] = []

    for task in catalog["tasks"]:
        for entry in task["entries"]:
            path = entry["path"]
            if path in NETWORK_PATHS:
                outcome, detail = "pulado-rede", ""
            else:
                outcome, detail = run_snippet(entry["snippet"])
            tally[outcome] = tally.get(outcome, 0) + 1
            if outcome == "DEFEITO":
                defects.append((path, detail))
            marker = "!!" if outcome == "DEFEITO" else "  "
            suffix = f" ({detail})" if detail else ""
            print(f"{marker} {outcome:17s} {path}{suffix}")

    print()
    for outcome, count in sorted(tally.items()):
        print(f"{outcome:17s} {count}")

    if defects:
        print(f"\n{len(defects)} trecho(s) com defeito:", file=sys.stderr)
        for path, detail in defects:
            print(f"  - {path}: {detail}", file=sys.stderr)
        return 1

    print("\nNenhum trecho com defeito.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
