# BusGuard — orientações para agentes e contribuidores

Este documento define como trabalhar neste repositório. Consulte [project.md](project.md) para arquitetura, configuração, funcionalidades e diagnóstico técnico. O [AGENTS.md](AGENTS.md) da raiz encaminha agentes para estas orientações.

As regras abaixo orientam novas alterações; elas não significam que todas as melhorias já estejam implementadas. A análise de referência foi realizada em **6 de outubro de 2026**.

## 1. Antes de alterar arquivos

1. Leia a tarefa, este documento, `project.md` e os `AGENTS.md` aplicáveis ao diretório alterado.
2. Verifique `git status --short` e preserve alterações existentes do usuário.
3. Localize os fluxos envolvidos com `rg` e leia os arquivos antes de editá-los.
4. Confira versões em `backend/requirements.txt`, `backend/Dockerfile`, `mobile/busguard/package.json` e `package-lock.json`.
5. Defina a menor alteração que atende ao pedido e identifique efeitos sobre API, banco, aplicativo e permissões.

Em `mobile/busguard`, siga também o [AGENTS.md local](mobile/busguard/AGENTS.md), que exige a leitura da [documentação do Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) antes de escrever código. Consulte a versão correspondente à instalada; não suponha compatibilidade com exemplos de outros SDKs.

Instruções explícitas do usuário prevalecem sobre estes documentos. Instruções específicas de um subdiretório complementam as da raiz no seu escopo.

## 2. Mapa de responsabilidades

| Local | Responsabilidade |
| --- | --- |
| `backend/app/routes/` | Endpoints, dependências, autorização de entrada e tradução de erros para HTTP. |
| `backend/app/services/` | Casos de uso, regras de negócio e operações de persistência. |
| `backend/app/models/` | Mapeamentos SQLAlchemy e estrutura persistida. |
| `backend/app/schemas/` | Contratos Pydantic de entrada e saída. |
| `backend/app/security.py` | Hash de senhas, JWT e dependências de autenticação/perfil. |
| `backend/app/database.py` | Engine e sessão por requisição. |
| `mobile/busguard/app/` | Telas e navegação por arquivos com Expo Router. |
| `mobile/busguard/services/` | Cliente HTTP, sessão e integração de viagens. |
| `mobile/busguard/components/` | Componentes compartilhados. |
| `database/` | Bootstrap SQL, dados de demonstração e artefatos de modelagem. |
| `docker-compose.yml` | Ambiente local de API e MySQL. |

A stack atual usa Python 3.12 na imagem, FastAPI, SQLAlchemy com sessões síncronas, Pydantic v2, MySQL 8.0, Expo 57, React 19, React Native 0.86 e TypeScript com `strict: true`. Preserve a arquitetura modular existente. Introduza novas camadas, serviços ou bibliotecas quando houver necessidade demonstrável.

## 3. Fluxo de implementação

- Mantenha mudanças focadas no pedido. Uma recomendação do `project.md` não autoriza implementar todo o roteiro em uma tarefa pontual.
- Em mudanças de contrato, revise o percurso completo: rota → schema → serviço → modelo/SQL → cliente HTTP → tela.
- Preserve nomes de campos, valores de enums, códigos HTTP e comportamento público quando não houver mudança de contrato prevista. Documente incompatibilidades e a estratégia de migração.
- Não edite dependências instaladas, arquivos gerados ou lockfiles manualmente. Use o gerenciador correspondente quando uma atualização fizer parte da tarefa.
- Não faça atualizações amplas de frameworks junto de uma correção pequena. Justifique novas dependências por benefício, manutenção e compatibilidade.
- Use português brasileiro na documentação e nas mensagens ao usuário. Preserve convenções locais de nomes de código.
- Para decisões com impacto duradouro, registre uma decisão de arquitetura curta com contexto, escolha, alternativas e consequências. `docs/adr/` é um local recomendado, ainda inexistente.

## 4. Backend e contratos HTTP

