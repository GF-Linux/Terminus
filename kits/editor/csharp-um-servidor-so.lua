--? C# COM UM SERVIDOR SÓ — Decisão sobre omnisharp x roslyn 17/08/2026
--!
--! 1. O extra `lang.dotnet` do LazyVim liga o **omnisharp**. O Neovim 0.12, por
--!    conta própria, liga o **roslyn_ls** assim que ele existe no Mason.
--! 2. Resultado medido, num arquivo de 7 linhas com 2 erros de verdade:
--!       7 diagnósticos, vindos de 3 fontes diferentes
--!       3 processos `dotnet`, ~300 MB cada — quase 1 GB para editar um arquivo
--! 3. Não é o dobro do serviço, é o mesmo serviço duas vezes: cada erro aparece
--!    repetido, e cada sugestão do autocomplete também.
--! 4. Fica o **roslyn**, que é o servidor atual da Microsoft — o mesmo que o VS
--!    Code usa. O omnisharp é o antigo, roda sobre mono e está em manutenção.
--! 5. Isto NÃO desinstala o omnisharp: só desliga. Trocar de volta é apagar este
--!    arquivo.

return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        omnisharp = { enabled = false },
      },
    },
  },

  --! O extra também instala `omnisharp` pelo Mason. Sem tirar daqui, ele volta
  --! sozinho na próxima abertura, e o desligamento acima viraria só um remendo
  --! sobre um download que continua acontecendo.
  {
    "mason-org/mason-lspconfig.nvim",
    optional = true,
    opts = function(_, opts)
      opts.ensure_installed = vim.tbl_filter(function(nome)
        return nome ~= "omnisharp"
      end, opts.ensure_installed or {})
    end,
  },
}
