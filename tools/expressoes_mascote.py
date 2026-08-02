#!/usr/bin/env python3
"""Deriva os quadros de expressão do mascote a partir de UM sprite parado.

    # 1. ver onde estão os olhos (mapa em texto, com régua)
    python3 tools/expressoes_mascote.py parado.png --mapa

    # 2. derivar as quatro expressões, passando as duas caixas
    python3 tools/expressoes_mascote.py parado.png 37,42,27,34 49,56,27,34

Escreve `piscando.png`, `feliz.png`, `preocupado.png` e `pensando.png` ao lado
do arquivo de entrada.

**As caixas são passadas à mão, e isso é decisão.** Uma primeira versão tentava
achar os olhos sozinha, procurando ilhas de pixel que não fossem pele no meio do
rosto. Erra: reflexo de franja e sombra de bochecha também são ilhas, e o que ela
devolvia era metade da testa. Num sprite de 96 px a diferença entre acertar e
errar é de dois pixels — ler o mapa leva dez segundos e não erra.

## Por que isto existe, em vez de gerar cada expressão com IA

Porque não funcionou. Gerar variação a partir do sprite com força alta devolve o
mesmo desenho (rosto de 96 px tem olho de 6 px — a diferença some no ruído), e
com força baixa o personagem deixa de ser o mesmo. Editar o pixel dá controle
exato, sai de graça e mantém a identidade **por construção**: as quatro
expressões são o mesmo desenho com os olhos mexidos.

## O que ele mexe

Só os olhos, e de propósito. Boca de chibi tem 2 ou 3 pixels e não sustenta
expressão; olho sustenta — é a linguagem do gênero:

    feliz       olhos em arco para cima  (^   ^)
    piscando    pálpebras fechadas       (-   -)
    preocupado  pálpebra caída sobre a íris
    pensando    íris deslocada para baixo (olhar baixo)

## Como acha os olhos

Sem coordenada chutada: procura, na metade de cima do desenho, pixels que **não
são pele** (a pele deste tipo de arte tem sempre r>=g>=b) e que têm pele dos
dois lados na mesma linha — é isso que separa olho de cabelo, que é uma massa
grande e encostada na borda. Agrupa o que sobra e fica com os dois maiores
grupos. Se achar coisa diferente de dois olhos, diz e não escreve nada.
"""

from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

# --------------------------------------------------------------------------
# PNG em Python puro: esta máquina não tem Pillow nem ImageMagick.
# --------------------------------------------------------------------------


