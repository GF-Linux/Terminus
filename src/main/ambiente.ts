import { existsSync } from "node:fs";

/**
 * O Python que o Terminus usa.
 *
 * A versão anterior procurava um env específico de um laboratório (miniforge,
 * `easycontig-demo`) — resíduo do produto de bioinformática que este repositório
 * já foi. Agora é o Python do sistema, que é o certo para uma ferramenta que não
 * conhece a máquina de quem a usa.
 *
 * Serve a **uma** coisa: reescrever `pip install x` como `python3 -m pip
 * install x` na linha de comando. A diferença não é preciosismo — o `pip` do
 * PATH pode instalar num Python e o `import` procurar em outro, e essa é uma das
 * primeiras pedras em que quem chega ao Linux tropeça.
 */
export function acharPython(): string {
  for (const caminho of ["/usr/bin/python3", "/usr/local/bin/python3"]) {
    if (existsSync(caminho)) return caminho;
  }
  // Sem caminho absoluto conhecido, o PATH resolve. `spawn` sem shell continua
  // valendo: o nome do programa não é reinterpretado por ninguém.
  return "python3";
}
