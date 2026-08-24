#* O diário de trabalho do Jared-Agent neste projeto. Lido antes de tocar em qualquer coisa;
#* escrito ao fim de todo despacho. O que FALHOU importa mais que o que deu certo.

# Diário — Terminus v0500

---

## 2026-08-23 · Despacho 1 — o portão de desenho (§11 / §12·1). Nenhum código movido.

### O estado em que encontrei o alvo

HEAD `ada7bfa`, sem remoto. Único arquivo não rastreado: `media/Fundno-JaredV3.png`.
`docs/` **não existia** — este é o primeiro despacho nesta cópia, e nasci sem memória daqui.

### O que medi, com o número

| medida | valor | comando |
|---|---|---|
| arquivos em `codigos/` | **34** | `find codigos -type f \| wc -l` |
| linhas de texto (sem `.woff2`) | **5.683** | `find … ! -name '*.woff2' -exec cat {} + \| wc -l` |
| — só `.ts`/`.d.ts` | **5.152** (28 arquivos) | idem, filtrado |
| — `.css` + `.html` | **531** | idem |
| o monólito `janela-principal.ts` | **707 linhas** | `wc -l` |
| — a função `registrarPonte` | **359 linhas** (317–675) | fronteira achada por script |
| canais de IPC | **37** | `grep -c "ipcMain\.\(handle\|on\)"` |
| **M1 · módulos de `sistema/` que o registrador alcança** | **7** (teto do E2 = 2) | script de alcance de símbolo |
| M2 · ciclos de import | **2** (2 nós e 3 nós, ambos em `interface/`) | Tarjan, script próprio |
| M4 · conformidade com a árvore §1.3 | **5 de 13 nós** | laço de `test -d` |
| testes | **0** — `tests/` não existe | `ls tests/` |
| `npm run typecheck` | exit **0** | `npx tsc --noEmit` |
| `npx electron-vite build` | exit **0**, 3 pacotes | 55,07 / 8,12 / 471,09 kB |

**A linha de base humana da fatia 1 não está em disco.** O §12 do PADRAO cita como prova empírica
*"Terminus 2.0, fatia 1 — guarda de caminho → `dominio/` puro; portão verde (teste 7/7)"*. Conferi:
`~/projetos/terminus` está na **mesma HEAD `ada7bfa`**, **sem `dominio/`, sem `tests/`**, sem
stash, sem branch além de `main`. Busca larga em `~/projetos` achou `guarda-HUMANA-baseline.ts` e
`guarda-AGENTE-v0002.ts` — os dois **dentro do segundo cérebro**, que me é vedado. **Não os abri.**
Registro que existem; entregá-los ou não é decisão da cabeça. Conclusão prática: **esta corrida
começa do zero em rede de teste**, e não tenho artefato de comparação à mão.

### O que TENTEI e falhou — e por quê

**1. A sonda de conduta deixou 6 processos vivos.** Matei `process.kill(filho.pid, "SIGKILL")` e
achei que bastava. O `ps` mostrou **6 processos do alvo ainda de pé** 25 s depois: zygote (×2),
gpu-process, network utility e renderer. **Matar o pai do Electron não mata a árvore dele.**
Correção que funcionou: `spawn(..., { detached: true })` dá ao filho um **grupo de processos
próprio**, e `process.kill(-pid, "SIGKILL")` derruba o grupo inteiro. Reconferido: **zero órfãos**
nas três execuções seguintes. Os 6 primeiros foram mortos **por PID** — nunca `pkill -f`, que
casaria com o próprio comando.

**2. Medi o acoplamento do registrador com a fatia errada, e o número saiu 8.** Usei
`linhas[316:702]` supondo que `registrarPonte` ia até o fim do arquivo. Não vai: ela fecha na
**675**, e da **676** em diante é `app.whenReady`. A fatia larga engoliu `ligarKits` e
`limparHistoricoAntigo`, que são da partida, não do registrador. Refeito com a fronteira achada
por script: **M1 = 7**, e mais 4 módulos que **só** a partida alcança. É o modo de falha que o
§15.4 nomeia — *fechar o espaço de busca cedo demais*. Aqui foi a fronteira, não o filtro.

