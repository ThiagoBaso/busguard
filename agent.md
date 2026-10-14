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

### 3.1. Trabalho com múltiplos agentes

Use múltiplos agentes quando separar implementação, investigação ou revisão permitir avançar em paralelo ou melhorar a qualidade. Mantenha o esforço proporcional à tarefa; mudanças pequenas podem usar um agente para implementação e outro para revisão. Todos devem ler as instruções aplicáveis ao seu escopo, preservar alterações existentes e respeitar a autorização do usuário.

Para execução automatizada, consulte o [sistema multiagente local](.agent-system/README.md). Ele mantém plano, revisão e estado por tarefa em `.agent-system/runs/`, sem sobrescrever os arquivos de controle da raiz; chamadas Cloud de benchmarks e escalonamento exigem confirmação explícita no CLI. Execuções sem Reviewer Cloud devem ser identificadas como verificadas localmente, sem declarar aprovação Cloud.

| Papel | Responsabilidade |
| --- | --- |
| **Coordenador / Planner** | Entender o pedido, manter `PLAN.md`, definir escopo e critérios de aceite, distribuir tarefas, integrar entregas e comunicar o resultado. O agente principal pode acumular esses dois papéis. |
| **Coder** | Implementar as etapas atribuídas do plano aprovado, executar as verificações pertinentes e relatar alterações, resultados e impedimentos. |
| **Reviewer** | Revisar o diff e as evidências de validação, registrar achados em `REVIEW.md` e verificar as correções. Deve ser um agente diferente de quem implementou o trecho revisado. |

**Plano e autorização (`PLAN.md`)**

- `PLAN.md` contém o plano aprovado da tarefa atual: objetivo e escopo, etapas identificadas, responsáveis, dependências, arquivos ou áreas permitidas, critérios de aceite e verificações previstas. Registre o estado do plano e a origem da aprovação; um arquivo vazio ou um plano antigo não representa aprovação da tarefa atual.
- O Coordenador / Planner aprova decisões de implementação dentro do escopo já autorizado pelo usuário. Aproveite autorizações existentes na conversa; peça esclarecimento ou autorização adicional apenas quando necessário para resolver uma decisão fora desse escopo.
- O Coder deve executar as etapas atribuídas de `PLAN.md` e **não deve modificar esse arquivo**, nem para marcar progresso. Reporte o andamento ao Coordenador / Planner, responsável por manter o plano atualizado.
- Se uma etapa for inviável ou exigir alteração de escopo, o Coder deve relatar o motivo e propor o ajuste. O Coordenador / Planner registra a revisão e sua autorização antes de redistribuir a etapa afetada; tarefas independentes podem continuar.

**Delegação e integração**

- Antes de delegar, informe objetivo, etapas do plano, contexto necessário, arquivos permitidos, dependências e critério verificável de entrega.
- Atribua um responsável por arquivo alterado durante cada etapa. Agentes podem ler os mesmos arquivos, mas edições no mesmo arquivo devem ocorrer em sequência. Defina também um único responsável por consolidar `PLAN.md` e outro por consolidar `REVIEW.md`.
- Execute em paralelo tarefas independentes. Compartilhe decisões que afetem contratos entre backend, banco e mobile antes de implementar partes dependentes.
- Cada Coder entrega ao Coordenador / Planner um resumo com etapas atendidas, arquivos alterados, verificações executadas e resultados, além de riscos ou impedimentos. O Coordenador / Planner confere o diff integrado e os contratos entre as entregas antes da revisão final.

**Revisão e correções (`REVIEW.md`)**

- `REVIEW.md` contém os achados e solicitações de correção do Reviewer, associados à tarefa e à versão do plano ou do diff revisado. Registre também o resultado da revisão, mesmo quando não houver achados: `aprovado`, `correções necessárias` ou `validação pendente`.
- Cada achado deve ter identificador, gravidade, arquivo/local afetado, evidência, impacto, correção esperada ou critério de resolução e estado (`aberto`, `aguardando verificação` ou `resolvido`). Distinga correções obrigatórias de sugestões opcionais; sugestões não ampliam automaticamente o escopo.
- O Coder corrige os achados atribuídos e informa ao Reviewer o que mudou e como foi verificado. Não apague achados nem marque como resolvida a própria correção; somente o Reviewer atualiza as conclusões de `REVIEW.md` após conferir o resultado. Divergências devem ser resolvidas com evidências e registradas pelo Reviewer.
- O Reviewer verifica aderência ao plano, regressões, contratos, autorização e integridade dos dados quando aplicáveis, além da suficiência das verificações. Reavalie os trechos corrigidos e seus efeitos antes de aprovar a entrega.

**Conclusão da tarefa**

