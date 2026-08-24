#* Terceiro ato do §12 passo 6 do PADRAO: todo simbolo exportado e todo canal de IPC
#* SEM CHAMADOR no repositorio, nome a nome — a varredura do que NINGUEM moveu.
#? INSTRUMENTO VERSIONADO — Decisao sobre por que ele saiu do scratchpad 24/08/2026
#!
#! 1. Ate hoje este instrumento nao existia no repositorio. Ele foi reconstruido do zero em
#!    QUATRO corridas seguidas, no scratchpad de quem o rodava, e a cada corrida redescobriu
#!    os mesmos defeitos. O controle compensatorio que a arvore A12 invocava — "o ato 3 pega
#!    o que o portao nao pega" — dependia, na pratica, de uma ferramenta que so existia na
#!    memoria de quem tinha rodado da ultima vez. E' o mesmo defeito da receita do PNG, que
#!    o cabecalho de `gera-fluxo.py` acabou de consertar pelo mesmo motivo.
#! 2. Como rodar, a partir da raiz do repositorio:
#!
#!      npm run orfaos                        # a arvore de trabalho de hoje
#!      python3 ferramentas/varre-orfaos.py   # identico, sem passar pelo npm
#!      python3 ferramentas/varre-orfaos.py --ref ada7bfa    # uma arvore antiga, por git
#!      python3 ferramentas/varre-orfaos.py --raiz /caminho  # outra copia do projeto
#!
#! 3. ⚠️ ELE NAO E' PERNA DE PORTAO, E ISSO E' DECISAO, NAO ESQUECIMENTO. Orfao transitorio
#!    entre fatias e' estado legitimo: uma peca extraida antes de o chamador ser religado fica
#!    orfa por um commit, e travar nisso daria vermelho falso justamente na hora em que a
#!    refatoracao esta no meio. O lugar dele e' o FECHAMENTO da corrida (§12 passo 6), onde a
#!    pergunta e' "o que ficou parado", nao "esta fatia quebrou algo".
#!    Consequencia direta no codigo de saida: achar orfao NAO e' erro (sai 0). O unico exit
#!    diferente de zero e' 2, quando a AUTO-VALIDACAO abaixo reprova — porque instrumento que
#!    nao se prova nao tem o direito de imprimir veredito.
#!
#? AS QUATRO ARMADILHAS QUE ESTE ARQUIVO EXISTE PARA NAO REPETIR 24/08/2026
#!
#! Estao aqui porque cada uma ja custou uma medicao errada, e uma delas custou DUAS: a quarta
#! estava escrita no diario do projeto, com o nome do arquivo, e foi reproduzida assim mesmo.
#! LER O REGISTRO NAO IMPEDIU A REPETICAO. Por isso elas nao ficam so escritas: cada uma virou
#! um caso do `corpo de prova` la embaixo, que roda ANTES de qualquer relatorio. Licao que so
#! mora em prosa depende de alguem reler; licao que roda cobra sozinha.
#!
#! A1. `\b` NAO CASA `$`. `$` nao e' caractere de palavra, entao `\b$\b` nunca casa e todo
#!     simbolo chamado `$` saia como orfao. A fronteira certa e' `(?<![\w$]) … (?![\w$])`.
#! A2. O NAMESPACE NAO E' O METODO. Procurando de tras para frente na porta, `shell: {` casa
#!     antes de `pasta:` — e o instrumento cobrava `api.shell()` em vez de `api.shell.pasta()`,
#!     declarando 10 canais orfaos que tinham chamador.
#! A3. PARAMETRO TIPADO PARECE DEFINICAO. Em
#!       `ler: (arquivo: string): Promise<string> => ipcRenderer.invoke("arquivo:ler", …)`
#!     o ultimo `\w+:` antes do canal e' `arquivo`, que e' o PARAMETRO. Sem ancorar a
#!     propriedade em INICIO DE LINHA, 19 canais sairam com o nome errado.
#! A4. NOME DE METODO E' GENERICO; `grupo.metodo` NAO E'. Procurar `parar\s*\(` solto deu falso
#!     negativo em `neovim:parar`, porque `this.parar()` existe quatro vezes no reprodutor de
#!     papel de parede, em `codigos/design/`. O caminho do objeto e' obrigatorio.
#!
#? TRES ARMADILHAS DE CORPUS — as duas primeiras a cabeca mandou tratar ao versionar,
#?   e a terceira foi defeito MEU, nascido nesta mesma fatia e pego medindo 24/08/2026
#!
#! C1. MENCAO NAO E' CHAMADOR. A primeira versao deste instrumento varria `.md` junto com
#!     `.ts`, entao uma linha de prosa no tracker escondia qualquer orfao ja registrado — o
#!     documento que EXISTE para anotar o orfao era o que o apagava do relatorio. Chamador mora
#!     em CODIGO. Prosa e' outra coluna, e ela informa o CONTRARIO: orfao citado em doc e'
#!     orfao conhecido, nao orfao usado.
#! C2. A PROPRIA FERRAMENTA NAO E' CHAMADOR. Aquela mesma versao foi copiada para dentro da
#!     arvore que varria, e o comentario dela citava `lerDoTwinny` — uma funcao orfa capaz de
#!     ler uma `apiKey`. O medidor se apagou do proprio relatorio, e o orfao mais grave da
#!     corrida so apareceu porque uma auditoria de fora cobrou.
#!     ⚠️ ESTE ARQUIVO MORA DENTRO DA ARVORE QUE ELE VARRE, e `.py` entra no corpus de codigo
#!     (`gera-fluxo.py` esta ao lado e poderia, em tese, chamar alguem). Entao a exclusao
#!     abaixo e' A UNICA COISA que separa este instrumento da versao que se enganava sozinha.
#!     Ela e' por caminho absoluto de `__file__`, que e' exatamente o caso historico: a copia
#!     rodava de dentro, e `__file__` era a copia.
#!     E ela nao fica so escrita — o corpo de prova a DERRUBA de proposito e exige que o orfao
#!     suma, porque guarda que nao foi vista falhar e' enfeite (§12·2).
#! C3. O QUE O `.gitignore` MANDA IGNORAR NAO E' DO PROJETO. A primeira versao deste arquivo,
#!     escrita hoje, andava o disco com `rglob` e varria `CLAUDE-SECURITY-20260802-193112/` —
#!     pasta ignorada, que so existe na maquina do autor. A coluna de prosa caiu de 6 para 5
#!     arquivos ao consertar. O grave nao era esse: um dia alguem ignora uma pasta DENTRO de
#!     `ferramentas/` ou `tests/`, e o lixo local passa a contar como chamador — a resposta do
#!     instrumento mudaria com o que sobrou no disco de quem o roda. A guarda esta em `nomes()`.
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

