#!/usr/bin/env python3
"""Monta design/prototipo-preto-fosco.html — o protótipo visual da IDE própria.

Junta três coisas que não devem ser copiadas à mão:
  1. o template (design/prototipo.template.html);
  2. o catálogo verificado (data/biopython-catalog.json), injetado como JSON;
  3. as fontes IBM Plex em base64, reaproveitadas do mockup aprovado de 23/07,
     para a tipografia continuar idêntica e o arquivo abrir offline.

As versões da barra de estado são **detectadas nesta máquina**, não escritas no
template: é o que a nota 5 do próprio protótipo promete ao leitor.

Uso:
    python tools/build_prototype.py
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TEMPLATE = REPO / "design" / "prototipo.template.html"
FONTE_MOCKUP = REPO / "design" / "mockup-2-aprovado-vscodium.html"
CATALOGO = REPO / "data" / "biopython-catalog.json"
SAIDA = REPO / "design" / "prototipo-preto-fosco.html"

BIOPY_PYTHON = Path.home() / "miniforge3" / "envs" / "easycontig-demo" / "bin" / "python"
TRACY = Path.home() / "projetos" / "dna-contingency" / "bin" / "tracy.exe"
BLASTN = Path.home() / "miniforge3" / "envs" / "easycontig-demo" / "bin" / "blastn"


def extrair_fontes() -> str:
    """Pega os @font-face (com o base64) do mockup aprovado, sem alterá-los."""
    if not FONTE_MOCKUP.exists():
        raise SystemExit(
            f"ERRO: {FONTE_MOCKUP} não existe. É de lá que vêm as fontes embutidas."
        )
    texto = FONTE_MOCKUP.read_text(encoding="utf-8")
    faces = re.findall(r"@font-face\{[^}]*\}", texto)
    if len(faces) != 5:
        raise SystemExit(f"ERRO: esperava 5 @font-face no mockup, achei {len(faces)}.")
    return "\n".join(faces)


def _rodar(cmd: list[str]) -> str:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return (r.stdout or "") + (r.stderr or "")
    except (OSError, subprocess.SubprocessError):
        return ""


def detectar_versoes() -> dict[str, str]:
    """Lê as versões reais das ferramentas. '?' quando não dá para detectar."""
    versoes = {"biopython": "?", "python": "?", "tracy": "?", "blast": "?"}

    if BIOPY_PYTHON.exists():
        saida = _rodar([
            str(BIOPY_PYTHON), "-c",
            "import Bio,sys;print(Bio.__version__);print('.'.join(map(str,sys.version_info[:3])))",
        ]).split()
        if len(saida) >= 2:
            versoes["biopython"], versoes["python"] = saida[0], saida[1]

    if TRACY.exists():
        m = re.search(r"Tracy version:\s*v?([\d.]+)", _rodar([str(TRACY), "--version"]))
        if m:
            versoes["tracy"] = m.group(1)

    blastn = str(BLASTN) if BLASTN.exists() else shutil.which("blastn")
    if blastn:
        m = re.search(r"blastn:\s*([\d.]+)\+?", _rodar([blastn, "-version"]))
        if m:
            # sem o '+' final: o rótulo na barra de estado já é "BLAST+",
            # senão sai "BLAST+ 2.17.0+"
            versoes["blast"] = m.group(1)

    faltando = [k for k, v in versoes.items() if v == "?"]
    if faltando:
        print(f"AVISO: não detectei {', '.join(faltando)} — vai como '?' na barra de estado.",
              file=sys.stderr)
    return versoes


def substituir_unico(texto: str, marcador: str, valor: str, rotulo: str) -> str:
    """Troca `/*MARCADOR*/...../*FIM*/` por `valor`, exigindo exatamente uma ocorrência."""
    padrao = re.compile(re.escape(f"/*{marcador}*/") + r".*?" + re.escape("/*FIM*/"), re.S)
    novo, n = padrao.subn(lambda _: valor, texto)
    if n != 1:
        raise SystemExit(f"ERRO: marcador {rotulo} apareceu {n} vezes no template (esperado 1).")
    return novo


def main() -> int:
    if not TEMPLATE.exists():
        raise SystemExit(f"ERRO: template ausente ({TEMPLATE}).")
    if not CATALOGO.exists():
        raise SystemExit(f"ERRO: catálogo ausente ({CATALOGO}). Rode tools/build_catalog.py.")

    catalogo = json.loads(CATALOGO.read_text(encoding="utf-8"))
    versoes = detectar_versoes()
    html = TEMPLATE.read_text(encoding="utf-8")

    if "<!--FONTES-->" not in html:
        raise SystemExit("ERRO: template sem o marcador <!--FONTES-->.")
    html = html.replace("<!--FONTES-->", extrair_fontes(), 1)

    html = substituir_unico(
        html, "CATALOGO", json.dumps(catalogo, ensure_ascii=False, separators=(",", ":")), "CATALOGO"
    )
    html = substituir_unico(
        html, "VERSOES", json.dumps(versoes, ensure_ascii=False), "VERSOES"
    )

    SAIDA.write_text(html, encoding="utf-8")

    print(f"Biopython {versoes['biopython']} · Python {versoes['python']} · "
          f"BLAST+ {versoes['blast']} · Tracy {versoes['tracy']}")
    print(f"catálogo : {catalogo['task_count']} tarefas, {catalogo['entry_count']} entradas")
    print(f"gravado  : {SAIDA.relative_to(REPO)}  ({SAIDA.stat().st_size/1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
