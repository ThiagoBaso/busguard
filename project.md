# BusGuard — guia do projeto

## Visão geral

BusGuard organiza cadastros e viagens de transporte escolar. O repositório contém uma API FastAPI, um aplicativo Expo e o bootstrap SQL do MySQL. O estado atual é um MVP em desenvolvimento; considere as limitações de dados, segurança e operação antes de qualquer uso com dados reais.

## Como trabalhar neste repositório

Use um fluxo simples com um único agente:

1. Entenda o pedido, leia este guia e o README, confira `git status` e inspecione os arquivos e convenções da área afetada.
2. Preserve mudanças já existentes. Escolha o menor escopo que atende ao pedido; itens deste documento são contexto, não autorização para ampliar uma tarefa.
3. Siga a arquitetura e os contratos existentes. Antes de alterar o app, consulte a documentação oficial da versão Expo instalada; o projeto usa atualmente [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
4. Revise o diff e execute verificações relevantes já disponíveis. Relate comandos e resultados reais e indique o que não foi possível validar.
5. Ao concluir, resuma arquivos alterados, verificações e limitações.

Não use Planner/Coder/Reviewer, delegação multiagente, arquivos de controle por tarefa como `PLAN.md`/`REVIEW.md` nem um orquestrador local. Não altere dados, volumes, credenciais ou ambientes compartilhados como parte de uma verificação.

## Arquitetura

| Área | Responsabilidade |
| --- | --- |
| `backend/app/routes/` | Endpoints HTTP, autenticação de entrada e tradução de erros. |
| `backend/app/services/` | Casos de uso, regras de negócio e consultas. |
| `backend/app/models/` | Entidades SQLAlchemy. |
| `backend/app/schemas/` | Contratos Pydantic de entrada e saída. |
| `backend/app/security.py` | Hash de senha, JWT e dependências de usuário/perfil. |
| `backend/app/database.py` | Engine e sessão do banco. |
| `mobile/busguard/app/` | Telas e navegação com Expo Router. |
| `mobile/busguard/services/` | Cliente HTTP, sessão e integração de viagens. |
| `admin-panel/src/` | Painel administrativo React/TypeScript, cliente da API e telas web. |
| `database/` | Esquema, migrações e dados fictícios no arquivo SQL unificado. |
| `docker-compose.yml` | API, MySQL, recarga automática do megamock e painel web para desenvolvimento local. |

Fluxo típico da API: rota → autenticação e schema → serviço → persistência. O app e o painel chamam a API por HTTP/JSON com Bearer JWT. O Compose executa API, MySQL, fixture e painel; o Expo é iniciado separadamente.

## Stack

- Backend: Python 3.12 na imagem Docker, FastAPI, SQLAlchemy síncrono, Pydantic v2 e PyMySQL.
- Banco: MySQL 8.0. O serviço `megamock` executa `database/init.sql` em volumes novos e existentes.
- App: Expo SDK 57, Expo Router, React 19, React Native 0.86 e TypeScript estrito.
- Dependências mobile: npm e `package-lock.json`. As dependências Python não estão totalmente fixadas.

Confira os manifests antes de atualizar bibliotecas ou assumir versões efetivas.

## Funcionalidades e contratos

| Endpoint | Acesso e uso |
| --- | --- |
| `GET /health` | Público; verifica a API, não a conexão com o banco. |
| `POST /auth/login` e `GET /auth/me` | Login por JSON; consulta o usuário e o perfil atuais. |
| `POST /driver/trips/{trip_id}/location` | Motorista ou supervisor autorizado; grava posição GPS da viagem ativa. |
| `GET /driver/trips/current` | Motorista ou supervisor vinculado à viagem. |
| `GET /driver/trips/{trip_id}/map` e `/map/geometry` | Paradas, última posição e trajeto fictício do OSRM, somente para o operador vinculado à viagem ativa. |
| `POST /driver/trips/{trip_id}/map/next-stop` | Calcula até parada fictícia da viagem autorizada; envia ao OSRM a posição recebida, inclusive GPS real. |
| `POST /driver/trips/{trip_id}/boarding` | Operador vinculado; recebe `passenger_id` positivo e `checked_in`. |
| `POST /driver/trips/{trip_id}/events` | Operador vinculado; recebe UUID, passageiro, ação e horário com fuso. Reenvios idênticos retornam o mesmo evento; divergências ficam pendentes de revisão. |
| `POST /driver/trips/current/heartbeat` | Motorista vinculado; registra comunicação recebida enquanto o aplicativo está em primeiro plano, independentemente do GPS. |
| `GET /admin/trip-communications` | Admin; mostra a última comunicação recebida e a situação de atualização. |
| `POST /admin/access-events/{id}/review` | Admin; aceita ou rejeita evento pendente com motivo obrigatório e registro do revisor. |
| `GET /responsible/children/current-trip` | Responsável com vínculo ao passageiro; admin também é aceito pela rota. |
| `/admin/...` | Cadastros e vínculos; requer perfil admin. |
| `GET /admin/routes/{route_id}/geometry` | Calcula no OSRM público apenas rotas cujas coordenadas são fictícias. |
| `GET /admin/trips/{trip_id}/next-stop-geometry` | Admin; calcula do GPS mais recente ate a proxima parada com passageiro aguardando. A posicao GPS pode ser enviada ao OSRM conforme autorizacao do usuario; coordenadas manuais de paradas ficam restritas a linha reta local. |
| `GET /admin/changes` | Transmissão autenticada para administradores; informa tabelas alteradas após confirmação das transações da API. |
| `POST /admin/routes/{route_id}/stops/reorder` | Reordena as paradas sem alterar os vínculos dos passageiros. |
| `/admin/trips/{trip_id}/start`, `/finish`, `/cancel` | Ações administrativas de viagem. |

Os contratos mobile ficam em `backend/app/schemas/mobile_trips.py`; serviços em `backend/app/services/`. Preserve nomes e semântica ao alterar uma ponta: por exemplo, `passenger_id`/`checked_in` no pedido e `routeName`/`checkedIn` nas respostas mobile.

No mapa da viagem, cada parada inclui `completed` quando todos os alunos associados ja embarcaram durante a viagem; `boarded` permanece verdadeiro mesmo depois do desembarque. O calculo do proximo ponto ignora embarques ja registrados e, depois do ultimo embarque, segue para a parada final.

## Domínio e dados

O esquema cobre usuários, passageiros, responsáveis, endereços, motoristas, CNHs, veículos, rotas, paradas, vínculos de passageiros a rotas, viagens, eventos de acesso e histórico de posições GPS. Os estados de viagem são `scheduled`, `in_progress`, `completed` e `cancelled`.

`database/init.sql` reúne esquema, atualizações para volumes anteriores e dados fictícios de Marília/SP. Quando o serviço `megamock` inicia, o Compose executa esse arquivo: cria ou atualiza as tabelas e substitui os registros de `app_db` em uma transação. Isso também acontece em volumes existentes; nunca inicie o serviço se precisar preservar dados inseridos localmente. Endereços possuem coordenadas opcionais e origem `demo` ou `manual`; passageiros podem ser vinculados a uma parada da própria rota. As posições GPS de demonstração são identificadas pela origem `demo`; as posições recebidas do aplicativo usam `gps`. API, MySQL, megamock e painel usam `restart: unless-stopped` para voltarem quando o Docker iniciar. O ORM e o SQL ainda têm diferenças de constraints; Alembic não está configurado.

A migração aditiva `python -m app.scripts.migrate_access_events_v1` é separada da fixture, pode ser repetida e não apaga registros. No Compose de demonstração, a API a executa após a carga do megamock, antes de iniciar o servidor. Para um banco existente, faça backup e execute a migração explicitamente antes de atualizar a API; não execute `init.sql` para migrar dados reais. Eventos legados permanecem sem viagem e autor quando não há vínculo registrado, e não são usados para inferir a situação de uma viagem.

As oito rotas da fixture usam pontos simulados sobre vias mapeadas de Marília; têm nove paradas e cerca de 2,5 a 4,7 km cada. Os nomes das vias vêm do mapa, mas números, CEPs, passageiros e escolas são fictícios; as coordenadas não identificam residências ou escolas reais.

## Desenvolvimento e verificações

O [README](README.md) contém os comandos rápidos para iniciar os serviços. Para testar o backend, em um ambiente Python com dependências instaladas:

```powershell
Set-Location backend
python -m pip install -r requirements-test.txt
python -B -m unittest discover -s tests -v
```

Para o app, em `mobile/busguard`, `npm test` executa a suíte Node existente e `npm run typecheck` verifica TypeScript. Use MySQL isolado para validar comportamento específico do banco; testes com SQLite não comprovam equivalência com MySQL.

Para o painel, em `admin-panel`, use `npm test`, `npm run typecheck` e `npm run build`.

## Limitações conhecidas

- A migração de eventos v1 é aditiva e específica do MySQL; ainda não há uma estrutura geral de migrações versionadas para os demais modelos.
- Registros legados sem viagem explícita não determinam a situação da viagem; os horários informados pelo cliente não provam quando um evento ocorreu. Eventos tardios, repetidos ou fora de ordem são revisados manualmente. Não há fila offline persistente ou autenticação offline; o UUID de uma tentativa é mantido em memória apenas enquanto a tela existir.
- A comunicação reportada depende do app do motorista em primeiro plano e não prova que todos os eventos ou posições foram recebidos. O limite de alerta é configurável por `COMMUNICATION_STALE_SECONDS` (padrão 300 segundos).
- O OSRM público recebe paradas fictícias e, para o trajeto até a próxima parada, a posição do veículo, inclusive GPS real, conforme escolha do usuário. Coordenadas de paradas manuais não são enviadas; linhas diretas são apenas referências e o GPS não calcula ETA em tempo real.
- O compartilhamento GPS é opcional e funciona em primeiro plano, inclusive ao trocar entre as abas; é interrompido quando o app vai para segundo plano, a sessão termina ou a viagem deixa de estar ativa. O app não rastreia em segundo plano.
- O CRUD administrativo permite alterar alguns estados e horários sem passar pelas ações de transição.
- A consulta do responsável escolhe um passageiro vinculado; seleção de múltiplos filhos não está implementada.
- Logout remove a sessão do cliente, mas tokens ainda válidos não são revogados no servidor.
- As notificações em tempo real são locais ao processo da API; várias instâncias ou alterações feitas diretamente no banco dependem da sincronização periódica do painel (15 segundos). O app atualiza viagens a cada 3 segundos enquanto a tela está ativa.
- `/health` não confirma prontidão do MySQL; o healthcheck do banco verifica o servidor, e reinícios automáticos do Docker não garantem a ordem das dependências.
- O domínio inclui dados de crianças, documentos, endereços e um campo facial. Não use dados reais até definir finalidade, acesso, retenção e controles adequados. Revisão de código não comprova conformidade legal.

Esses pontos descrevem o estado observado e orientam tarefas futuras. Implemente somente o que fizer parte do pedido atual.

## Manutenção da documentação

Atualize este guia quando arquitetura, contratos, execução ou limitações mudarem. O README deve ser o ponto de entrada curto para execução; detalhes técnicos e orientações de trabalho ficam aqui.
