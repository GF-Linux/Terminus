"""Verificador de valida(itens, permitidos) — Tópico 4.

Testa as duas metades: devolver True quando está tudo certo, e **levantar**
ValueError quando não está — com o item errado citado na mensagem, que é o que
transforma um erro em um aviso útil.
"""

FUNCAO = "valida"
ELOGIO = "Quebrar cedo e dizer o que quebrou vale mais que seguir em frente com dado torto."


def verificar(mod):
    ok = mod.valida(["A", "C", "G"], {"A", "C", "G", "T"})
    assert ok is True, f"com tudo certo, valida() devolveu {ok!r}; esperado True"

    try:
        mod.valida(["A", "X", "G"], {"A", "C", "G", "T"})
    except ValueError as erro:
        assert "X" in str(erro), (
            f"levantou ValueError, mas a mensagem ({str(erro)!r}) não diz qual item estava errado. "
            "Quem lê o erro precisa saber onde olhar."
        )
    except Exception as outro:
        raise AssertionError(
            f"levantou {type(outro).__name__} em vez de ValueError — o enunciado pede ValueError"
        ) from None
    else:
        raise AssertionError(
            "com um item fora da lista, valida() não levantou nada. "
            "O enunciado pede raise ValueError, não devolver False."
        )
