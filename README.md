# BusGuard

Aplicativo para acompanhamento do transporte escolar, com uma API administrativa e um app para motoristas, supervisores e responsáveis. O projeto está em fase de MVP; consulte [project.md](project.md) para arquitetura, contratos e limitações conhecidas.

## O que já existe

- Motorista e supervisor consultam a viagem atual autorizada e registram embarque/desembarque.
- Responsável consulta a viagem atual de um passageiro vinculado à sua conta.
- API administrativa oferece cadastros e ações de início, conclusão e cancelamento de viagens.
- O app Expo atende web e plataformas nativas.

## Tecnologias

FastAPI e SQLAlchemy no backend, MySQL 8 no banco e Expo/React Native com TypeScript no aplicativo.

## Executar localmente

Pré-requisitos: Docker com Compose v2, Node.js e npm.

### API e banco

Na raiz, crie `.env` a partir do modelo se ainda não existir. Configure uma chave JWT local e exclusiva; não compartilhe nem versione o `.env`.

```powershell
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.exemple' -Destination '.env'
}
docker compose up -d --build
docker compose ps
```

A API fica em <http://localhost:8000>; a documentação interativa fica em <http://localhost:8000/docs>. O Compose cria somente o esquema em um volume MySQL novo. Ele não cadastra contas nem viagens de demonstração.

### Aplicativo

Em outro terminal:

```powershell
Set-Location mobile/busguard
npm ci
$env:EXPO_PUBLIC_API_BASE_URL = 'http://localhost:8000'
npm run web
```

Para iniciar o Expo em modo interativo, use `npm start`. Em um telefone físico, configure `EXPO_PUBLIC_API_BASE_URL` com o endereço de rede do computador; `localhost` no telefone aponta para o próprio telefone.

## Dados e ambiente

O formulário de login pode preencher credenciais de demonstração durante o desenvolvimento, mas a conta precisa existir no banco. `database/megamock.sql` é uma fixture manual e não é carregada pelo Compose. Volumes MySQL existentes preservam seus dados; não remova volumes sem avaliar o que contêm.

Consulte [project.md](project.md) para detalhes de configuração, verificações e limites atuais.
