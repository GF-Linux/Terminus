"""Verificador de proporcao(itens, alvos) — Tópico 3."""

FUNCAO = "proporcao"
ELOGIO = "Genérica assim, ela responde o GC e mais uma dúzia de perguntas."


def verificar(mod):
    casos = [
        ((["G", "C", "A", "T"], {"G", "C"}), 50.0),
        ((["G", "G", "G", "G"], {"G", "C"}), 100.0),
        ((["A", "T"], {"G", "C"}), 0.0),
        (([], {"G", "C"}), 0.0),
    ]
    for (itens, alvos), esperado in casos:
        obtido = mod.proporcao(list(itens), set(alvos))
        assert obtido is not None, (
            f"proporcao({itens!r}, {alvos!r}) devolveu None. "
            "Você imprimiu em vez de devolver? print mostra; return entrega."
        )
        assert abs(float(obtido) - esperado) < 0.001, (
            f"proporcao({itens!r}, {alvos!r}) devolveu {obtido!r}; esperado {esperado}"
        )
