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

> **Estado: v0.0.1.** Primeira versão pública, e é cedo. Roda a partir do
> repositório, foi usada de verdade numa máquina só (Fedora 44 / KDE Wayland) e
> tem arestas — a lista honesta está em [Ainda não existe](#ainda-não-existe).

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

## Rodar

Precisa de **Neovim**, **Node** e um compilador C++ (o `node-pty` é módulo
nativo).

```bash
# Fedora
sudo dnf install -y neovim nodejs gcc-c++ make

git clone <este-repositório> terminus
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
src/renderer/   a casca: árvore, abas, terminal, temas
```

---

## Ainda não existe

Lista honesta, porque v0.0.1 quer dizer isso:

- **Não está empacotado.** Roda do repositório; não há AppImage nem RPM.
- **Testado numa máquina só** — Fedora 44, KDE em Wayland. Nunca rodou em GNOME,
  em X11 puro, em outra distribuição, no macOS nem no Windows.
- **Terminal em janela separada** — o botão foi removido até existir de verdade.
- **Resíduo do produto anterior**: este repositório nasceu como uma IDE de
  bioinformática, e sobraram partes escondidas (um editor CodeMirror por baixo,
  visualizador de cromatograma, trilha de estudo, um assistente). Elas não
  aparecem na tela e serão removidas.
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

## Licença

**PolyForm Noncommercial License 1.0.0** — livre para uso não comercial; veja
[LICENSE](LICENSE).
