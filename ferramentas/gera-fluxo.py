#* Gera o mapa mental da planta do Terminus em SVG. Raiz a esquerda, galhos a
#* direita, conectores em curva — nunca lista vertical (PADRAO §11).
#? A RECEITA COMPLETA — Decisao sobre onde ela mora 24/08/2026
#!
#! 1. Este script escreve o SVG. Quem vira PNG e um segundo comando, e ate 24/08 ele NAO
#!    ESTAVA ESCRITO EM LUGAR NENHUM DO REPOSITORIO: vivia so na memoria de quem tinha
#!    rodado da ultima vez. O preco disso foi cobrado no mesmo dia — o PNG foi refeito sem
#!    `-density` e saiu 1820x1155 no lugar de 2843x1804, com exit 0 e sem reclamacao nenhuma.
#! 2. Os dois passos, na ordem, a partir da raiz do repositorio:
#!
#!      python3 ferramentas/gera-fluxo.py
#!      magick -background none -density 150 docs/fluxo.svg -strip docs/fluxo.png
#!
#! ⚠️ SEM REDIRECIONAMENTO NO PRIMEIRO PASSO, e isto foi um erro cometido e medido em 24/08
#!    ao escrever esta propria receita: o script ABRE `docs/fluxo.svg` e escreve nele, e
#!    depois IMPRIME um resumo na saida padrao. Um `> docs/fluxo.svg` faz o resumo cair por
#!    cima dos primeiros 69 bytes do arquivo que o script acabou de escrever — a tag `<svg`
#!    some, o `magick` responde `unable to read image data`, e o PNG antigo fica no lugar
#!    com o mesmo md5, sem ninguem reclamar. A receita errada durou 4 minutos porque foi
#!    RODADA antes de ser commitada.
#!
#! 3. ⚠️ O `-density 150` NAO E ENFEITE: sem ele o ImageMagick rasteriza a 96 DPI e a imagem
#!    sai a 1820x1155 — 150/96 = 1,5625 vezes menor em cada lado. O comando nao avisa, o
#!    arquivo existe, e so quem ABRE a imagem percebe. O tamanho certo e 2843x1804.
#! 4. `-strip` tira os metadados, para o PNG de duas geracoes do mesmo SVG ter o MESMO md5 —
#!    e e isso que torna a regeracao conferivel por diff em vez de por confianca.
#! As cores saem do PROPRIO tema do Terminus (codigos/design/estilo-da-casca.css).
#! O rotulo de no COM FILHOS leva a descricao na LINHA DE BAIXO; o de folha, ao
#!   lado. Levar tudo ao lado atravessava a coluna dos filhos — medido e visto.
import html, sys

BG, SIDE   = "#0c0e16", "#171a26"
LINHA      = "#2a3046"
FG, ROTULO = "#d7d9ea", "#8f95d6"
ACENTO     = "#b9bef2"
NOVO, MORRE= "#7fd6b5", "#e0857a"
CINZA      = "#7c819b"
MONO = "JetBrainsMono Nerd Font, JetBrains Mono, monospace"
SANS = "Cantarell, Noto Sans, sans-serif"

def no(rot, desc, cor, filhos=()): return dict(rot=rot, desc=desc, cor=cor, filhos=list(filhos))

