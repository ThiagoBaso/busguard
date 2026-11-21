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

A API executa as migrações aditivas `python -m app.scripts.migrate_access_events_v1` e `python -m app.scripts.migrate_trip_manifests_v2` antes de iniciar. Elas são separadas da carga fictícia e preservam os registros existentes. Para aplicá-las em outro ambiente, faça e valide um backup, configure `DATABASE_URL` para o banco correto e execute os dois comandos no diretório `backend`; **não use `init.sql` como migração de dados reais**. Reiniciar apenas um contêiner de API já criado com `docker compose restart api` não inicia o megamock, mas alterar o comando de inicialização no Compose exige recriar o contêiner da API para que o novo comando entre em vigor; evite iniciar ou recriar o megamock se precisar preservar os dados locais.

A credencial NFC também requer a migração aditiva `python -m app.scripts.migrate_nfc_credentials_v1`. Execute-a no backend antes de usar o recurso em um banco existente. O comando de inicialização atualizado da API no Compose inclui essa migração.

As viagens iniciadas depois da migração guardam seus vínculos de motorista, supervisor e passageiros, incluindo o identificador e a ordem da parada. Durante uma viagem, alterações nos passageiros ou nas paradas da rota ficam bloqueadas até o encerramento. O painel também apresenta o histórico de alterações posteriores em passageiros e paradas, com autor e dados anteriores e posteriores. Viagens e alterações anteriores não recebem históricos presumidos; o manifesto não é uma cópia histórica dos endereços ou das coordenadas.

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

### Tags NFC no Android

#### Reconectar o celular por USB no Windows

Com o celular desbloqueado, a depuração USB ativada e o cabo conectado, execute **Reconectar Android.cmd** na pasta do projeto. Se o Android solicitar autorização de depuração, aceite no celular e execute o atalho novamente. Ele encaminha as portas do painel (5173), da API (8000) e do servidor do aplicativo (8082), verifica o painel e a API, inicia o servidor de desenvolvimento do app se necessário e abre o aplicativo conectado a esse servidor. Acesse `http://localhost:5173` no Chrome do celular para usar o painel. Repita o atalho sempre que desconectar o cabo ou reiniciar o celular.

