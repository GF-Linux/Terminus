#!/usr/bin/env python3
"""Gera data/biopython-catalog.json a partir do Biopython instalado.

Regra do projeto: o catálogo NUNCA é escrito à mão. Aqui só se declara a
curadoria — quais tarefas existem, quais caminhos entram em cada uma e qual
trecho de código inserir. Tipo, assinatura, docstring e estado de depreciação
saem sempre de introspecção do pacote instalado.

Se um caminho declarado não resolver, o script falha com código 1 em vez de
gravar um catálogo que promete algo inexistente. Foi assim que se pegou que
`Bio.SeqUtils.GC` e `Bio.Application` não existem mais no Biopython 1.87.

Uso:
    python tools/build_catalog.py            # grava o catálogo
    python tools/build_catalog.py --check    # só valida, não grava
"""

from __future__ import annotations

import argparse
import importlib
import inspect
import json
import sys
import warnings
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT = REPO_ROOT / "data" / "biopython-catalog.json"

# ---------------------------------------------------------------------------
# Curadoria: tarefa -> caminhos. Organizado pelo que se quer FAZER, não pelo
# módulo em que a função mora — é essa inversão que justifica a extensão.
# ---------------------------------------------------------------------------

TASKS: list[dict] = [
    {
        "id": "arquivos",
        "title": "Ler e escrever arquivos de sequência",
        "why": "Ponto de entrada de quase toda análise: transformar arquivo em objeto e de volta.",
        "entries": [
            {
                "path": "Bio.SeqIO.parse",
                "snippet": 'from Bio import SeqIO\n\nfor registro in SeqIO.parse("entrada.fasta", "fasta"):\n    print(registro.id, len(registro.seq))',
                "note": "Devolve um iterador — use para arquivos com muitos registros.",
            },
            {
                "path": "Bio.SeqIO.read",
                "snippet": 'from Bio import SeqIO\n\nregistro = SeqIO.read("entrada.fasta", "fasta")\nprint(registro.id, len(registro.seq))',
                "note": "Levanta erro se o arquivo tiver zero ou mais de um registro. Use quando você sabe que é um só.",
            },
            {
                "path": "Bio.SeqIO.write",
                "snippet": 'from Bio import SeqIO\n\nSeqIO.write(registros, "saida.fasta", "fasta")',
                "note": "Devolve quantos registros foram gravados.",
            },
            {
                "path": "Bio.SeqIO.convert",
                "snippet": 'from Bio import SeqIO\n\nSeqIO.convert("entrada.ab1", "abi", "saida.fastq", "fastq")',
                "note": "Converte formato sem você abrir os dois arquivos na mão.",
            },
            {
                "path": "Bio.SeqIO.to_dict",
                "snippet": 'from Bio import SeqIO\n\nindice = SeqIO.to_dict(SeqIO.parse("entrada.fasta", "fasta"))\nregistro = indice["ID_QUE_EU_QUERO"]',
                "note": "Carrega tudo na memória. Para arquivos grandes prefira SeqIO.index.",
            },
            {
                "path": "Bio.SeqIO.index",
                "snippet": 'from Bio import SeqIO\n\nindice = SeqIO.index("grande.fasta", "fasta")\nregistro = indice["ID_QUE_EU_QUERO"]',
                "note": "Acesso por chave sem carregar o arquivo inteiro na memória.",
            },
        ],
    },
    {
        "id": "sanger",
        "title": "Ler cromatograma Sanger (.ab1)",
        "why": "O formato que sai do sequenciador do laboratório. É o insumo do EasyContig BR.",
        "entries": [
            {
                "path": "Bio.SeqIO.read",
                "snippet": 'from Bio import SeqIO\n\nregistro = SeqIO.read("amostra.ab1", "abi")\nprint(registro.seq)\nprint(registro.letter_annotations["phred_quality"][:20])',
                "note": 'O formato se chama "abi". A qualidade por base vive em letter_annotations["phred_quality"].',
            },
            {
                "path": "Bio.SeqIO.AbiIO.AbiIterator",
                "snippet": 'from Bio.SeqIO.AbiIO import AbiIterator\n\n# trim=True aplica o corte de qualidade do próprio Biopython\nfor registro in AbiIterator("amostra.ab1", trim=True):\n    print(registro.id, len(registro.seq))',
                "note": 'Use trim=True para a versão aparada. Via SeqIO o equivalente é o formato "abi-trim".',
            },
            {
                "path": "Bio.SeqRecord.SeqRecord",
                "snippet": 'from Bio.SeqIO import read\n\nregistro = read("amostra.ab1", "abi")\n# os canais de fluorescência crus ficam em annotations["abif_raw"]\ncanais = registro.annotations["abif_raw"]\nprint(sorted(k for k in canais if k.startswith("DATA")))',
                "note": "Os traços brutos do cromatograma estão em annotations['abif_raw'] — é daqui que sai o desenho do cromatograma.",
            },
        ],
    },
    {
        "id": "transformar",
        "title": "Transformar sequência",
        "why": "Complemento reverso, transcrição e tradução — as operações que aparecem em toda aula.",
        "entries": [
            {
                "path": "Bio.Seq.Seq",
                "snippet": 'from Bio.Seq import Seq\n\ns = Seq("ATGGCCATTGTAATG")\nprint(s.reverse_complement())\nprint(s.translate())',
                "note": "Objeto Seq tem os métodos embutidos — normalmente você não precisa das funções soltas.",
            },
            {
                "path": "Bio.Seq.reverse_complement",
                "snippet": 'from Bio.Seq import reverse_complement\n\nprint(reverse_complement("ATGGCCATTGTAATG"))',
                "note": "Versão função, aceita str. Equivale ao método .reverse_complement() do Seq.",
            },
            {
                "path": "Bio.Seq.translate",
                "snippet": 'from Bio.Seq import translate\n\nprint(translate("ATGGCCATTGTAATG", to_stop=True))',
                "note": "to_stop=True para na primeira parada. table= escolhe o código genético.",
            },
            {
                "path": "Bio.Seq.transcribe",
                "snippet": 'from Bio.Seq import transcribe\n\nprint(transcribe("ATGGCCATTGTAATG"))',
                "note": "DNA para RNA (troca T por U). back_transcribe faz o contrário.",
            },
            {
                "path": "Bio.Seq.complement",
                "snippet": 'from Bio.Seq import complement\n\nprint(complement("ATGGCCATTGTAATG"))',
                "note": "Complemento sem inverter. Para a fita oposta de verdade use reverse_complement.",
            },
        ],
    },
    {
        "id": "medir",
        "title": "Medir propriedades da sequência",
        "why": "GC, massa, temperatura de anelamento — o que se calcula antes de desenhar primer ou conferir amostra.",
        "entries": [
            {
                "path": "Bio.SeqUtils.gc_fraction",
                "snippet": 'from Bio.SeqUtils import gc_fraction\n\nprint(gc_fraction("ATGGCCATTGTAATG"))  # fração de 0 a 1',
                "note": "ATENÇÃO: substitui a antiga Bio.SeqUtils.GC, que foi REMOVIDA. Devolve fração (0-1), não porcentagem.",
            },
            {
                "path": "Bio.SeqUtils.GC123",
                "snippet": 'from Bio.SeqUtils import GC123\n\ntotal, p1, p2, p3 = GC123("ATGGCCATTGTAATG")\nprint(total, p3)',
                "note": "GC total e por posição do códon. A 3ª posição é a informativa em estudo de códon.",
            },
            {
                "path": "Bio.SeqUtils.GC_skew",
                "snippet": 'from Bio.SeqUtils import GC_skew\n\nprint(GC_skew("ATGGCCATTGTAATGATGGCCATTGTAATG", window=10))',
                "note": "(G-C)/(G+C) em janelas ao longo da sequência.",
            },
            {
                "path": "Bio.SeqUtils.molecular_weight",
                "snippet": 'from Bio.SeqUtils import molecular_weight\n\nprint(molecular_weight("ATGGCCATTGTAATG", seq_type="DNA"))',
                "note": "seq_type aceita DNA, RNA ou protein. double_stranded=True para fita dupla.",
            },
            {
                "path": "Bio.SeqUtils.MeltingTemp.Tm_NN",
                "snippet": 'from Bio.SeqUtils import MeltingTemp as mt\n\nprint(mt.Tm_NN("ATGGCCATTGTAATG"))',
                "note": "Tm por vizinho mais próximo — é o método a usar para primer de verdade.",
            },
            {
                "path": "Bio.SeqUtils.MeltingTemp.Tm_Wallace",
                "snippet": 'from Bio.SeqUtils import MeltingTemp as mt\n\nprint(mt.Tm_Wallace("ATGGCCATTGTAATG"))',
                "note": "Regra 2(AT)+4(GC). Rápida e grosseira, boa só para oligo curto.",
            },
            {
                "path": "Bio.SeqUtils.nt_search",
                "snippet": 'from Bio.SeqUtils import nt_search\n\nprint(nt_search("ATGGCCATTGTAATG", "GCC"))',
                "note": "Aceita código IUPAC ambíguo no padrão buscado.",
            },
            {
                "path": "Bio.SeqUtils.six_frame_translations",
                "snippet": 'from Bio.SeqUtils import six_frame_translations\n\nprint(six_frame_translations("ATGGCCATTGTAATGATGGCC"))',
                "note": "Texto pronto com as 6 janelas de leitura. Bom para inspeção visual rápida.",
            },
            {
                "path": "Bio.SeqUtils.ProtParam.ProteinAnalysis",
                "snippet": 'from Bio.SeqUtils.ProtParam import ProteinAnalysis\n\na = ProteinAnalysis("MAIVMGRWKGAR")\nprint(a.molecular_weight(), a.isoelectric_point())',
                "note": "Bloco de propriedades de proteína num objeto só.",
            },
        ],
    },
    {
        "id": "alinhar-par",
        "title": "Alinhar duas sequências",
        "why": "Comparar amostra com referência. É onde mais gente ainda copia código obsoleto da internet.",
        "entries": [
            {
                "path": "Bio.Align.PairwiseAligner",
                "snippet": 'from Bio.Align import PairwiseAligner\n\nalinhador = PairwiseAligner()\nalinhador.mode = "local"\nfor alinhamento in alinhador.align("ATGGCCATTG", "ATGGCTATTG"):\n    print(alinhamento.score)\n    print(alinhamento)',
                "note": "É ESTE o caminho atual. Substitui Bio.pairwise2, que está depreciado.",
            },
            {
                "path": "Bio.Align.substitution_matrices.load",
                "snippet": 'from Bio.Align import substitution_matrices, PairwiseAligner\n\nalinhador = PairwiseAligner()\nalinhador.substitution_matrix = substitution_matrices.load("BLOSUM62")\nprint(substitution_matrices.load()[:8])  # nomes disponíveis',
                "note": "load() sem argumento lista as matrizes disponíveis na instalação.",
            },
            {
                "path": "Bio.pairwise2.align",
                "snippet": '# NÃO USE EM CÓDIGO NOVO — depreciado.\n# Equivalente atual: Bio.Align.PairwiseAligner\nfrom Bio import pairwise2\n\nalinhamentos = pairwise2.align.globalxx("ATGGCCATTG", "ATGGCTATTG")',
                "note": "Entra no catálogo só para ser reconhecido e substituído quando aparecer em código antigo.",
            },
        ],
    },
    {
        "id": "alinhar-multiplo",
        "title": "Alinhamento múltiplo",
        "why": "Insumo da árvore filogenética e da leitura de região conservada.",
        "entries": [
            {
                "path": "Bio.AlignIO.read",
                "snippet": 'from Bio import AlignIO\n\nalinhamento = AlignIO.read("alinhado.fasta", "fasta")\nprint(len(alinhamento), alinhamento.get_alignment_length())',
                "note": "Lê um alinhamento pronto (feito por MUSCLE/MAFFT fora do Python).",
            },
            {
                "path": "Bio.AlignIO.parse",
                "snippet": 'from Bio import AlignIO\n\nfor alinhamento in AlignIO.parse("varios.phy", "phylip"):\n    print(alinhamento.get_alignment_length())',
                "note": "Para arquivo com vários alinhamentos.",
            },
            {
                "path": "Bio.AlignIO.write",
                "snippet": 'from Bio import AlignIO\n\nAlignIO.write(alinhamento, "saida.phy", "phylip")',
                "note": "Converter para phylip é o passo comum antes de programa de filogenia.",
            },
            {
                "path": "Bio.Align.MultipleSeqAlignment",
                "snippet": 'from Bio.Align import MultipleSeqAlignment\n\nalinhamento = MultipleSeqAlignment(registros)\nprint(alinhamento[:, 0:10])  # fatia colunas 0-9 de todas as linhas',
                "note": "Fatiamento por coluna é o que torna esse objeto útil: alinhamento[:, i:j].",
            },
            {
                "path": "Bio.Align.AlignInfo.SummaryInfo",
                "snippet": 'from Bio.Align.AlignInfo import SummaryInfo\n\nresumo = SummaryInfo(alinhamento)\nprint(resumo.dumb_consensus())',
                "note": "MARCADO COMO DEPRECIADO no docstring do Biopython 1.87 — evite em código novo.",
            },
        ],
    },
    {
        "id": "arvore",
        "title": "Árvore filogenética",
        "why": "Posicionar a amostra em relação às referências. No EasyContig BR isso já vem resolvido.",
        "entries": [
            {
                "path": "Bio.Phylo.read",
                "snippet": 'from Bio import Phylo\n\narvore = Phylo.read("arvore.nwk", "newick")\nPhylo.draw_ascii(arvore)',
                "note": 'Formatos comuns: "newick", "nexus", "phyloxml".',
            },
            {
                "path": "Bio.Phylo.draw_ascii",
                "snippet": 'from Bio import Phylo\n\nPhylo.draw_ascii(arvore)',
                "note": "Desenho em texto puro — funciona no terminal, sem matplotlib.",
            },
            {
                "path": "Bio.Phylo.draw",
                "snippet": 'from Bio import Phylo\n\nPhylo.draw(arvore)  # requer matplotlib',
                "note": "Precisa de matplotlib instalado. Para desenho sem dependência use draw_ascii.",
            },
            {
                "path": "Bio.Phylo.write",
                "snippet": 'from Bio import Phylo\n\nPhylo.write(arvore, "saida.nwk", "newick")',
                "note": "Grava a árvore. Aceita uma árvore só ou uma lista delas.",
            },
            {
                "path": "Bio.Phylo.TreeConstruction.DistanceCalculator",
                "snippet": 'from Bio.Phylo.TreeConstruction import DistanceCalculator\n\ncalc = DistanceCalculator("identity")\nmatriz = calc.get_distance(alinhamento)\nprint(matriz)',
                "note": "Primeiro passo do NJ/UPGMA: matriz de distância a partir do alinhamento.",
            },
            {
                "path": "Bio.Phylo.TreeConstruction.DistanceTreeConstructor",
                "snippet": 'from Bio.Phylo.TreeConstruction import DistanceCalculator, DistanceTreeConstructor\n\nconstrutor = DistanceTreeConstructor(DistanceCalculator("identity"), "nj")\narvore = construtor.build_tree(alinhamento)',
                "note": 'Aceita "nj" (neighbor joining) ou "upgma".',
            },
            {
                "path": "Bio.Phylo.Consensus.majority_consensus",
                "snippet": 'from Bio.Phylo.Consensus import majority_consensus\n\nconsenso = majority_consensus(arvores, cutoff=0.5)',
                "note": "Árvore de consenso a partir de várias réplicas.",
            },
        ],
    },
    {
        "id": "ncbi",
        "title": "Consultar bancos do NCBI",
        "why": "Baixar referência sem sair do editor. Exige rede e e-mail declarado.",
        "entries": [
            {
                "path": "Bio.Entrez.esearch",
                "snippet": 'from Bio import Entrez\n\nEntrez.email = "seu@email.com"  # obrigatório pelo NCBI\nhandle = Entrez.esearch(db="nucleotide", term="Trypanosoma vivax 18S", retmax=10)\nresultado = Entrez.read(handle)\nprint(resultado["IdList"])',
                "note": "Entrez.email é obrigatório — sem ele o NCBI pode bloquear o IP.",
            },
            {
                "path": "Bio.Entrez.efetch",
                "snippet": 'from Bio import Entrez, SeqIO\n\nEntrez.email = "seu@email.com"\nhandle = Entrez.efetch(db="nucleotide", id="NC_000913.3", rettype="gb", retmode="text")\nregistro = SeqIO.read(handle, "genbank")',
                "note": "Combine com SeqIO.read para virar SeqRecord direto.",
            },
            {
                "path": "Bio.Entrez.read",
                "snippet": 'from Bio import Entrez\n\nresultado = Entrez.read(handle)',
                "note": "Converte o XML do Entrez em dict/list do Python.",
            },
            {
                "path": "Bio.Entrez.esummary",
                "snippet": 'from Bio import Entrez\n\nEntrez.email = "seu@email.com"\nresumo = Entrez.read(Entrez.esummary(db="nucleotide", id="NC_000913.3"))',
                "note": "Devolve só o resumo (título, tamanho, organismo) sem baixar a sequência — bom para conferir um hit antes de puxar o registro inteiro.",
            },
        ],
    },
    {
        "id": "blast",
        "title": "Rodar e ler BLAST",
        "why": "Identificar de que organismo é a sequência. O EasyContig BR já embute esse passo.",
        "entries": [
            {
                "path": "Bio.Blast.qblast",
                "snippet": 'from Bio import Blast\n\nBlast.email = "seu@email.com"\nresultado = Blast.qblast("blastn", "nt", sequencia)',
                "note": "Roda no servidor do NCBI — lento e sujeito a fila. Para lote, use BLAST local.",
            },
            {
                "path": "Bio.Blast.parse",
                "snippet": 'from Bio import Blast\n\nwith open("resultado.xml", "rb") as fh:\n    for registro in Blast.parse(fh):\n        for hit in registro:\n            print(hit.target.id)',
                "note": "Interface nova (Bio.Blast). Abra o XML em modo binário.",
            },
            {
                "path": "Bio.Blast.read",
                "snippet": 'from Bio import Blast\n\nwith open("resultado.xml", "rb") as fh:\n    registro = Blast.read(fh)',
                "note": "Para XML com uma única query.",
            },
            {
                "path": "Bio.SearchIO.read",
                "snippet": 'from Bio import SearchIO\n\nresultado = SearchIO.read("resultado.xml", "blast-xml")\nfor hit in resultado:\n    print(hit.id, hit.hsps[0].evalue)',
                "note": "SearchIO é a interface genérica — serve para BLAST, HMMER, BLAT etc.",
            },
            {
                "path": "Bio.Blast.NCBIWWW.qblast",
                "snippet": '# caminho antigo, ainda funciona\nfrom Bio.Blast import NCBIWWW\n\nhandle = NCBIWWW.qblast("blastn", "nt", sequencia)',
                "note": "Docstring avisa que parâmetros mudaram. Prefira Bio.Blast.qblast em código novo.",
            },
        ],
    },
    {
        "id": "restricao",
        "title": "Enzimas de restrição",
        "why": "Planejar digestão e conferir sítio em construção de plasmídeo.",
        "entries": [
            {
                "path": "Bio.Restriction.EcoRI",
                "snippet": 'from Bio.Restriction import EcoRI\nfrom Bio.Seq import Seq\n\nprint(EcoRI.site)\nprint(EcoRI.search(Seq("GAATTCGGGGAATTC")))',
                "note": "Cada enzima é um objeto próprio importável pelo nome. São mais de mil no módulo.",
            },
            {
                "path": "Bio.Restriction.RestrictionBatch",
                "snippet": 'from Bio.Restriction import RestrictionBatch\n\nlote = RestrictionBatch(["EcoRI", "BamHI", "HindIII"])\nprint(lote.search(sequencia))',
                "note": "Para testar várias enzimas de uma vez.",
            },
            {
                "path": "Bio.Restriction.Analysis",
                "snippet": 'from Bio.Restriction import Analysis, RestrictionBatch\n\nanalise = Analysis(RestrictionBatch(["EcoRI", "BamHI"]), sequencia, linear=True)\nanalise.print_that()',
                "note": "print_that() imprime tabela formatada. linear=False para plasmídeo circular.",
            },
        ],
    },
    {
        "id": "anotacao",
        "title": "Anotações e regiões marcadas",
        "why": "Ler features de GenBank e marcar região própria numa sequência.",
        "entries": [
            {
                "path": "Bio.SeqFeature.SeqFeature",
                "snippet": 'from Bio.SeqFeature import SeqFeature, SimpleLocation\n\nf = SeqFeature(SimpleLocation(5, 20, strand=1), type="CDS")\nprint(f.extract(registro.seq))',
                "note": "extract() já devolve o trecho na orientação certa da fita.",
            },
            {
                "path": "Bio.SeqFeature.SimpleLocation",
                "snippet": 'from Bio.SeqFeature import SimpleLocation\n\nlocal = SimpleLocation(5, 20, strand=-1)',
                "note": "Substitui o antigo nome FeatureLocation. Coordenadas em base 0, fim exclusivo.",
            },
            {
                "path": "Bio.SeqFeature.CompoundLocation",
                "snippet": 'from Bio.SeqFeature import CompoundLocation, SimpleLocation\n\nlocal = CompoundLocation([SimpleLocation(0, 10), SimpleLocation(20, 30)])',
                "note": "Para gene com éxons separados (join no GenBank).",
            },
        ],
    },
    {
        "id": "referencia",
        "title": "Tabelas de referência",
        "why": "Código genético e códigos IUPAC sem procurar na internet.",
        "entries": [
            {
                "path": "Bio.Data.CodonTable.unambiguous_dna_by_id",
                "snippet": 'from Bio.Data import CodonTable\n\ntabela = CodonTable.unambiguous_dna_by_id[1]  # 1 = padrão\nprint(tabela.stop_codons)\nprint(tabela.forward_table["ATG"])',
                "note": "id=1 é o código padrão; 2 é mitocondrial de vertebrado; 4 é o de tripanossomatídeo/micoplasma.",
            },
            {
                "path": "Bio.Data.IUPACData.ambiguous_dna_values",
                "snippet": 'from Bio.Data import IUPACData\n\nprint(IUPACData.ambiguous_dna_values["N"])\nprint(IUPACData.ambiguous_dna_values["R"])',
                "note": "O que cada letra ambígua representa. Útil ao ler chamada de base de Sanger.",
            },
        ],
    },
]