raizes = [
 no("codigos/", "", ROTULO, [
   no("compartilhado/", "tipos.ts — a forma que os 3 reinos falam", FG),
   no("dominio/", "regra pura · sem fs, sem electron", NOVO, [
      no("guarda-de-caminho",        "caminho já resolvido cai dentro das raízes?", NOVO),
      no("entrada-recusada",         "recusa vazio, \\0 e o que começa com ‑", NOVO),
      no("protecao-da-pasta-aberta", "é a pasta aberta, ou está acima dela?", NOVO),
      no("escolha-da-pasta-inicial", "argumento ganha da memória", NOVO),
      no("fluxo-conhecido",          "cpp | python | csharp", NOVO),
      no("endereco-da-pagina",       "onde a página mora, nos DOIS regimes de carga", NOVO)]),
   no("porta/", "preload · a ÚNICA passagem renderer↔main", ACENTO, [
      no("ponte-para-a-interface", "contextBridge: publica window.terminus", FG)]),
   no("sistema/", "main · o reino do processo principal", ACENTO, [
      no("janela/",   "6 · cria, vive, zoom, atalhos, diálogos, partida", FG),
      no("motores/",  "4 · conduzem algo VIVO: pty, rpc, config", FG),
      no("infra/",    "8 · tocam o disco e voltam: fs, realpath, argv", FG),
      no("servicos/", "5 · caso de uso: chamam na ordem certa", NOVO),
      no("ponte/",    "8 registradores · teto 2 módulos cada", NOVO)]),
   no("interface/", "renderer · a casca, 16 arquivos", FG, [
      no("painel-lateral", "desfaz os 2 ciclos de import", NOVO)]),
   no("design/", "css, temas, papel de parede, fontes", FG)]),
 no("tests/", "145 testes (§6·R5)", NOVO, [
   no("apoio/",    "o andaime: duble do electron, gancho, casa temporária", NOVO),
   no("dominio/",  "30 · a regra pura, sem Electron, em milissegundos", NOVO),
   no("servicos/", "76 · o caso de uso: a ORDEM e a DECISÃO", NOVO),
   no("motores/",  "32 · A8 consertada: o canal de controle DESISTE e diz", NOVO),
   no("infra/",    "5 · os 4 casos de ligação da A4(b)", NOVO),
   no("funcionais/", "2 · a perna P6: GET na URL que a janela MANDOU carregar", NOVO)]),
 no("ferramentas/", "portao.mjs (6 pernas + M1-M4) · gera-fluxo.py · varre-orfaos.py", NOVO),
 no("docs/", "fluxo.md (esta planta) · tracker.md · diario.md", NOVO),
 no("kits/", "dev-kits embutidos", FG),
]

COL, LH, GAP = [70, 250, 560, 900], 30, 30
cursor, plano, arestas, erros = [150], [], [], []

def largura(txt, tam): return len(txt) * tam * 0.53   #! Cantarell, medido por olho no PNG

def dispor(n, nivel):
    if n["filhos"]:
        ys = [dispor(f, nivel+1) for f in n["filhos"]]
        meu = (ys[0] + ys[-1]) / 2
        for yf in ys: arestas.append((nivel, meu, yf))
        cursor[0] += GAP
    else:
        meu = cursor[0]; cursor[0] += LH
    plano.append((nivel, meu, n["rot"], n["desc"], n["cor"], bool(n["filhos"])))
    #! trava: descricao de PAI nao pode invadir a coluna dos filhos. Se invadir,
    #!   o gerador PARA — desenho torto que passa calado e o que nao se quer.
    if n["filhos"] and n["desc"]:
        fim = COL[nivel] + largura(n["desc"], 12.5)
        teto = COL[nivel+1] - 14
        if fim > teto: erros.append(f'{n["rot"]}: descricao chega a {fim:.0f}px, teto {teto}px')
    return meu

topos = [dispor(r, 0) for r in raizes]
if erros:
    print("DESENHO RECUSADO:"); [print("  -", e) for e in erros]; sys.exit(1)

ALT, LARG = int(cursor[0] + 165), 1820
def curva(x1,y1,x2,y2):
    dx=(x2-x1)*0.55
    return f'M {x1} {y1} C {x1+dx} {y1}, {x2-dx} {y2}, {x2} {y2}'

s=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {LARG} {ALT}" width="{LARG}" height="{ALT}" role="img" aria-label="Planta-alvo do Terminus: dominio puro, reino da porta e as cinco camadas de sistema, com o alvo da corrida em numeros">',
   f'<rect width="{LARG}" height="{ALT}" fill="{BG}"/>',
   f'<text x="70" y="58" font-family="{SANS}" font-size="30" font-weight="700" fill="{FG}">Terminus — a planta do prédio</text>',
   f'<text x="70" y="86" font-family="{MONO}" font-size="14.5" fill="{ROTULO}">PADRÃO §1.3 + emendas E1–E4 · construída em 23/08 · portão verde 5/5 · 37 canais da base + 1 declarado (A7)</text>',
   f'<line x1="70" y1="108" x2="{LARG-70}" y2="108" stroke="{LINHA}" stroke-width="1"/>']

