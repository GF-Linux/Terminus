# Política de segurança

## Como reportar

Achou uma falha? Escreva para **juaredbr@gmail.com** ou **jared@ufrrj.br**, com
"Bancada — segurança" no assunto. Prefiro receber por e-mail em vez de issue
pública, para que a correção saia antes da descrição.

Respondo em até uma semana. Se eu demorar mais que isso, insista — não é
desinteresse, é uma pessoa só tocando o projeto.

Ao reportar, ajuda muito: o que acontece, o que deveria acontecer, e o caminho
mais curto para reproduzir. Não é preciso trazer exploit pronto.

## O que está no escopo

A Bancada é um aplicativo Electron que roda na máquina de quem usa. Não há
servidor, não há conta, não há dado de usuário na minha mão. O que interessa,
então, é o que ela faz com **arquivo que veio de fora** — uma pasta de corrida
recebida por pendrive, um `.zip` de material suplementar, um repositório clonado:

- abrir uma pasta de terceiro levar a execução de código sem o usuário mandar;
- alcançar arquivo fora da pasta aberta, para ler ou escrever;
- vazar a chave de API guardada em `~/.config/bancada/config.json`;
- travar ou derrubar o aplicativo com arquivo malformado.

Fora do escopo: o que exige que a máquina já esteja comprometida, e as
bibliotecas de terceiros — essas reporte ao projeto de origem.

## Estado atual

O código passou por uma varredura de segurança antes de virar público, e os
achados com caminho de exploração foram corrigidos e verificados **executando o
aplicativo**, não só compilando. Os commits `fix(seguranca):` contam cada um o
que estava errado e como foi conferido.

Sobraram itens de menor gravidade, todos dependentes de comprometer o aplicativo
primeiro. Estão registrados e vão sendo fechados. Se você achar caminho para
algum deles que eu não tenha visto, o e-mail acima é o lugar.

## Uma coisa que vale saber antes de usar

O **texto fantasma** é o único recurso que envia código para fora da máquina: o
trecho em volta do cursor vai para o modelo de IA configurado. Vem **desligado**,
e a tela de Configurações diz isso na cara, com interruptor e um botão para
esquecer a chave. Se você trabalha com dado que não pode sair do prédio, deixe
desligado.
