# busguard

## Ambiente local de demonstração

Execute `docker compose up -d --build` na raiz do projeto. Na primeira criação do volume MySQL, o Compose carrega o esquema e os dados de `database/megamock.sql`. O app pode entrar com:

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Motorista | `joao.pereira@transportescolar.com` | `Busguard@123` |
| Responsável | `maria.fernandes@email.com` | `Busguard@123` |

Os dados são apenas para desenvolvimento. As contas de demonstração compartilham a mesma senha.

Os scripts de inicialização do MySQL só rodam quando o volume é criado. Se o volume local já existir e **todas as tabelas de dados estiverem vazias**, carregue o mock manualmente no PowerShell:

```powershell
Get-Content -Raw -Encoding UTF8 database/migrate_users_role.sql | docker compose exec -T mysql mysql --default-character-set=utf8mb4 -uapp_user -papp_password app_db
Get-Content -Raw -Encoding UTF8 database/megamock.sql | docker compose exec -T mysql mysql --default-character-set=utf8mb4 -uapp_user -papp_password app_db
```

Em bases que já tenham usuários, use as credenciais cadastradas; não carregue o mock sobre dados existentes.

