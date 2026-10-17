# Revisão — frontend mobile de motorista e responsável

Data: 16 de outubro de 2026. Reviewer independente: `/root/review_mobile_frontend`. Plano: `PLAN.md`, M1–M6, com referência visual do usuário na retomada de 16/10.

Resultado final: **aprovado na revisão independente e na revisão Cloud**, sem achados obrigatórios abertos. Os dois requisitos identificados na primeira revisão Cloud foram corrigidos e reavaliados. A entrega combina coordenação, Coder local e revisores; não representa uma execução autônoma integral do orquestrador.

## Escopo e contratos

Revisados os arquivos mobile alterados e novos: boas-vindas/seleção de perfil, login, navegação protegida, início/chamada do motorista, acompanhamento do responsável, detalhes, conta, ajuda, UI/tema, cliente HTTP, sessão, consultas e testes. Instruções do repositório e documentação versionada do Expo SDK 57 consultadas.

Endpoints e nomes dos campos JSON foram preservados. `/auth/me` fornece somente ID/perfil; a conta não inventa nome ou e-mail. Supervisor mantém a área do motorista; admin somente conta. Detalhes possuem guardas por perfil e não passam dados pessoais em parâmetros de navegação. Backend, SQL, Docker, lockfile e dependências de produção não têm alterações nesta entrega.

A Chamada é o único local com ações de embarque/desembarque. Estado vem da API, sem atualização otimista; referência síncrona bloqueia repetição, leitura anterior é cancelada e polling fica suspenso durante gravação. POST continua ao trocar de aba, até resposta/timeout; reconsulta confirma o estado. Falha identificada bloqueia novas ações até atualização bem-sucedida. Início apresenta resumo/cartões somente para consulta. Lista alfabética não é sequência de paradas e resumo de embarque não representa progresso do percurso.

Responsável distingue horário do evento informado pela API do horário de consulta. Falha de rede identifica dados anteriores; 401/403/404 limpam dados protegidos/indisponíveis. Não há GPS, previsão de chegada, chat, notificações, histórico ou seletor fictício de múltiplos filhos. Seleção inicial de perfil orienta login; autorização efetiva continua sendo a conta retornada pelo servidor.

## Achados e correções verificadas

| ID | Gravidade | Obrigatório | Estado | Evidência e resolução |
| --- | --- | --- | --- | --- |
| M-R1 | média | sim | resolvido | Timeout/listener terminava ao receber headers, deixando JSON pendente sem limite. Reviewer reproduziu em VM com código real. Prazo agora inclui consumo do corpo com Promise.race; testes exercitam headers, JSON, corpo do login, sinal externo e sinal previamente cancelado. |
| M-R2 | média | sim | resolvido | Instâncias independentes de DriverContent poderiam gravar nas duas abas. Ações ficaram exclusivamente na Chamada; início usa readOnly. POST não é abortado no blur e a mesma instância mantém bloqueio até resposta/timeout. Fluxo conferido, com evidência de POST único no navegador. |
| M-R3 | média | sim | resolvido | TripSummary do Coder local usava propriedades incompatíveis e tema literal inválido. Candidatos rejeitados foram preservados; coordenação corrigiu interfaces/tipagem/apresentação antes de integrar. Componente atual lido e aprovado no TypeScript; os candidatos originais não foram aprovados automaticamente. |
| M-R4 | média | sim | resolvido | Preferência de cor não atualizava aparência web. Hook passou a acompanhar matchMedia, limpar listener e manter primeiro render estável. Asserção do navegador verifica cor CSS realmente renderizada. |
| R2-001 | média | sim | resolvido | Cliente distingue network/timeout/cancelled; hook e telas reais exibem HTTP 503, transporte e demora separadamente, mantendo dados anteriores e bloqueio. SessionContext e RootLayout também preservam a mensagem classificada ao restaurar sessão ou falhar logout, com texto neutro para causa desconhecida. Reviewer reproduziu testes e TypeScript; browser-validation.json atualizado aprova o cenário de rejeição fetch, timeout real e 503 com recuperação. |
| R2-002 | média | sim | resolvido | Screen passou a usar useSafeAreaInsets e reservar max(24, bottom + 16) no conteúdo rolável fora das abas; withTabBar deixa somente 24 nas homes cobertas pela barra. Detalhes/modal usam proteção por padrão. Reviewer conferiu chamadas reais e reproduziu testes do Screen real transpilado com inset 48: padding inferior 64 fora das abas e 24 nas abas. Não representa ensaio em dispositivo físico. |

