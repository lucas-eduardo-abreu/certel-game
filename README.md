# Certel Game

Jogo para totens: o mascote da Certel corre por uma rua, pega os ícones da
cooperativa (+100) e desvia dos obstáculos (−300). Cada totem tem seu login e
todas as pontuações entram em um ranking geral.

## Pontuação

- Cada ícone vale 100 pontos vezes o multiplicador.
- O multiplicador sobe a cada 5 ícones pegos em seguida: os 5 primeiros valem
  100, do 6º ao 10º valem 200 (2x), do 11º ao 15º valem 300 (3x) e assim por
  diante, sem limite.
- Encostar em um obstáculo tira 300 pontos e zera o multiplicador. A pontuação
  não fica negativa.
- Deixar um ícone passar não zera a sequência; só o obstáculo zera.

Os três números (100, 300 e 5) são editáveis no admin.

## Velocidade

- A rua começa a 380 px/s e dobra de velocidade a cada 1.000 pontos: com
  1.000 fica 2x, com 2.000 fica 4x.
- Há um limite de dobras (padrão 2, ou seja, até 4x). Em 4x um item leva
  cerca de meio segundo entre aparecer e chegar ao mascote; em 8x, um quarto
  de segundo, o que já não dá tempo de reagir. O limite vai até 4 no admin.
- O nível acompanha a pontuação atual: se um obstáculo derrubar o jogador para
  baixo da marca, a rua desacelera.
- Com a rua mais rápida os itens também vêm mais juntos no tempo (nunca menos
  de 0,32 s entre dois) e o mascote anda mais rápido para os lados.

"Pontos para dobrar a velocidade" e "limite de dobras" ficam no admin; 0 em
qualquer um desliga a aceleração.

## Obstáculos

- No começo, 25% dos itens são obstáculos. A cada 1.000 pontos a proporção sobe
  8 pontos percentuais: 33% com 1.000, 41% com 2.000, 49% com 3.000, até o
  teto de 65% (a partir de 5.000).
- Usa a mesma marca de pontos da velocidade e, como ela, acompanha a
  pontuação atual: se o jogador cair de faixa, os obstáculos diminuem.
- Mesmo no teto, nunca vêm três obstáculos seguidos nem dois itens seguidos na
  mesma faixa, então sempre existe um caminho.

"Obstáculos no início (%)" e "aumento de obstáculos por marca (%)" ficam no admin.
No código e no banco os campos continuam com o nome antigo (`perigos_*`).

## Som e música

Tudo é sintetizado no navegador (`jogo/static/jogo/js/som.js`), sem arquivos
de áudio. A música da partida é uma composição original de 8 compassos em
laço, com melodia, baixo e percussão; o andamento sobe 12% a cada dobra de
velocidade. Para trocar a melodia, edite `MELODIA` e `BAIXO` no início da
seção de música. Efeitos e música têm chaves separadas no admin.

O Chrome só libera áudio depois de um toque na tela; como a partida começa
com toques, isso já acontece sozinho. Confira o volume do sistema do totem.

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

- Entrar: http://localhost:8000/entrar/ — cada usuário cai na sua tela (veja
  "Acessos" abaixo)
- Totem: http://localhost:8000/ — login `totem1` (ou `totem2`, `totem3`), senha de `TOTENS_SENHA`
- Telão do ranking: http://localhost:8000/ranking/ — login `ranking`, senha de `RANKING_SENHA`
- Sorteio: http://localhost:8000/roleta/ (do dia) e `/roleta/?tipo=geral` — login `ranking`
- Admin: http://localhost:8000/admin/ — `ADMIN_USUARIO` / `ADMIN_SENHA`

No computador dá para jogar com as setas do teclado ou A/D.

## Deploy no Render

No ar em **https://certel-game.onrender.com** (plano grátis):

| Tela | Endereço | Login |
| --- | --- | --- |
| Jogo | https://certel-game.onrender.com/ | `totem1`, `totem2`, `totem3` |
| Telão do ranking | https://certel-game.onrender.com/ranking/ | `ranking` |
| Sorteio do dia | https://certel-game.onrender.com/roleta/ | `ranking` |
| Sorteio geral | https://certel-game.onrender.com/roleta/?tipo=geral | `ranking` |
| Admin | https://certel-game.onrender.com/admin/ | `admin` |

O endereço vem do nome do serviço no `render.yaml` (`certel-game`). O Django
aceita sozinho o host do Render pela variável `RENDER_EXTERNAL_HOSTNAME`; só
um domínio próprio precisa de `ALLOWED_HOSTS` e `CSRF_TRUSTED_ORIGINS`.


