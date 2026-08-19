import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve("codigos/sistema/janela-principal.ts") } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve("codigos/ponte/ponte-para-a-interface.ts") } },
    },
  },
  renderer: {
    root: resolve("codigos"),
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