O atalho exige Android SDK Platform Tools (ADB), Node.js, as dependências do aplicativo e a versão de desenvolvimento do BusGuard já instalada. Se o ADB não for encontrado, instale as [Platform Tools oficiais](https://developer.android.com/tools/releases/platform-tools) e adicione a pasta ao PATH. O atalho verifica a API e o painel, mas não inicia nem recria os contêineres Docker. O servidor de desenvolvimento iniciado por ele usa a configuração de teste com o mapa nativo desativado, necessária para a versão instalada sem chave do Google Maps.

O gerenciamento fica em **Passageiros → Editar → Tag NFC**. Gere o código, selecione **Gravar tag**, aproxime uma NTAG216 e depois selecione **Confirmar leitura e ativar** para aproximar a mesma tag novamente. Para substituir uma tag ativa, use outra tag: regravar a antiga apaga seu conteúdo. A credencial antiga permanece ativa até a confirmação da nova. A gravação substitui o conteúdo anterior da tag; cancelar ou interromper o processo deixa o código novo pendente e ele não registra embarques. É possível gerar outro código para recomeçar ou desativar a credencial.

Para gravar pelo painel, abra-o no Chrome para Android com NFC habilitado e use HTTPS ou um `localhost` encaminhado para o computador. Para desenvolvimento local sem HTTPS, habilite a depuração USB no Android, conecte-o ao computador e configure o encaminhamento das portas 5173 e 8000 no Chrome DevTools. Acesse `http://localhost:5173` no telefone; o painel usa `http://localhost:8000` para a API. Outros endereços HTTP da rede não permitem Web NFC. Em produção, use HTTPS para painel e API. Consulte as [instruções do Chrome para encaminhamento de portas](https://developer.chrome.com/docs/devtools/remote-debugging/local-server/).

O aplicativo do motorista precisa de uma nova versão Android com o módulo nativo de NFC; o Expo Go não inclui esse módulo. Com as dependências instaladas e um ambiente Android configurado, gere e instale uma versão de desenvolvimento usando `npx expo run:android`, e configure `EXPO_PUBLIC_API_BASE_URL` para uma API acessível pelo telefone. Na aba **Chamada**, toque em **NFC**, aproxime a tag e confirme o embarque ou desembarque do aluno. A operação exige conexão e uma viagem ativa autorizada. Tags desconhecidas, desativadas, de alunos fora da viagem ou com pendência de revisão não registram o evento.

Cada tag armazena apenas um código aleatório; o servidor guarda um resumo desse código e seu vínculo com o passageiro. Uma tag NDEF comum pode ter seu conteúdo copiado: desative a credencial se ela for perdida ou houver suspeita de cópia. A leitura e a gravação devem ser conferidas em um dispositivo Android com NFC físico antes do uso operacional.

### QR Code para passageiros

No painel, acesse **Passageiros → Editar → QR Code**, gere o código, baixe ou imprima e confirme a ativação. O código só é exibido durante a emissão; se a cópia for perdida, gere outro. O QR antigo permanece ativo até a confirmação do substituto. Desativar o QR não altera a tag NFC. Para bancos existentes, execute a migração aditiva `python -m app.scripts.migrate_qr_credentials_v1`; não é necessário executar a carga de demonstração.

No aplicativo Android de desenvolvimento, toque em **QR** na chamada, permita a câmera, leia o código e confirme embarque ou desembarque. A leitura exige conexão e viagem ativa autorizada. Como um QR pode ser copiado, desative-o em caso de perda e confira a identidade antes de confirmar. O módulo de câmera exige uma nova compilação Android; o aplicativo instalado anteriormente não o contém.

### Mensagens

Motoristas e responsáveis acessam **Mensagens** no aplicativo; a administração acessa a seção correspondente no painel. Conversas são individuais: a API permite leitura e envio somente aos dois participantes, inclusive quando o usuário é administrador. Os contatos entre motorista e responsável são oferecidos quando há passageiro vinculado a uma rota com viagem programada ou em andamento daquele motorista. A conversa permanece no histórico dos participantes.

O painel e o aplicativo consultam mensagens e quantidades não lidas a cada cinco segundos enquanto estão abertos. A tentativa de envio sem confirmação pode ser repetida com o mesmo identificador, evitando criar duplicatas; no Android ela é mantida no armazenamento seguro do dispositivo. Mensagens com o aplicativo fechado ainda não geram notificações push. Para bancos existentes, execute a migração aditiva `python -m app.scripts.migrate_chat_v1`, sem executar a carga de demonstração.

### Verificações isoladas

Com Docker e as dependências de `backend/requirements-test.txt` instaladas, execute:

```powershell
Set-Location backend
python -B scripts/verify_reliability.py
```

A rotina cria um MySQL descartável sem volumes compartilhados, carrega dados fictícios, aplica as migrações, restaura um backup em outro banco do contêiner e testa permissões, concorrência, revisão, acompanhamento e indisponibilidade do banco. Ela encerra o contêiner ao terminar e não usa o Compose nem o `DATABASE_URL` do projeto. A execução também está configurada em `.github/workflows/reliability.yml`. Para conferir a interface em telefones físicos, siga [o roteiro de validação](docs/validacao_aparelhos.md).

Em desenvolvimento, o painel preenche a conta de demonstração do megamock: `admin@transportescolar.com` / `Busguard@123`. Em produção, os campos começam vazios.

Na aba **Início**, o mapa mostra as paradas, o percurso planejado e o trajeto do veículo até a próxima parada com aluno aguardando; depois dos embarques, usa o destino final. O motorista ou supervisor pode iniciar o compartilhamento da localização durante uma viagem ativa; ele continua na aba **Chamada** enquanto o app está em primeiro plano e para ao sair do app ou ao terminar a viagem. Para calcular o trecho até a próxima parada fictícia, a posição do veículo, inclusive GPS real, é enviada ao OSRM configurado (público por padrão). É possível interromper o compartilhamento pelo botão na aba Início. Em dispositivos nativos é necessário conceder permissão de localização; na versão web o navegador também precisa permitir acesso à localização.

O painel atualiza embarques, viagens, GPS e cadastros automaticamente após mudanças realizadas pela API. Se a conexão de notificações cair, ele tenta reconectar e confere os dados a cada 15 segundos; no aplicativo, as telas de viagem abertas conferem a cada 3 segundos.

A base de apresentação reúne 8 veículos, 96 alunos, 64 responsáveis e viagens em Marília/SP. Nomes, documentos, endereços e movimentações são fictícios. As posições GPS iniciais também são simuladas e aparecem identificadas no painel; novas posições enviadas pelo aplicativo são identificadas como GPS.

Em **Rotas e Paradas**, associe alunos às paradas, ajuste a ordem pelas setas e informe coordenadas pelo mapa ou pelos campos de latitude e longitude. As oito rotas de demonstração percorrem vias mapeadas em Marília, com aproximadamente 2,5 a 4,7 km e nove paradas cada. Os pontos são simulados sobre as vias: não identificam residências ou escolas reais, e os números e CEPs não devem ser usados como endereços postais. O percurso é calculado automaticamente quando todas as paradas têm coordenadas fictícias; endereços informados manualmente não são enviados. A linha tracejada é apenas uma referência em linha reta.

O mapa usa tiles públicos do OpenStreetMap por padrão; o provedor recebe requisições da região visualizada. Para endereços reais, configure `VITE_MAP_TILE_URL` com um provedor adequado à privacidade do projeto. O [servidor de demonstração do OSRM](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server) não oferece garantia de disponibilidade e é limitado a usos não comerciais.

## Dados e ambiente

O formulário de login móvel preenche credenciais de demonstração em desenvolvimento. O motorista de demonstração usa `joao.pereira@transportescolar.com` / `Busguard@123`; o responsável usa `maria.fernandes@email.com` / `Busguard@123`. **Atenção:** iniciar o serviço `megamock` substitui os registros de `app_db` pelos dados fictícios, inclusive dados inseridos manualmente. A carga também acontece em volumes MySQL existentes; o volume não é removido. Repetir `docker compose up` sem reiniciar o serviço não recarrega os dados.

Consulte [project.md](project.md) para detalhes de configuração, verificações e limites atuais.