1. Suba este projeto para um repositório no GitHub.
2. No Render: **Blueprints > New Blueprint Instance** e escolha o repositório.
   O `render.yaml` cria o serviço web e o Postgres.
3. O painel pede três valores: `TOTENS_SENHA` (senha dos logins dos totens),
   `RANKING_SENHA` (senha do telão do ranking e da roleta) e `ADMIN_SENHA`
   (senha do admin).
4. Ao fim do build, `build.sh` já terá rodado as migrações e criado
   `totem1`, `totem2`, `totem3`, `ranking` e o usuário `admin`.

O `render.yaml` usa os planos gratuitos, na região Virginia. Eles servem para
testar, não para o evento: o web hiberna sem tráfego (o primeiro acesso depois
disso demora cerca de 1 minuto) e o Postgres gratuito expira, levando os dados
junto. Para o evento, troque no `render.yaml` para os pagos mais baratos: web
`starter` (US$ 7/mês) e Postgres `basic-256mb` com `diskSizeGB: 1`
(US$ 6/mês + US$ 0,30/GB), cerca de US$ 13,30/mês em novembro de 2026.
Limites do plano grátis em https://render.com/docs/free e preços em
https://render.com/pricing.

Variáveis de ambiente:

| Variável | Para que serve |
| --- | --- |
| `SECRET_KEY` | Chave do Django (o Render gera) |
| `DATABASE_URL` | Conexão do Postgres (o Render preenche) |
| `TOTENS_SENHA` | Senha usada ao criar os logins dos totens |
| `TOTENS_QUANTIDADE` | Quantos totens criar (padrão 3) |
| `RANKING_USUARIO`, `RANKING_SENHA` | Login do telão do ranking e da roleta (padrão `ranking`); sem senha, não é criado |
| `ADMIN_USUARIO`, `ADMIN_SENHA` | Superusuário criado no primeiro deploy |
| `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS` | Só se usar domínio próprio |

Mudar as senhas depois de criadas:
`python manage.py preparar_ambiente --senha NOVA --senha-ranking NOVA2 --redefinir-senhas`
(ou pelo admin, em Usuários).

## Acessos

São cinco logins, todos pela mesma tela `/entrar/`. Depois do login cada um
cai na sua tela; se abrir uma tela que não é sua, volta para a dele.

| Login | O que vê |
| --- | --- |
| `admin` | O admin e todas as telas. No jogo entra em **prévia**: joga normalmente, mas a partida não vai para o ranking (faixa amarela no topo). |
| `totem1`, `totem2`, `totem3` | Só o jogo. |
| `ranking` | Só o telão do ranking e a roleta. Não entra no admin nem no jogo. |

O perfil `ranking` é o grupo **Ranking** (admin > Grupos). Para dar o mesmo
acesso a outro usuário, ponha-o nesse grupo. O admin é qualquer usuário com
"membro da equipe" marcado. As regras ficam em `jogo/perfis.py`.

No telão, mexa o mouse para aparecer o menu (Ranking, Sorteio do dia, Sorteio
geral, Sair) no canto superior direito; ele some sozinho.

## Ranking

O telão mostra o **top 5** do ranking geral (os três totens juntos), com a
melhor partida de cada jogador. O número de posições fica no admin
("posições no ranking", padrão 5).

## Sorteio

Os nomes passam na vertical numa janela e vão freando até parar no
vencedor, sob a faixa amarela do meio. O endereço continua `/roleta/` (e a
API `/api/roleta/`), para não quebrar favoritos do telão.

Dois sorteios, os dois operados pelo login `ranking` (ou pelo admin):

- **Sorteio do dia** (`/roleta/`): concorre quem jogou no dia escolhido
  (padrão: hoje, no fuso de São Paulo). Dá para escolher um dia anterior.
- **Sorteio geral** (`/roleta/?tipo=geral`): concorrem todos os jogadores do
  evento. Para sortear só entre os melhores, ponha em admin > Configuração do
  jogo > "sorteio geral só entre o top" o número de posições (ex.: 5 = só o
  top 5 do ranking; 0 = todos). A tela mostra "top 5 do ranking" ao lado do
  total. Quem ganha sai, e a vaga não passa para o 6º.

Regras:

- Conta quem tem partida finalizada e não oculta. Partida ocultada no admin
  tira a pessoa da roleta também.
- O vencedor é sorteado no servidor; a tela só anima os nomes até o sorteado.
- Cada giro fica registrado em **Sorteios** no admin, com nome completo,
  telefone, quantos concorreram e quem girou.
