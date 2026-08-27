import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve("codigos/sistema/janela/partida.ts") } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve("codigos/porta/ponte-para-a-interface.ts") } },
    },
  },
  renderer: {
    root: resolve("codigos"),
    //? ⚠️ O ALIAS ABAIXO EXISTE POR UMA FALHA DE RESOLUÇÃO, e ela é do empacotador
    //! O `@codingame/monaco-vscode-api` publica o `exports` como
    //!   `"./vscode/*": { "default": "./vscode/src/*.js" }` — um curinga de VÁRIOS
    //!   segmentos. O Node resolve isso corretamente (medido: `require.resolve` de
    //!   `.../vscode/vs/base/browser/cssValue` devolve o `.../vscode/src/...js`), mas o
    //!   resolvedor do Rollup usado pela construção NÃO — e a construção morre no primeiro
    //!   dos **775** imports desse formato que os 42 pacotes do `@codingame` fazem entre si.
    //! Um alias de PREFIXO cobre os 775 de uma vez, porque todos partem do mesmo lugar. Ele
    //!   aponta para o caminho REAL do disco — o mesmo que o `exports` aponta —, então não
    //!   inventa nada: só faz à mão o que o mapa já diz.
    resolve: {
      alias: [
        {
          find: /^@codingame\/monaco-vscode-api\/vscode\/(.*)$/,
          replacement: resolve("node_modules/@codingame/monaco-vscode-api/vscode/src/$1"),
        },
      ],
      //! `dedupe`: com duas cópias do editor em memória haveria DOIS registros de
      //!   provedores — o cliente LSP escreveria num e o editor leria do outro, e nada
      //!   funcionaria sem um único erro na tela.
      dedupe: ["vscode", "monaco-editor", "@codingame/monaco-vscode-api"],
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve("codigos/interface/pagina.html"),
          // A segunda janela da ADR 0031 saiu (19/08): o botão que a abria hoje
          // abre o Konsole de verdade, e uma página só voltou a bastar.
        },
      },
    },
  },
});
