//* Os quatro diálogos nativos que o Terminus abre — escolher, salvar, perguntar.

import { dialog, type BrowserWindow } from "electron";

//! POR QUE OS QUATRO NUM LUGAR SÓ: espalhados pelos handlers, cada um carregava
//!   `dialog` para dentro do registrador e obrigava o registrador a conhecer o
//!   Electron. Reunidos aqui, o registrador só sabe pedir — e a janela chega a
//!   ele injetada, não importada.

//* Abre o seletor de pasta. Devolve `null` se a pessoa cancelar.
export async function escolherPasta(janela: BrowserWindow, titulo: string): Promise<string | null> {
  const r = await dialog.showOpenDialog(janela, { title: titulo, properties: ["openDirectory"] });
  return r.canceled ? null : (r.filePaths[0] ?? null);
}

//* Pergunta ONDE e COM QUE NOME de uma vez. Devolve `null` se cancelar.
//! `showSaveDialog` e não `showOpenDialog`: o diálogo de salvar já pergunta as
//!   duas coisas que faltam. Com o de abrir seria escolher a pasta-mãe numa tela
//!   e digitar o nome em outra.
export async function escolherOndeSalvar(
  janela: BrowserWindow,
  titulo: string,
  rotuloDoBotao: string,
  caminhoPadrao: string,
): Promise<string | null> {
  const r = await dialog.showSaveDialog(janela, {
    title: titulo,
    buttonLabel: rotuloDoBotao,
    defaultPath: caminhoPadrao,
    properties: ["createDirectory"],
  });
  return r.canceled ? null : (r.filePath ?? null);
}

//* Abre o seletor de imagem para o papel de parede.
export async function escolherImagem(janela: BrowserWindow, titulo: string): Promise<string | null> {
  const r = await dialog.showOpenDialog(janela, {
    title: titulo,
    properties: ["openFile"],
    filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
  });
  return r.canceled ? null : (r.filePaths[0] ?? null);
}

//* Pergunta se pode excluir. Devolve `true` só quando a pessoa confirma.
//! O texto MUDA conforme a lixeira alcance ou não o caminho: prometer
//!   recuperação para um arquivo que vai sumir de vez é pior que não avisar.
export async function perguntarExclusao(
  janela: BrowserWindow,
  nome: string,
  temLixeira: boolean,
): Promise<boolean> {
  const r = await dialog.showMessageBox(janela, {
    type: "warning",
    buttons: [temLixeira ? "Mover para a lixeira" : "Apagar de vez", "Cancelar"],
    defaultId: 1,
    cancelId: 1,
    message: `Excluir "${nome}"?`,
    detail: temLixeira
      ? "Vai para a lixeira do sistema — dá para recuperar de lá."
      : "Este arquivo está em outro disco — pendrive, disco externo ou pasta " +
        "temporária —, e a lixeira do sistema não vale para ele.\n\n" +
        "Apagar aqui NÃO TEM VOLTA. Numa pasta de corrida pode haver arquivo " +
        "que não se refaz.",
  });
  return r.response === 0;
}
