# APIs: consumir antes de servir
semana: 5
entrega: um script que busca dados de uma API e salva o resultado

Esta é a semana que mais muda o seu dia a dia. NCBI, GBIF, ENA, e-utilities:
tudo que você quer buscar programaticamente tem API. Servir uma API vem depois —
e talvez nem venha.

## conceitos
- `requests`: `get`, `post`, parâmetros, cabeçalhos
- ler a resposta: `status_code`, `.json()`, e tratar erro
- autenticação: chave em cabeçalho, token, e por que chave não vai no código
- limite de requisição (rate limit) e educação com servidor alheio
- paginação: quando a resposta vem em pedaços
- guardar o resultado em vez de repetir a busca

## recursos
- roadmap.sh backend — Learn about APIs :: https://roadmap.sh/backend
- Real Python — Python's Requests Library :: https://realpython.com/python-requests/
- NCBI E-utilities — a API que você vai usar de verdade :: https://www.ncbi.nlm.nih.gov/books/NBK25501/
