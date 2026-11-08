# Painel administrativo

Aplicação web independente em React, TypeScript e Vite. Ela usa o backend FastAPI existente e não mantém uma API ou cópia de dados próprias.

## Desenvolvimento

O painel também inicia com `docker compose up -d --build`, em <http://localhost:5173>.

```powershell
npm ci
npm run dev
```

Abra <http://localhost:5173>. A API padrão é `http://localhost:8000`; copie `.env.example` para `.env` para alterar `VITE_API_BASE_URL` ou configurar `VITE_MAP_TILE_URL`.

Em desenvolvimento, o login vem preenchido com a conta do megamock `admin@transportescolar.com` e a senha `Busguard@123`. Ela fica disponível após a carga da fixture; em produção, os campos começam vazios.

## Telas

- Login por e-mail ou CPF para contas com perfil `admin`.
- Dashboard, passageiros, motoristas, veículos, rotas e paradas, viagens, embarques/desembarques, administradores e rastreamento GPS.
- Cadastros e filtros consultam e atualizam os endpoints `/admin/...` da API.
- O GPS exibe posições enviadas pelo motorista/supervisor e identifica as posições simuladas da base de apresentação.
- Rotas permite vincular alunos às paradas e ajustar sua ordem. As telas de Rotas e GPS exibem paradas com coordenadas. O OSRM público calcula o percurso pelas ruas apenas para coordenadas fictícias da demonstração; a linha tracejada representa uma ligação direta, sem cálculo pelas ruas.

## Banco existente e localização

O Compose atualiza o esquema e carrega os dados de demonstração com `database/init.sql`. A execução substitui os registros existentes de `app_db`.

O aplicativo móvel pede permissão de localização em primeiro plano após ação do motorista e envia posições enquanto a tela da viagem ativa estiver aberta. O painel não calcula ETA em tempo real; a duração do percurso do OSRM não considera trânsito.

O padrão de mapas usa os tiles públicos do OpenStreetMap, com atribuição visível e uso interativo. Para operação contínua, configure um provedor de tiles com SLA e credenciais próprias.

## Verificações

```powershell
npm run typecheck
npm run build
```