EU = Path(__file__).resolve()

#! O CORPUS, declarado em um lugar so, porque foi a sua definicao implicita que produziu C1.
#! DEFINICOES so em `codigos/`: orfao de produto e' o que interessa. Funcao de ferramenta ou
#!   de teste sem uso e' outra conversa, e mistura-las esconderia a primeira na segunda.
#! CHAMADORES em tudo que EXECUTA — inclusive `tests/` e `ferramentas/`. Um simbolo que so o
#!   teste usa NAO e' orfao (tem chamador), mas tambem nao e' codigo vivo de produto: ele sai
#!   em coluna propria, porque as duas leituras sao decisao da cabeca, nao minha.
DEFINICOES = "codigos"
CHAMADORES = ("codigos", "tests", "ferramentas")
AVULSOS = ("electron.vite.config.ts",)
EXT_CODIGO = (".ts", ".mjs", ".js", ".cjs", ".py", ".html")
EXT_PROSA = (".md",)
IGNORA = {"node_modules", "out", ".git", "__pycache__"}

#! Especifico do Terminus, e por isso declarado no topo: quem EXPOE canal e' o preload
#!   (`codigos/porta/`), e quem CHAMA e' a tela (`codigos/interface/` e `codigos/design/`).
E_PORTA = "codigos/porta"
E_TELA = ("codigos/interface", "codigos/design")