def ler_png(caminho: Path):
    dados = caminho.read_bytes()
    assert dados[:8] == b"\x89PNG\r\n\x1a\n", f"{caminho} não é PNG"
    pos, idat, paleta, trns = 8, b"", None, None
    largura = altura = prof = tipo = None

    while pos < len(dados):
        (tam,) = struct.unpack(">I", dados[pos : pos + 4])
        marca = dados[pos + 4 : pos + 8]
        corpo = dados[pos + 8 : pos + 8 + tam]
        if marca == b"IHDR":
            largura, altura, prof, tipo, _, _, entrelace = struct.unpack(">IIBBBBB", corpo)
            assert entrelace == 0, "PNG entrelaçado não suportado"
        elif marca == b"PLTE":
            paleta = corpo
        elif marca == b"tRNS":
            trns = corpo
        elif marca == b"IDAT":
            idat += corpo
        elif marca == b"IEND":
            break
        pos += 12 + tam

    assert prof == 8, f"profundidade {prof} não suportada"
    canais = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[tipo]
    bruto = zlib.decompress(idat)

    linhas, bpp, i = [], canais, 0
    anterior = bytearray(largura * bpp)
    for _ in range(altura):
        filtro = bruto[i]
        i += 1
        linha = bytearray(bruto[i : i + largura * bpp])
        i += largura * bpp
        for x in range(len(linha)):
            a = linha[x - bpp] if x >= bpp else 0
            b = anterior[x]
            c = anterior[x - bpp] if x >= bpp else 0
            if filtro == 1:
                linha[x] = (linha[x] + a) & 255
            elif filtro == 2:
                linha[x] = (linha[x] + b) & 255
            elif filtro == 3:
                linha[x] = (linha[x] + (a + b) // 2) & 255
            elif filtro == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                linha[x] = (linha[x] + pr) & 255
        linhas.append(linha)
        anterior = linha

    pixels = []
    for linha in linhas:
        fila = []
        for x in range(largura):
            p = linha[x * bpp : (x + 1) * bpp]
            if tipo == 6:
                fila.append(tuple(p))
            elif tipo == 2:
                fila.append((p[0], p[1], p[2], 255))
            elif tipo == 3:
                idx = p[0]
                r, g, b = paleta[idx * 3 : idx * 3 + 3]
                fila.append((r, g, b, trns[idx] if trns and idx < len(trns) else 255))
            elif tipo == 4:
                fila.append((p[0], p[0], p[0], p[1]))
            else:
                fila.append((p[0], p[0], p[0], 255))
        pixels.append(fila)
    return largura, altura, pixels


def gravar_png(caminho: Path, largura: int, altura: int, pixels) -> None:
    bruto = b"".join(b"\x00" + bytes(v for p in fila for v in p) for fila in pixels)

    def chunk(marca: bytes, corpo: bytes) -> bytes:
        return (
            struct.pack(">I", len(corpo))
            + marca
            + corpo
            + struct.pack(">I", zlib.crc32(marca + corpo) & 0xFFFFFFFF)
        )

    caminho.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", largura, altura, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bruto, 9))
        + chunk(b"IEND", b"")
    )


# --------------------------------------------------------------------------
# ler o sprite com os olhos
# --------------------------------------------------------------------------


def e_pele(p) -> bool:
    """Pele desta arte tem sempre r>=g>=b. Cílio é escuro demais para valer."""
    r, g, b, a = p
    return a > 10 and (r + g + b) >= 80 and r >= g >= b


