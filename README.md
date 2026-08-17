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

> **Estado: v0.0.4.** Ainda é cedo. Roda a partir do
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
| **Terminal** | painel próprio, dockável no rodapé, à direita ou à esquerda; a medida fica lembrada. |
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

**Elas não são cópias.** Moram em `kits/` neste repositório, e o Terminus as
liga na abertura — atualizar o Terminus atualiza as funções. O que ele escreve
na sua máquina é só isto:

```
~/.config/nvim/snippets/<linguagem>/terminus-*.json     (ligações, não cópias)
```

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

**Electron** para a casca, **xterm.js** para a tela, **node-pty** para o
pseudo-terminal, e o **Neovim** como motor — falando por dois canais:

- **o PTY**, por onde passam as teclas e os bytes que ele desenha;
- **o socket de controle** (`nvim --listen`, msgpack-RPC), por onde a casca pede
  as coisas do dia a dia sem mexer no que você está fazendo.

A separação é o projeto: a casca **não** reimplementa edição, realce,
autocomplete nem LSP. Isso é do Neovim e do ecossistema dele.

Segurança da casca: `contextIsolation` ligado, `nodeIntegration` desligado. A
interface não tem `require`, `fs` nem `child_process` — toda a superfície está em
`src/preload/index.ts`.

```
src/main/       processo principal — Neovim (PTY), canal de controle, arquivos
src/preload/    a ponte, e a única porta para o sistema
src/renderer/   a casca: árvore, terminal, plugins, temas
```

---

## Ainda não existe

Lista honesta, porque v0.0.4 ainda quer dizer isso:

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
- **Sem testes automatizados** na casca.

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
7. **Conserto:** a janela do terminal nascia travada. A ponte prometia um
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

As fontes IBM Plex embutidas em `src/renderer/fontes/` são SIL OFL 1.1, e o aviso
delas acompanha o LICENSE.