- Quem já ganhou não entra de novo **no mesmo sorteio** (mesmo dia, no
  diário; ou o geral). Girar de novo sorteia o próximo prêmio. Quem ganhou no
  dia continua concorrendo na roleta geral.
- Para refazer um sorteio (ex.: ganhador não apareceu e deve voltar a
  concorrer), exclua-o em admin > Sorteios.
- Com "pedir telefone" desligado, cada partida vira um jogador novo; aí quem
  jogou várias vezes tem várias chances.
- A janela passa até 36 nomes (uma amostra quando há mais gente); todos os
  participantes concorrem, e o total aparece na tela.

## Zerar os dados (antes do evento)

`python manage.py limpar_dados` apaga todos os jogadores, partidas e
sorteios. Logins, totens e a configuração ficam. Ele mostra o banco e as
contagens e pede para digitar o nome do banco antes de apagar (`--sim` pula a
pergunta). Não tem volta.

No Render (plano grátis, sem Shell), rode do seu computador apontando para o
Postgres: copie a **External Database URL** em Postgres > Connections e, no
PowerShell:

```powershell
$env:DATABASE_URL="postgresql://..."; python manage.py limpar_dados
```

## Preparar cada totem

1. Abra o endereço do serviço no navegador do totem e entre com o login dele
   (`totem1` no primeiro, `totem2` no segundo...). O login é feito uma vez: a
   sessão dura um ano.
2. Deixe o navegador em modo quiosque, por exemplo:
   `chrome.exe --kiosk https://certel-game.onrender.com/`
3. **Menu do operador:** cinco toques seguidos (em até 3 segundos) no canto
   superior esquerdo da tela de espera ("Toque para jogar"). É o canto da
   área do jogo: em monitor deitado, o canto da faixa verde, não o da tela.
   Tem liberar/travar tela cheia, recarregar e sair do totem.
4. **Tela cheia travada:** depois do login, o primeiro toque na tela já
   coloca o jogo em tela cheia, e se alguém sair dela (Esc, F11) o próximo
   toque volta. O navegador não deixa uma página impedir a saída de vez: no
   Chrome/Edge o Esc precisa ser segurado. Para travar de verdade, use o modo
   quiosque do item 2. Para sair da trava (manutenção), use "Liberar tela
   cheia" no menu do operador; ela volta ao recarregar a página. Na prévia do
   admin a trava fica desligada.
