import temaLua from "../../kits/editor/tema.lua?raw";

//? A PALETA — lida do `kits/editor/tema.lua`, que é a FONTE DA VERDADE
//!
//! ⚠️ ISTO NASCEU DE UM DEFEITO ACHADO AO LER O KIT: o editor estava pintando o texto com
//! `#d7d9ea` — e o próprio `tema.lua` documenta esse valor como o que foi **SUBSTITUÍDO em
//! 17/08/2026** por contraste (13,76:1 → 16,37:1 com `#eaecf7`). Eu tinha herdado a cor do
//! xterm do Neovim (`vista-do-neovim.ts`) e nunca conferi contra o kit. Resultado: a casca
//! rodava a paleta **anterior à correção que o autor pediu**, e ninguém veria isso olhando —
//! duas cores próximas parecem a mesma até se medir.
//!
//! POR QUE LER O `.lua` EM VEZ DE COPIAR OS VALORES: copiar cria uma segunda lista, e uma
//! segunda lista é a que vai ficar para trás — foi exatamente o que acabou de acontecer.
//! O kit é o que o Neovim da cabeça usa; lendo dele, **os dois andam juntos por construção**.
//!
//! ⚠️ O LIMITE, DITO: o arquivo é lido **na construção** (`?raw`), não a cada abertura. Mexer
//! no `tema.lua` exige `npm run build` para a casca acompanhar. Ler em tempo de execução
//! custaria um canal de IPC e um módulo a mais no registrador — e o registrador de aparência
//! já está no teto de dois (E2). O preço escolhido foi o rebuild.

//? ⚠️ O KIT NÃO É A PALETA INTEIRA — e essa foi a razão do "não pegou o tema" (26/08)
//!
//! O `tema.lua` **sobrescreve 17 cores** de um tema que tem **26**. As nove que ele NÃO toca
//! — `peach`, `green`, `teal`, `flamingo`, `yellow`, `pink`, `red`, `maroon`, `rosewater` —
//! continuam sendo as do **catppuccin-mocha**, e são exatamente as coloridas.
//! E é aí que estava o meu erro: eu peguei os 17 tons de azul-lavanda do kit e distribuí à
//! mão pelos tokens, então **tudo ficou da mesma cor**. No Neovim da cabeça, `String` é
//! VERDE, `Number` é PÊSSEGO, `Type` é AMARELO, `Identifier` é FLAMINGO — porque o
//! catppuccin manda, e o kit não desmanda.
//! A paleta base está no disco (`catppuccin/lua/catppuccin/palettes/mocha.lua`) e foi lida de
//! lá, não escolhida por mim.

/** O catppuccin-mocha, base sobre a qual o kit escreve. */
//! Copiada do `mocha.lua` do próprio catppuccin. É a única lista de cores deste projeto que é
//!   cópia, e ela é cópia porque a alternativa seria ler um SEGUNDO `.lua` do `~/.local/share`
//!   — um caminho fora do repositório, que muda quando a pessoa atualiza plugin, e que faria
//!   a casca deixar de construir na máquina de quem não tem Neovim.
const MOCHA = {
  rosewater: "#f5e0dc", flamingo: "#f2cdcd", pink: "#f5c2e7", mauve: "#cba6f7",
  red: "#f38ba8", maroon: "#eba0ac", peach: "#fab387", yellow: "#f9e2af",
  green: "#a6e3a1", teal: "#94e2d5", sky: "#89dceb", sapphire: "#74c7ec",
  blue: "#89b4fa", lavender: "#b4befe", text: "#cdd6f4", subtext1: "#bac2de",
  subtext0: "#a6adc8", overlay2: "#9399b2", overlay1: "#7f849c", overlay0: "#6c7086",
  surface2: "#585b70", surface1: "#45475a", surface0: "#313244",
  base: "#1e1e2e", mantle: "#181825", crust: "#11111b",
};

/** Os nomes que o `tema.lua` usa (são os do catppuccin) com os valores do Jared-Linux. */
export type Paleta = typeof MOCHA;


//! Se o parser falhar, sobra o mocha puro — colorido e legível. Um padrão de zeros
//!   esconderia a falha atrás de uma tela que parece boa.

//* Extrai a tabela `local jared = { … }` do kit.
//! ⚠️ NÃO É UM INTERPRETADOR DE LUA, e não precisa ser: o alvo é uma tabela de pares
//!   `nome = "#rrggbb"`, e uma expressão regular sobre esse formato é honesta. Escrever um
//!   parser de Lua para ler dezessete cores seria construir uma peça que envelhece sozinha.
//! Se o kit mudar de forma, o casamento falha e cai na reserva — e é por isso que a reserva
//!   é a paleta certa, e não zeros.
function lerPaleta(): Paleta {
  const bloco = /local\s+jared\s*=\s*\{([\s\S]*?)\n\}/.exec(temaLua);
  if (!bloco) return MOCHA;

  const achadas: Record<string, string> = {};
  for (const par of bloco[1]!.matchAll(/(\w+)\s*=\s*"(#[0-9a-fA-F]{6})"/g)) {
    achadas[par[1] as string] = par[2] as string;
  }

  //! ⚠️ MESCLA SOBRE O MOCHA, e é isto que conserta o "não pegou o tema": as nove cores que
  //!   o kit não toca (verde, pêssego, amarelo, flamingo…) **continuam existindo**, e são
  //!   elas que dão cor ao código. Substituir em vez de mesclar deixaria a tela monocromática
  //!   — que foi exatamente o que a cabeça viu e reportou.
  return { ...MOCHA, ...achadas } as Paleta;
}

/** A paleta desta sessão. Lida uma vez. */
export const paleta: Paleta = lerPaleta();