**3. Meu `grep` de imports não pegava `node:fs/promises`.** O padrão `node:[a-z_]+` disse que
`arquivos-do-projeto.ts` **não toca fs** — falso: ele importa `node:fs/promises`. Refiz com padrão
largo (`from "[^".][^"]*"`). **Nenhum** arquivo de `sistema/` é puro hoje; todos tocam `fs`,
`child_process`, `node-pty` ou `neovim`. Consequência de desenho: **não existe arquivo que se
mova inteiro para `dominio/`** — o domínio tem de ser **extraído de dentro de funções**.

**4. Afirmei reprodutibilidade antes de conferir.** Imprimi `(md5 igual = reproduzivel)` num
`echo` **antes** de comparar — e os md5 eram **diferentes**. Medido de verdade:
`magick compare -metric AE` dá **0 pixels diferentes**; a diferença é só o carimbo de data que o
ImageMagick embute. `-strip` resolve e o md5 fica estável. O SVG já era byte-idêntico.
Fica escrito porque o erro não foi a medição — foi **anunciar o veredito antes dela**.

**5. Meu gerador de diagrama publicou texto sobreposto, duas vezes.** Primeira: descrição de nó
ia sempre à direita e **atravessava a coluna dos filhos** em 4 lugares. Segunda: detectei
"tem filhos" comparando `y`, e o pai de 1 ou 3 filhos tem **o mesmo `y`** de um filho — três nós
caíram na regra errada. Só vi porque **abri o PNG e olhei**; nas duas vezes o comando saiu exit 0
e o arquivo existia. Corrigido carregando a marca de filho no nó e pondo uma **trava de largura
que faz o gerador sair com erro** (`DESENHO RECUSADO`) — e ela pegou uma terceira sobreposição
antes de virar arquivo.

### O que decidi (e é meu para decidir)

- **A perna de conduta usa `HOME` redirecionado.** Não é conveniência: `kits-embutidos.ts` cria
  **symlinks em `~/.config/nvim/`** e `configuracao-salva.ts` escreve em `~/.config/terminus/` na
  partida. Medido que `HOME` redireciona `os.homedir()` **e** `app.getPath("home")`; depois de
  quatro subidas do app, `~/.config/nvim` real seguiu com mtime de **17/08** — intocado.
- **O sinal da perna de conduta é `.xterm`, não "a página tem elementos".** A `pagina.html` tem
  **72 tags estáticas** — uma asserção de contagem nunca poderia falhar (§12·2). Provei que a rede
  morde: sabotei o pacote do renderer → **MORTA, exit 1**; restaurei → **VIVA, exit 0**. Sob
  sabotagem, `porta` e `aparencia` seguiram vivos e **só** o `.xterm` virou `false` — a perna
  aponta para a camada certa.
- **O runner recomendado é `node --test` nativo**, medido verde com TypeScript direto, zero
  dependência nova. Custo medido e escrito no tracker: import `.ts` nos testes (com `.js` dá
  `ERR_MODULE_NOT_FOUND`) e `allowImportingTsExtensions` no tsconfig — que **não quebra nada**
  (`tsc` exit 0, `build` exit 0). É recomendação, **não decisão**: o ramo C é da cabeça.

### O que NÃO decidi, e devolvi

Cinco ramos (A–E) no `docs/tracker.md §4` e três defeitos herdados (D1–D3) com árvore de decisão
completa (§12·3a). O mais importante:

> ⚠️ **O §1.3 do PADRAO se contradiz.** A árvore da seção põe `molde-de-projeto` e `como-rodar` em
> **`dominio/`**; a emenda **E3**, na mesma seção, os põe em **`sistema/infra/`**. Medido: os dois
> importam `node:fs` (e `molde` também `node:child_process`), então **violam** "dominio não importa
> fs" como estão. É a *emenda sem varredura* — o modo de falha que o próprio documento nomeia no
> §15.4 — acontecendo dentro do §1.3. **Não resolvi**: corrigir o PADRAO é da cabeça.

### O que ficou aberto para o próximo despacho

1. Os cinco ramos e os três defeitos, **esperando a concordância dupla** (§13.1a).
2. **Fatia 0 não começou.** Antes de mover a primeira linha: `ferramentas/portao.mjs` (mecanismo
   das pernas P4 e P5 já medido aqui), `tests/` no runner escolhido, e a **rede semeada E
   sabotada** para a guarda de caminho — verde sozinho não é rede.
3. A linha de base de M1–M4 precisa ser commitada para a catraca do P4 ter contra o que comparar.
4. `ferramentas/gera-fluxo.py` é quem refaz o `fluxo.png`; ele mora no projeto de propósito, para
   a planta não virar imagem órfã.
