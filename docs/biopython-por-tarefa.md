# Biopython por tarefa — referência

**55 funções em 12 tarefas.** Verificado contra o **Biopython 1.87** (Python 3.12.13) instalado nesta máquina.

Organizado pelo que se quer **fazer**, não pelo módulo onde a função mora — a documentação oficial é indexada por módulo, o que só ajuda quem já sabe o nome do que procura.

> Arquivo **gerado** por `tools/build_reference.py` a partir de `data/biopython-catalog.json`. Não editar à mão: assinaturas e docstrings vêm de introspecção do pacote instalado. Para atualizar: `python tools/build_catalog.py && python tools/build_reference.py`.

## Leia isto primeiro: o que saiu do Biopython

O Biopython vem removendo e depreciando coisas rápido, e muito código na internet (e em tutorial antigo) usa API que **já não existe**. Confirmado contra a instalação 1.87:

| Você vê por aí | Situação real | Use isto |
|---|---|---|
| `Bio.SeqUtils.GC(seq)` | **removido** | `Bio.SeqUtils.gc_fraction(seq)` — devolve **fração 0–1, não %** |
| `Bio.Application.*` (wrappers de linha de comando) | **removido por inteiro** | chamar o programa via `subprocess` |
| `Bio.Alphabet` | **removido por inteiro** | não é mais necessário; `Seq` não leva alfabeto |
| `Bio.pairwise2.align.*` | depreciado (avisa ao importar) | `Bio.Align.PairwiseAligner` |
| `Bio.Align.AlignInfo.SummaryInfo` | depreciado no docstring | sem substituto direto; evitar em código novo |

A armadilha que mais pega: **`gc_fraction` devolve 0,462 onde o antigo `GC` devolvia 46,2.** Multiplique por 100 se quer porcentagem.

## Cola rápida — uma por tarefa

Se você só quer começar, é esta função por tarefa:

