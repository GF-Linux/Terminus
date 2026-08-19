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
--! 4. Por isso passa a atualizar durante a escrita.
--!
--? POR QUE ISTO VAI EM `opts.diagnostics`, E NÃO EM `vim.diagnostic.config()`
--!
--! 5. Primeira tentativa: chamar `vim.diagnostic.config(...)` dentro de `opts`.
--!    Não funcionou, e em silêncio: o LazyVim aplica os diagnósticos DELE no
--!    `config`, que roda depois — e sobrescreve. Medido: depois da minha
--!    chamada, `virtual_text` voltava a ser `{ prefix = "●", ... }`, o padrão
--!    dele. O jeito certo é escrever na tabela que ele mesmo vai aplicar.

--? O AVISO DE "NÃO USEI AINDA" — Decisão de 19/08/2026
--!
--! 6. Reclamação do autor: escrever `int num = 2;` em C# e o editor já acusar
--!    "variável não utilizada". Medido, e o aviso NÃO é invenção do erro na
--!    linha — é o compilador:
--!
--!       dotnet build   warning CS0219: A variável "num" é atribuída,
--!                                      mas seu valor nunca é usado
--!       roslyn (LSP)   SEVERIDADE=2 (AVISO)  CODE=CS0219
--!                      SEVERIDADE=3 (INFO)   CODE=IDE0059   <- ja filtrado
--!
--!    Quem escreve na linha é o `virtual_text`; o fato é do compilador. Desligar
--!    o CS0219 esconderia um aviso que é verdadeiro depois que o arquivo está
--!    pronto — variável esquecida é lixo, e ele acha lixo.
--! 7. O que está errado não é o aviso: é a HORA. Quem acabou de digitar a linha
--!    ainda não teve chance de usar a variável. O item 4 acima criou isto: com
--!    `update_in_insert = true`, o aviso chega no meio da declaração.
--! 8. Por isso: essa família de aviso — e SÓ ela — fica calada ENQUANTO SE
--!    ESCREVE, e volta ao sair do modo de escrita. Nada deixa de ser detectado;
--!    o `:lua vim.diagnostic.get()`, o quickfix e o `dotnet build` seguem vendo
--!    tudo. O que muda é quando ele aparece na tela.
--! 9. Casa por CÓDIGO, não por texto da mensagem: nesta máquina o roslyn
--!    responde em português, e casar frase quebraria em qualquer outro idioma.

--* Os códigos de "isto ainda não foi usado". Medidos, um a um, abrindo arquivo
--* de cada linguagem e lendo o que o servidor devolveu.
local AINDA_NAO_USEI = {
  --! C# (roslyn) — CS0219 medido; os outros dois são a mesma ideia com outra cara.
  ["CS0219"] = true, --? variável atribuída, valor nunca usado
  ["CS0168"] = true, --? variável declarada, nunca usada
  ["CS8321"] = true, --? função local nunca usada
  ["IDE0059"] = true, --? atribuição desnecessária (chega como INFO, mas fica escrito)
  --! Python (ruff) — medidos: SEVERIDADE=2 nos dois.
  ["F841"] = true, --? variável local atribuída e nunca usada
  ["F401"] = true, --? import ainda sem uso, que é o caso de quem acabou de importar
  --! Lua (lua_ls)
  ["unused-local"] = true,
  ["unused-function"] = true,
  ["unused-vararg"] = true,
  --! C/C++ (clangd, quando o projeto liga -Wall)
  ["-Wunused-variable"] = true,
  ["-Wunused-but-set-variable"] = true,
  ["unused-variable"] = true,
}

local function escrevendo()
  return vim.startswith(vim.api.nvim_get_mode().mode, "i")
end