DEF = re.compile(
    r"^\s*export\s+(?:default\s+)?(?:async\s+)?"
    r"(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)",
    re.M,
)


def eh_definicao(linha, nome):
    #! A1 mora aqui tambem: `re.escape` protege o `$`, e a ancora de inicio de linha e' o que
    #!   impede A3 — `(raiz: string)` no meio da linha nunca e' definicao.
    return re.search(
        r"^\s*export\s+(?:default\s+)?(?:async\s+)?"
        r"(?:function|const|let|var|class|interface|type|enum)\s+" + re.escape(nome) + r"(?![\w$])",
        linha,
    )


def padrao(nome):
    #! A1: fronteira que inclui `$` dos dois lados, em vez de `\b`.
    return re.compile(r"(?<![\w$])" + re.escape(nome) + r"(?![\w$])")


def sem_comentario(texto, sufixo):
    #! ⚠️ A LINHA VEM ANTES DO BLOCO, e a ordem foi medida: o sigilo da casa (§3) e' `//*`, que
    #!   CONTEM `/*`. Tirando bloco primeiro, o regex casa de dentro de `//*` ate o primeiro
    #!   `*/` e come o arquivo — 1320 de 1551 caracteres sumiram numa medicao, e simbolos
    #!   USADOS viraram orfaos. Como o autor nao usa comentario inline (§4.3·R1, medido 0%),
    #!   apagar a LINHA inteira que comeca com o sigilo e' exato — e ainda evita quebrar
    #!   `https://` dentro de string.
    #! As linhas viram VAZIAS em vez de sumir: o relatorio cita `arquivo:linha`, e deletar
    #!   linha desalinharia todo numero depois do primeiro comentario.
    abre = "#" if sufixo == ".py" else "//"
    linhas = ["" if l.lstrip().startswith(abre) else l for l in texto.split("\n")]
    texto = "\n".join(linhas)
    vazio = lambda m: "\n" * m.group(0).count("\n")
    texto = re.sub(r"/\*.*?\*/", vazio, texto, flags=re.S)
    texto = re.sub(r"<!--.*?-->", vazio, texto, flags=re.S)
    return texto