| Tarefa | Função | Para |
|---|---|---|
| [Ler e escrever arquivos de sequência](#ler-e-escrever-arquivos-de-sequencia) | `Bio.SeqIO.parse` | percorrer um arquivo de sequências |
| [Ler cromatograma Sanger (.ab1)](#ler-cromatograma-sanger-ab1) | `Bio.SeqIO.read` | abrir um .ab1 (formato "abi") |
| [Transformar sequência](#transformar-sequencia) | `Bio.Seq.Seq` | complemento reverso, tradução, transcrição |
| [Medir propriedades da sequência](#medir-propriedades-da-sequencia) | `Bio.SeqUtils.gc_fraction` | medir GC (fração 0–1) |
| [Alinhar duas sequências](#alinhar-duas-sequencias) | `Bio.Align.PairwiseAligner` | alinhar duas sequências |
| [Alinhamento múltiplo](#alinhamento-multiplo) | `Bio.AlignIO.read` | ler um alinhamento pronto |
| [Árvore filogenética](#arvore-filogenetica) | `Bio.Phylo.read` | ler e desenhar uma árvore |
| [Consultar bancos do NCBI](#consultar-bancos-do-ncbi) | `Bio.Entrez.efetch` | baixar registro do NCBI |
| [Rodar e ler BLAST](#rodar-e-ler-blast) | `Bio.SearchIO.read` | ler resultado de BLAST |
| [Enzimas de restrição](#enzimas-de-restricao) | `Bio.Restriction.RestrictionBatch` | onde as enzimas cortam |
| [Anotações e regiões marcadas](#anotacoes-e-regioes-marcadas) | `Bio.SeqFeature.SeqFeature` | marcar/extrair uma região |
| [Tabelas de referência](#tabelas-de-referencia) | `Bio.Data.CodonTable.unambiguous_dna_by_id` | consultar o código genético |

## Índice

- [Ler e escrever arquivos de sequência](#ler-e-escrever-arquivos-de-sequencia) — 6 funções
- [Ler cromatograma Sanger (.ab1)](#ler-cromatograma-sanger-ab1) — 3 funções
- [Transformar sequência](#transformar-sequencia) — 5 funções
- [Medir propriedades da sequência](#medir-propriedades-da-sequencia) — 9 funções
- [Alinhar duas sequências](#alinhar-duas-sequencias) — 3 funções · ⚠️ 1 depreciada
- [Alinhamento múltiplo](#alinhamento-multiplo) — 5 funções · ⚠️ 1 depreciada
- [Árvore filogenética](#arvore-filogenetica) — 7 funções
- [Consultar bancos do NCBI](#consultar-bancos-do-ncbi) — 4 funções
- [Rodar e ler BLAST](#rodar-e-ler-blast) — 5 funções
- [Enzimas de restrição](#enzimas-de-restricao) — 3 funções
- [Anotações e regiões marcadas](#anotacoes-e-regioes-marcadas) — 3 funções
- [Tabelas de referência](#tabelas-de-referencia) — 2 funções

---

## Ler e escrever arquivos de sequência

*Ponto de entrada de quase toda análise: transformar arquivo em objeto e de volta.*

### `Bio.SeqIO.parse(handle, format, alphabet=None)`

Turn a sequence file into an iterator returning SeqRecords.

**Nota:** Devolve um iterador — use para arquivos com muitos registros.

```python
from Bio import SeqIO

for registro in SeqIO.parse("entrada.fasta", "fasta"):
    print(registro.id, len(registro.seq))
```

### `Bio.SeqIO.read(handle, format, alphabet=None)`

Turn a sequence file into a single SeqRecord.

**Nota:** Levanta erro se o arquivo tiver zero ou mais de um registro. Use quando você sabe que é um só.

```python
from Bio import SeqIO

registro = SeqIO.read("entrada.fasta", "fasta")
print(registro.id, len(registro.seq))
```

### `Bio.SeqIO.write(sequences: collections.abc.Iterable[Bio.SeqRecord.SeqRecord] | Bio.SeqRecord.SeqRecord, handle: Union[IO[str], os.PathLike, str, bytes], format: str…`

<sub>assinatura cortada — a função aceita muitos parâmetros; veja a lista completa com `help()`</sub>

Write complete set of sequences to a file.

**Nota:** Devolve quantos registros foram gravados.

```python
from Bio import SeqIO

SeqIO.write(registros, "saida.fasta", "fasta")
```

### `Bio.SeqIO.convert(in_file, in_format, out_file, out_format, molecule_type=None)`

Convert between two sequence file formats, return number of records.

**Nota:** Converte formato sem você abrir os dois arquivos na mão.

```python
from Bio import SeqIO

SeqIO.convert("entrada.ab1", "abi", "saida.fastq", "fastq")
```

### `Bio.SeqIO.to_dict(sequences, key_function=None)`

Turn a sequence iterator or list into a dictionary.

**Nota:** Carrega tudo na memória. Para arquivos grandes prefira SeqIO.index.

```python
from Bio import SeqIO

indice = SeqIO.to_dict(SeqIO.parse("entrada.fasta", "fasta"))
registro = indice["ID_QUE_EU_QUERO"]
```

### `Bio.SeqIO.index(filename, format, alphabet=None, key_function=None)`

Indexes a sequence file and returns a dictionary like object.

**Nota:** Acesso por chave sem carregar o arquivo inteiro na memória.

```python
from Bio import SeqIO

indice = SeqIO.index("grande.fasta", "fasta")
registro = indice["ID_QUE_EU_QUERO"]
```

---

## Ler cromatograma Sanger (.ab1)

*O formato que sai do sequenciador do laboratório. É o insumo do EasyContig BR.*

### `Bio.SeqIO.read(handle, format, alphabet=None)`

Turn a sequence file into a single SeqRecord.

**Nota:** O formato se chama "abi". A qualidade por base vive em letter_annotations["phred_quality"].

```python
from Bio import SeqIO

registro = SeqIO.read("amostra.ab1", "abi")
print(registro.seq)
print(registro.letter_annotations["phred_quality"][:20])
```

### `Bio.SeqIO.AbiIO.AbiIterator(source, trim=False)`

Parser for Abi files.

**Nota:** Use trim=True para a versão aparada. Via SeqIO o equivalente é o formato "abi-trim".

```python
from Bio.SeqIO.AbiIO import AbiIterator

# trim=True aplica o corte de qualidade do próprio Biopython
for registro in AbiIterator("amostra.ab1", trim=True):
    print(registro.id, len(registro.seq))
```

### `Bio.SeqRecord.SeqRecord(seq: Union[ForwardRef('Seq'), ForwardRef('MutableSeq'), NoneType], id: str | None = '<unknown id>', name: str = '<unknown name>', description: str =…`

<sub>assinatura cortada — a função aceita muitos parâmetros; veja a lista completa com `help()`</sub>

A SeqRecord object holds a sequence and information about it.

**Nota:** Os traços brutos do cromatograma estão em annotations['abif_raw'] — é daqui que sai o desenho do cromatograma.

```python
from Bio.SeqIO import read

registro = read("amostra.ab1", "abi")
# os canais de fluorescência crus ficam em annotations["abif_raw"]
canais = registro.annotations["abif_raw"]
print(sorted(k for k in canais if k.startswith("DATA")))
```

---

## Transformar sequência

*Complemento reverso, transcrição e tradução — as operações que aparecem em toda aula.*

### `Bio.Seq.Seq(data: str | bytes | bytearray | Bio.Seq._SeqAbstractBaseClass | Bio.Seq.SequenceDataAbstractBaseClass | dict | None, length: int | None = None)`

Read-only sequence object (essentially a string with biological methods).

**Nota:** Objeto Seq tem os métodos embutidos — normalmente você não precisa das funções soltas.

```python
from Bio.Seq import Seq

s = Seq("ATGGCCATTGTAATG")
print(s.reverse_complement())
print(s.translate())
```

### `Bio.Seq.reverse_complement(sequence, inplace=False)`

Return the reverse complement as a DNA sequence.

**Nota:** Versão função, aceita str. Equivale ao método .reverse_complement() do Seq.

```python
from Bio.Seq import reverse_complement

print(reverse_complement("ATGGCCATTGTAATG"))
```

### `Bio.Seq.translate(sequence, table='Standard', stop_symbol='*', to_stop=False, cds=False, gap=None)`

Translate a nucleotide sequence into amino acids.

**Nota:** to_stop=True para na primeira parada. table= escolhe o código genético.

```python
from Bio.Seq import translate

print(translate("ATGGCCATTGTAATG", to_stop=True))
```

### `Bio.Seq.transcribe(dna)`

Transcribe a DNA sequence into RNA.

**Nota:** DNA para RNA (troca T por U). back_transcribe faz o contrário.

```python
from Bio.Seq import transcribe

print(transcribe("ATGGCCATTGTAATG"))
```

### `Bio.Seq.complement(sequence, inplace=False)`

Return the complement as a DNA sequence.

**Nota:** Complemento sem inverter. Para a fita oposta de verdade use reverse_complement.

```python
from Bio.Seq import complement

print(complement("ATGGCCATTGTAATG"))
```

---

## Medir propriedades da sequência

*GC, massa, temperatura de anelamento — o que se calcula antes de desenhar primer ou conferir amostra.*

### `Bio.SeqUtils.gc_fraction(seq, ambiguous='remove')`

Calculate G+C percentage in seq (float between 0 and 1).

**Nota:** ATENÇÃO: substitui a antiga Bio.SeqUtils.GC, que foi REMOVIDA. Devolve fração (0-1), não porcentagem.

```python
from Bio.SeqUtils import gc_fraction

print(gc_fraction("ATGGCCATTGTAATG"))  # fração de 0 a 1
```

### `Bio.SeqUtils.GC123(seq)`

Calculate G+C content: total, for first, second and third positions.

**Nota:** GC total e por posição do códon. A 3ª posição é a informativa em estudo de códon.

```python
from Bio.SeqUtils import GC123

total, p1, p2, p3 = GC123("ATGGCCATTGTAATG")
print(total, p3)
```

### `Bio.SeqUtils.GC_skew(seq, window=100)`

Calculate GC skew (G-C)/(G+C) for multiple windows along the sequence.

**Nota:** (G-C)/(G+C) em janelas ao longo da sequência.

```python
from Bio.SeqUtils import GC_skew

print(GC_skew("ATGGCCATTGTAATGATGGCCATTGTAATG", window=10))
```

### `Bio.SeqUtils.molecular_weight(seq, seq_type='DNA', double_stranded=False, circular=False, monoisotopic=False)`

Calculate the molecular mass of DNA, RNA or protein sequences as float.

**Nota:** seq_type aceita DNA, RNA ou protein. double_stranded=True para fita dupla.

```python
from Bio.SeqUtils import molecular_weight

print(molecular_weight("ATGGCCATTGTAATG", seq_type="DNA"))
```

### `Bio.SeqUtils.MeltingTemp.Tm_NN(seq, check=True, strict=True, c_seq=None, shift=0, nn_table=None, tmm_table=None, imm_table=None, de_table=None, dnac1=25, dnac2=25, selfcomp=False,…`

<sub>assinatura cortada — a função aceita muitos parâmetros; veja a lista completa com `help()`</sub>

Return the Tm using nearest neighbor thermodynamics.

**Nota:** Tm por vizinho mais próximo — é o método a usar para primer de verdade.

```python
from Bio.SeqUtils import MeltingTemp as mt

print(mt.Tm_NN("ATGGCCATTGTAATG"))
```

### `Bio.SeqUtils.MeltingTemp.Tm_Wallace(seq, check=True, strict=True)`

Calculate and return the Tm using the 'Wallace rule'.

**Nota:** Regra 2(AT)+4(GC). Rápida e grosseira, boa só para oligo curto.

```python
from Bio.SeqUtils import MeltingTemp as mt

print(mt.Tm_Wallace("ATGGCCATTGTAATG"))
```

### `Bio.SeqUtils.nt_search(seq, subseq)`

Search for a DNA subseq in seq, return list of [subseq, positions].

**Nota:** Aceita código IUPAC ambíguo no padrão buscado.

```python
from Bio.SeqUtils import nt_search

print(nt_search("ATGGCCATTGTAATG", "GCC"))
```

### `Bio.SeqUtils.six_frame_translations(seq, genetic_code=1)`

Return pretty string showing the 6 frame translations and GC content.

**Nota:** Texto pronto com as 6 janelas de leitura. Bom para inspeção visual rápida.

```python
from Bio.SeqUtils import six_frame_translations

print(six_frame_translations("ATGGCCATTGTAATGATGGCC"))
```

### `Bio.SeqUtils.ProtParam.ProteinAnalysis(prot_sequence, monoisotopic=False)`

Class containing methods for protein analysis.

**Nota:** Bloco de propriedades de proteína num objeto só.

```python
from Bio.SeqUtils.ProtParam import ProteinAnalysis

a = ProteinAnalysis("MAIVMGRWKGAR")
print(a.molecular_weight(), a.isoelectric_point())
```

---

## Alinhar duas sequências

*Comparar amostra com referência. É onde mais gente ainda copia código obsoleto da internet.*

### `Bio.Align.PairwiseAligner(scoring=None, **kwargs)`

Performs pairwise sequence alignment using dynamic programming.

**Nota:** É ESTE o caminho atual. Substitui Bio.pairwise2, que está depreciado.

```python
from Bio.Align import PairwiseAligner

alinhador = PairwiseAligner()
alinhador.mode = "local"
for alinhamento in alinhador.align("ATGGCCATTG", "ATGGCTATTG"):
    print(alinhamento.score)
    print(alinhamento)
```

### `Bio.Align.substitution_matrices.load(name=None)`

Load and return a precalculated substitution matrix.

**Nota:** load() sem argumento lista as matrizes disponíveis na instalação.

```python
from Bio.Align import substitution_matrices, PairwiseAligner

alinhador = PairwiseAligner()
alinhador.substitution_matrix = substitution_matrices.load("BLOSUM62")
print(substitution_matrices.load()[:8])  # nomes disponíveis
```

### `Bio.pairwise2.align`

> ⚠️ **Depreciado.** Bio.pairwise2 has been deprecated, and we intend to remove it in a future release of Biopython. As an alternative, please consider using Bio.Align.PairwiseAligner as a replacement, and contact the Biopython developers if you still need the Bio.pairwise2 module.

Provide functions that do alignments.

**Nota:** Entra no catálogo só para ser reconhecido e substituído quando aparecer em código antigo.

```python
# NÃO USE EM CÓDIGO NOVO — depreciado.
# Equivalente atual: Bio.Align.PairwiseAligner
from Bio import pairwise2

alinhamentos = pairwise2.align.globalxx("ATGGCCATTG", "ATGGCTATTG")
```

---

## Alinhamento múltiplo

*Insumo da árvore filogenética e da leitura de região conservada.*

### `Bio.AlignIO.read(handle, format, seq_count=None)`

Turn an alignment file into a single MultipleSeqAlignment object.

**Nota:** Lê um alinhamento pronto (feito por MUSCLE/MAFFT fora do Python).

```python
from Bio import AlignIO

alinhamento = AlignIO.read("alinhado.fasta", "fasta")
print(len(alinhamento), alinhamento.get_alignment_length())
```

### `Bio.AlignIO.parse(handle, format, seq_count=None)`

Iterate over an alignment file as MultipleSeqAlignment objects.

**Nota:** Para arquivo com vários alinhamentos.

```python
from Bio import AlignIO

for alinhamento in AlignIO.parse("varios.phy", "phylip"):
    print(alinhamento.get_alignment_length())
```

### `Bio.AlignIO.write(alignments, handle, format)`

Write complete set of alignments to a file.

**Nota:** Converter para phylip é o passo comum antes de programa de filogenia.

```python
from Bio import AlignIO

AlignIO.write(alinhamento, "saida.phy", "phylip")
```

### `Bio.Align.MultipleSeqAlignment(records, alphabet=None, annotations=None, column_annotations=None)`

Represents a classical multiple sequence alignment (MSA).

**Nota:** Fatiamento por coluna é o que torna esse objeto útil: alinhamento[:, i:j].

```python
from Bio.Align import MultipleSeqAlignment

alinhamento = MultipleSeqAlignment(registros)
print(alinhamento[:, 0:10])  # fatia colunas 0-9 de todas as linhas
```

### `Bio.Align.AlignInfo.SummaryInfo(alignment)`

> ⚠️ **Depreciado.** Calculate summary info about the alignment. (DEPRECATED)

Calculate summary info about the alignment.  (DEPRECATED)

**Nota:** MARCADO COMO DEPRECIADO no docstring do Biopython 1.87 — evite em código novo.

```python
from Bio.Align.AlignInfo import SummaryInfo

resumo = SummaryInfo(alinhamento)
print(resumo.dumb_consensus())
```

---

## Árvore filogenética

*Posicionar a amostra em relação às referências. No EasyContig BR isso já vem resolvido.*

### `Bio.Phylo.read(file, format, **kwargs)`

Parse a file in the given format and return a single tree.

**Nota:** Formatos comuns: "newick", "nexus", "phyloxml".

```python
from Bio import Phylo

arvore = Phylo.read("arvore.nwk", "newick")
Phylo.draw_ascii(arvore)
```

### `Bio.Phylo.draw_ascii(tree, file=None, column_width=80)`

Draw an ascii-art phylogram of the given tree.

**Nota:** Desenho em texto puro — funciona no terminal, sem matplotlib.

```python
from Bio import Phylo

Phylo.draw_ascii(arvore)
```

### `Bio.Phylo.draw(tree, label_func=<class 'str'>, do_show=True, show_confidence=True, axes=None, branch_labels=None, label_colors=None, *args, **kwargs)`

Plot the given tree using matplotlib (or pylab).

**Nota:** Precisa de matplotlib instalado. Para desenho sem dependência use draw_ascii.

```python
from Bio import Phylo

Phylo.draw(arvore)  # requer matplotlib
```

### `Bio.Phylo.write(trees, file, format, **kwargs)`

Write a sequence of trees to file in the given format.

**Nota:** Grava a árvore. Aceita uma árvore só ou uma lista delas.

```python
from Bio import Phylo

Phylo.write(arvore, "saida.nwk", "newick")
```

### `Bio.Phylo.TreeConstruction.DistanceCalculator(model='identity', skip_letters=None)`

Calculates the distance matrix from a DNA or protein sequence alignment.

**Nota:** Primeiro passo do NJ/UPGMA: matriz de distância a partir do alinhamento.

```python
from Bio.Phylo.TreeConstruction import DistanceCalculator

calc = DistanceCalculator("identity")
matriz = calc.get_distance(alinhamento)
print(matriz)
```

### `Bio.Phylo.TreeConstruction.DistanceTreeConstructor(distance_calculator=None, method='nj')`

Distance based tree constructor.

**Nota:** Aceita "nj" (neighbor joining) ou "upgma".

```python
from Bio.Phylo.TreeConstruction import DistanceCalculator, DistanceTreeConstructor

construtor = DistanceTreeConstructor(DistanceCalculator("identity"), "nj")
arvore = construtor.build_tree(alinhamento)
```

### `Bio.Phylo.Consensus.majority_consensus(trees, cutoff=0)`

Search majority rule consensus tree from multiple trees.

**Nota:** Árvore de consenso a partir de várias réplicas.

```python
from Bio.Phylo.Consensus import majority_consensus

consenso = majority_consensus(arvores, cutoff=0.5)
```

---

## Consultar bancos do NCBI

*Baixar referência sem sair do editor. Exige rede e e-mail declarado.*

### `Bio.Entrez.esearch(db, term, **keywds)`

Run an Entrez search and return a handle to the results.

**Nota:** Entrez.email é obrigatório — sem ele o NCBI pode bloquear o IP.

```python
from Bio import Entrez

Entrez.email = "seu@email.com"  # obrigatório pelo NCBI
handle = Entrez.esearch(db="nucleotide", term="Trypanosoma vivax 18S", retmax=10)
resultado = Entrez.read(handle)
print(resultado["IdList"])
```

### `Bio.Entrez.efetch(db, **keywords)`

Fetch Entrez results which are returned as a handle.

**Nota:** Combine com SeqIO.read para virar SeqRecord direto.

```python
from Bio import Entrez, SeqIO

Entrez.email = "seu@email.com"
handle = Entrez.efetch(db="nucleotide", id="NC_000913.3", rettype="gb", retmode="text")
registro = SeqIO.read(handle, "genbank")
```

### `Bio.Entrez.read(source, validate=True, escape=False, ignore_errors=False)`

Parse an XML file from the NCBI Entrez Utilities into python objects.

**Nota:** Converte o XML do Entrez em dict/list do Python.

```python
from Bio import Entrez

resultado = Entrez.read(handle)
```

### `Bio.Entrez.esummary(**keywds)`

Retrieve document summaries as a results handle.

**Nota:** Devolve só o resumo (título, tamanho, organismo) sem baixar a sequência — bom para conferir um hit antes de puxar o registro inteiro.

```python
from Bio import Entrez

Entrez.email = "seu@email.com"
resumo = Entrez.read(Entrez.esummary(db="nucleotide", id="NC_000913.3"))
```

---

## Rodar e ler BLAST

*Identificar de que organismo é a sequência. O EasyContig BR já embute esse passo.*

### `Bio.Blast.qblast(program, database, sequence, url_base='https://blast.ncbi.nlm.nih.gov/Blast.cgi', auto_format=None, composition_based_statistics=None, db_genetic_co…`

<sub>assinatura cortada — a função aceita muitos parâmetros; veja a lista completa com `help()`</sub>

BLAST search using NCBI's QBLAST server.

**Nota:** Roda no servidor do NCBI — lento e sujeito a fila. Para lote, use BLAST local.

```python
from Bio import Blast

Blast.email = "seu@email.com"
resultado = Blast.qblast("blastn", "nt", sequencia)
```

### `Bio.Blast.parse(source)`

Parse an XML file containing BLAST output and return a Bio.Blast.Records object.

**Nota:** Interface nova (Bio.Blast). Abra o XML em modo binário.

```python
from Bio import Blast

with open("resultado.xml", "rb") as fh:
    for registro in Blast.parse(fh):
        for hit in registro:
            print(hit.target.id)
```

### `Bio.Blast.read(source)`

Parse an XML file containing BLAST output for a single query and return it.

**Nota:** Para XML com uma única query.

```python
from Bio import Blast

with open("resultado.xml", "rb") as fh:
    registro = Blast.read(fh)
```

### `Bio.SearchIO.read(handle, format=None, **kwargs)`

Turn a search output file containing one query into a single QueryResult.

**Nota:** SearchIO é a interface genérica — serve para BLAST, HMMER, BLAT etc.

```python
from Bio import SearchIO

resultado = SearchIO.read("resultado.xml", "blast-xml")
for hit in resultado:
    print(hit.id, hit.hsps[0].evalue)
```

### `Bio.Blast.NCBIWWW.qblast(program, database, sequence, url_base='https://blast.ncbi.nlm.nih.gov/Blast.cgi', auto_format=None, composition_based_statistics=None, db_genetic_co…`

<sub>assinatura cortada — a função aceita muitos parâmetros; veja a lista completa com `help()`</sub>

BLAST search using NCBI's QBLAST server.

**Nota:** Docstring avisa que parâmetros mudaram. Prefira Bio.Blast.qblast em código novo.

```python
# caminho antigo, ainda funciona
from Bio.Blast import NCBIWWW

handle = NCBIWWW.qblast("blastn", "nt", sequencia)
```

---

## Enzimas de restrição

*Planejar digestão e conferir sítio em construção de plasmídeo.*

### `Bio.Restriction.EcoRI(name='', bases=(), dct=None)`

Implement methods for enzymes with palindromic recognition sites.

**Nota:** Cada enzima é um objeto próprio importável pelo nome. São mais de mil no módulo.

```python
from Bio.Restriction import EcoRI
from Bio.Seq import Seq

print(EcoRI.site)
print(EcoRI.search(Seq("GAATTCGGGGAATTC")))
```

### `Bio.Restriction.RestrictionBatch(first=(), suppliers=())`

Class for operations on more than one enzyme.

**Nota:** Para testar várias enzimas de uma vez.

```python
from Bio.Restriction import RestrictionBatch

lote = RestrictionBatch(["EcoRI", "BamHI", "HindIII"])
print(lote.search(sequencia))
```

### `Bio.Restriction.Analysis(restrictionbatch=RestrictionBatch([]), sequence=Seq(''), linear=True)`

Provide methods for enhanced analysis and pretty printing.

**Nota:** print_that() imprime tabela formatada. linear=False para plasmídeo circular.

```python
from Bio.Restriction import Analysis, RestrictionBatch

analise = Analysis(RestrictionBatch(["EcoRI", "BamHI"]), sequencia, linear=True)
analise.print_that()
```

---

## Anotações e regiões marcadas

*Ler features de GenBank e marcar região própria numa sequência.*

### `Bio.SeqFeature.SeqFeature(location=None, type='', id='<unknown id>', qualifiers=None, sub_features=None)`

Represent a Sequence Feature on an object.

**Nota:** extract() já devolve o trecho na orientação certa da fita.

```python
from Bio.SeqFeature import SeqFeature, SimpleLocation

f = SeqFeature(SimpleLocation(5, 20, strand=1), type="CDS")
print(f.extract(registro.seq))
```

### `Bio.SeqFeature.SimpleLocation(start, end, strand=None, ref=None, ref_db=None)`

Specify the location of a feature along a sequence.

**Nota:** Substitui o antigo nome FeatureLocation. Coordenadas em base 0, fim exclusivo.

```python
from Bio.SeqFeature import SimpleLocation

local = SimpleLocation(5, 20, strand=-1)
```

### `Bio.SeqFeature.CompoundLocation(parts, operator='join')`

For handling joins etc where a feature location has several parts.

**Nota:** Para gene com éxons separados (join no GenBank).

```python
from Bio.SeqFeature import CompoundLocation, SimpleLocation

local = CompoundLocation([SimpleLocation(0, 10), SimpleLocation(20, 30)])
```

---

## Tabelas de referência

*Código genético e códigos IUPAC sem procurar na internet.*

### `Bio.Data.CodonTable.unambiguous_dna_by_id`

dict() -> new empty dictionary

**Nota:** id=1 é o código padrão; 2 é mitocondrial de vertebrado; 4 é o de tripanossomatídeo/micoplasma.

```python
from Bio.Data import CodonTable

tabela = CodonTable.unambiguous_dna_by_id[1]  # 1 = padrão
print(tabela.stop_codons)
print(tabela.forward_table["ATG"])
```

### `Bio.Data.IUPACData.ambiguous_dna_values`

dict() -> new empty dictionary

**Nota:** O que cada letra ambígua representa. Útil ao ler chamada de base de Sanger.

```python
from Bio.Data import IUPACData

print(IUPACData.ambiguous_dna_values["N"])
print(IUPACData.ambiguous_dna_values["R"])
```

---

## Como isto foi levantado

A instalação do Biopython 1.87 expõe **1907 símbolos públicos em 221 módulos**. Esta referência é uma curadoria de 55 deles, escolhidos pelo que aparece no trabalho de bancada (Sanger, 16S/18S, filogenia, identificação).

Nenhum nome aqui foi escrito de memória. O gerador do catálogo resolve cada caminho declarado contra o pacote instalado e **falha em vez de gravar** se algo não existir — foi assim que se confirmou que `Bio.SeqUtils.GC` e `Bio.Application` sumiram. Um segundo script (`tools/check_snippets.py`) **executa** os trechos: 22 rodam de ponta a ponta, os demais pedem arquivo de exemplo ou objeto de contexto, e os 6 que fariam requisição ao NCBI nunca são executados.
