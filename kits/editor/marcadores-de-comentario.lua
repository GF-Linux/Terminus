--? MARCADORES DE COMENTÁRIO — Decisão sobre dar cor ao #! e ao #* 17/08/2026
--!
--! 1. O `todo-comments.nvim` JÁ vinha instalado: é padrão do LazyVim
--!    (`lazyvim/plugins/editor.lua`). Não havia o que instalar.
--! 2. O que faltava é outra coisa: medido num arquivo com quatro linhas, ele
--!    reconhecia UMA — o `# TODO:`. Os marcadores desta casa (`#?`, `#!`, `#*`)
--!    não eram reconhecidos, e como não há nenhum Better Comments instalado,
--!    eles não tinham cor nenhuma na tela.
--! 3. A regra desta casa é: sem emoji; `#!` vermelho, `#*` verde, `#?` título.
--!    Este arquivo faz o editor cumprir a regra — e, de brinde, os marcadores
--!    passam a ser encontráveis pelo `Espaço st`, como qualquer TODO.

--? POR QUE O PADRÃO CAPTURA SÓ O SINAL, E NÃO O MARCADOR INTEIRO
--!
--! MEDIDO na sessão de verdade, com o socket do Terminus:
--!     //* linha, col 0 -> is_comment=nil    <- descartado
--!     //* linha, col 1 -> is_comment=true
--!     // TODO:  col 3  -> is_comment=true   <- por isso o TODO sempre pintou
--! O plugin só destaca dentro de comentário (`comments_only`), e pergunta ao
--! treesitter na coluna ONDE O CASAMENTO COMEÇA. Na coluna 0 — o primeiro
--! caractere da linha — o treesitter não devolve captura nenhuma.
--! Capturando o marcador inteiro (`//*`), o casamento começava na coluna 0 e
--! era jogado fora TODA VEZ. Capturando só o sinal (`*`), começa na coluna 2 em
--! `//*` e na 1 em `#*` — dentro do comentário, e aí passa.
--! Por isso as chaves da tradução são "!", "*" e "?", e não "#!", "//*" e afins.

--? POR QUE OS MARCADORES NÃO ENTRAM COMO "alt"
--!
--! 4. O caminho óbvio seria `alt = { "#!", "#*", "#?" }`. Ele NÃO funciona:
--!    o plugin monta o padrão de destaque juntando todas as palavras numa
--!    alternância e casa com `\v` (very magic), onde `*` e `?` são
--!    quantificadores. Um `|#*` no meio da alternância vira regex quebrada.
--! 5. A saída é não passar os marcadores por ali: o padrão abaixo usa uma
--!    CLASSE (`[!*?]`), onde os dois são literais nos dois motores de busca —
--!    o do Vim e o do ripgrep.
--! 6. E a tradução "texto casado -> palavra-chave" é preenchida à mão em
--!    `Config.keywords`, depois do setup. É a mesma tabela que o `alt` alimenta.

--* O sinal capturado -> a palavra que carrega o ícone e a cor.
local TRADUCAO = { ["!"] = "AVISO", ["*"] = "VERDE", ["?"] = "TITULO" }