class Arvore:
    #! Duas fontes possiveis para o mesmo trabalho: o disco (a arvore de hoje) ou um commit
    #!   (`--ref`). A segunda existe porque validar contra resposta conhecida exigiu rodar
    #!   sobre uma arvore antiga onde os orfaos ja estavam contados.
    def __init__(self, raiz, ref=None):
        self.raiz, self.ref = Path(raiz).resolve(), ref

    def nomes(self):
        if self.ref:
            saida = subprocess.run(
                ["git", "-C", str(self.raiz), "ls-tree", "-r", "--name-only", self.ref],
                capture_output=True, text=True,
            ).stdout.split("\n")
            return [n for n in saida if n]
        #! ⚠️ C3 — O QUE O `.gitignore` MANDA IGNORAR NÃO ENTRA, e isto foi defeito MEDIDO na
        #!   primeira versão deste arquivo: um `rglob` puro varria
        #!   `CLAUDE-SECURITY-20260802-193112/`, pasta que o `.gitignore` exclui e que só
        #!   existe nesta máquina. O relatório passava a depender de lixo local — noutra
        #!   máquina, ou num clone limpo, o mesmo commit daria outro número. Instrumento cuja
        #!   resposta muda com o que sobrou no disco não é instrumento.
        #! `--cached --others --exclude-standard` = rastreado + novo-ainda-não-adicionado,
        #!   e SEM o ignorado. É "o que é do projeto", que é a pergunta certa: um módulo
        #!   recém-criado e ainda não commitado precisa entrar; um relatório ignorado, não.
        #! ⚠️ A RAIZ TEM DE SER A RAIZ DO REPOSITORIO, e nao basta o `git` responder: se alguem
        #!   apontar `--raiz` para uma pasta QUALQUER dentro de outro repositorio, o `ls-files`
        #!   responde com sucesso e devolve a lista do repositorio errado. Comparar o
        #!   `--show-toplevel` com a raiz pedida e' o que separa "e' um repo" de "e' ESTE repo".
        topo = subprocess.run(["git", "-C", str(self.raiz), "rev-parse", "--show-toplevel"],
                              capture_output=True, text=True)
        if topo.returncode == 0 and Path(topo.stdout.strip()).resolve() == self.raiz:
            achou = subprocess.run(
                ["git", "-C", str(self.raiz), "ls-files", "--cached", "--others", "--exclude-standard"],
                capture_output=True, text=True,
            )
            return [n for n in achou.stdout.split("\n") if n and (self.raiz / n).is_file()]
        #! Fora de um repositório (uma cópia extraída por `git archive`, por exemplo) não há
        #!   `.gitignore` a respeitar e a varredura é o disco inteiro — declarado, não calado.
        fora = []
        for p in self.raiz.rglob("*"):
            if not p.is_file():
                continue
            if IGNORA & set(p.relative_to(self.raiz).parts):
                continue
            fora.append(str(p.relative_to(self.raiz)))
        return fora

    def texto(self, nome):
        if self.ref:
            return subprocess.run(
                ["git", "-C", str(self.raiz), "show", f"{self.ref}:{nome}"],
                capture_output=True, text=True,
            ).stdout
        return (self.raiz / nome).read_text(encoding="utf-8", errors="replace")

    def eu_mesmo(self, nome):
        #! C2: a exclusao. Por caminho absoluto, que e' o caso historico — a copia rodava de
        #!   dentro da arvore, e `__file__` era a copia.
        if self.ref:
            return False
        try:
            return (self.raiz / nome).resolve() == EU
        except OSError:
            return False


