# Certel Game

Jogo para totens: o mascote da Certel corre por uma rua, pega os ícones da
cooperativa (+100) e desvia dos perigos (−100). Cada totem tem seu login e
todas as pontuações entram em um ranking geral.

Django 5.2 + DRF, Postgres em produção (SQLite local), jogo em canvas sem
dependências de front-end.

## Rodar no computador (Windows CMD)

```cmd
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env
python manage.py migrate
python manage.py preparar_ambiente
python manage.py runserver
```

- Totem: http://localhost:8000/ — login `totem1` (ou `totem2`, `totem3`), senha de `TOTENS_SENHA`
- Telão do ranking: http://localhost:8000/ranking/ (não pede login)
- Admin: http://localhost:8000/admin/ — `ADMIN_USUARIO` / `ADMIN_SENHA`

No computador dá para jogar com as setas do teclado ou A/D.

## Deploy no Render

1. Suba este projeto para um repositório no GitHub.
2. No Render: **Blueprints > New Blueprint Instance** e escolha o repositório.
   O `render.yaml` cria o serviço web e o Postgres.
3. O painel pede dois valores: `TOTENS_SENHA` (senha dos logins dos totens) e
   `ADMIN_SENHA` (senha do admin).
4. Ao fim do build, `build.sh` já terá rodado as migrações e criado
   `totem1`, `totem2`, `totem3` e o usuário `admin`.

Os planos do `render.yaml` estão como `free` para testar. Para o evento,
troque o web e o banco para planos pagos: a instância gratuita hiberna sem
tráfego e o Postgres gratuito tem prazo de validade. Limites atuais em
https://render.com/docs/free.

Variáveis de ambiente:

| Variável | Para que serve |
| --- | --- |
| `SECRET_KEY` | Chave do Django (o Render gera) |
| `DATABASE_URL` | Conexão do Postgres (o Render preenche) |
| `TOTENS_SENHA` | Senha usada ao criar os logins dos totens |
| `TOTENS_QUANTIDADE` | Quantos totens criar (padrão 3) |
| `ADMIN_USUARIO`, `ADMIN_SENHA` | Superusuário criado no primeiro deploy |
| `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS` | Só se usar domínio próprio |

Mudar a senha dos totens depois de criados:
`python manage.py preparar_ambiente --senha NOVA --redefinir-senhas`
(ou pelo admin, em Usuários).

## Preparar cada totem

1. Abra o endereço do serviço no navegador do totem e entre com o login dele
   (`totem1` no primeiro, `totem2` no segundo...). O login é feito uma vez: a
   sessão dura um ano.
2. Deixe o navegador em modo quiosque, por exemplo:
   `chrome.exe --kiosk https://SEU-SERVICO.onrender.com/`
3. **Menu do operador:** cinco toques seguidos no canto superior esquerdo da
   tela de espera. Tem tela cheia, recarregar e sair do totem.

A tela foi desenhada em retrato (720 × 1280) e escala sozinha para a
resolução do totem. Em tela deitada o jogo fica centralizado.

O cadastro usa um teclado próprio na tela, então o totem não precisa de
teclado físico. Se o jogador abandonar o totem, ele volta sozinho para a
tela de espera.

## Ajustes pelo admin

Em **Configuração do jogo**: título, duração da partida, pontos por ícone,
pontos perdidos por perigo, pedir ou não telefone, texto do consentimento,
tamanho do ranking e som. Os totens pegam a mudança ao voltar para a tela de
espera, sem recarregar.

Em **Partidas**: a ação "Ocultar do ranking" tira uma partida do ranking
(nome impróprio, teste etc.).

Em **Jogadores**: a ação "Exportar selecionados em CSV" gera a planilha de
contatos.

## Como o ranking funciona

- Soma os três totens. Cada jogador aparece uma vez, com a melhor pontuação.
- Com telefone ligado, o telefone identifica o jogador entre partidas. Sem
  telefone, cada partida é uma entrada.
- Empate: fica à frente quem marcou primeiro.
- O nome aparece abreviado ("Maria Souza Lima" vira "Maria L.").

O servidor só aceita a pontuação de uma partida aberta pelo próprio totem,
depois de passado o tempo de jogo e até o teto possível
(`pontuacao_maxima` em `jogo/services.py`). Isso barra envios adulterados
simples; não é um anti-trapaça completo, porque o jogo roda no navegador.

Se a internet cair no fim da partida, o totem guarda a pontuação e reenvia
quando a conexão voltar.

## Trocar ícones, perigos e mascote

Os arquivos ficam em `jogo/static/jogo/img/`:

- `icone_*.png` — os 7 ícones da Certel (256 × 256, fundo transparente)
- `perigo_*.png` — os 3 perigos (os `.svg` são os originais editáveis)
- `mascote.png`, `mascote_sprite.png`, `mascote_cabeca.png`

Para trocar uma imagem, mantenha o nome do arquivo. Para mudar a quantidade,
edite as listas no fim de `jogo/templates/jogo/totem.html` (bloco `imagens`).

Velocidade, intervalo entre itens e chance de perigo ficam no topo de
`jogo/static/jogo/js/motor.js`. Se baixar `INTERVALO_FINAL`, ajuste também
`INTERVALO_MINIMO_ITENS` em `jogo/services.py`.

## Demonstração em arquivo único

```cmd
python scripts\gerar_demo.py
```

Gera `demo.html`, o jogo inteiro em um arquivo, sem servidor (o ranking fica
só no navegador). Serve para mostrar ao cliente ou testar em um totem.

## Testes

```cmd
coverage run manage.py test
coverage report
```

O `.coveragerc` reprova abaixo de 98%.

## Estrutura

```
config/                 settings, urls, wsgi
core/                   AbstractBaseModel (UUID4, created_at, updated_at), health check
jogo/
  models.py             Totem, Jogador, Partida, ConfiguracaoJogo
  services.py           regras: iniciar/finalizar partida, ranking
  api.py                endpoints JSON dos totens e do telão
  views.py              páginas: login, totem, telão
  admin.py              admin (Jazzmin)
  management/commands/  preparar_ambiente
  static/jogo/js/       motor.js (jogo), totem.js (fluxo), teclado.js, som.js, api.js, ranking.js
  templates/jogo/       entrar.html, totem.html, ranking.html
scripts/                gerador da demonstração
```

| Rota | O que é |
| --- | --- |
| `/` | Jogo (exige login de totem) |
| `/entrar/`, `/sair/` | Login e logout do totem |
| `/ranking/` | Telão do ranking (público) |
| `/api/ranking/` | Ranking em JSON (público) |
| `/api/config/` | Configuração em vigor (totem) |
| `/api/partidas/` | Abre a partida (totem) |
| `/api/partidas/<id>/finalizar/` | Registra a pontuação (totem) |
| `/healthz/` | Health check do Render |

A fonte Baloo 2 está em `jogo/static/jogo/fonts/` sob a licença SIL OFL.
