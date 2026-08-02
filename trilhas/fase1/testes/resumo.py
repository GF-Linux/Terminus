"""Verificador de resumo(itens, rotulo='itens') — Tópico 3."""

FUNCAO = "resumo"
ELOGIO = "Valor padrão: a função serve para os dois jeitos de chamar."


def verificar(mod):
    padrao = mod.resumo(["A", "C", "G"])
    assert padrao == "3 itens", f'resumo(["A","C","G"]) devolveu {padrao!r}; esperado "3 itens"'

    com_rotulo = mod.resumo(["A", "C", "G"], "bases")
    assert com_rotulo == "3 bases", (
        f'resumo(["A","C","G"], "bases") devolveu {com_rotulo!r}; esperado "3 bases"'
    )

    vazio = mod.resumo([])
    assert vazio == "0 itens", f"resumo([]) devolveu {vazio!r}; esperado \"0 itens\""