def varre(arvore, prosa_conta_como_codigo=False, excluir_a_si=True):
    #! Os dois parametros existem para o corpo de prova poder DERRUBAR C1 e C2 e exigir que o
    #!   orfao suma. Fora do corpo de prova ninguem os liga — e o `main` nem os expoe.
    nomes = arvore.nomes()
    dentro = lambda n, base: n == base or n.startswith(base + "/")

    codigo, prosa = {}, {}
    for n in nomes:
        if excluir_a_si and arvore.eu_mesmo(n):
            continue
        sufixo = "." + n.rsplit(".", 1)[-1] if "." in n else ""
        no_corpus = any(dentro(n, b) for b in CHAMADORES) or n in AVULSOS
        if sufixo in EXT_CODIGO and no_corpus:
            codigo[n] = sem_comentario(arvore.texto(n), sufixo).split("\n")
        elif sufixo in EXT_PROSA:
            alvo = codigo if prosa_conta_como_codigo else prosa
            alvo[n] = arvore.texto(n).split("\n")

    exportados = {}
    for n, linhas in codigo.items():
        if not (dentro(n, DEFINICOES) and n.endswith(".ts")):
            continue
        for nome in DEF.findall("\n".join(linhas)):
            exportados[nome] = n

    orfaos, so_em_teste, so_em_casa = [], [], []
    for nome, dono in sorted(exportados.items()):
        pad = padrao(nome)
        fora, casa = [], []
        for n, linhas in codigo.items():
            for i, l in enumerate(linhas, 1):
                if not pad.search(l):
                    continue
                if n == dono and eh_definicao(l, nome):
                    continue
                (casa if n == dono else fora).append(f"{n}:{i}")
        doc = [f"{n}:{i}" for n, linhas in prosa.items()
               for i, l in enumerate(linhas, 1) if pad.search(l)]
        produto = [u for u in fora if dentro(u.rsplit(":", 1)[0], DEFINICOES)]
        if produto:
            continue
        if fora:
            so_em_teste.append((nome, dono, fora, doc))
        elif casa:
            so_em_casa.append((nome, dono, casa, doc))
        else:
            orfaos.append((nome, dono, [], doc))

    #! A coluna de canal le so a porta e a tela — alargar o corpus nao a toca, de proposito:
    #!   um canal "chamado" por um teste continua sem chamador NA TELA, que e' a pergunta.
    junta = lambda bases: "\n".join(
        "\n".join(l) for n, l in codigo.items() if any(dentro(n, b) for b in bases)
    )
    txt_porta, txt_tela = junta((E_PORTA,)), junta(E_TELA)
    canais = {}
    for n, linhas in codigo.items():
        if not dentro(n, DEFINICOES):
            continue
        for m in re.finditer(r"ipcMain\.(?:handle|on)\(\s*[\"']([^\"']+)[\"']", "\n".join(linhas)):
            canais[m.group(1)] = n

    nao_expostos, sem_chamador = [], []
    for canal, dono in sorted(canais.items()):
        m = re.search(rf"ipcRenderer\.(?:invoke|send)\(\s*[\"']{re.escape(canal)}[\"']", txt_porta)
        if not m:
            nao_expostos.append((canal, dono))
            continue
        #! A2 e A3: POSICIONAL, caminhando para tras do canal ate a propriedade e ate o grupo
        #!   que a contem, com a propriedade ANCORADA EM INICIO DE LINHA. Quase toda definicao
        #!   da porta quebra em varias linhas, entao um scanner linha a linha nao serve.
        antes = txt_porta[: m.start()]
        props = re.findall(r"\n\s*([A-Za-z_$][\w$]*)\s*:", antes)
        grupos = re.findall(r"\n\s*([A-Za-z_$][\w$]*)\s*:\s*\{", antes)
        if not props:
            sem_chamador.append((canal, "exposto, mas nao achei o nome do metodo"))
            continue
        metodo, grupo = props[-1], (grupos[-1] if grupos else "")
        #! A4: o caminho do objeto e' obrigatorio. `parar(` solto casaria `this.parar()`.
        alvos = [rf"terminus\s*\.\s*{re.escape(metodo)}\s*\(", rf"(?<![\w$])api\s*\.\s*{re.escape(metodo)}\s*\("]
        if grupo and grupo != metodo:
            alvos.append(rf"(?<![\w$]){re.escape(grupo)}\s*\.\s*{re.escape(metodo)}\s*\(")
        if not any(re.search(a, txt_tela) for a in alvos):
            onde = f"{grupo}.{metodo}()" if grupo and grupo != metodo else f"{metodo}()"
            sem_chamador.append((canal, f"exposto como {onde} e ninguem chama"))

    return {
        "arquivos": len(codigo), "prosa": len(prosa),
        "exportados": len(exportados), "canais": len(canais),
        "orfaos": orfaos, "so_em_teste": so_em_teste, "so_em_casa": so_em_casa,
        "nao_expostos": nao_expostos, "sem_chamador": sem_chamador,
    }