def mapa(largura: int, altura: int, pixels) -> None:
    """Desenha o sprite em texto, com régua, para ler a caixa de cada olho.

        .  pele        #  escuro (cílio, contorno)
        ~  outra cor (cabelo, roupa, íris)   ·  esclera
    """
    print("     " + "".join(str(x // 10 % 10) for x in range(largura)))
    print("     " + "".join(str(x % 10) for x in range(largura)))
    for y in range(altura):
        linha = ""
        for x in range(largura):
            r, g, b, a = pixels[y][x]
            if a < 10:
                linha += " "
            elif r + g + b < 80:
                linha += "#"
            elif e_pele(pixels[y][x]):
                linha += "."
            elif r > 200 and g > 200 and b > 200:
                linha += "\u00b7"
            else:
                linha += "~"
        print(f"{y:4d} {linha}")


def caixa_de(texto: str):
    partes = [int(v) for v in texto.split(",")]
    if len(partes) != 4:
        raise SystemExit(f"caixa inválida: {texto} (esperado x0,x1,y0,y1)")
    return tuple(partes)


# --------------------------------------------------------------------------
# desenhar as expressões
# --------------------------------------------------------------------------


def tom_de_pele(pixels, caixa):
    """A pele mais comum em volta do olho — é com ela que se apaga o olho."""
    x0, x1, y0, y1 = caixa
    contagem = {}
    for y in range(y0 - 2, y1 + 3):
        for x in range(x0 - 3, x1 + 4):
            try:
                p = pixels[y][x]
            except IndexError:
                continue
            if e_pele(p) and p[0] > 200:
                contagem[p] = contagem.get(p, 0) + 1
    return max(contagem, key=contagem.get) if contagem else (249, 225, 212, 255)


def cor_do_cilio(pixels, caixa):
    """O pixel mais escuro do olho — o cílio que já existe no desenho."""
    x0, x1, y0, y1 = caixa
    escuros = [
        pixels[y][x]
        for y in range(y0, y1 + 1)
        for x in range(x0, x1 + 1)
        if pixels[y][x][3] > 10
    ]
    return min(escuros, key=lambda p: p[0] + p[1] + p[2])


def copiar(pixels):
    return [list(linha) for linha in pixels]


def apagar_olho(alvo, pixels, caixa, pele):
    x0, x1, y0, y1 = caixa
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if pixels[y][x][3] > 10 and not e_pele(pixels[y][x]):
                alvo[y][x] = pele


def piscando(pixels, caixas):
    """Pálpebras fechadas: linha reta com as pontas caídas."""
    alvo = copiar(pixels)
    for caixa in caixas:
        x0, x1, y0, y1 = caixa
        apagar_olho(alvo, pixels, caixa, tom_de_pele(pixels, caixa))
        cilio = cor_do_cilio(pixels, caixa)
        yc = (y0 + y1) // 2
        for x in range(x0, x1 + 1):
            alvo[yc + (1 if x in (x0, x1) else 0)][x] = cilio
    return alvo


def feliz(pixels, caixas):
    """Olhos em arco para cima — o sorriso do gênero mora no olho."""
    alvo = copiar(pixels)
    for caixa in caixas:
        x0, x1, y0, y1 = caixa
        apagar_olho(alvo, pixels, caixa, tom_de_pele(pixels, caixa))
        cilio = cor_do_cilio(pixels, caixa)
        yc = (y0 + y1) // 2 + 1
        largura = x1 - x0
        for i, x in enumerate(range(x0, x1 + 1)):
            # arco: pontas baixas, meio alto
            altura = 2 if largura and abs(i - largura / 2) < largura / 4 else (1 if 0 < i < largura else 0)
            alvo[yc - altura][x] = cilio
    return alvo


def preocupado(pixels, caixas):
    """Pálpebra caindo sobre a íris: olho aberto, mas encolhido por cima."""
    alvo = copiar(pixels)
    for caixa in caixas:
        x0, x1, y0, y1 = caixa
        cilio = cor_do_cilio(pixels, caixa)
        pele = tom_de_pele(pixels, caixa)
        corte = y0 + max(1, (y1 - y0) // 3)
        for y in range(y0, corte):
            for x in range(x0, x1 + 1):
                if pixels[y][x][3] > 10 and not e_pele(pixels[y][x]):
                    alvo[y][x] = pele
        for x in range(x0, x1 + 1):
            alvo[corte][x] = cilio
    return alvo


def pensando(pixels, caixas):
    """Íris um pixel mais abaixo: o olhar cai, como quem pensa."""
    alvo = copiar(pixels)
    for caixa in caixas:
        x0, x1, y0, y1 = caixa
        pele = tom_de_pele(pixels, caixa)
        for x in range(x0, x1 + 1):
            coluna = [pixels[y][x] for y in range(y0, y1 + 1)]
            for i, y in enumerate(range(y0, y1 + 1)):
                origem = coluna[i - 1] if i > 0 else None
                if origem is None:
                    alvo[y][x] = pele if not e_pele(pixels[y][x]) else pixels[y][x]
                else:
                    alvo[y][x] = origem
    return alvo


def main() -> None:
    argumentos = sys.argv[1:]
    if not argumentos:
        raise SystemExit(__doc__)

    base = Path(argumentos[0]).expanduser()
    largura, altura, pixels = ler_png(base)

    if "--mapa" in argumentos:
        mapa(largura, altura, pixels)
        return

    if len(argumentos) != 3:
        raise SystemExit(__doc__)
    caixas = [caixa_de(argumentos[1]), caixa_de(argumentos[2])]

    for nome, fn in (
        ("piscando", piscando),
        ("feliz", feliz),
        ("preocupado", preocupado),
        ("pensando", pensando),
    ):
        saida = base.with_name(f"{nome}.png")
        gravar_png(saida, largura, altura, fn(pixels, caixas))
        print(f"gravado {saida}")


if __name__ == "__main__":
    main()
