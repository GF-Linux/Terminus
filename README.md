# Terminus

**Uma ponte amigável para o terminal do Linux.**

O Neovim é um editor excelente e um péssimo primeiro contato: centenas de
atalhos, modos que ninguém explica, e nenhuma pista na tela do que fazer. Quem
está chegando ao Linux desiste antes de descobrir o que a ferramenta faz.

O Terminus põe uma casca clicável em volta dele. A pasta abre numa árvore de
arquivos, o arquivo abre com um clique, `Ctrl+S` salva, `Ctrl+Z` desfaz, o
terminal abre num botão. Por baixo é o Neovim de verdade — a sua configuração,
os seus plugins, o seu Copilot —, e nada disso é reimplementado.

O nome vem de **terminal** e de **fim**: é onde a barreira do terminal termina.

> **Estado: v0.0.9.** Ainda é cedo. Roda a partir do
> repositório, foi usada de verdade numa máquina só (Fedora 44 / KDE Wayland) e
> tem arestas — a lista honesta está em [Ainda não existe](#ainda-não-existe).
> O que mudou em cada versão está em [Atualizações](#atualizações).

---

## O que ele faz hoje

| | |
|---|---|
| **Editor** | o Neovim, num pseudo-terminal. Sua config, seus plugins, suas cores. |
| **Árvore de arquivos** | abrir, criar, renomear e excluir com o mouse. Excluir vai para a lixeira. |
| **Abrir arquivo** | um clique, e o cursor já entra em **modo de escrita**. |
| **`Ctrl+S`** | grava **sem tirar você do modo de escrita** — veja abaixo por que isso importa. |
| **`Ctrl+Z` / `Ctrl+Shift+Z`** | desfaz e refaz. |
| **Terminal** | um **shell de verdade**, em pseudo-terminal: cor, `htop`, `python` interativo, `sudo`, pipe e `&&`. Dockável no rodapé, à direita ou à esquerda; a medida fica lembrada. |
| **Botão ↗ do terminal** | abre o **Konsole** na pasta em que o terminal está, com o perfil e as abas que você já configurou. |
| **Plugins** | a lista do `lazy.nvim` na lateral, filtrável; clicar abre a pasta do plugin. |
| **Aparência** | papel de parede atrás do editor, temas, zoom com `Ctrl +` / `Ctrl -`. |

### Por que o `Ctrl+S` é o exemplo que explica o projeto

O LazyVim mapeia `<C-s>` como `<Esc>:w` — ele grava, mas te **joga para fora do
modo de escrita**. Para quem vem do VS Code, isso é o editor tropeçando.

No Terminus a casca **intercepta** o `Ctrl+S` antes de ele virar tecla e manda o
`write` pelo canal de controle do Neovim (msgpack-RPC). Um ex-comando por RPC não
mexe no modo: grava e você continua escrevendo. Só sai da escrita quem apertar
`Esc`.

É a ideia inteira do projeto num atalho: **a casca é dona de um punhado de
comandos do dia a dia; o resto do teclado é do Neovim, intacto.**

---

## Como instalar e rodar

Precisa de **Neovim**, **Node** e um compilador C++ (o `node-pty` é módulo
nativo).

```bash
# Fedora
sudo dnf install -y neovim nodejs gcc-c++ make

git clone git@github.com:GF-Linux/Terminus.git terminus
cd terminus
npm install
npx electron-rebuild -f -w node-pty   # compila o node-pty para o ABI do Electron
npm run dev
```

Sem configuração de Neovim? Ele abre igual, com o Neovim padrão. O
[LazyVim](https://www.lazyvim.org/) é um bom ponto de partida, e é contra ele que
o Terminus foi testado.

### Conferir antes de mexer

```
npm run teste       # 145 testes: regra pura, casos de uso, motores, kits e a carga da página em dev
npm run typecheck   # tsc --noEmit
npm run portao      # as cinco pernas do portão, e o veredito
npm run orfaos      # exportado e canal SEM chamador — no FECHAMENTO, não a cada mudança
```

O `portao` é o que fecha uma mudança. Ele roda os testes, a verificação de tipo e
o build, **mede** o acoplamento dos registradores, os ciclos de import, a pureza
do domínio e a árvore de pastas — e trava em cada um deles. Por fim **sobe o
aplicativo de verdade**, com `HOME` redirecionado para uma pasta temporária, e
pergunta à tela por um sinal que só o JavaScript produz. Sem as cinco verdes, a
mudança não fecha.

### Instalar o lançador (Linux/KDE)

```bash
sudo cp media/icon.png /usr/share/icons/hicolor/256x256/apps/terminus.png
cp media/terminus.desktop ~/.local/share/applications/
# ajuste o Exec= para o caminho absoluto do repositório
update-desktop-database ~/.local/share/applications
```

---

## O que vem embutido

O Terminus não é só a casca. Ele traz **dev kits**: por linguagem, o molde de
projeto, o gesto de rodar, e uma biblioteca de funções prontas que cresce
conforme o uso real pede.

A ideia é a mesma do "Python Dev Kit" do VSCode — com uma diferença: aqui as
funções nascem de necessidade de verdade, não de catálogo. Cada uma existe
porque alguém estava travado nela.

### O que já é do Terminus, e o que ainda não é

Lista honesta, porque o kit está começando:

| | vem do Terminus | vem do Neovim (LazyVim + Mason) |
|---|---|---|
| funções prontas (`caixa`) | sim, em `kits/` | — |
| saber a linguagem da pasta | sim, o botão de fluxo | — |
| criar projeto novo | sim, com o molde de cada linguagem | — |
| rodar com um gesto | sim, o botão **Rodar** e o `F5` | `Espaço+r` dentro do editor |
| servidor de linguagem | ainda não | `pyright`, `roslyn`, `clangd` |
| formatador | ainda não | `ruff`, `csharpier` |

Ou seja: hoje o Terminus embute **as funções, o molde e o gesto de rodar**. O
servidor de linguagem ainda é o `:LazyExtras` que você liga — está em
[Ainda não existe](#ainda-não-existe) como próximo passo do kit.

Python, C# e C++ têm molde de projeto pelo botão de fluxo. Lua tem as funções
prontas, mas ainda não tem molde.

### As funções prontas

Escreva o nome e aperte **Enter** — a função inteira aparece no arquivo, já na
linguagem certa.

| gatilho | o que dá |
|---|---|
| `caixa` | desenha uma moldura em volta do texto, no console |
| `caixaascii` | a mesma moldura só com `+ - \|`, para terminal sem a fonte |

```
╭────────────────────────────────────────────╮
│ 1. Começa com uma letra ou sublinhado ou   │
│ 2. Começa com uma letra ou sublinhado ou @ │
╰────────────────────────────────────────────╯
```

A largura sai da linha mais longa, e vale tanto `caixa("a", "b")` quanto
`caixa("a\nb")`.

### O comportamento do editor

A outra metade do kit. São ajustes de Neovim que o Terminus liga por você —
cada um está listado aqui, porque **arquivo de editor muda o comportamento na
hora**, ao contrário de uma função pronta, que fica inerte até você digitar.

| arquivo | o que faz | interruptor |
|---|---|---|
| `erro-na-propria-linha` | o erro aparece escrito na linha, sem precisar rodar — e o aviso de "variável não usada" espera você sair do modo de escrita, porque quem acabou de declarar ainda não teve chance de usar | `Espaço+ux` |
| `linha-longa-nao-arrasta` | linha longa quebra na tela em vez de rolar para o lado | `Espaço+uw` |
| `marcadores-de-comentario` | `#!` vermelho, `#*` verde, `#?` título — e busca por eles | — |
| `caixa-de-comentario` | desenha moldura em comentário | `Espaço+cb…` |
| `rodar-e-setas` | `Espaço+r` roda o arquivo aberto, por linguagem | — |
| `csharp-um-servidor-so` | evita dois servidores de C# no mesmo arquivo | — |
| `tema` | recolore o Neovim na paleta da casca, **só dentro do Terminus** | — |

Não entra nada além disso. O painel de comandos, a árvore, o teclado e o resto
continuam sendo os do seu LazyVim.

**Elas não são cópias.** Moram em `kits/` neste repositório, e o Terminus as
liga na abertura — atualizar o Terminus atualiza as funções. O que ele escreve
na sua máquina é só isto:

```
~/.config/nvim/snippets/<linguagem>/terminus-*.json     (as funções prontas)
~/.config/nvim/lua/plugins/terminus-*.lua               (o comportamento acima)
```

São **ligações, não cópias** — atualizar o Terminus atualiza tudo.

Nada mais é criado ou alterado. Se já existir um arquivo seu com esse nome, o
Terminus **não o toca** e avisa.

---

## Noções básicas de configuração

O Terminus não tem tela de configuração própria de propósito: quem configura é o
Neovim, e o que se aprende aqui serve fora daqui também. O mínimo para não ficar
perdido:

### Onde as coisas moram

```
~/.config/nvim/lua/plugins/     um arquivo por assunto; cada um devolve uma tabela
~/.config/nvim/lazyvim.json     os "extras" ligados (as linguagens, por exemplo)
~/.config/nvim/snippets/        as funções prontas (as do Terminus vêm ligadas aqui)
~/.config/terminus/config.json  o que é da casca: pasta lembrada, tema, histórico
```

### O gesto que resolve a maioria

- `Espaço` é a tecla de comando. Segure e espere: o menu aparece sozinho e diz
  o que existe. É assim que se descobre atalho, sem decorar nada.
- `Espaço l` abre o gerenciador de plugins. Ali se instala, atualiza e remove.
- `:LazyExtras` liga suporte a uma linguagem inteira de uma vez.

### Acrescentar um plugin

Um arquivo novo em `~/.config/nvim/lua/plugins/`, com o nome do que ele faz:

```lua
return {
  { "autor/nome-do-plugin", opts = {} },
}
```

Salvou, reabriu, está instalado. Para tirar, apague o arquivo.

### Trocar um ajuste do editor

```lua
return {
  {
    "LazyVim/LazyVim",
    opts = function()
      vim.opt.wrap = true        -- linha longa quebra na tela
      vim.opt.number = true      -- numera as linhas
    end,
  },
}
```

---

## Como é feito

**Electron** para a casca, **xterm.js** para as telas, **node-pty** para os
pseudo-terminais, e o **Neovim** como motor.

São **dois** PTYs, com o mesmo desenho: um roda o Neovim (o editor), o outro roda
o seu shell (o terminal). Nos dois, a casca só transporta bytes — teclado sobe,
ANSI desce, e ela não interpreta o que passa. O Neovim tem ainda um segundo
canal:

- **o PTY**, por onde passam as teclas e os bytes que ele desenha;
- **o socket de controle** (`nvim --listen`, msgpack-RPC), por onde a casca pede
  as coisas do dia a dia sem mexer no que você está fazendo.

A separação é o projeto: a casca **não** reimplementa edição, realce,
autocomplete nem LSP. Isso é do Neovim e do ecossistema dele.

Segurança da casca: `contextIsolation` ligado, `nodeIntegration` desligado. A
interface não tem `require`, `fs` nem `child_process` — toda a superfície está em
`codigos/porta/ponte-para-a-interface.ts`.

**E o terminal alcança o que você alcança.** É um shell, com a sua conta e as
suas permissões, igual ao Konsole. Até a v0.0.6 o Terminus recusava `|`, `>`,
`&&` e programa interativo, e aquilo estava escrito como se fosse uma trava de
segurança — não era: era consequência de o terminal não ter pseudo-terminal, e
por isso nem cor ele tinha. A trava que existe de verdade continua de pé, e é
esta: **nenhum modelo de linguagem escreve nesse terminal.** Nada do que a IA
sugere chega ali sem passar pelas suas mãos.

```
codigos/dominio/    regra pura: a guarda de caminho e o que decide sem tocar disco
codigos/porta/      o preload — a única passagem entre a casca e o sistema
codigos/sistema/    o processo principal, em cinco camadas:
     janela/          cria a janela, o zoom, os atalhos, os diálogos, a partida
     motores/         conduzem algo vivo: o PTY do shell, o do Neovim, o RPC, a config
     infra/           tocam o disco e voltam: arquivos, molde, kits, realpath
     servicos/        os casos de uso — chamam infra, motor e persistência na ordem
     ponte/           os handlers de IPC, oito registradores
codigos/interface/  a casca: árvore, terminal, plugins, temas
codigos/compartilhado/  os tipos que os três reinos falam
codigos/design/     css, temas, papel de parede, fontes
```

---

## Ainda não existe

Lista honesta, porque v0.0.9 ainda quer dizer isso:

- **Os kits ainda não instalam o servidor de linguagem.** Hoje eles trazem as
  funções, o molde e o gesto de rodar; o `pyright`/`roslyn` você liga pelo
  `:LazyExtras`. O objetivo é o Terminus fazer isso por quem chega.
- **Não está empacotado.** Roda do repositório; não há AppImage nem RPM.
- **Testado numa máquina só** — Fedora 44, KDE em Wayland. Nunca rodou em GNOME,
  em X11 puro, em outra distribuição, no macOS nem no Windows.
- **Renomear pela árvore não avisa o Neovim**: o buffer aberto continua
  apontando para o nome antigo; reabra o arquivo depois de renomear.
- **Sem busca em arquivos pela casca** — use a do Neovim (`<space>/` no LazyVim).
- **Atalhos são poucos e fixos** — o "personalizável" do objetivo ainda é o do
  Neovim, não da casca.
- **O botão ↗ do terminal chama o `konsole` pelo nome.** Fora do KDE ele não
  existe, e o botão diz isso em vez de procurar outro terminal — abrir um
  programa diferente sem avisar seria responder outra pergunta.
- **O Konsole não é EMBUTIDO na janela**, e não dá para ser: o `konsolepart` é um
  KPart Qt, que exige aplicativo Qt como hospedeiro, e nesta sessão Wayland não
  existe XEmbed. O que fica embutido é um terminal equivalente (mesmo shell,
  mesmo PTY, mesmo `.bashrc`, mesmo `.bash_history`).

## Armadilhas conhecidas (que custaram tempo)

- **Teclas que o sistema rouba.** No KDE, `Alt+T` nunca chega ao aplicativo. Em
  alguns teclados, as `F1`–`F12` saem como teclas de mídia. Atalho que o
  ambiente engole não é bug do aplicativo — mas é problema do usuário, então a
  casca prefere `Ctrl+<tecla>` e botões.
- **Pixel art não se reduz com interpolação.** LANCZOS borra exatamente as bordas
  duras que fazem a arte ler. Redução em razão inteira, com NEAREST.
- **Imagem referenciada no HTML por caminho relativo não carrega em
  desenvolvimento** — o caminho sai da raiz do Vite e o servidor devolve o
  `index.html` no lugar do arquivo. Importe pelo TypeScript.
- **`E325: ATTENTION`** ao abrir arquivo: era swap file órfão. O `edit` vem por
  RPC, que é não-interativo, então o prompt travava o comando. O Terminus
  responde a isso sozinho no arranque.

---

## Atualizações

### v0.0.9 — 24/08/2026

**A janela abria preta no `npm run dev` — e abria desde o primeiro dia.** Quem
seguiu o "Como instalar e rodar" deste README nunca chegou a ver o Terminus: o
comando sobe, a janela aparece, e não há nada dentro. E isso atinge **todo
mundo**, porque o Terminus ainda não está empacotado — `npm run dev` é o único
jeito de rodá-lo.

**O que estava errado.** Em modo de desenvolvimento a interface é servida por
HTTP, e a página não mora na raiz desse servidor: mora em
`interface/pagina.html`. A janela pedia a raiz. Medido: a raiz responde **404 e
0 bytes**; a página responde **200 e 7075 bytes**.

**Não foi a v0.0.8 que quebrou.** O defeito nasceu com o produto e atravessou
todas as versões — a v0.0.8 apenas o herdou. Conferido contra a v0.0.7 em cópia
isolada: o mesmo 404, byte a byte.

**Por que nenhum teste pegava.** O portão constrói o aplicativo e sobe o
aplicativo **construído**, que sempre funcionou. O comando que este README manda
um recém-chegado usar era justamente o único que nenhuma perna do portão rodava.
Agora existe uma que sobe o servidor de desenvolvimento e faz uma requisição à
página que a janela de verdade mandou carregar, exigindo 200 e corpo não vazio —
sem abrir tela. **139 → 145 testes.**

### v0.0.8 — 24/08/2026

**A obra por dentro.** Nenhum botão mudou de lugar e nenhum canal mudou de nome —
os 37 canais entre a casca e o sistema são **idênticos** aos da v0.0.7, conferidos
um a um. O que mudou foi o que sustenta tudo isso.

**O monólito acabou.** `janela-principal.ts` tinha **707 linhas e cinco papéis**:
a partida, o ciclo da janela, a guarda de caminho, um caso de uso e os 37
handlers. Hoje o maior arquivo do processo principal tem **296 linhas**, e o
código está em camadas com nome: `dominio/` decide sem tocar disco, `porta/` é a
única passagem, e `sistema/` se divide em janela, motores, infra, serviços e
ponte. **28 → 58 arquivos**; **os dois ciclos de import viraram zero**.

**Passou a existir rede de teste — não havia nenhuma.** De **0 para 139 testes**,
em 22 arquivos, rodando em 0,9 s sem subir o Electron. E um portão de cinco
pernas (`npm run portao`) que roda os testes, o tipo e o build, **mede** o
acoplamento, os ciclos, a pureza do domínio e a árvore de pastas — travando em
cada um —, e por fim sobe o aplicativo de verdade para provar que ele responde.

**Oito consertos que a pessoa sente:**

- **`Ctrl+S` funciona em pasta aberta por atalho.** Antes, abrir a pasta por um
  link simbólico fazia o Terminus recusar **toda** escrita, com uma frase que
  contradizia a tela.
- **O botão ↗ parou de mentir.** Sem `konsole` na máquina ele anunciava
  *"Konsole aberto em…"* e não abria nada; o erro era engolido.
- **Ctrl+S, Ctrl+Z, F12 e o painel de plugins param de pendurar em silêncio.**
  Sem o socket do Neovim, o canal de controle travava **para sempre**, e o aviso
  que existia para esse caso era inalcançável. Agora ele aparece.
- **"Fechar pasta" fecha de verdade.** Antes limpava só a tela: o sistema
  continuava achando a pasta aberta, e a recusa de exclusão dizia isso.
- **Criar e renomear confinam como gravar** — o mesmo rigor nos quatro caminhos.
- **Nome inválido devolve recusa legível**, não um erro interno da linguagem.
- **Symlink de kit é reconhecido pelo destino**, não por "é symlink" — link seu
  com nome parecido deixa de ser sobrescrito.
- **Saiu uma função órfã que sabia ler uma chave de API** do banco de outro
  programa, e que nenhum código chamava.

**O que ficou por fazer está escrito**, em vez de escondido: as decisões que
dependem de rumo viraram árvores em `docs/tracker.md`, com o custo de cada opção
medido. E `docs/diario.md` guarda as falhas do caminho — inclusive as minhas.

### v0.0.7 — 19/08/2026

1. **O terminal virou um terminal de verdade.** O relato foi "o comando de cores
   não pinta nada aqui, e no Konsole pinta". Medido, e a culpa não era do tema
   nem do xterm.js: o terminal rodava comando por **canos comuns**, sem
   pseudo-terminal, e todo programa que se pergunta se fala com um terminal
   desliga a cor sozinho quando a resposta é não.

   ```
   ls --color=auto /usr/lib     por cano  b'alsa\n...'           <- sem cor
                                por PTY   b'\x1b[01;34malsa...'  <- com cor
   sys.stdout.isatty()          por cano  False    por PTY  True
   ```

   Aquele desenho nasceu numa máquina sem compilador (o Steam Deck), que não
   compilava módulo nativo. A trava acabou faz tempo — o `node-pty` já roda o
   Neovim aqui dentro desde a v0.0.1. Agora ele roda o **seu shell** também.

2. **Junto com a cor vem o resto do terminal**: `htop`, `nano`, `python`
   interativo, `sudo` pedindo senha, barra de progresso do `pip`, `|`, `>`,
   `&&`, `;` e `Tab` completando. Sai a linha de comando própria do Terminus e
   entra a digitação **dentro** da tela, como no Konsole — quem edita a linha
   passa a ser o `readline` do bash, com `Ctrl+R`, `Ctrl+A` e `Ctrl+E`.
3. **O botão ↗ agora abre o Konsole**, na pasta em que o terminal está. Ele
   abria uma segunda janela do Electron, que era uma cópia da nossa própria tela;
   o Konsole de verdade traz o seu perfil, as suas abas e os seus atalhos.
4. **O histórico mudou de dono.** Era uma lista nossa no `config.json`; agora é o
   `~/.bash_history`, o **mesmo** que o Konsole usa — duas listas de "o que eu já
   digitei" é pior que uma. O que estava guardado no `config.json` é apagado na
   primeira abertura: comando é dado sensível, e dado sensível esquecido num
   campo que ninguém mais lê é o pior dos dois mundos.
5. **O botão Rodar aprendeu C++ sem Makefile.** Ele mandava você para o
   `Espaço+r` porque o terminal não aceitava `&&`. Agora a linha inteira aparece
   na tela: `g++ … && /tmp/terminus-…`.
6. **Kit do editor:** o aviso de "variável não usada" espera você sair do modo de
   escrita. Declarar `int num = 2;` e ser acusado na mesma tecla é o aviso certo
   na hora errada — quem acabou de declarar ainda não teve chance de usar. O
   erro de verdade (tipo errado, nome inexistente) continua aparecendo enquanto
   se digita.

### v0.0.6 — 17/08/2026

1. **O kit passou a levar o comportamento do editor também**, e não só as
   funções prontas. Erro escrito na linha, quebra de linha longa, cores dos
   marcadores, `Espaço+r` e o tema da casca agora vêm com o Terminus, ligados
   em `~/.config/nvim/lua/plugins/terminus-*.lua`. Cada peça está listada no
   leia-me — arquivo de editor muda o comportamento na hora, ao contrário de uma
   função pronta, e nada entra sem estar escrito.
2. `kits/` ficou dividido em `funcoes/` e `editor/`, porque são duas coisas com
   riscos diferentes.
3. **O erro aparece na própria linha**, sem precisar rodar. O que faltava não
   era o recurso: era o `update_in_insert`, que vinha desligado — e o Terminus
   vive em modo de escrita, então o diagnóstico nunca se atualizava. `Espaço+ux`
   liga e desliga.
4. Em Python, `ruff` e `pyright` diziam a mesma coisa na mesma linha. Cada um
   ficou com o que é dele; nada deixou de ser detectado.
5. **O contraste do texto subiu, medido**: `#d7d9ea` (13.76:1) virou `#eaecf7`
   (16.37:1), e o mesmo para o resto da paleta. O tom não mudou — é o mesmo
   azul-lavanda, só mais claro.
6. **O véu da área de escrita virou degradê.** Na v0.0.5 ele era parelho e
   apagava a ilustração. A figura fica à direita e o código à esquerda: forte
   onde se escreve, quase nada onde a figura está.
7. `csharpier` entrou como formatador de C#.

### v0.0.5 — 17/08/2026

1. **A escrita ganhou contraste.** A área de edição mostrava o papel de parede
   em cheio, sem nada entre a figura e o texto — a única área da casca sem véu.
   Era isso que deixava o código com cara de apagado. Agora tem véu, como o
   resto: a figura continua lá, atrás, e o texto fica na frente.

### v0.0.4 — 17/08/2026

1. **Os dev kits saíram do computador do autor.** As funções prontas moram agora
   em `kits/`, neste repositório, e o Terminus as liga na abertura. Antes elas
   existiam só numa máquina: quem instalasse o Terminus não as teria.
2. O que ele escreve na sua máquina está limitado a
   `~/.config/nvim/snippets/<linguagem>/terminus-*.json`, e são ligações, não
   cópias — atualizar o Terminus atualiza as funções. Arquivo seu com o mesmo
   nome não é tocado, e o Terminus avisa.
3. A primeira função embutida é a `caixa`: desenha uma moldura em volta do texto
   no console, em Python, C#, C++ e Lua. A largura sai da linha mais longa.
4. **Linha longa não arrasta mais a tela para o lado.** Ela quebra na tela, com
   a continuação alinhada e marcada. O arquivo continua com uma linha só — a
   quebra é só visual. `Espaço+uw` liga e desliga.
5. A seta passa a andar pelo que se vê: com a linha quebrada, descer uma linha
   desce uma linha da TELA. Com número na frente (`3j`) continua sendo três
   linhas do arquivo.
6. README ganhou **O que vem embutido** e **Noções básicas de configuração**, e
   "Rodar" virou "Como instalar e rodar".

### v0.0.3 — 17/08/2026

1. Os botões de fechar, minimizar e maximizar saíram do canto esquerdo e foram
   para a direita. O canto esquerdo é o primeiro lugar onde a mão chega, e ali
   estava o botão que fecha o aplicativo — nada que se usa.
2. No lugar que sobrou entrou o **botão de fluxo**: ele diz qual linguagem a
   pasta aberta é, e cria projeto novo em C++, Python ou C#. O molde traz o
   mínimo que faz o código rodar, e nada além disso.
3. O molde de C++ traz um `compile_flags.txt`. É o arquivo que ninguém lembra de
   criar, e sem ele o servidor de linguagem sublinha código correto: medido, 3
   erros falsos viram 0.
4. Entrou o **botão Rodar**, e o F5. Ele não roda nada por conta própria: olha a
   pasta, diz qual é a linha, e manda pela linha de comando — o que aparece na
   tela é exatamente o que rodou. Quando não dá para saber, ele diz o que falta
   em vez de chutar um comando que vai falhar.
5. O **terminal agora sai para uma janela própria**, pelo botão no cabeçalho
   dele. Fechar a janela devolve o terminal para a casca. Era a metade que
   faltava da doca, que já mudava o terminal de lugar dentro da janela.
6. **Conserto:** o terminal travava na primeira linha que rodasse alguma coisa e
   depois recusava tudo com "há algo rodando". Ninguém na interface escutava o
   fim do processo desde a virada para o Neovim, então a trava ligava e não
   desligava mais. A saída dos programas também não aparecia, pelo mesmo motivo.
7. **Conserto:** a janela do terminal nascia travada. A porta prometia um
   `boolean` e entregava um objeto, e objeto é sempre verdadeiro em JavaScript.
   O tipo estava errado desde sempre; ninguém tinha chamado aquilo até agora.

### v0.0.2 — 17/08/2026

1. O layout foi corrigido: a casca inteira passou para a paleta Jared-Linux —
   editor `#0c0e16`, barras `#14161f`, lateral `#171a26`, texto `#d7d9ea`.
2. O motivo: a casca ainda usava o cinza do produto que este repositório já foi,
   e ficava um esquema de cor brigando com o outro na mesma tela.
3. A lateral era duas cores: a coluna de ícones estava num tom e o painel ao
   lado em outro. Agora é uma só.
4. O Neovim acompanha: dentro do Terminus o tema dele é recolorido para a mesma
   paleta. Fora do Terminus, continua como você o deixou.
5. O papel de parede parou de esticar quando a janela não está em tela cheia.

### v0.0.1 — 16/08/2026

1. Primeira versão pública.
2. O Neovim passa a ser o motor de edição, dentro da casca.
3. `Ctrl+S` grava sem tirar do modo de escrita; `Ctrl+Z` desfaz.
4. Terminal com doca no rodapé, à direita ou à esquerda.
5. Lista de plugins do `lazy.nvim` na lateral.

---

## Licença

**MIT** — veja [LICENSE](LICENSE). A escolha é deliberada: o Terminus só serve
se puder ser copiado, adaptado e redistribuído por quem quiser adaptar a própria
ponte.

As fontes IBM Plex embutidas em `codigos/design/fontes/` são SIL OFL 1.1, e o aviso
delas acompanha o LICENSE.
