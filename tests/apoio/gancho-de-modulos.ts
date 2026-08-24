//? GANCHO DE MÓDULOS — Decisão sobre como a suíte carrega `sistema/` fora do Electron 24/08/2026
//!
//! 1. Quatro obstáculos foram MEDIDOS antes de escolher a forma (a tabela inteira está em
//!    `docs/tracker.md §10.1`). Os dois que este arquivo resolve:
//!      a) `electron` é CJS e resolve para uma string — o import nomeado morre no link;
//!      b) a produção importa com `.js` (o Vite resolve) e o disco tem `.ts`.
//! 2. A alternativa `t.mock.module()` foi RECUSADA POR MEDIÇÃO: `typeof mock.module` é
//!    `undefined` neste Node (v22.23.1) sem `--experimental-test-module-mocks`, e a flag
//!    imprime `ExperimentalWarning` — a P1 exige saída limpa.
//! 3. `registerHooks` é síncrono e no mesmo thread (Node ≥ 22.15), então não há worker
//!    nem canal a sincronizar: o gancho vale a partir do próximo import.
//! 4. ⚠️ O `HOME` É REDIRECIDO AQUI, E NÃO DENTRO DE CADA TESTE, e a razão é de segurança:
//!    `configuracao-salva.ts:15` calcula a pasta de config a partir de `os.homedir()` NO
//!    CARREGAMENTO DO MÓDULO — e em ESM todo `import` estático roda ANTES da primeira
//!    linha do corpo do arquivo. Um teste que redirecionasse `HOME` no próprio corpo
//!    chegaria tarde e escreveria no `~/.config/terminus/` de quem roda a suíte.
//!    É o §8·S2 aplicado ao andaime: a trava fica na camada que vê todo pedido, porque
//!    "a sétima rota é a que alguém esquece".

import { registerHooks } from "node:module";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

//! Uma casa por PROCESSO. `node --test` dá um processo a cada arquivo de teste (medido),
//!   então cada arquivo nasce com casa limpa e não herda resto do vizinho.
const CASA = mkdtempSync(path.join(tmpdir(), "terminus-teste-"));
process.env["HOME"] = CASA;

//! Só remove o que ele mesmo criou, nesta execução, dentro de `/tmp` (§13.3b). O
//!   `mkdtempSync` garante nome novo e exclusivo — não há caminho pelo qual isto
//!   alcance pasta de outra pessoa.
process.on("exit", () => {
  try {
    rmSync(CASA, { recursive: true, force: true });
  } catch {
    /* a casa já tinha ido */
  }
});

const DUBLE = new URL("./electron-duble.ts", import.meta.url).href;

registerHooks({
  //! Sem anotação de tipo de propósito: o literal é tipado pelo CONTEXTO da assinatura de
  //!   `registerHooks`, então os três parâmetros herdam os tipos reais do `@types/node`.
  //!   Anotá-los à mão foi o que o `tsc` reprovou — tipo escrito de cabeça diverge do real.
  resolve(especificador, contexto, proximo) {
    if (especificador === "electron") return { url: DUBLE, shortCircuit: true };

    //! A ponte `.js` → `.ts`, e SÓ quando o `.js` não existe e o `.ts` existe. A
    //!   condição dupla importa: se um dia houver `.js` de verdade ao lado, ele ganha,
    //!   e o gancho não sequestra em silêncio um arquivo que o autor pôs ali de propósito.
    if (especificador.startsWith(".") && especificador.endsWith(".js") && contexto.parentURL) {
      const comoEsta = new URL(especificador, contexto.parentURL);
      const comTs = new URL(especificador.replace(/\.js$/, ".ts"), contexto.parentURL);
      if (!existsSync(fileURLToPath(comoEsta)) && existsSync(fileURLToPath(comTs))) {
        return { url: comTs.href, shortCircuit: true };
      }
    }

    return proximo(especificador, contexto);
  },
});
