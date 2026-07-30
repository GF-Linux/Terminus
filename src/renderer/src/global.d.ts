import type { ApiBancada } from "../../preload/index.js";

declare global {
  interface Window {
    /** Exposta pelo preload via contextBridge. É a única porta para o sistema. */
    readonly bancada: ApiBancada;
  }
}

export {};