def resolve(path: str):
    """Resolve um caminho pontilhado, importando o prefixo mais longo que for módulo.

    Devolve (objeto, aviso_de_depreciacao) ou levanta LookupError.
    """
    parts = path.split(".")
    # Os avisos são acumulados por TODAS as tentativas, não só pela que deu certo.
    # Motivo: tentar importar "Bio.pairwise2.align" como módulo falha, mas já
    # carrega o pacote pai Bio.pairwise2 e dispara o aviso de depreciação dele.
    # Na tentativa seguinte o módulo já está em sys.modules e não avisa de novo,
    # então descartar os avisos da tentativa que falhou perdia a depreciação.
    warned: str | None = None
    for cut in range(len(parts), 0, -1):
        module_name = ".".join(parts[:cut])
        module = None
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            try:
                module = importlib.import_module(module_name)
            except BaseException:
                module = None
        if warned is None:
            warned = next(
                (str(w.message) for w in caught if "deprecat" in str(w.message).lower()),
                None,
            )
        if module is None:
            continue
        obj = module
        for attr in parts[cut:]:
            try:
                obj = getattr(obj, attr)
            except AttributeError as exc:
                raise LookupError(f"{path}: {exc}") from exc
        return obj, warned
    raise LookupError(f"{path}: nenhum prefixo importável")


