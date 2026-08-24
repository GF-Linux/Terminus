import type { ApiTerminus } from "../porta/ponte-para-a-interface.js";

declare global {
  interface Window {
    /** Exposta pelo preload via contextBridge. É a única porta para o sistema. */
    readonly terminus: ApiTerminus;
  }
}

/** Imagens importadas como URL (o Vite resolve em desenvolvimento e no build).
 *  Referenciar `../../media/x.png` direto no HTML **não** funciona no modo de
 *  desenvolvimento: o caminho sai da raiz do Vite e o servidor devolve o
 *  index.html no lugar do arquivo. */
declare module "*.png" {
  const url: string;
  export default url;
}

export {};
