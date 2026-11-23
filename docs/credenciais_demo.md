# NFC e QR fixos de demonstração

O aluno **Lucas Fernandes**, CPF fictício `80000000167` (ID 1 na fixture), recebe NFC e QR ativos na primeira carga. **Rafael Fernandes**, CPF fictício `80000000329` (ID 3), recebe um QR próprio. Esses códigos são públicos e exclusivos para demonstração.

## QR pronto

Abra [o QR do Lucas](lucas-demo-qr.svg), imprima ou exiba em outra tela para ler pelo aplicativo:

![QR Code de demonstração do Lucas Fernandes](lucas-demo-qr.svg)

Conteúdo do QR:

```text
busguard:qr:v1:d2fe7089c5ad4b7d865592bc102a46f3
```

Para o Rafael, abra [o QR do Rafael](rafael-demo-qr.svg):

![QR Code de demonstração do Rafael Fernandes](rafael-demo-qr.svg)

```text
busguard:qr:v1:a0973b6fe3a14411b34df671ec92d205
```

## Tag NFC

Em uma base nova, o código abaixo já recebe uma credencial ativa. **Se o Lucas já tinha outra NFC cadastrada, o cadastro anterior é preservado e este código fixo não é ativado automaticamente.** Para usar o código fixo, execute antes:

```powershell
docker compose exec api python -m app.scripts.seed_demo_credentials --activate-lucas-nfc
```

Esse comando substitui a NFC ativa do Lucas pelo código fixo e desativa suas NFCs anteriores ou pendentes. Os QRs e as credenciais de outros alunos são preservados. Só execute para usar esta tag: se você desativá-la depois, repetir o comando irá reativá-la.

Grave uma vez o conteúdo abaixo como **registro de texto NDEF** na tag, usando um gravador NFC no Android. Depois, leia essa mesma tag no aplicativo. Não é necessário gerar outro código no painel.

```text
busguard:nfc:v1:b35df68203bf4988a62fb054be610261
```

Gravar a tag substitui seu conteúdo anterior. O botão **Gerar código** do painel emite uma credencial diferente; use o conteúdo acima para utilizar a credencial fixa.

## Banco existente

Para adicionar os códigos sem recarregar ou apagar outros dados, com a API atualizada e as migrações NFC/QR aplicadas:

```powershell
docker compose exec api python -m app.scripts.seed_demo_credentials
```

O comando só atua se encontrar os nomes e CPFs fictícios dos dois alunos. Se um aluno já tiver qualquer histórico do tipo de credencial indicado, esse histórico é preservado; o comando informa o resultado separadamente para cada aluno e tipo. Nesse caso, utilize a tag/QR que você já cadastrou: o código fixo daquele tipo não é ativado.

## Próximas recargas

A carga `database/init.sql` preserva hashes, IDs, estados e datas das credenciais NFC/QR de passageiros cujos CPFs continuam na fixture. O vínculo é reconstruído pelo CPF, inclusive se o ID mudar. O autor também é vinculado pelo CPF, ou fica vazio se não existir mais. Credenciais de passageiros removidos da demonstração são descartadas; elas nunca são transferidas ao novo dono de um ID reutilizado.

Credenciais pendentes continuam pendentes e as desativadas continuam desativadas. Um código fixo desativado ou substituído não é reativado na próxima recarga nem pelo comando sem opções. A opção explícita `--activate-lucas-nfc` ativa novamente a NFC fixa quando solicitada. A tag NFC e o QR são independentes.

A carga ainda substitui os demais dados fictícios. Remover o volume do banco apaga os cadastros existentes; uma base nova recebe novamente os três códigos públicos. Para leitura no app, o aluno precisa pertencer à viagem ativa do motorista ou supervisor autenticado.
