//! A instância da aparência (tema e papel de parede).
//!
//! Mora sozinha porque duas peças precisam dela e não podem depender uma da
//! outra: a tela de Configurações desenha os controles, e a partida a carrega
//! antes do primeiro desenho.

import { Aparencia } from "../design/temas-e-papel-de-parede.js";
import { $, api } from "./nucleo-da-casca.js";

//* O papel de parede e o tema da casca, carregados na partida.
//! QUEM MUDA NAO CONHECE QUEM OLHA. Antes, este modulo importava a tela de
//!   configuracoes so para mandar ela se redesenhar — e a tela importava a
//!   aparencia para le-la. Os dois se importavam, e o ciclo sobreviveu a duas
//!   refatoracoes anteriores porque nenhum portao media ciclo.
//! Agora quem quiser saber que a aparencia mudou se REGISTRA aqui.
let aoMudar: () => void = () => {};

//* Registra quem deve se redesenhar quando a aparencia mudar.
export function aoMudarAparencia(redesenhar: () => void): void {
  aoMudar = redesenhar;
}

export const aparencia = new Aparencia($("fundoTela"), api, () => aoMudar());