--* O padrão do Vim (very magic) e o do ripgrep. São motores diferentes, mas a
--* classe `[!*?]` quer dizer a mesma coisa nos dois.
--! `%(...)` é grupo QUE NÃO CAPTURA no `\v` do Vim: a abertura do comentário
--! entra no casamento mas fica de fora da captura, e o casamento passa a
--! começar no sinal — nunca na coluna 0.
local MARCAS_VIM = [[.*%(\#|//|--)([!*?])]]
local MARCAS_RG = [[(\b(KEYWORDS):|#[!*?]|//[!*?]|--[!*?])]]

return {
  {
    "folke/todo-comments.nvim",

    opts = function(_, opts)
      opts.keywords = vim.tbl_extend("force", opts.keywords or {}, {
        --! Ícone em ASCII, e não em emoji: é a regra da casa, e o ícone repete
        --! o próprio marcador — quem vê a lista reconhece sem legenda.
        AVISO = { icon = "!", color = "error" },
        VERDE = { icon = "*", color = "verde" },
        --! Cor própria, e não `info`: medido, o `info` dava a MESMA cor do TODO
        --! (#89dceb), e um cabeçalho de seção com cara de pendência engana a
        --! primeira leitura do arquivo.
        TITULO = { icon = "?", color = "titulo" },
      })

      opts.colors = vim.tbl_extend("force", opts.colors or {}, {
        --! Verde pelo grupo do diagnóstico primeiro, para acompanhar o tema; o
        --! hexadecimal é o verde do catppuccin, e só entra se o grupo não
        --! existir. Cor chumbada sem alternativa brigaria ao trocar de tema.
        verde = { "DiagnosticOk", "@string", "#a6e3a1" },
        --! O acento do Jared-Linux, o mesmo `--acento` da casca do Terminus: o
        --! cabeçalho de seção é marca da casa, e usa a cor da casa.
        titulo = { "#b9bef2" },
      })

      opts.highlight = vim.tbl_extend("force", opts.highlight or {}, {
        --! Os dois padrões: o de fábrica (TODO:, FIX:, ...) continua inteiro, e
        --! o dos marcadores entra ao lado. Substituir o primeiro apagaria os
        --! TODO de qualquer projeto que não seja meu.
        pattern = { [[.*<(KEYWORDS)\s*:]], MARCAS_VIM },
        --! `after = "fg"` é o padrão do plugin, e é o que faz o TEXTO do
        --! comentário ganhar a cor do marcador — que é o comportamento que a
        --! regra desta casa descreve ("#! para vermelho, #* verde").
        --! Eu tinha posto `after = ""`, e o resultado foi o sinal colorido de um
        --! caractere e a frase inteira cinza: reconhecia e não se via.
        keyword = "wide_fg",
        after = "fg",
      })

      --! A busca do ripgrep aceita UM padrão só (é `gsub` numa string, não uma
      --! lista), então os dois casos vivem na mesma alternância.
      opts.search = vim.tbl_extend("force", opts.search or {}, {
        pattern = MARCAS_RG,
      })

      return opts
    end,

    config = function(_, opts)
      local Config = require("todo-comments.config")

      --? POR QUE ISTO SE PENDURA NO `_setup`, E NÃO RODA DIRETO
      --!
      --! O `setup` do plugin ADIA o trabalho quando o Neovim ainda está
      --! abrindo (`vim_did_enter == 0` -> `vim.defer_fn`). Rodando direto, o
      --! que vem depois encontra a metade que ainda não existe.
      --! Medido, e foi um defeito de verdade que ficou escondido:
      --!     Failed to run `config` for todo-comments.nvim
      --!     ...marcadores-de-comentario.lua:113: attempt to call field
      --!     'search_regex' (a nil value)
      --! E era INTERMITENTE: quando o plugin carregava depois da abertura, o
      --! `setup` rodava na hora e tudo funcionava. Quando carregava durante,
      --! estourava e os marcadores ficavam sem cor — sem ninguém saber por quê.
      --! Pendurando no `_setup`, o ajuste acontece logo depois dele, aconteça
      --! ele agora ou daqui a pouco.
      local originalSetup = Config._setup
      Config._setup = function(...)
        originalSetup(...)

        --? O REGEX DE BUSCA É CONGELADO ANTES DE SUJAR A TABELA
        --!
        --! O plugin monta a lista de palavras do ripgrep a partir das CHAVES de
        --! `Config.keywords`. Acrescentando "!", "*" e "?" ali, elas entram na
        --! alternância e o ripgrep recebe `|*|` — quantificador sem nada para
        --! repetir, regex inválida, busca devolvendo ZERO.
        --! Medido: `Espaço st` passou de 6 achados para 0 quando isto faltava.
        local buscaCongelada = Config.search_regex()
        Config.search_regex = function()
          return buscaCongelada
        end

        for sinal, palavra in pairs(TRADUCAO) do
          Config.keywords[sinal] = palavra
        end
      end

      require("todo-comments").setup(opts)
    end,
  },
}