- Use tipagem explícita nas interfaces novas e recursos compatíveis com Python 3.12. Adote `snake_case` em funções, variáveis e módulos; `PascalCase` em classes.
- Mantenha handlers enxutos: validação de transporte e dependências nas rotas; regras de domínio nos serviços. Preserve a tradução das exceções de negócio para respostas HTTP.
- Use schemas específicos para criação, atualização e leitura. Não retorne entidades ORM sem controlar os campos serializados. Nunca inclua senha, `password_hash` ou segredo JWT em respostas.
- Valide entradas além do tipo: identificadores positivos, limites de paginação, e-mail, datas coerentes e regras de relacionamento. Distinga campo omitido de `null` em atualizações.
- Use ORM ou SQL parametrizado. Não concatene entrada do usuário em consultas.
- Para operações de negócio, delimite uma transação, faça rollback em falhas e evite commits intermediários que deixem estado parcial. Os serviços atuais fazem seus próprios commits; considere isso antes de compô-los.
- Não use chamadas bloqueantes de `Session` síncrona diretamente em handlers `async def`. Uma migração para acesso assíncrono deve abranger driver, engine, sessão e testes.
- Centralize regras de início, conclusão e cancelamento de viagens. CRUD genérico não deve permitir contornar essas regras.
- Para novos instantes persistidos, adote uma política explícita de UTC e conversão de apresentação. Migre datas antigas de forma planejada; elas hoje incluem horários sem fuso. A data operacional da viagem deve respeitar o fuso definido pelo negócio.
- Preserve contratos existentes: respostas mobile usam campos como `routeName` e `checkedIn`; o pedido de embarque usa `passenger_id` e `checked_in`. Não altere uma ponta sem atualizar a outra.
- Ao padronizar erros, diferencie autenticação inválida, acesso proibido, recurso ausente, conflito, validação e indisponibilidade. Não exponha SQL, caminhos internos ou dados pessoais na resposta.

## 5. Autorização e dados pessoais

Toda leitura ou alteração de dados protegidos deve verificar **perfil e acesso ao recurso específico**, conforme a [orientação da OWASP sobre autorização por objeto](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/).

- Motoristas só devem acessar viagens atribuídas a eles. Supervisores devem ser verificados pelo vínculo de supervisão. Permissões administrativas precisam ser explícitas.
- Responsáveis só devem acessar os passageiros vinculados a sua conta. Considere múltiplos filhos e não aceite um identificador enviado pelo aplicativo como prova de vínculo.
- No embarque, valide usuário → viagem → passageiro → veículo/rota antes de persistir. Não amplie o acesso quando nenhum recurso autorizado for encontrado.
- Não replique o fallback atual que retorna qualquer viagem ativa para um motorista sem viagem própria. O problema está registrado como P0 no `project.md`.
- JWT assinado não substitui consulta às políticas de acesso. Ao alterar autenticação, trate usuário excluído, mudança de perfil, expiração e estratégia de revogação.
- Não registre tokens, senhas, documentos, endereços completos ou dados faciais em logs. Use identificadores e metadados mínimos quando necessários à auditoria.
- Não copie dados reais de alunos para fixtures, seeds ou exemplos. Dados faciais, quando usados como biometria de uma pessoa, exigem proteção específica; avalie a necessidade de coletá-los antes de expandir essa funcionalidade.
- Ao mudar respostas, devolva somente os dados necessários ao caso de uso. O campo `facial` atualmente está no schema de leitura de passageiros e merece revisão.
- Não declare conformidade com a LGPD a partir de uma revisão de código. As decisões de finalidade, base legal, retenção e tratamento de dados de crianças precisam ser documentadas com os responsáveis pelo produto.

## 6. Banco de dados e migrações

