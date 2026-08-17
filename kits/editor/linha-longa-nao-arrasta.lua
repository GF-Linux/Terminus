--? LINHA LONGA NÃO ARRASTA — Decisão sobre a rolagem lateral 17/08/2026
--!
--! 1. O caso: escrevendo uma frase longa, a tela ANDAVA PARA O LADO para
--!    acompanhar o cursor, e não havia um jeito óbvio de voltar. Quem estava
--!    escrevendo perdia de vista o começo da própria linha.
--! 2. Isso é o `wrap = false` que o LazyVim traz de fábrica: sem quebra visual,
--!    a única saída é rolar na horizontal.
--! 3. A decisão é a do autor: a linha **quebra na tela** e fica toda visível.
--!    Quem quiser acompanhar o que escreve desce com a seta.
--! 4. Quebra só na TELA — o arquivo continua com uma linha só. Nada é gravado
--!    diferente do que foi escrito.

return {
  {
    "LazyVim/LazyVim",
    opts = function()
      --* A linha inteira aparece, sem rolagem lateral.
      vim.opt.wrap = true

      --! Quebra no espaço, nunca no meio da palavra. Sem isto, um nome de
      --! variável longo é cortado ao meio e fica ilegível.
      vim.opt.linebreak = true

      --! A continuação nasce alinhada com a linha de cima, e ainda recuada dois
      --! espaços. Sem isto a continuação começa na coluna 0 e parece uma linha
      --! nova de código — que é justamente o que ela não é.
      vim.opt.breakindent = true
      vim.opt.breakindentopt = "shift:2"

      --! A marca diz "isto é continuação". Sem emoji, como manda a regra da
      --! casa: uma seta de canto, que é o desenho do que aconteceu.
      vim.opt.showbreak = "↳ "

      --? A SETA PASSA A ANDAR PELO QUE SE VÊ
      --!
      --! Sem isto, a seta para baixo PULA a continuação: ela anda de linha do
      --! arquivo, e a continuação não é uma linha do arquivo. O efeito é a
      --! tela mexer sem o cursor parar onde o olho está.
      --! `v:count == 0` preserva o `3j`: com número na frente, continua sendo
      --! três linhas de verdade, que é o que quem digita `3j` quer.
      local function porTela(tecla, visual)
        return function()
          return vim.v.count == 0 and visual or tecla
        end
      end
      for _, par in ipairs({ { "j", "gj" }, { "k", "gk" }, { "<Down>", "g<Down>" }, { "<Up>", "g<Up>" } }) do
        vim.keymap.set({ "n", "x" }, par[1], porTela(par[1], par[2]), { expr = true, silent = true })
      end
      --! Em modo de escrita não há contador, então o mapa é direto.
      vim.keymap.set("i", "<Down>", "<C-o>g<Down>", { silent = true })
      vim.keymap.set("i", "<Up>", "<C-o>g<Up>", { silent = true })
    end,
  },

  {
    "folke/snacks.nvim",
    optional = true,
    keys = {
      --? O BOTÃO DE VOLTAR QUE FALTAVA
      --!
      --! O autor pediu "um botão de voltar". Este é ele: liga e desliga a
      --! quebra. Em arquivo de dado largo — uma tabela, um CSV, um alinhamento
      --! de sequência — a quebra atrapalha, e aí se desliga sem editar nada.
      {
        "<leader>uw",
        function()
          vim.opt_local.wrap = not vim.wo.wrap
          vim.notify(
            vim.wo.wrap and "linha quebra na tela" or "linha corrida (rola para o lado)",
            vim.log.levels.INFO
          )
        end,
        desc = "Quebrar linha na tela (liga/desliga)",
      },
    },
  },
}