5. **Sair sem o menu:** abra `/sair/` (ex.:
   https://certel-game.onrender.com/sair/) e confirme. Vale para qualquer
   login.

A tela foi desenhada em retrato (720 × 1280) e escala sozinha para a
resolução do totem. Em tela deitada o jogo fica centralizado.

O cadastro usa um teclado próprio na tela, então o totem não precisa de
teclado físico. Se o jogador abandonar o totem, ele volta sozinho para a
tela de espera.

## Ajustes pelo admin

Em **Configuração do jogo**: título, duração da partida, pontos por ícone,
pontos perdidos por obstáculo, ícones seguidos por multiplicador (0 desliga),
pontos para dobrar a velocidade e limite de dobras, proporção de obstáculos
(inicial e aumento), efeitos sonoros e música,
pedir ou não telefone, texto do consentimento, tamanho do ranking e som. Os totens pegam a mudança ao voltar para a tela de
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

## Trocar ícones, obstáculos e mascote

Os arquivos ficam em `jogo/static/jogo/img/`:

- `icone_*.png` — os 7 ícones da Certel (256 × 256, fundo transparente)
- `perigo_*.png` — os 3 obstáculos (os `.svg` são os originais editáveis)
- `mascote.png`, `mascote_sprite.png`, `mascote_cabeca.png`
- `mascote_corrida.png` — folha de sprites do mascote correndo de costas

Para trocar uma imagem, mantenha o nome do arquivo. Para mudar a quantidade,
edite as listas no fim de `jogo/templates/jogo/totem.html` (bloco `imagens`).

O cenário (rua de cidade com quarteirões, prédios, cruzamentos e árvores) é
desenhado por código em `motor.js`, na seção "Rua de cidade". As listas
`QUARTEIROES`, `ARVORES_ESQ` e `ARVORES_DIR` definem os prédios e onde ficam
as árvores; para pôr mais ou menos árvores, edite essas duas últimas.

Velocidade, intervalo entre itens e chance de obstáculo ficam no topo de
`jogo/static/jogo/js/motor.js`. `VELOCIDADE_BASE`, `PRIMEIRO_ITEM`,
`ESPACAMENTO_ITENS` e `INTERVALO_MINIMO` têm cópia em `jogo/services.py` (é
com eles que o servidor calcula a pontuação máxima): se mudar em um, mude no
outro.

## Mascote correndo de costas (3D)

Durante a partida o mascote aparece de costas, correndo. A animação vem de um
modelo 3D feito em three.js (`scripts/mascote3d/mascote3d.js`), renderizado
em 16 quadros e salvo como folha de sprites em
`jogo/static/jogo/img/mascote_corrida.png`. O jogo só usa a imagem pronta:
não precisa de WebGL no totem.

O modelo é uma releitura do desenho oficial em formas simples, não a arte da
agência. O cabelo de costas segue o mascote de pelúcia: um bloco cheio e
quadradinho cobrindo a nuca, por baixo do boné. Nas costas da camiseta vai o
logo oficial (`logo_certel_fundo_azul.svg`). Nas telas de espera, cadastro e
resultado continua a ilustração original.

Para ver a corrida em tempo real, instale o three.js e sirva a raiz do projeto
(o modelo lê o logo em `jogo/static/jogo/img/`):

```cmd
cd scripts\mascote3d
npm install
cd ..\..
python -m http.server 8001
```

e acesse http://localhost:8001/scripts/mascote3d/render.html.

Para gerar a folha de novo depois de mexer no modelo:

```cmd
pip install playwright pillow
playwright install chromium
python scripts\mascote3d\gerar_sprites.py
```

Para voltar ao mascote de frente, apague o trecho `"corrida": "..."` do bloco
`imagens` em `jogo/templates/jogo/totem.html`.

Se a agência entregar um modelo 3D ou uma sequência de quadros oficial, basta
substituir `mascote_corrida.png` (grade 4 × 4, quadros de 384 × 512) e ajustar
as constantes `SPRITE_*` em `motor.js`.

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
  models.py             Totem, Jogador, Partida, Sorteio, ConfiguracaoJogo
  perfis.py             perfis de acesso: admin, totem, ranking
  services.py           regras: iniciar/finalizar partida, ranking, sorteio
  api.py                endpoints JSON dos totens e do telão
  views.py              páginas: login, totem, telão, roleta
  admin.py              admin (Jazzmin)
  management/commands/  preparar_ambiente
  static/jogo/js/       motor.js (jogo), totem.js (fluxo), teclado.js, som.js, api.js, ranking.js,
                        roleta.js, telao.js (menu do telão)
  templates/jogo/       entrar.html, totem.html, ranking.html, roleta.html
scripts/                gerador da demonstração e modelo 3D do mascote (mascote3d/)
```

| Rota | O que é |
| --- | --- |
| `/` | Jogo (totem; admin em prévia) |
| `/entrar/`, `/sair/` | Login e logout de todos os perfis |
| `/ranking/` | Telão do ranking (ranking, admin) |
| `/roleta/`, `/roleta/?tipo=geral` | Roleta do dia e geral (ranking, admin) |
| `/api/ranking/` | Ranking em JSON (totem, ranking, admin) |
| `/api/roleta/` | Estado da roleta (GET) e giro (POST) (ranking, admin) |
| `/api/config/` | Configuração em vigor (totem) |
| `/api/partidas/` | Abre a partida (totem) |
| `/api/partidas/<id>/finalizar/` | Registra a pontuação (totem) |
| `/healthz/` | Health check do Render |

## Identidade visual (Manual de Marca)

O jogo segue o Manual de Aplicação da Marca Certel (V01.2025):

- **Cores:** Azul Certel `#004899` (Pantone 287) e Verde Certel `#04A64B`
  (Pantone 347), em `jogo/static/jogo/css/base.css` e no cenário do jogo.
- **Logo:** arquivos vetoriais recortados do próprio manual, em
  `jogo/static/jogo/img/`: `logo_certel.svg` (fundo branco),
  `logo_certel_fundo_azul.svg` (fundo azul) e `logo_certel_branco.svg`
  (fundo verde). Aparece na tela de espera, no telão e no login, sempre sem
  sombra, contorno, rotação ou distorção.
- **Fonte:** Boston (Latinotype). É uma fonte paga e não vem no projeto. O
  jogo usa a Boston quando ela está instalada no computador do totem (pesos
  SemiBold, Bold e Heavy/Black); enquanto não estiver, usa a Montserrat, a
  fonte de apoio do manual, que vem em `jogo/static/jogo/fonts/` (SIL OFL).

Para embutir a Boston no projeto em vez de instalar em cada totem, coloque os
arquivos `.woff2` em `jogo/static/jogo/fonts/` e troque, em `base.css`, os
`local(...)` de cada peso por `url("../fonts/NOME-DO-ARQUIVO.woff2")`. A
licença da Boston precisa cobrir uso web/embutido.