- O Compose inicializa o banco com `database/init.sql` e `database/megamock.sql`. `init.sql` é a referência operacional atual; os modelos ORM também precisam refletir suas constraints.
- Confira PKs, FKs, unicidade, índices, enums, defaults, nulabilidade e comportamento de exclusão nas duas representações antes de alterar entidades.
- `create_tables.sql` duplica o bootstrap; `transport_schema.sql` é complementar. Não execute todos os arquivos SQL como se formassem uma sequência de migrações.
- Alterações em banco existente exigem migração explícita e plano de recuperação. Atualizar `init.sql` não atualiza volumes já criados. Alembic é uma melhoria proposta, ainda não configurada.
- Quando Alembic for adotado, revise manualmente migrações geradas, especialmente renomes e operações destrutivas, conforme sua [documentação](https://alembic.sqlalchemy.org/en/latest/autogenerate.html).
- Nunca execute `delete_all_rows.sql`, `docker compose down -v`, exclusões de dados ou redefinições de senhas como rotina de validação. Só use operações destrutivas com autorização específica para o ambiente e os dados envolvidos.
- Não execute `/admin/seed-demo` nem `app.scripts.seed_demo` como checagem: eles alteram dados e redefinem credenciais de demonstração.
- Não desabilite FKs para contornar erros da aplicação. Corrija relacionamentos, ordem de operações e migrações.
- Testes de persistência devem usar banco isolado e descartável; prefira MySQL 8.0 para verificar comportamentos específicos desse banco.

## 7. Aplicativo e experiência de uso

- Mantenha TypeScript estrito. Evite `any`, coerções que ocultem incompatibilidades e regras de autorização exclusivamente na interface.
- Requisições e persistência de sessão pertencem aos serviços; componentes devem lidar com interação e apresentação.
- Separe carregamento, ausência de viagem, erro de autenticação, falta de conexão e dados de demonstração. Falha de API não deve parecer uma viagem real atualizada.
- Tokens nativos usam SecureStore. O cliente web atual usa `localStorage`; mudanças nessa sessão precisam considerar XSS e desenho de backend, cookies e CSRF. Não apresente esse armazenamento como proteção contra XSS.
- Ao evoluir o cliente HTTP, considere timeout, cancelamento, tratamento uniforme de `401/403` e respostas sem corpo, como `204`.
- Centralize o estado do embarque ou sincronize-o corretamente com novas props. Atualizações otimistas precisam reverter a UI em caso de falha e evitar disputas com polling e toques repetidos.
- Os fluxos atuais consultam a API a cada 15 segundos. Mudanças devem limpar timers, evitar requisições concorrentes e respeitar foco da tela e ciclo de vida do aplicativo.
- Cuide de rótulos de acessibilidade, foco, contraste, escalonamento de texto e estados desabilitados. Verifique comportamento em web e na plataforma nativa afetada.
- Não anuncie rastreamento, leitor facial, notificações ou mensagens como recursos operacionais sem a integração correspondente. Os mapas atuais são ilustrativos.

## 8. Configuração e dependências

- Nunca versione `.env`, chaves privadas, credenciais reais ou dumps com dados pessoais. Use valores fictícios nos exemplos.
- Preserve o arquivo existente `.env.exemple` enquanto seu nome não for alterado junto das referências. Configure segredos fora do código.
- Variáveis `EXPO_PUBLIC_*` entram no aplicativo compilado. Use `EXPO_PUBLIC_API_BASE_URL` para o endereço da API, nunca para segredos, conforme a [documentação do Expo](https://docs.expo.dev/guides/environment-variables/).
- Dentro do Compose, o MySQL atende em `mysql:3306`; a porta do host é `localhost:3307`. Um telefone físico precisa de um endereço acessível na rede local.
- Use `npm ci` para reproduzir o lockfile mobile. Dependências Python ainda não têm resolução integral travada; não assuma build reproduzível no backend.
- O Compose e o Dockerfile atuais usam `--reload`, e o Compose monta o código local. Para produção, planeje uma configuração própria, sem dados de demonstração e com gestão de segredos.

## 9. Verificação proporcional à mudança

| Verificação disponível | Diretório | Comando |
| --- | --- | --- |
| Configuração Compose, sem imprimir valores de ambiente | Raiz | `docker compose config --quiet` |
| Sintaxe Python; não valida imports nem negócio | `backend/` | `python -m compileall -q app` |
| Tipagem TypeScript, após instalar dependências | `mobile/busguard/` | `node node_modules/typescript/bin/tsc --noEmit` |
| Saúde da API, com ambiente iniciado | Raiz / PowerShell | `Invoke-RestMethod http://localhost:8000/health` |

O `/health` atual não verifica o banco. Não use sua resposta como comprovação de autenticação, viagens ou persistência.

Não há suíte automatizada, configuração de lint/format ou CI versionada na análise inicial. Não afirme que `pytest`, `npm test` ou `npm run lint` passaram sem que essas ferramentas tenham sido configuradas e executadas.

Para alterações de comportamento, escreva verificações que detectem regressões relevantes: acesso à viagem de outro usuário, embarque fora da rota, transição inválida, repetição/concorrência de eventos, sessão expirada e rollback visual. Correções apenas documentais não exigem novos testes da aplicação.

## 10. Critério de conclusão

Uma entrega deve atender ao pedido, manter contratos consistentes, preservar dados e alterações existentes e atualizar a documentação afetada. Execute as verificações necessárias ao risco da mudança e informe precisamente o que passou, falhou ou ficou sem validação.

Antes de concluir, revise o diff, confira links e comandos adicionados e verifique se não entraram segredos ou arquivos gerados. Resuma o resultado, os motivos e as limitações materiais. Não faça commit, push ou deploy sem que isso faça parte do pedido.