for nivel, ypai, yf in arestas:
    x1 = COL[nivel] + largura(dict()  and "" or "", 0) + (135 if nivel==0 else 175)
    s.append(f'<path d="{curva(x1, ypai-5, COL[nivel+1]-14, yf-5)}" fill="none" stroke="{LINHA}" stroke-width="1.6"/>')

TR = 40
s.append(f'<path d="M {TR} {topos[0]-5} L {TR} {topos[-1]-5}" stroke="{LINHA}" stroke-width="1.6" fill="none"/>')
for t in topos: s.append(f'<path d="{curva(TR, t-5, COL[0]-12, t-5)}" fill="none" stroke="{LINHA}" stroke-width="1.6"/>')

for nivel, yy, rot, desc, cor, tem_filho in plano:
    x = COL[nivel]
    peso = "700" if nivel==0 else ("600" if nivel==1 else "400")
    tam  = 17 if nivel==0 else (15 if nivel==1 else 13.5)
    s.append(f'<circle cx="{x-11}" cy="{yy-5}" r="3.2" fill="{cor}"/>')
    s.append(f'<text x="{x}" y="{yy}" font-family="{MONO}" font-size="{tam}" font-weight="{peso}" fill="{cor}">{html.escape(rot)}</text>')
    if desc and tem_filho:
        s.append(f'<text x="{x}" y="{yy+19}" font-family="{SANS}" font-size="12.5" fill="#6d7290">{html.escape(desc)}</text>')
    elif desc:
        s.append(f'<text x="{x + len(rot)*tam*0.62 + 16}" y="{yy}" font-family="{SANS}" font-size="13" fill="{CINZA}">{html.escape(desc)}</text>')

ry = ALT - 100
s.append(f'<rect x="70" y="{ry-30}" width="{LARG-140}" height="78" rx="8" fill="{SIDE}" stroke="{LINHA}"/>')
s.append(f'<text x="94" y="{ry-7}" font-family="{MONO}" font-size="13" font-weight="700" fill="{ROTULO}">O ALVO DA CORRIDA — MEDIDO E ATINGIDO em 23/08 (§12·4b)</text>')
for i,(nome,hoje,alvo) in enumerate([
    ("M1  acoplamento máximo do registrador","8","2"),
    ("M2  ciclos de import","2","0"),
    ("M3  imports proibidos em dominio/","n/a","0"),
    ("M4  conformidade com a árvore §1.3","5/13","13/13")]):
    x = 94 + i*430
    s.append(f'<text x="{x}" y="{ry+17}" font-family="{SANS}" font-size="12.5" fill="#6d7290">{html.escape(nome)}</text>')
    s.append(f'<text x="{x}" y="{ry+38}" font-family="{MONO}" font-size="15" font-weight="700" fill="{MORRE}">{hoje}</text>')
    w = len(hoje)*9.4 + 12
    s.append(f'<text x="{x+w}" y="{ry+38}" font-family="{MONO}" font-size="15" fill="#565b74">→</text>')
    s.append(f'<text x="{x+w+27}" y="{ry+38}" font-family="{MONO}" font-size="15" font-weight="700" fill="{NOVO}">{alvo}</text>')
s.append(f'<text x="70" y="{ALT-22}" font-family="{SANS}" font-size="12.5" fill="#565b74">verde — o que a corrida entregou   ·   vermelho — o número de partida   ·   a fonte da verdade é docs/fluxo.md; este PNG é derivado dele</text>')
s.append('</svg>')
open('docs/fluxo.svg','w').write('\n'.join(s))
print("svg escrito · altura", ALT, "· nenhuma descricao invadiu coluna de filho")
