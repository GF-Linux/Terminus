--? ERRO NA PRÓPRIA LINHA — Decisão sobre ver o erro antes de rodar 17/08/2026
--!
--! 1. O caso do autor: ele escrevia C#, rodava, LIA O ERRO NO TERMINAL, entendia
--!    e ajustava. O fluxo funciona — mas obriga a rodar para descobrir o que o
--!    editor já sabia desde que a linha foi escrita.
--! 2. O `virtual_text` do LazyVim já vinha ligado. O que faltava era outra
--!    coisa, e é específica do Terminus:
--!
--?    `update_in_insert = false`, E O TERMINUS VIVE EM MODO DE ESCRITA
--!
--! 3. O Terminus abre o arquivo já em modo de escrita e só sai se a pessoa
--!    quiser (ADR 0025). Com `update_in_insert = false`, o diagnóstico NÃO se
--!    atualiza enquanto se digita — ou seja, no fluxo normal do Terminus ele
--!    quase nunca aparecia. Num editor onde se entra e sai do modo de escrita o
--!    tempo todo, esse padrão faz sentido; aqui ele apaga o recurso.
--! 4. Por isso passa a atualizar durante a escrita. O custo é o erro piscar no
--!    meio de uma palavra ainda incompleta — e é um preço barato perto de
--!    descobrir o erro só ao rodar.
--!
--? POR QUE ISTO VAI EM `opts.diagnostics`, E NÃO EM `vim.diagnostic.config()`
--!
--! 5. Primeira tentativa: chamar `vim.diagnostic.config(...)` dentro de `opts`.
--!    Não funcionou, e em silêncio: o LazyVim aplica os diagnósticos DELE no
--!    `config`, que roda depois — e sobrescreve. Medido: depois da minha
--!    chamada, `virtual_text` voltava a ser `{ prefix = "●", ... }`, o padrão
--!    dele. O jeito certo é escrever na tabela que ele mesmo vai aplicar.

return {
  {
    "neovim/nvim-lspconfig",
    opts = function(_, opts)
      opts.diagnostics = vim.tbl_deep_extend("force", opts.diagnostics or {}, {
        --* O ponto que faz o recurso existir no Terminus.
        update_in_insert = true,

        virtual_text = {
          spacing = 4,
          --! Sem o nome do servidor na frente: numa linha estreita, "pyright:"
          --! empurra a frase para fora da tela.
          source = false,
          prefix = "",
          format = function(d)
            --! Mensagem de várias linhas vira uma: o `virtual_text` desenha numa
            --! linha só, e o resto seria cortado no meio da palavra.
            local msg = d.message:gsub("%s*\n%s*", " ")
            --! Corte com reticências, e não corte seco: quem lê precisa saber
            --! que continua. O texto inteiro aparece embaixo, na linha do cursor.
            if #msg > 80 then msg = msg:sub(1, 79) .. "…" end
            return msg
          end,
          --! Aviso e erro sempre; dica e informação NÃO. O servidor tem opinião
          --! sobre quase toda linha ("pode ser estático", "pode simplificar"), e
          --! isso escrito em todas elas vira ruído que esconde o que importa.
          severity = { min = vim.diagnostic.severity.WARN },
        },

        --* A mensagem INTEIRA, embaixo, só na linha onde o cursor está.
        --! É o que resolve o corte acima sem encher a tela.
        virtual_lines = { current_line = true },
      })
      --? DOIS VERIFICADORES DIZENDO A MESMA COISA
      --!
      --! Em Python rodam o `ruff` e o `pyright`, e os dois avisam de nome que
      --! não existe. Medido na tela: a linha ficava com o recado repetido —
      --!     Undefined name `resultadoo`    "resultadoo" is not defined
      --! Repetido é pior que ausente para quem está aprendendo: parece que são
      --! dois problemas diferentes.
      --! Cada um fica com o que é dele: o `ruff` avisa de nome que não existe
      --! (é linter), o `pyright` cuida de TIPO (é verificador de tipos). Nada
      --! deixa de ser detectado; o que sai é a repetição.
      opts.servers = opts.servers or {}
      opts.servers.pyright = vim.tbl_deep_extend("force", opts.servers.pyright or {}, {
        settings = {
          python = {
            analysis = {
              diagnosticSeverityOverrides = {
                reportUndefinedVariable = "none",
              },
            },
          },
        },
      })

      return opts
    end,
  },

  {
    "folke/snacks.nvim",
    optional = true,
    keys = {
      --? O INTERRUPTOR
      --!
      --! Erro escrito na linha ajuda quando se escreve, e atrapalha quando se
      --! LÊ código dos outros. Quem decide qual é a hora é quem está na tela.
      {
        "<leader>ux",
        function()
          local ligado = vim.diagnostic.config().virtual_text ~= false
          vim.diagnostic.config({
            virtual_text = ligado and false
              or { spacing = 4, source = false, prefix = "", severity = { min = vim.diagnostic.severity.WARN } },
            virtual_lines = ligado and false or { current_line = true },
          })
          vim.notify(ligado and "erro na linha: desligado" or "erro na linha: ligado", vim.log.levels.INFO)
        end,
        desc = "Erro escrito na linha (liga/desliga)",
      },
    },
  },
}
