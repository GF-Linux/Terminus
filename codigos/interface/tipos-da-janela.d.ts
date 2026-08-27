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


//! O `@codingame/monaco-vscode-editor-api` procura `MonacoEnvironment.getWorker`
//! para criar Web Worker — diferente do `monaco-editor` 0.56, que se auto-fiava.
//! O tipo não vem no pacote quando se usa empacotador, então mora aqui.
declare global {
  interface Window {
    MonacoEnvironment?: { getWorker(id: string, rotulo: string): Worker };
  }
}

//! O `?worker` do Vite: cada import destes vira uma classe que constrói o
//! trabalhador já apontado para o arquivo emitido no pacote.
declare module "*?worker" {
  const Trabalhador: new () => Worker;
  export default Trabalhador;
}

//! O `?raw` do Vite: traz o conteúdo do arquivo como texto, sem interpretá-lo. É como o
//! `kits/editor/tema.lua` chega à casca — o kit continua sendo a fonte da verdade da paleta,
//! e ninguém mantém uma segunda lista de cores.
declare module "*?raw" {
  const conteudo: string;
  export default conteudo;
}
