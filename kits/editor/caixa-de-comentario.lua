--? CAIXA DE COMENTÁRIO — Decisão sobre desenhar cabeçalho de seção 17/08/2026
--!
--! 1. O plugin desenha caixa e linha divisória DENTRO de comentário, usando o
--!    `commentstring` da linguagem do arquivo. Em Lua sai `--`, em Python `#`,
--!    em C++ `//` — sem precisar configurar nada por linguagem.
--! 2. Ele NÃO substitui o `#?` / `#!` / `#*`: aqueles marcam a natureza do texto
--!    (título, aviso, comentário normal) e são coloridos pelo Better Comments.
--!    A caixa marca onde uma SEÇÃO começa. São coisas diferentes na mesma linha.
--! 3. Carrega sob demanda: só existe quando um dos comandos é chamado. Plugin de
--!    desenho não pode custar tempo de abertura.

return {
  {
    "LudoPinelli/comment-box.nvim",

    --! `cmd` e `keys` juntos: o lazy.nvim carrega o plugin no primeiro uso de
    --! qualquer um dos dois. Só `cmd` deixaria os atalhos mortos até alguém
    --! digitar o comando à mão uma vez.
    cmd = {
      "CBcatalog", "CBllbox", "CBlcbox", "CBccbox", "CBline", "CBcline", "CBd", "CBy",
    },

    opts = {
      --! 80 é a largura do texto, não da janela: a caixa acompanha o mesmo
      --! limite que o resto dos comentários deste computador respeita.
      doc_width = 80,
      box_width = 60,
      line_width = 70,
      --! Sem linha em branco automática dentro nem fora. O espaçamento de um
      --! cabeçalho é decisão de quem escreve, e o plugin acrescentando linha por
      --! conta própria obrigaria a apagar uma toda vez.
      inner_blank_lines = false,
      outer_blank_lines_above = false,
      outer_blank_lines_below = false,
    },

    --? OS ATALHOS
    --!
    --! Ficam sob `<leader>cb` — conferido que está livre: em `<leader>c` o
    --! LazyVim usa só `cs`, `cS`, `cm` e `cF`.
    --! Numa linha só desenha em volta dela; com várias selecionadas, em volta do
    --! bloco.
    --!
    --? POR QUE OS ATALHOS TAMBÉM VALEM EM MODO DE ESCRITA
    --!
    --! O Terminus abre o arquivo JÁ em modo de escrita, e isso é decisão de
    --! projeto: "abriu, escreve, e só sai do modo se eu quiser".
    --! Medido: com os atalhos só em normal e visual, apertar Espaço+cbb logo
    --! depois de abrir DIGITAVA " cbb" dentro do texto —
    --!     " cbbLeitura das amostras"
    --! Exigir um Esc antes seria devolver ao usuário o atrito que o Terminus
    --! existe para tirar. O `<Cmd>` executa sem sair do modo de escrita.
    --! Os de apagar e copiar ficam de fora do modo de escrita: os dois pedem
    --! uma seleção, e seleção não existe enquanto se digita.
    keys = {
      { "<leader>cbb", "<Cmd>CBllbox<CR>", mode = { "n", "v", "i" }, desc = "Caixa (à esquerda)" },
      { "<leader>cbc", "<Cmd>CBccbox<CR>", mode = { "n", "v", "i" }, desc = "Caixa centralizada" },
      { "<leader>cbl", "<Cmd>CBline<CR>", mode = { "n", "v", "i" }, desc = "Linha divisória" },
      --! Apagar tem que existir e ser fácil de achar: caixa é desenho, e desenho
      --! feito à mão vira trabalho de apagar à mão.
      --! Medido: em modo normal ele apaga só a LINHA do cursor, não a caixa
      --! inteira. Para desmanchar, selecione as linhas da caixa (V) e aperte.
      --! Por isso a descrição diz "selecionada" — o atalho que engana uma vez
      --! ensina errado para sempre.
      { "<leader>cbd", "<Cmd>CBd<CR>", mode = { "n", "v" }, desc = "Apagar a caixa selecionada" },
      { "<leader>cby", "<Cmd>CBy<CR>", mode = { "n", "v" }, desc = "Copiar a caixa" },
      { "<leader>cbt", "<Cmd>CBcatalog<CR>", desc = "Catálogo de estilos" },
    },
  },
}