--* Encurta a mensagem para caber numa linha, ou devolve `nil` para não desenhar.
--! `nil` é o jeito documentado de omitir: "If the return value is nil, the
--! diagnostic is not displayed by the handler" (`:h vim.diagnostic.Opts.VirtualText`).
local function frase(d, teto)
  if escrevendo() and AINDA_NAO_USEI[tostring(d.code)] then return nil end
  --! Mensagem de várias linhas vira uma: o `virtual_text` desenha numa linha
  --! só, e o resto seria cortado no meio da palavra.
  local msg = (d.message or ""):gsub("%s*\n%s*", " ")
  --! Corte com reticências, e não corte seco: quem lê precisa saber que
  --! continua. O texto inteiro aparece embaixo, na linha do cursor.
  if teto and #msg > teto then msg = msg:sub(1, teto - 1) .. "…" end
  return msg
end

--* As duas tabelas de desenho, num lugar só.
--! Ficam aqui fora porque o interruptor lá embaixo precisa REMONTAR as mesmas.
--! Antes ele remontava à mão, e a cópia dele já tinha perdido o corte em 80 —
--! duas descrições da mesma coisa divergem no primeiro conserto feito de um lado.
local NA_LINHA = {
  spacing = 4,
  --! Sem o nome do servidor na frente: numa linha estreita, "pyright:"
  --! empurra a frase para fora da tela.
  source = false,
  prefix = "",
  format = function(d) return frase(d, 80) end,
  --! Aviso e erro sempre; dica e informação NÃO. O servidor tem opinião
  --! sobre quase toda linha ("pode ser estático", "pode simplificar"), e
  --! isso escrito em todas elas vira ruído que esconde o que importa.
  severity = { min = vim.diagnostic.severity.WARN },
}

--* A mensagem INTEIRA, embaixo, só na linha onde o cursor está.
--! É o que resolve o corte acima sem encher a tela. Passa pelo mesmo `frase`,
--! senão o aviso calado em cima reapareceria embaixo, por extenso.
local EMBAIXO = {
  current_line = true,
  format = function(d) return frase(d) end,
}

return {
  {
    "neovim/nvim-lspconfig",
    opts = function(_, opts)
      opts.diagnostics = vim.tbl_deep_extend("force", opts.diagnostics or {}, {
        --* O ponto que faz o recurso existir no Terminus.
        update_in_insert = true,
        virtual_text = NA_LINHA,
        virtual_lines = EMBAIXO,
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
    "neovim/nvim-lspconfig",
    --? A VOLTA DO AVISO AO SAIR DA ESCRITA
    --!
    --! O `format` só é consultado quando o diagnóstico é REDESENHADO. Com
    --! `update_in_insert`, toda tecla redesenha — então o aviso some sozinho
    --! assim que se começa a digitar. Sair do modo de escrita, porém, não é uma
    --! mudança de texto: sem isto o aviso ficaria calado até a próxima tecla, e
    --! quem parasse de escrever para conferir a linha não veria nada.
    --! `InsertEnter` é a metade simétrica: entrar na linha que já mostrava o
    --! aviso deve calá-lo na hora, sem esperar a primeira tecla.
    init = function()
      vim.api.nvim_create_autocmd({ "InsertEnter", "InsertLeave" }, {
        group = vim.api.nvim_create_augroup("terminus_erro_na_linha", { clear = true }),
        desc = "Redesenha o erro na linha ao entrar e sair do modo de escrita",
        callback = function(ev)
          --! `vim.schedule` porque no momento do evento o `nvim_get_mode` ainda
          --! pode responder o modo ANTERIOR — e `frase` pergunta exatamente isso.
          vim.schedule(function()
            if vim.api.nvim_buf_is_valid(ev.buf) then vim.diagnostic.show(nil, ev.buf) end
          end)
        end,
      })
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
            virtual_text = ligado and false or NA_LINHA,
            virtual_lines = ligado and false or EMBAIXO,
          })
          vim.notify(ligado and "erro na linha: desligado" or "erro na linha: ligado", vim.log.levels.INFO)
        end,
        desc = "Erro escrito na linha (liga/desliga)",
      },
    },
  },
}
