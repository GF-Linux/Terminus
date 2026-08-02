# Empacotar e rodar em outro lugar
semana: 8
entrega: seu projeto rodando fora da sua máquina

O fim da linha da automação é ela rodar sem você. Pode ser um agendamento na sua
máquina, um contêiner, ou um script que o colega executa. O ponto é o mesmo:
sair do "só funciona aqui".

## conceitos
- agendamento: `cron` e `systemd --user`
- contêiner: o que Docker resolve, e o que ele não resolve
- imagem × contêiner; `Dockerfile` mínimo para um script Python
- por que fixar versão de dependência vira obrigatório aqui
- registrar o que aconteceu: `logging` em vez de `print`

## recursos
- roadmap.sh backend — Containerization :: https://roadmap.sh/backend
- Docker — Get Started :: https://docs.docker.com/get-started/
- Docs oficiais — logging :: https://docs.python.org/pt-br/3/howto/logging.html
