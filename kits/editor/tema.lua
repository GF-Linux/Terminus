-- Tema do editor, com FUNDO TRANSPARENTE.
--
-- A transparência é o que faz a ilustração do papel de parede aparecer por trás
-- do código. Sem ela, o Neovim pinta o próprio fundo por cima e a imagem some —
-- foi assim que o painel do chafa acabou parecendo "PNG colado".
--
-- Dentro do Terminus (marca `BANCADA=1`), o catppuccin é **recolorido** para a
-- paleta Jared-Linux. O fundo já era transparente, mas as peças que pintam a si
-- mesmas — statusline, abas, menu de completação, janelas flutuantes — seguiam
-- na cor do catppuccin, e era isso que fazia a tela misturar dois esquemas: a
-- casca em azul-noite, o miolo em roxo. Fora do Terminus nada muda.

local dentro_do_terminus = vim.env.BANCADA == "1"

-- A paleta da casca. Os nomes são os do catppuccin, os valores são os do
-- Jared-Linux — assim cada grupo que o tema deriva já nasce na cor certa, em vez
-- de precisar de uma lista de `highlight` corrigidos um a um.
--? O CONTRASTE DA ESCRITA — ajustado 17/08/2026
--!
--! O autor pediu mais contraste no que se escreve. Os valores abaixo foram
--! MEDIDOS contra o fundo #0c0e16, não escolhidos por gosto:
--!
--!   text      #d7d9ea 13.76:1  ->  #eaecf7 16.37:1
--!   subtext1  #b6bcd8 10.25:1  ->  #ccd1e8 12.71:1
--!   subtext0   #9ba2c4  7.67:1  ->  #aab1d2  9.11:1   (comentário)
--!   blue      #8f95d6  6.82:1  ->  #a3a9e6  8.60:1   (palavra-chave)
--!   overlay1  #5d6484  3.32:1  ->  #767ea0  4.83:1   (era o mais fraco)
--!
--! O TOM não muda — é o mesmo azul-lavanda do Jared-Linux, só mais claro.
--! Subir a saturação ou trocar a matiz consertaria o contraste estragando a
--! identidade, que é o oposto do pedido.
local jared = {
  base = "#0c0e16", -- área de escrita (transparente por cima disto)
  mantle = "#14161f", -- barras
  crust = "#171a26", -- lateral
  surface0 = "#1b1f2c",
  surface1 = "#232838",
  surface2 = "#2c3144",
  overlay0 = "#5c6382",
  overlay1 = "#767ea0",
  overlay2 = "#8b93b5",
  subtext0 = "#aab1d2",
  subtext1 = "#ccd1e8",
  text = "#eaecf7",
  lavender = "#c9cdf8",
  blue = "#a3a9e6",
  sapphire = "#a3a9e6",
  sky = "#b5bbf0",
  mauve = "#c9cdf8",
}

return {
  { "LazyVim/LazyVim", opts = { colorscheme = "catppuccin-mocha" } },
  {
    "catppuccin/nvim",
    name = "catppuccin",
    opts = {
      transparent_background = true,
      styles = { comments = { "italic" } },
      color_overrides = dentro_do_terminus and { mocha = jared } or {},
    },
  },
}