#? O CORPO DE PROVA — a licao que roda, em vez da licao que espera ser relida 24/08/2026
#!
#! 1. As seis armadilhas acima (A1–A4, C1, C2) foram descobertas UMA a UMA, cada uma depois de
#!    um numero errado ja ter sido escrito num relatorio. A quarta ja estava no diario do
#!    projeto, com o nome do arquivo, e foi repetida mesmo assim.
#! 2. Entao elas nao ficam so no cabecalho: cada uma e' um caso desta arvore de mentira, com a
#!    resposta escrita ao lado, e a varredura roda sobre ela ANTES de olhar o projeto. Se um
#!    numero nao bate, o instrumento sai com 2 e NAO imprime relatorio nenhum.
#! 3. As tres ultimas asserts sao SABOTAGENS: derrubam C1, C2 e C3 de proposito e exigem que o
#!    orfao desapareca. Guarda que ninguem viu falhar e' enfeite (§12·2) — e foi assim, com o
#!    orfao sumindo, que as duas armadilhas de corpus se manifestaram em campo.
PROVA = {
    #! Este arquivo carrega DOIS casos de uma vez, e o segundo e' silencioso: o cabecalho usa o
    #!   sigilo `//*`, que contem `/*`, e o arquivo TERMINA num bloco que fecha. Se alguem
    #!   inverter a ordem de `sem_comentario` e tirar bloco antes de linha, o regex come daqui
    #!   ate o `*/` la embaixo, os quatro `export` somem, e a coluna de orfaos fica vazia.
    "codigos/dominio/util.ts": (
        '//* A1: `$` e simbolo de verdade, e `\\b` nao o alcanca.\n'
        'export const $ = (s: string): string => s.trim();\n'
        'export function usada(): string { return $("x"); }\n'
        'export function soEmCasa(): number { return 1; }\n'
        'export function orfa(): number { return soEmCasa(); }\n'
        '/* Bloco de verdade, e ele FECHA: e o fechamento que torna a inversao destrutiva. */\n'
    ),
    "codigos/interface/tela.ts": (
        'import { $, usada } from "../dominio/util.ts";\n'
        'declare const api: any;\n'
        'export function desenhar(): void {\n'
        '  $(usada());\n'
        '  api.ler("x");\n'
        '  api.shell.pasta();\n'
        '}\n'
        '//! A4: `this.parar()` existe aqui e NAO e chamador de `neovim.parar()`.\n'
        'export class Papel { parar(): void {} ; fim(): void { this.parar(); } }\n'
    ),
    "codigos/porta/ponte.ts": (
        'const ipcRenderer: any = {};\n'
        'export const api = {\n'
        '  //! A3: `arquivo` e PARAMETRO; o metodo e `ler`, e a tela chama `api.ler(…)`.\n'
        '  //!   Sem a ancora de inicio de linha o instrumento cobra `api.arquivo(…)`,\n'
        '  //!   nao acha, e declara orfao um canal que tem chamador.\n'
        '  ler: (arquivo: string): Promise<string> =>\n'
        '    ipcRenderer.invoke("arquivo:ler", arquivo),\n'
        '  gravar: (arquivo: string, texto: string): Promise<void> =>\n'
        '    ipcRenderer.invoke("arquivo:gravar", arquivo, texto),\n'
        '  //! A2: `shell` e o GRUPO, `pasta` e o metodo.\n'
        '  shell: {\n'
        '    pasta: (): Promise<string> => ipcRenderer.invoke("shell:pasta"),\n'
        '  },\n'
        '  neovim: {\n'
        '    parar: (): Promise<void> => ipcRenderer.invoke("neovim:parar"),\n'
        '  },\n'
        '};\n'
    ),
    "codigos/sistema/ponte/registra.ts": (
        'const ipcMain: any = {};\n'
        'export function registrar(): void {\n'
        '  ipcMain.handle("arquivo:ler", () => "");\n'
        '  ipcMain.handle("arquivo:gravar", () => {});\n'
        '  ipcMain.handle("shell:pasta", () => "");\n'
        '  ipcMain.handle("neovim:parar", () => {});\n'
        '}\n'
    ),
    #! Entrada de verdade, para `desenhar`, `Papel` e `registrar` NAO cairem como orfaos: um
    #!   corpo de prova em que quase tudo e' orfao nao prova que a coluna sabe distinguir.
    "codigos/sistema/janela/partida.ts": (
        'import { registrar } from "../ponte/registra.ts";\n'
        'import { desenhar, Papel } from "../../interface/tela.ts";\n'
        'registrar();\n'
        'desenhar();\n'
        'new Papel().fim();\n'
    ),
    "tests/util.test.ts": (
        'import { soUsadoEmTeste } from "../codigos/dominio/apoio.ts";\n'
        'soUsadoEmTeste();\n'
    ),
    "codigos/dominio/apoio.ts": 'export function soUsadoEmTeste(): number { return 2; }\n',
    "docs/nota.md": (
        "C1: esta linha de prosa cita `orfa` e NAO pode escondê-la do relatório.\n"
    ),
    "ferramentas/copia-de-mim.py": (
        "#! C2: uma copia deste instrumento, morando dentro da arvore que varre, citando\n"
        "#!   `orfa` no proprio comentario — foi assim que `lerDoTwinny` sumiu do relatorio.\n"
        "#! ⚠️ A mencao aqui esta em CODIGO, e nao em comentario, de proposito: `sem_comentario`\n"
        "#!   ja apaga a linha de comentario, entao um caso so-de-comentario passaria sozinho e\n"
        "#!   nao provaria a exclusao. O risco vivo e' este — o corpo de prova LA EM CIMA carrega\n"
        "#!   nomes de simbolo em literais de texto, e sem a exclusao eles contam como chamador.\n"
        "TEXTO = 'orfa'\n"
    ),
    #! C3: o corpo de prova vira um repositório de mentira só para este caso. O arquivo abaixo
    #!   é IGNORADO pelo `.gitignore` ao lado, cita `orfa` em CÓDIGO, e mora DENTRO de uma das
    #!   pastas de chamadores. Se a varredura voltar a ler o disco cru em vez de perguntar ao
    #!   `git`, ele conta como chamador e o órfão some.
    #! ⚠️ A PRIMEIRA VERSÃO DESTE CASO NÃO MORDIA, e o erro é instrutivo: pus o ignorado em
    #!   `relatorio-local/`, na raiz. Como o corpus de chamadores é restrito a `codigos/`,
    #!   `tests/` e `ferramentas/`, ele nunca entraria — o caso passava com ou sem a guarda.
    #!   O que o `CLAUDE-SECURITY-*` desta máquina realmente contaminava era só a coluna de
    #!   PROSA, que é varrida no repositório inteiro. O risco grave é este aqui: ignorado
    #!   DENTRO de pasta de chamador.
    ".gitignore": "ferramentas/sobras-locais/\n",
    "ferramentas/sobras-locais/relatorio.py": "SOBROU = 'orfa'\n",
}
ESPERADO = {"orfaos": ["orfa"], "so_em_teste": ["soUsadoEmTeste"], "so_em_casa": ["soEmCasa"],
            "sem_chamador": ["arquivo:gravar", "neovim:parar"], "nao_expostos": []}


