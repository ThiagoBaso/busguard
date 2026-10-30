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
| `database/` | Bootstrap SQL, fixtures e arquivos de modelagem. |
| `docker-compose.yml` | API e MySQL para desenvolvimento local. |

Fluxo típico da API: rota → autenticação e schema → serviço → persistência. O app chama a API por HTTP/JSON com Bearer JWT. O Compose executa API e MySQL; o Expo é iniciado separadamente.

## Stack

- Backend: Python 3.12 na imagem Docker, FastAPI, SQLAlchemy síncrono, Pydantic v2 e PyMySQL.
- Banco: MySQL 8.0. O bootstrap de volume novo usa `database/init.sql`.
- App: Expo SDK 57, Expo Router, React 19, React Native 0.86 e TypeScript estrito.
- Dependências mobile: npm e `package-lock.json`. As dependências Python não estão totalmente fixadas.

Confira os manifests antes de atualizar bibliotecas ou assumir versões efetivas.

## Funcionalidades e contratos

| Endpoint | Acesso e uso |
| --- | --- |
| `GET /health` | Público; verifica a API, não a conexão com o banco. |
| `POST /auth/login` e `GET /auth/me` | Login por JSON; consulta o usuário e o perfil atuais. |
| `GET /driver/trips/current` | Motorista ou supervisor vinculado à viagem. |
| `POST /driver/trips/{trip_id}/boarding` | Operador vinculado; recebe `passenger_id` positivo e `checked_in`. |
| `GET /responsible/children/current-trip` | Responsável com vínculo ao passageiro; admin também é aceito pela rota. |
| `/admin/...` | Cadastros e vínculos; requer perfil admin. |
| `/admin/trips/{trip_id}/start`, `/finish`, `/cancel` | Ações administrativas de viagem. |

Os contratos mobile ficam em `backend/app/schemas/mobile_trips.py`; serviços em `backend/app/services/`. Preserve nomes e semântica ao alterar uma ponta: por exemplo, `passenger_id`/`checked_in` no pedido e `routeName`/`checkedIn` nas respostas mobile.

## Domínio e dados

O esquema cobre usuários, passageiros, responsáveis, endereços, motoristas, CNHs, veículos, rotas, paradas, vínculos de passageiros a rotas, viagens e eventos de acesso. Os estados de viagem são `scheduled`, `in_progress`, `completed` e `cancelled`.

`database/init.sql` é o bootstrap do Compose. `database/create_tables.sql` duplica esse conteúdo; `database/transport_schema.sql` é complementar. `database/megamock.sql` é uma fixture manual. Esses arquivos não formam uma sequência de migrações e não são reaplicados em volumes existentes. O ORM e o SQL ainda têm diferenças de constraints; Alembic não está configurado.

## Desenvolvimento e verificações

O [README](README.md) contém os comandos rápidos para iniciar os serviços. Para testar o backend, em um ambiente Python com dependências instaladas:

```powershell
Set-Location backend
python -m pip install -r requirements-test.txt
python -B -m unittest discover -s tests -v
```

Para o app, em `mobile/busguard`, `npm test` executa a suíte Node existente e `npm run typecheck` verifica TypeScript. Use MySQL isolado para validar comportamento específico do banco; testes com SQLite não comprovam equivalência com MySQL.

## Limitações conhecidas

- Não há migrações versionadas. Alterar o bootstrap não atualiza bancos em volumes existentes.
- Eventos de embarque não têm vínculo explícito com viagem/autor e a deduplicação não é atômica sob concorrência.
- O CRUD administrativo permite alterar alguns estados e horários sem passar pelas ações de transição.
- A consulta do responsável escolhe um passageiro vinculado; seleção de múltiplos filhos não está implementada.
- Logout remove a sessão do cliente, mas tokens ainda válidos não são revogados no servidor.
- `/health` não confirma prontidão do MySQL; o Compose não tem healthcheck do banco.
- O domínio inclui dados de crianças, documentos, endereços e um campo facial. Não use dados reais até definir finalidade, acesso, retenção e controles adequados. Revisão de código não comprova conformidade legal.

Esses pontos descrevem o estado observado e orientam tarefas futuras. Implemente somente o que fizer parte do pedido atual.

## Manutenção da documentação

Atualize este guia quando arquitetura, contratos, execução ou limitações mudarem. O README deve ser o ponto de entrada curto para execução; detalhes técnicos e orientações de trabalho ficam aqui.
