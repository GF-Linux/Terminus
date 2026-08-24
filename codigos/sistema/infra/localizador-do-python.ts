import { existsSync } from "node:fs";

//? LOCALIZADOR DO PYTHON — Decisão sobre qual Python usar 16/08/2026
//!
//! 1. É o Python do sistema. A versão anterior procurava um env de laboratório
//!    (miniforge, `easycontig-demo`) — resíduo do produto anterior.
//! 2. Serve a UMA coisa: reescrever `pip install x` como `python3 -m pip
//!    install x` na linha de comando.
//! 3. Não é preciosismo — o `pip` do PATH pode instalar num Python e o `import`
//!    procurar em outro. É das primeiras pedras de quem chega ao Linux.
//? FORA DO CAMINHO (D4, 23/08/2026): exportado e sem chamador — nada importa este
//?   módulo hoje. Mantido até a cabeça decidir apagar; a árvore está no tracker, D4.
//* Devolve o Python do sistema — `/usr/bin/python3`, ou o que estiver no PATH.
//* Serve só para reescrever `pip install x` como `python3 -m pip install x`.
export function acharPython(): string {
  for (const caminho of ["/usr/bin/python3", "/usr/local/bin/python3"]) {
    if (existsSync(caminho)) return caminho;
  }
  // Sem caminho absoluto conhecido, o PATH resolve. `spawn` sem shell continua
  // valendo: o nome do programa não é reinterpretado por ninguém.
  return "python3";
}