def prove_se():
    falhas = []
    with tempfile.TemporaryDirectory(prefix="varre-orfaos-prova-") as tmp:
        for nome, corpo in PROVA.items():
            alvo = Path(tmp) / nome
            alvo.parent.mkdir(parents=True, exist_ok=True)
            alvo.write_text(corpo, encoding="utf-8")
        #! Repositório de mentira, só para o `.gitignore` do caso C3 ter quem o obedeça.
        #!   `git init` basta — `--others --exclude-standard` funciona sem nenhum commit, e
        #!   commitar exigiria identidade configurada na máquina de quem roda.
        semGit = subprocess.run(["git", "-C", tmp, "init", "-q"], capture_output=True).returncode != 0
        #! A copia-de-mim precisa ser tratada como "eu" para o caso C2 ter sentido: no projeto
        #!   real quem se exclui e' `__file__`, aqui e' o arquivo que faz o papel dele.
        global EU
        guardado, EU = EU, (Path(tmp) / "ferramentas/copia-de-mim.py").resolve()
        try:
            r = varre(Arvore(tmp))
            for chave, esperado in ESPERADO.items():
                obtido = sorted(x[0] for x in r[chave])
                if obtido != sorted(esperado):
                    falhas.append(f"{chave}: esperado {sorted(esperado)}, obtido {obtido}")
            sabotagens = [
                ("C2 — sem excluir a propria ferramenta, o orfao tem de SUMIR",
                 varre(Arvore(tmp), excluir_a_si=False)),
                ("C1 — contando prosa como codigo, o orfao tem de SUMIR",
                 varre(Arvore(tmp), prosa_conta_como_codigo=True)),
            ]
            for rotulo, r2 in sabotagens:
                if [x[0] for x in r2["orfaos"]] == ["orfa"]:
                    falhas.append(f"{rotulo} — e ele NAO sumiu: a guarda nao esta segurando nada")
            #! C3 nao tem interruptor no `varre`: a guarda dele e' PERGUNTAR AO GIT em vez de
            #!   ler o disco. Entao a sabotagem e' tirar o `.git` — o codigo cai no ramo de
            #!   fallback, que e' literalmente o disco cru, e o ignorado volta a contar.
            if semGit:
                falhas.append("C3 — `git init` falhou no corpo de prova; o caso nao foi exercido")
            else:
                shutil.rmtree(Path(tmp) / ".git")
                if [x[0] for x in varre(Arvore(tmp))["orfaos"]] == ["orfa"]:
                    falhas.append("C3 — sem `git`, o arquivo IGNORADO tem de voltar a esconder "
                                  "o orfao — e ele nao escondeu: a guarda nao esta segurando nada")
        finally:
            EU = guardado
    return falhas


