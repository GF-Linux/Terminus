//! A instância da aparência (tema e papel de parede).
//!
//! Mora sozinha porque duas peças precisam dela e não podem depender uma da
//! outra: a tela de Configurações desenha os controles, e a partida a carrega
//! antes do primeiro desenho.

import { Aparencia } from "../design/temas-e-papel-de-parede.js";
import { $, api } from "./nucleo-da-casca.js";
import { desenharConfigAparencia } from "./tela-de-configuracoes.js";

//* O papel de parede e o tema da casca, carregados na partida.
export const aparencia = new Aparencia($("fundoTela"), api, () => desenharConfigAparencia());
