-- Dois ajustes pedidos em 2026-08-14.

-- (1) As setas na caixa de completação.
--     O preset "default" do blink já mapeia <Up>/<Down>, mas deixamos explícito
--     para não depender de qual preset o LazyVim escolher no futuro.
--     Atenção: isto vale para a CAIXA de sugestões. O texto fantasma cinza do
--     Copilot não é caixa e não anda de seta — ali é Alt+] e Alt+[.
return {
  {
    "saghen/blink.cmp",
    optional = true,
    opts = function(_, opts)
      opts.keymap = opts.keymap or {}
      opts.keymap["<Up>"] = { "select_prev", "fallback" }
      opts.keymap["<Down>"] = { "select_next", "fallback" }
      return opts
    end,
  },

  -- (2) Rodar o arquivo aberto sem digitar caminho nenhum.
  --     Espaço + r  →  salva, abre o terminal já na pasta do arquivo, roda.
  {
    "folke/snacks.nvim",
    optional = true,
    keys = {
      {
        "<leader>r",
        function()
          if vim.bo.buftype ~= "" then
            vim.notify("Isto não é um arquivo", vim.log.levels.WARN)
            return
          end
          vim.cmd("silent! write")
          local arquivo = vim.fn.expand("%:p")
          local pasta = vim.fn.expand("%:p:h")
          local nome = vim.fn.expand("%:t")

          --? O QUE ACONTECE AO APERTAR Espaço+r
          --!
          --! 1. Linguagem interpretada: o programa É o arquivo, então basta
          --!    chamar o interpretador.
          --! 2. C e C++ NÃO são assim: precisam ser COMPILADOS antes, e o que
          --!    roda é o binário — dois passos, não um.
          --! 3. O binário nasce em /tmp, e não ao lado do código: compilar não
          --!    pode sujar a pasta de quem só queria ver o programa rodar.
          --! 4. Se a compilação falhar, o executável NÃO roda — senão a tela
          --!    mostraria a saída da versão anterior e pareceria que compilou.
          local interpretado = ({
            python = "python3",
            lua = "lua",
            sh = "sh",
            bash = "bash",
          })[vim.bo.filetype]

          local compilado = ({
            cpp = { "g++", "-std=c++20", "-O2", "-Wall" },
            c = { "gcc", "-std=c17", "-O2", "-Wall" },
          })[vim.bo.filetype]

          --? C# NÃO É NENHUM DOS DOIS
          --!
          --! 5. Quem compila é o `dotnet`, e ele decide sozinho o que fazer. Só
          --!    que ele responde a DUAS perguntas diferentes:
          --!    - numa pasta com .csproj, `dotnet run` roda O PROJETO;
          --!    - sem projeto, o .NET 10 roda o ARQUIVO: `dotnet run x.cs`.
          --! 6. Passar o arquivo dentro de um projeto dá erro, e não passar fora
          --!    dele também. Por isso a escolha é olhando o disco, e não pelo
          --!    tipo do arquivo.
          local dotnet = nil
          if vim.bo.filetype == "cs" or vim.bo.filetype == "fsharp" then
            local projeto = vim.fs.find(
              function(nome_do_arquivo)
                --! `%.` é o ponto literal em padrão de Lua. `\.` NÃO existe em
                --! string de Lua e derruba o arquivo inteiro ao carregar.
                return nome_do_arquivo:match("%.[cf]sproj$") or nome_do_arquivo:match("%.sln$")
              end,
              { path = pasta, upward = true, type = "file" }
            )[1]
            dotnet = projeto
              and { "dotnet", "run", "--project", vim.fn.fnamemodify(projeto, ":h") }
              or { "dotnet", "run", arquivo }
          end

          if not interpretado and not compilado and not dotnet then
            vim.notify("Não sei rodar arquivo do tipo '" .. vim.bo.filetype .. "'", vim.log.levels.WARN)
            return
          end

          --* C#: o dotnet cuida de compilar. Um passo só, como interpretada.
          if dotnet then
            Snacks.terminal(dotnet, { cwd = pasta, interactive = true })
            vim.notify("rodando " .. nome .. " pelo dotnet", vim.log.levels.INFO)
            return
          end

          --* Compilado: monta "compila && executa", com o binário fora da pasta.
          if compilado then
            local binario = "/tmp/terminus-" .. vim.fn.fnamemodify(arquivo, ":t:r")
            local cmd = table.concat(compilado, " ")
              .. " " .. vim.fn.shellescape(arquivo)
              .. " -o " .. vim.fn.shellescape(binario)
              .. " && " .. vim.fn.shellescape(binario)
            Snacks.terminal(
              { "sh", "-c", cmd .. '; printf "\\n\\033[2m[Enter fecha]\\033[0m "; read _' },
              { cwd = pasta, interactive = true }
            )
            vim.notify("compilando e rodando " .. nome, vim.log.levels.INFO)
            return
          end

          local interpretador = interpretado

          Snacks.terminal(
            {
              "sh",
              "-c",
              interpretador
                .. " "
                .. vim.fn.shellescape(arquivo)
                .. '; printf "\\n\\033[2m[Enter fecha]\\033[0m "; read _',
            },
            { cwd = pasta, interactive = true }
          )
          vim.notify("rodando " .. nome .. " em " .. pasta, vim.log.levels.INFO)
        end,
        desc = "Rodar este arquivo",
      },
    },
  },
}
