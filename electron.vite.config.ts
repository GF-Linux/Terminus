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
          // A segunda janela (ADR 0031). Página própria, entrada própria.
          terminal: resolve("codigos/interface/pagina-do-terminal.html"),
        },
      },
    },
  },
});
