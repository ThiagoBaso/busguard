# BusGuard

Aplicativo para acompanhamento do transporte escolar, com uma API administrativa e um app para motoristas, supervisores e responsáveis. O projeto está em fase de MVP; consulte [project.md](project.md) para arquitetura, contratos e limitações conhecidas.

## O que já existe

- Motorista e supervisor consultam a viagem atual autorizada e registram embarque/desembarque.
- Responsável consulta a viagem atual de um passageiro vinculado à sua conta.
- API administrativa oferece cadastros e ações de início, conclusão e cancelamento de viagens.
- Painel web em React/TypeScript cobre login e as nove áreas administrativas, integrado à API.
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

A API fica em <http://localhost:8000>; a documentação interativa fica em <http://localhost:8000/docs>; o painel abre em <http://localhost:5173>. Quando o serviço `megamock` inicia, ele executa o único arquivo [database/init.sql](database/init.sql): cria ou atualiza o esquema e substitui os registros de `app_db` por dados de demonstração. A API aguarda a conclusão da carga. Os contêineres usam `restart: unless-stopped`, então voltam quando o Docker inicia; depois de aplicar uma vez com `docker compose up -d --build`, você não precisa iniciar o Vite manualmente.

A API também executa a migração aditiva `python -m app.scripts.migrate_access_events_v1` antes de iniciar. Essa migração é separada da carga fictícia e preserva os registros existentes. Para aplicá-la em outro ambiente, faça e valide um backup, configure `DATABASE_URL` para o banco correto e execute o comando no diretório `backend`; **não use `init.sql` como migração de dados reais**. Reiniciar apenas um contêiner de API já criado com `docker compose restart api` não inicia o megamock, mas alterar o comando de inicialização no Compose exige recriar o contêiner da API para que o novo comando entre em vigor; evite iniciar ou recriar o megamock se precisar preservar os dados locais.

Para recarregar a fixture manualmente, execute `docker compose down` e depois `docker compose up -d --build`. Sem a opção `-v`, o volume do MySQL permanece; os registros de `app_db` são substituídos na próxima inicialização.

### Aplicativo

Em outro terminal:

```powershell
Set-Location mobile/busguard
npm ci
$env:EXPO_PUBLIC_API_BASE_URL = 'http://localhost:8000'
npm run web
```

Para iniciar o Expo em modo interativo, use `npm start`. Em um telefone físico, configure `EXPO_PUBLIC_API_BASE_URL` com o endereço de rede do computador; `localhost` no telefone aponta para o próprio telefone.

### Painel administrativo

O painel inicia junto com o Docker Compose. Se preferir executá-lo fora do Docker durante o desenvolvimento:

```powershell
Set-Location admin-panel
npm ci
npm run dev
```

O painel abre em <http://localhost:5173> e usa `http://localhost:8000` por padrão. Para outro endereço, copie `.env.example` para `.env` e ajuste `VITE_API_BASE_URL`. O acesso exige uma conta existente com perfil `admin`; o login aceita e-mail ou CPF.

Em desenvolvimento, o painel preenche a conta de demonstração do megamock: `admin@transportescolar.com` / `Busguard@123`. Em produção, os campos começam vazios.

Na aba **Início**, o mapa mostra as paradas, o percurso planejado e o trajeto do veículo até a próxima parada com aluno aguardando; depois dos embarques, usa o destino final. O motorista ou supervisor pode iniciar o compartilhamento da localização durante uma viagem ativa; ele continua na aba **Chamada** enquanto o app está em primeiro plano e para ao sair do app ou ao terminar a viagem. Para calcular o trecho até a próxima parada fictícia, a posição do veículo, inclusive GPS real, é enviada ao OSRM configurado (público por padrão). É possível interromper o compartilhamento pelo botão na aba Início. Em dispositivos nativos é necessário conceder permissão de localização; na versão web o navegador também precisa permitir acesso à localização.

O painel atualiza embarques, viagens, GPS e cadastros automaticamente após mudanças realizadas pela API. Se a conexão de notificações cair, ele tenta reconectar e confere os dados a cada 15 segundos; no aplicativo, as telas de viagem abertas conferem a cada 3 segundos.

A base de apresentação reúne 8 veículos, 96 alunos, 64 responsáveis e viagens em Marília/SP. Nomes, documentos, endereços e movimentações são fictícios. As posições GPS iniciais também são simuladas e aparecem identificadas no painel; novas posições enviadas pelo aplicativo são identificadas como GPS.

Em **Rotas e Paradas**, associe alunos às paradas, ajuste a ordem pelas setas e informe coordenadas pelo mapa ou pelos campos de latitude e longitude. As oito rotas de demonstração percorrem vias mapeadas em Marília, com aproximadamente 2,5 a 4,7 km e nove paradas cada. Os pontos são simulados sobre as vias: não identificam residências ou escolas reais, e os números e CEPs não devem ser usados como endereços postais. O percurso é calculado automaticamente quando todas as paradas têm coordenadas fictícias; endereços informados manualmente não são enviados. A linha tracejada é apenas uma referência em linha reta.

O mapa usa tiles públicos do OpenStreetMap por padrão; o provedor recebe requisições da região visualizada. Para endereços reais, configure `VITE_MAP_TILE_URL` com um provedor adequado à privacidade do projeto. O [servidor de demonstração do OSRM](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server) não oferece garantia de disponibilidade e é limitado a usos não comerciais.

## Dados e ambiente

O formulário de login móvel preenche credenciais de demonstração em desenvolvimento. O motorista de demonstração usa `joao.pereira@transportescolar.com` / `Busguard@123`; o responsável usa `maria.fernandes@email.com` / `Busguard@123`. **Atenção:** iniciar o serviço `megamock` substitui os registros de `app_db` pelos dados fictícios, inclusive dados inseridos manualmente. A carga também acontece em volumes MySQL existentes; o volume não é removido. Repetir `docker compose up` sem reiniciar o serviço não recarrega os dados.

Consulte [project.md](project.md) para detalhes de configuração, verificações e limites atuais.
