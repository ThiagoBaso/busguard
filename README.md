# BusGuard

## Execução local

Configure o `.env` conforme `.env.exemple` e execute `docker compose up -d --build` na raiz. O Compose cria apenas o esquema em volumes MySQL novos; não cadastra contas nem viagens de demonstração. Cadastre usuários e vínculos de acordo com os contratos descritos em [project.md](project.md).

O aplicativo Expo fica em `mobile/busguard`. Instale as dependências com `npm ci`, configure `EXPO_PUBLIC_API_BASE_URL` com o endereço acessível da API e execute `npm run web` ou `npm start`.

No modo de desenvolvimento, a tela de login já preenche o e-mail e a senha do motorista de demonstração. O Compose não cadastra essa conta; ela precisa existir no banco para que o login funcione. Em builds de produção, os campos começam vazios.

Volumes existentes não são alterados pelo Compose. Dados de demonstração carregados anteriormente permanecem no banco até serem removidos por uma migração ou operação administrada específica; não apague volumes para limpar esses dados sem avaliar o conteúdo.