## Evidências

Reviewer executou a partir de mobile/busguard:

```powershell
npm test
npm run typecheck
```

**26/26 testes aprovados; TypeScript aprovado.** Implementações reais transpiladas com dependências isoladas cobrem contratos HTTP/sessão, persistência serializada, 401 antigo durante novo login, logout durante login pendente, 204, timeout/cancelamento completo, IDs inválidos, classificação das falhas e layout com inset inferior simulado. Não constituem testes nativos de componentes nem teste do backend real. TypeScript foi repetido depois da alteração final de SessionContext/RootLayout e passou; `git diff --check` também passou.

Reviewer leu integralmente `browser-flows.cjs` e `browser-validation.json` e inspecionou screenshots. Evidência da coordenação usa navegador real com API fictícia somente no teste: dois perfis, login/logout, embarque com um POST, busca, troca de abas, uma consulta por intervalo de 15 segundos apenas em foco, 503 com consulta anterior identificada/ações bloqueadas, recuperação, detalhes, ajuda, 320 px sem overflow horizontal e mudança real das cores no tema escuro. Exportação web e bundle Android Hermes são evidências da coordenação, não reproduzidas pelo Reviewer nesta etapa.

Testes não cobrem exaustivamente as combinações de navegação/background/gravação/sessão. Inspeção confere foco/geração, timers e cancelamentos; evidência de polling no navegador complementa a leitura. Não foram demonstrados APK/instalação em dispositivo, iOS, leitor de tela, API/MySQL reais ou rede de produção.

## Proveniência e fechamento

Foram consumidas **3/3 chamadas Cloud autorizadas**: Planner rejeitado por checks vazio, Reviewer com correções solicitadas e Reviewer final aprovado. O plano válido foi consolidado pela coordenação no escopo autorizado. `cloud-report.json` preserva os três resultados e suas métricas; `reviewer.json` final contém status approved e R2-001/R2-002 resolved. Esses arquivos foram lidos pelo Reviewer independente.

OpenCode + LM Studio participou em etapas isoladas, com candidatos rejeitados e correções explícitas da coordenação. Helper anterior não foi integrado. Artefatos preservados em `.agent-system/runs/mobile-frontend/`; aprovação final refere-se ao resultado integrado e verificado, sem converter candidatos rejeitados em execuções autônomas aprovadas.

Histórico anterior preservado em `.agent-system/runs/mobile-frontend/previous-REVIEW.md`. Somente este Reviewer atualiza achados e conclusão após conferir novas evidências/correções.

Atualização documental: `project.md`, seção 16, e o andamento de `PLAN.md` foram conferidos pelo Reviewer. Registram corretamente funcionalidades, contratos, verificações, limites nativos/backend e participação do modelo local com correções da coordenação. Fechamento documental aprovado.

Evidência final adicional conferida em `validation.json` e `browser-validation.json`: **dez cenários aprovados**. O teste mantém uma resposta POST pendente, troca Início/Chamada e verifica bloqueio de segundo envio, depois libera a resposta e confirma reconciliação. Simula documento em background por 16 segundos sem nova consulta e verifica uma consulta ao retomar. Exercita rejeição de fetch, timeout real e HTTP 503 com mensagens distintas, consulta anterior identificada, bloqueio e recuperação. Também confere limites dos rótulos de abas na janela de 320 × 760. Capturas finais com altura mínima de navegação 64 foram inspecionadas; rótulos aparecem completos. Bundle Android/Hermes final, posterior à correção de SessionContext, consta como aprovado pela coordenação.

Nenhuma correção obrigatória permanece aberta ou aguardando verificação. Os limites de aparelho físico, iOS, acessibilidade assistiva e integração real permanecem explicitamente documentados e não são apresentados como validações executadas.


## Infraestrutura multiagente - 17/10/2026

Registro das respostas do Reviewer local Qwen3 14B: contabilidade e executores com status `approved` e `findings: []`. Fontes, escopos e limites: [.agent-system/OPTIMIZATION_REVIEW.md](.agent-system/OPTIMIZATION_REVIEW.md). Relatorio de testes: [.agent-system/OPTIMIZATION_RESULTS.md](.agent-system/OPTIMIZATION_RESULTS.md). Validacao Cloud real de integracao/benchmark nao executada.
