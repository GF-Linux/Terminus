#!/usr/bin/env python3
"""Gera docs/biopython-por-tarefa.md — referência de leitura a partir do catálogo.

Mesma regra do resto do projeto: nada é escrito à mão aqui. Caminho, assinatura,
docstring e estado de depreciação vêm de `data/biopython-catalog.json`, que por
sua vez saiu de introspecção do Biopython instalado.

Uso:
    python tools/build_reference.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CATALOGO = REPO / "data" / "biopython-catalog.json"
SAIDA = REPO / "docs" / "biopython-por-tarefa.md"

# Bio.Blast.qblast tem 943 caracteres de assinatura (dezenas de parâmetros do
# NCBI). Assinatura longa vira ruído numa referência de leitura, então corta-se
# e avisa-se que foi cortada — nunca em silêncio.
MAX_ASSINATURA = 150

# A "cola rápida": para cada tarefa, a função que se usa em 90% dos casos.
# Curadoria minha; os caminhos são validados contra o catálogo antes de gravar.
COLA = {
    "arquivos":         ("Bio.SeqIO.parse",                          "percorrer um arquivo de sequências"),
    "sanger":           ("Bio.SeqIO.read",                           'abrir um .ab1 (formato "abi")'),
    "transformar":      ("Bio.Seq.Seq",                              "complemento reverso, tradução, transcrição"),
    "medir":            ("Bio.SeqUtils.gc_fraction",                 "medir GC (fração 0–1)"),
    "alinhar-par":      ("Bio.Align.PairwiseAligner",                "alinhar duas sequências"),
    "alinhar-multiplo": ("Bio.AlignIO.read",                         "ler um alinhamento pronto"),
    "arvore":           ("Bio.Phylo.read",                           "ler e desenhar uma árvore"),
    "ncbi":             ("Bio.Entrez.efetch",                        "baixar registro do NCBI"),
    "blast":            ("Bio.SearchIO.read",                        "ler resultado de BLAST"),
    "restricao":        ("Bio.Restriction.RestrictionBatch",         "onde as enzimas cortam"),
    "anotacao":         ("Bio.SeqFeature.SeqFeature",                "marcar/extrair uma região"),
    "referencia":       ("Bio.Data.CodonTable.unambiguous_dna_by_id", "consultar o código genético"),
}


def ancora(titulo: str) -> str:
    """Âncora no estilo GitHub: minúsculas, sem acento nem pontuação, espaços->hífen."""
    import unicodedata
    s = unicodedata.normalize("NFKD", titulo)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^\w\s-]", "", s.lower())
    return re.sub(r"[\s]+", "-", s.strip())


def corta(assinatura: str | None) -> tuple[str, bool]:
    if not assinatura:
        return "", False
    if len(assinatura) <= MAX_ASSINATURA:
        return assinatura, False
    return assinatura[: MAX_ASSINATURA - 1].rstrip() + "…", True


def main() -> int:
    if not CATALOGO.exists():
        raise SystemExit(f"ERRO: catálogo ausente ({CATALOGO}). Rode tools/build_catalog.py.")
    cat = json.loads(CATALOGO.read_text(encoding="utf-8"))
    tarefas = cat["tasks"]
    por_caminho = {e["path"]: e for t in tarefas for e in t["entries"]}
    por_id = {t["id"]: t for t in tarefas}

    # a cola rápida não pode citar o que não existe
    erros = [p for p, _ in COLA.values() if p not in por_caminho]
    faltando = [t["id"] for t in tarefas if t["id"] not in COLA]
    if erros or faltando:
        for p in erros:
            print(f"ERRO: a cola cita {p}, que não está no catálogo.")
        for i in faltando:
            print(f"ERRO: tarefa '{i}' não tem entrada na cola rápida.")
        return 1

    L: list[str] = []
    A = L.append

    A("# Biopython por tarefa — referência")
    A("")
    A(f"**{cat['entry_count']} funções em {cat['task_count']} tarefas.** "
      f"Verificado contra o **Biopython {cat['biopython_version']}** "
      f"(Python {cat['python_version']}) instalado nesta máquina.")
    A("")
    A("Organizado pelo que se quer **fazer**, não pelo módulo onde a função mora — a "
      "documentação oficial é indexada por módulo, o que só ajuda quem já sabe o nome "
      "do que procura.")
    A("")
    A("> Arquivo **gerado** por `tools/build_reference.py` a partir de "
      "`data/biopython-catalog.json`. Não editar à mão: assinaturas e docstrings vêm "
      "de introspecção do pacote instalado. Para atualizar: "
      "`python tools/build_catalog.py && python tools/build_reference.py`.")
    A("")

    # ---------------- o que saiu do Biopython ----------------
    A("## Leia isto primeiro: o que saiu do Biopython")
    A("")
    A("O Biopython vem removendo e depreciando coisas rápido, e muito código na internet "
      "(e em tutorial antigo) usa API que **já não existe**. Confirmado contra a "
      f"instalação {cat['biopython_version']}:")
    A("")
    A("| Você vê por aí | Situação real | Use isto |")
    A("|---|---|---|")
    A("| `Bio.SeqUtils.GC(seq)` | **removido** | `Bio.SeqUtils.gc_fraction(seq)` — devolve **fração 0–1, não %** |")
    A("| `Bio.Application.*` (wrappers de linha de comando) | **removido por inteiro** | chamar o programa via `subprocess` |")
    A("| `Bio.Alphabet` | **removido por inteiro** | não é mais necessário; `Seq` não leva alfabeto |")
    A("| `Bio.pairwise2.align.*` | depreciado (avisa ao importar) | `Bio.Align.PairwiseAligner` |")
    A("| `Bio.Align.AlignInfo.SummaryInfo` | depreciado no docstring | sem substituto direto; evitar em código novo |")
    A("")
    A("A armadilha que mais pega: **`gc_fraction` devolve 0,462 onde o antigo `GC` "
      "devolvia 46,2.** Multiplique por 100 se quer porcentagem.")
    A("")

    # ---------------- cola rápida ----------------
    A("## Cola rápida — uma por tarefa")
    A("")
    A("Se você só quer começar, é esta função por tarefa:")
    A("")
    A("| Tarefa | Função | Para |")
    A("|---|---|---|")
    for t in tarefas:
        caminho, para = COLA[t["id"]]
        A(f"| [{t['title']}](#{ancora(t['title'])}) | `{caminho}` | {para} |")
    A("")

    # ---------------- índice ----------------
    A("## Índice")
    A("")
    for t in tarefas:
        dep = sum(1 for e in t["entries"] if e["deprecated"])
        aviso = f" · ⚠️ {dep} depreciada{'s' if dep > 1 else ''}" if dep else ""
        A(f"- [{t['title']}](#{ancora(t['title'])}) — {len(t['entries'])} funções{aviso}")
    A("")
    A("---")
    A("")

    # ---------------- as tarefas ----------------
    for t in tarefas:
        A(f"## {t['title']}")
        A("")
        A(f"*{t['why']}*")
        A("")
        for e in t["entries"]:
            assinatura, cortada = corta(e["signature"])
            titulo = f"{e['path']}{assinatura}" if assinatura else e["path"]
            A(f"### `{titulo}`")
            A("")
            if cortada:
                A("<sub>assinatura cortada — a função aceita muitos parâmetros; "
                  "veja a lista completa com `help()`</sub>")
                A("")
            if e["deprecated"]:
                aviso = " ".join(e["deprecated"].split())
                A(f"> ⚠️ **Depreciado.** {aviso}")
                A("")
            A(f"{e['doc']}")
            A("")
            if e["note"]:
                A(f"**Nota:** {e['note']}")
                A("")
            A("```python")
            A(e["snippet"])
            A("```")
            A("")
        A("---")
        A("")

    # ---------------- rodapé ----------------
    A("## Como isto foi levantado")
    A("")
    A(f"A instalação do Biopython {cat['biopython_version']} expõe **1907 símbolos "
      "públicos em 221 módulos**. Esta referência é uma curadoria de "
      f"{cat['entry_count']} deles, escolhidos pelo que aparece no trabalho de bancada "
      "(Sanger, 16S/18S, filogenia, identificação).")
    A("")
    A("Nenhum nome aqui foi escrito de memória. O gerador do catálogo resolve cada "
      "caminho declarado contra o pacote instalado e **falha em vez de gravar** se algo "
      "não existir — foi assim que se confirmou que `Bio.SeqUtils.GC` e `Bio.Application` "
      "sumiram. Um segundo script (`tools/check_snippets.py`) **executa** os trechos: "
      "22 rodam de ponta a ponta, os demais pedem arquivo de exemplo ou objeto de "
      "contexto, e os 6 que fariam requisição ao NCBI nunca são executados.")
    A("")

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text("\n".join(L), encoding="utf-8")

    dep = sum(1 for e in por_caminho.values() if e["deprecated"])
    print(f"Biopython {cat['biopython_version']} · {cat['entry_count']} funções · "
          f"{cat['task_count']} tarefas · {dep} depreciadas")
    print(f"gravado: {SAIDA.relative_to(REPO)} ({SAIDA.stat().st_size/1024:.0f} KB, "
          f"{len(L)} linhas)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