def imprime(r, titulo):
    print(f"### {titulo}: {r['arquivos']} arq. de codigo | {r['prosa']} de prosa | "
          f"{r['exportados']} exportados | {r['canais']} canais")
    print(f"\nSIMBOLOS sem chamador em lugar NENHUM: {len(r['orfaos'])}")
    for nome, dono, _, doc in r["orfaos"]:
        marca = f"   [citado em doc: {len(doc)}x — orfao CONHECIDO]" if doc else "   [nem em doc]"
        print(f"  - {nome:<26} {dono}{marca}")
    print(f"\nchamados so por `tests/` ou `ferramentas/` (observacao): {len(r['so_em_teste'])}")
    for nome, dono, usos, _ in r["so_em_teste"]:
        print(f"  - {nome:<26} {dono}   <- {usos[0]}")
    print(f"\nusados so DENTRO do proprio arquivo (observacao): {len(r['so_em_casa'])}")
    for nome, dono, _, _ in r["so_em_casa"]:
        print(f"  - {nome:<26} {dono}")
    print(f"\nCANAIS registrados e NAO expostos pela porta: {len(r['nao_expostos'])}")
    for canal, dono in r["nao_expostos"]:
        print(f"  - {canal:<24} {dono}")
    print(f"\nCANAIS expostos e sem chamador NA TELA: {len(r['sem_chamador'])}")
    for canal, porque in r["sem_chamador"]:
        print(f"  - {canal:<24} {porque}")
    #! ⚠️ As duas colunas de canal respondem perguntas DIFERENTES, e confundi-las produziria um
    #!   numero que contradiz corridas anteriores sem explicacao: "registrado no main mas nunca
    #!   invocado pela porta" nao e' "a porta publica e a tela nunca chama".


def main(argv):
    raiz, ref = Path(__file__).resolve().parent.parent, None
    i = 0
    while i < len(argv):
        if argv[i] == "--raiz":
            raiz = Path(argv[i + 1]); i += 2
        elif argv[i] == "--ref":
            ref = argv[i + 1]; i += 2
        else:
            print(f"argumento desconhecido: {argv[i]}", file=sys.stderr)
            return 2
    falhas = prove_se()
    if falhas:
        print("⚠️ CORPO DE PROVA REPROVADO — nenhum relatorio sera impresso.", file=sys.stderr)
        for f in falhas:
            print(f"  - {f}", file=sys.stderr)
        return 2
    print(f"corpo de prova: {len(ESPERADO)} colunas + 3 sabotagens de corpus — OK\n")
    imprime(varre(Arvore(raiz, ref)), f"arvore {ref or 'DE HOJE'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