Não considere uma tarefa concluída apenas porque o código foi escrito ou porque um subagente terminou. O Coordenador / Planner encerra a tarefa quando os critérios de aceite forem atendidos no resultado integrado, as verificações necessárias passarem e o Reviewer aprovar esse resultado, com todas as correções obrigatórias resolvidas. Achados obrigatórios em estado `aberto` ou `aguardando verificação` impedem a conclusão. Uma validação necessária não executada deve ficar registrada como pendente, com motivo e impacto, sem ser apresentada como aprovação. Aplique também o [critério geral de conclusão](#10-critério-de-conclusão).

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
- Não reintroduza o fallback que retornava qualquer viagem ativa para um motorista sem viagem própria. A correção está registrada no `project.md`.
- JWT assinado não substitui consulta às políticas de acesso. Ao alterar autenticação, trate usuário excluído, mudança de perfil, expiração e estratégia de revogação.
- Não registre tokens, senhas, documentos, endereços completos ou dados faciais em logs. Use identificadores e metadados mínimos quando necessários à auditoria.
- Não copie dados reais de alunos para fixtures, seeds ou exemplos. Dados faciais, quando usados como biometria de uma pessoa, exigem proteção específica; avalie a necessidade de coletá-los antes de expandir essa funcionalidade.
- Ao mudar respostas, devolva somente os dados necessários ao caso de uso. O campo `facial` atualmente está no schema de leitura de passageiros e merece revisão.
- Não declare conformidade com a LGPD a partir de uma revisão de código. As decisões de finalidade, base legal, retenção e tratamento de dados de crianças precisam ser documentadas com os responsáveis pelo produto.

## 6. Banco de dados e migrações

- O Compose inicializa volumes novos apenas com `database/init.sql`. `database/megamock.sql` é uma fixture manual para ambiente isolado; os modelos ORM também precisam refletir as constraints de `init.sql`.
- Confira PKs, FKs, unicidade, índices, enums, defaults, nulabilidade e comportamento de exclusão nas duas representações antes de alterar entidades.
- `create_tables.sql` duplica o bootstrap; `transport_schema.sql` é complementar. Não execute todos os arquivos SQL como se formassem uma sequência de migrações.
- Alterações em banco existente exigem migração explícita e plano de recuperação. Atualizar `init.sql` não atualiza volumes já criados. Alembic é uma melhoria proposta, ainda não configurada.
- Quando Alembic for adotado, revise manualmente migrações geradas, especialmente renomes e operações destrutivas, conforme sua [documentação](https://alembic.sqlalchemy.org/en/latest/autogenerate.html).
- Nunca execute `delete_all_rows.sql`, `docker compose down -v`, exclusões de dados ou redefinições de senhas como rotina de validação. Só use operações destrutivas com autorização específica para o ambiente e os dados envolvidos.
- Não execute `app.scripts.seed_demo` como checagem: ele altera dados e redefine credenciais de demonstração. O endpoint `/admin/seed-demo` foi removido.
- Não desabilite FKs para contornar erros da aplicação. Corrija relacionamentos, ordem de operações e migrações.
- Testes de persistência devem usar banco isolado e descartável; prefira MySQL 8.0 para verificar comportamentos específicos desse banco.

## 7. Aplicativo e experiência de uso

- Mantenha TypeScript estrito. Evite `any`, coerções que ocultem incompatibilidades e regras de autorização exclusivamente na interface.
- Requisições e persistência de sessão pertencem aos serviços; componentes devem lidar com interação e apresentação.
- Separe carregamento, ausência de viagem, erro de autenticação, falta de conexão e dados de demonstração. Falha de API não deve parecer uma viagem real atualizada.
- Tokens nativos usam SecureStore. A sessão web atual fica apenas em memória e termina ao recarregar a página; mudanças nessa sessão precisam considerar XSS, cookies e CSRF. Não apresente armazenamento em memória como proteção completa contra XSS.
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

Há testes de autorização mobile em `backend/tests/`; ainda não há configuração de lint/format ou CI versionada. Não afirme que `pytest`, `npm test` ou `npm run lint` passaram sem que essas ferramentas tenham sido configuradas e executadas.

Para alterações de comportamento, escreva verificações que detectem regressões relevantes: acesso à viagem de outro usuário, embarque fora da rota, transição inválida, repetição/concorrência de eventos, sessão expirada e rollback visual. Correções apenas documentais não exigem novos testes da aplicação.

## 10. Critério de conclusão

Uma entrega deve atender ao pedido, manter contratos consistentes, preservar dados e alterações existentes e atualizar a documentação afetada. Execute as verificações necessárias ao risco da mudança e informe precisamente o que passou, falhou ou ficou sem validação.

Antes de concluir, revise o diff, confira links e comandos adicionados e verifique se não entraram segredos ou arquivos gerados. Resuma o resultado, os motivos e as limitações materiais. Não faça commit, push ou deploy sem que isso faça parte do pedido.
