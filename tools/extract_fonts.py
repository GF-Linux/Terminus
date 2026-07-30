#!/usr/bin/env python3
"""Extrai as fontes IBM Plex embutidas no mockup aprovado para arquivos reais.

O protótipo (design/) carrega as fontes em base64 dentro do próprio HTML, porque
precisa abrir offline como arquivo único. O aplicativo não tem essa restrição: é
melhor ter os .woff2 no disco, servidos pelo bundler, do que ~1 MB de base64 no
CSS a cada recarga.

A fonte da verdade continua sendo design/mockup-2-aprovado-vscodium.html — as
fontes não são baixadas de novo nem substituídas por outras, para a tipografia do
aplicativo ser byte a byte a mesma que foi aprovada em 23/07.

Uso:
    python tools/extract_fonts.py
"""

from __future__ import annotations

import base64
import hashlib
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MOCKUP = REPO / "design" / "mockup-2-aprovado-vscodium.html"
DESTINO = REPO / "src" / "renderer" / "fontes"

# Peso -> nome do arquivo. A ordem é a de aparição no mockup.
ESPERADO = 5


def main() -> int:
    if not MOCKUP.exists():
        raise SystemExit(f"ERRO: {MOCKUP} não existe — é de lá que vêm as fontes.")

    html = MOCKUP.read_text(encoding="utf-8")
    faces = re.findall(r"@font-face\{[^}]*\}", html)
    if len(faces) != ESPERADO:
        raise SystemExit(f"ERRO: esperava {ESPERADO} @font-face, achei {len(faces)}.")

    DESTINO.mkdir(parents=True, exist_ok=True)
    for antigo in DESTINO.glob("*.woff2"):
        antigo.unlink()

    # (família, sha256) -> [pesos declarados]. Agrupar por conteúdo é o que revela
    # o mockup declarando três pesos e servindo o mesmo arquivo nos três.
    grupos: dict[tuple[str, str], list[int]] = {}
    conteudo: dict[str, bytes] = {}

    for face in faces:
        familia = re.search(r"font-family:'([^']+)'", face)
        peso = re.search(r"font-weight:(\d+)", face)
        dados = re.search(r"base64,([A-Za-z0-9+/=]+)\)", face)
        if not (familia and peso and dados):
            raise SystemExit(f"ERRO: @font-face sem família, peso ou base64:\n{face[:120]}")

        bytes_ = base64.b64decode(dados.group(1))
        chave = (familia.group(1), hashlib.sha256(bytes_).hexdigest())
        grupos.setdefault(chave, []).append(int(peso.group(1)))
        conteudo[chave[1]] = bytes_

    regras: list[str] = []
    duplicados: list[str] = []

    for (familia, sha), pesos in grupos.items():
        pesos.sort()
        slug = familia.lower().replace(" ", "-")
        nome = f"{slug}-{pesos[0]}.woff2"
        (DESTINO / nome).write_bytes(conteudo[sha])

        # Um só peso no arquivo: declarar 400, 500 e 600 apontando para os mesmos
        # contornos faz o navegador aceitar cada peso como existente e desenhar
        # tudo igual — o texto em "600" sai com o traço do 400 e ninguém percebe
        # que o negrito nunca chegou. Declarar o intervalo diz a verdade: esta
        # face cobre esses pesos, e não há contraste de peso a esperar.
        faixa = str(pesos[0]) if len(pesos) == 1 else f"{pesos[0]} {pesos[-1]}"
        if len(pesos) > 1:
            duplicados.append(f"{familia}: {', '.join(map(str, pesos))} são o mesmo arquivo")

        regras.append(
            f"@font-face{{font-family:'{familia}';font-style:normal;"
            f"font-weight:{faixa};font-display:block;"
            f"src:url('./fontes/{nome}') format('woff2')}}"
        )
        print(f"  {nome}  {(DESTINO / nome).stat().st_size / 1024:.0f} KB  peso {faixa}")

    if duplicados:
        print(
            "\nAVISO: o mockup aprovado declara pesos que não existem no arquivo:\n  "
            + "\n  ".join(duplicados)
            + "\n  A casca nunca teve contraste de peso nessa família. Mantido assim de\n"
            "  propósito — mudar exigiria trazer os .woff2 reais e alterar a aparência\n"
            "  aprovada em 23/07.",
            file=sys.stderr,
        )

    css = REPO / "src" / "renderer" / "fontes.css"
    css.write_text(
        "/* Gerado por tools/extract_fonts.py a partir do mockup aprovado de 23/07.\n"
        "   Não editar à mão: rode o gerador. */\n" + "\n".join(regras) + "\n",
        encoding="utf-8",
    )
    print(f"gravado: {css.relative_to(REPO)}  ({len(regras)} faces, de {len(faces)} no mockup)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