def describe(obj) -> tuple[str, str | None, str]:
    if inspect.isclass(obj):
        kind = "class"
    elif inspect.ismodule(obj):
        kind = "module"
    elif callable(obj):
        kind = "function"
    else:
        kind = type(obj).__name__
    try:
        signature = str(inspect.signature(obj))
    except (ValueError, TypeError):
        signature = None
    doc = inspect.getdoc(obj) or ""
    first_line = next((ln.strip() for ln in doc.splitlines() if ln.strip()), "")
    return kind, signature, first_line


def deprecation_from_doc(obj) -> str | None:
    doc = inspect.getdoc(obj) or ""
    for line in doc.splitlines():
        low = line.lower()
        if "deprecated" in low or "obsolete" in low:
            return line.strip()
    return None


def build() -> tuple[dict, list[str]]:
    import Bio

    failures: list[str] = []
    tasks_out = []

    for task in TASKS:
        entries_out = []
        for entry in task["entries"]:
            path = entry["path"]
            try:
                obj, warned = resolve(path)
            except LookupError as exc:
                failures.append(str(exc))
                continue
            kind, signature, doc = describe(obj)
            entries_out.append(
                {
                    "path": path,
                    "kind": kind,
                    "signature": signature,
                    "doc": doc,
                    "deprecated": warned or deprecation_from_doc(obj),
                    "snippet": entry["snippet"],
                    "note": entry.get("note"),
                }
            )
        tasks_out.append(
            {
                "id": task["id"],
                "title": task["title"],
                "why": task["why"],
                "entries": entries_out,
            }
        )

    catalog = {
        "biopython_version": Bio.__version__,
        "python_version": sys.version.split()[0],
        "task_count": len(tasks_out),
        "entry_count": sum(len(t["entries"]) for t in tasks_out),
        "generated_by": "tools/build_catalog.py",
        "tasks": tasks_out,
    }
    return catalog, failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="valida sem gravar")
    args = parser.parse_args()

    try:
        catalog, failures = build()
    except ImportError:
        print("ERRO: Biopython não está instalado neste interpretador.", file=sys.stderr)
        print(f"       interpretador: {sys.executable}", file=sys.stderr)
        return 2

    if failures:
        print(f"FALHA: {len(failures)} caminho(s) declarado(s) não existem na instalação:", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        print("Corrija a curadoria em TASKS antes de gravar o catálogo.", file=sys.stderr)
        return 1

    deprecated = [
        e["path"]
        for t in catalog["tasks"]
        for e in t["entries"]
        if e["deprecated"]
    ]

    print(f"Biopython {catalog['biopython_version']} / Python {catalog['python_version']}")
    print(f"tarefas : {catalog['task_count']}")
    print(f"entradas: {catalog['entry_count']}  (todas resolvidas)")
    print(f"marcadas como depreciadas: {len(deprecated)}")
    for path in deprecated:
        print(f"  ! {path}")

    if args.check:
        print("\n--check: nada gravado.")
        return 0

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    print(f"\ngravado: {OUTPUT.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
