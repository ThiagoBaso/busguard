# Plano — frontend mobile de motorista e responsável

Estado: concluído em 16/10/2026, com revisão independente e Cloud aprovadas. Escopo autorizado pelo usuário em 14/10/2026, com referência visual adicionada em 16/10: somente motorista e responsável, aproveitando o frontend existente. Três chamadas Cloud autorizadas e consumidas; plano válido consolidado em `.agent-system/runs/mobile-frontend/coordinator-plan.json`.

Retomada em 16/10/2026: referência visual do Figma enviada pelo usuário. Priorizar amarelo `#f9b900`, verde `#078861`, texto azul-escuro `#18233d`, fundos `#f7f8fd` e cartões compactos brancos com detalhes menta/lavanda. Substituir títulos e blocos genéricos por hierarquia de produto; incluir boas-vindas com seleção de perfil e login contextual. A referência orienta aparência, sem habilitar recursos inexistentes de GPS, chat, múltiplos filhos ou recuperação de senha. Coder local continua obrigatório em etapas isoladas e revisadas.

Estado herdado: M2–M4 parcialmente escritos e preservados. O Planner Cloud anterior foi rejeitado pelo validador (lista de checks vazia); não houve aprovação desse plano. Coordenação mantém este plano válido, e as duas chamadas restantes do orçamento ficam para revisão/correções. Helper local anterior gerado foi rejeitado na inspeção por descumprir contratos de normalização e datas; não integrado. Novo estágio local criará um cartão visual de viagem a partir das interfaces compartilhadas.

Arquivos adicionais permitidos após referência: `app/welcome.tsx`, `app/(tabs)/students.tsx`, `components/Brand.tsx`, `components/TripSummary.tsx`. Coordenador implementa integração/tema/login/layout/config e testes; Coder local escreve `TripSummary.tsx` em cópia isolada, sem alterar os demais arquivos. Responsáveis anteriores M3/M4 entregaram arquivos parciais e encerraram; Coordenador assume essas correções em sequência. Revisão independente continua responsável por `REVIEW.md`.

Andamento em 16/10: M1–M6 concluídas. Ações de embarque ficam exclusivamente na aba Chamada. Home exibe somente consulta e acesso à chamada, evitando operações simultâneas em instâncias diferentes. POST continua até resposta/timeout durante troca de aba; GET cancela ao perder foco. O Coder local gerou três propostas (uma inicial e duas correções) em workspace isolado, com interfaces ainda incompatíveis; o Coordenador corrigiu tipagem, propriedades e rótulos na integração. Não apresentar essa etapa como aprovação autônoma do modelo.

Evidências finais: 26 testes Node, TypeScript, exportação web com 15 rotas e bundle Android/Hermes aprovados. Dez cenários no navegador com API exclusivamente simulada verificaram os dois perfis, tema escuro, 320 px, polling por foco/background, POST pendente durante troca de aba, rede/timeout/503, busca e confirmação. Os achados Cloud R2-001 (classificação de falhas) e R2-002 (inset inferior fora das abas) foram corrigidos e verificados por testes e pelos dois revisores. Revisão independente e última revisão Cloud aprovadas, sem correções obrigatórias pendentes. Nenhum backend, SQL, Docker, lockfile ou dependência de produção alterado. Evidências e capturas em `.agent-system/runs/mobile-frontend/`.

## Etapas e responsáveis

| Etapa | Responsável | Escopo | Aceite |
| --- | --- | --- | --- |
| M1 | Coordenador + Planner Cloud | Contratos, design, atribuição e plano | API real preservada, perfis confirmados, critérios verificáveis e orçamento limitado. |
| M2 | Coordenador | Tema/UI, consulta por foco, sessão, serviços | Tema claro/escuro consistente, timeout/cancelamento, 401 sem corrida com novo login, polling somente em foco/ativo. |
| M3 | Coder motorista | `app/(tabs)/index.tsx`, `components/AlunoItem.tsx`, `app/route.tsx` | Busca/filtros, resumo de embarque, detalhes acessíveis, gravação confirmada e tratamento de falha sem dados fictícios. |
| M4 | Coder responsável | `app/(tabs)/responsible.tsx`, `app/trip-details.tsx` | Criança/estado/viagem da API, atualização/ausência/erro, horário do registro separado do horário da consulta. |
| M5 | Coordenador + Coder local OpenCode/LM Studio | Login/conta/navegação/ajuda; helper puro de apresentação em workspace isolado | Fluxos protegidos, texto PT-BR, ajuda útil, nenhum GPS/histórico/chat/seletor de filhos fictício. Helper local só integrado após checks. |
| M6 | Coordenador + Reviewer independente e Cloud | Integração, testes, exportações, documentação e revisão | TypeScript, testes relevantes e bundles passam; revisão aprova diff integrado; limitações materiais documentadas. |

O Coordenador é o único escritor de `PLAN.md`; Reviewer independente será o único escritor de `REVIEW.md`. Coders não editam esses documentos. Um responsável por arquivo em cada etapa; correções de outro responsável são sequenciais após entrega. Sem alterações no backend, SQL, Docker, dependências de produção ou credenciais. Os agentes revisores não implementam código.

Interfaces compartilhadas acordadas pela coordenação:

- `components/ui.tsx`: `Screen({title,subtitle?,eyebrow?,children,refreshing?,onRefresh?})`, `Card({children,style?})`, `AppText({children,muted?,variant?:'body'|'title'|'label'|'metric',style?})`, `Button({label,onPress,disabled?,loading?,variant?:'primary'|'secondary'|'danger'})`, `Badge({label,tone?:'success'|'warning'|'neutral'})`, `StatePanel({title,message,loading?,onRetry?})`, `Notice({message,tone?:'error'|'info'})`.
- `constants/theme.ts`: `useAppTheme()` retorna `background,surface,surfaceAlt,text,muted,primary,primarySoft,accent,border,danger,success,dark`. Componentes usam React Native e safe-area-context, sem nova biblioteca.
- `hooks/useTripQuery.ts`: `useTripQuery<T>(loader:(signal?:AbortSignal)=>Promise<T>, enabled=true)` retorna `data,loading,refreshing,error,errorStatus,updatedAt,refresh:()=>Promise<T|null>,cancel:()=>void`. Atualização periódica 15s somente em foco e AppState ativo; cancela ao sair da tela. Erro 404 limpa dados; erro de rede pode preservar dado anterior com aviso e controles bloqueados.
- `services/tripService.ts`: IDs de viagem obrigatórios; `time?:string|null`; loaders recebem `signal?:AbortSignal`; `updateBoardingStatus(tripId,passengerId,checkedIn,signal?)` tem resposta tipada. Nomes JSON preservados.
- Embarque: pausar consulta e cancelar leitura em andamento antes de enviar alteração; bloquear toques repetidos; recarregar somente após resposta. Diferenciar falha de gravação de confirmação seguida de falha de reconsulta. IDs positivos validados no cliente; sessão continua protegida no servidor.
- Detalhes `/route` só motorista/supervisor; `/trip-details` só responsável. Não transmitir dados pessoais em parâmetros da rota. Cada detalhe consulta API autorizada. Supervisor mantém a interface existente do motorista; admin mantém somente conta, sem nova área administrativa.

Critérios adicionais: não exibir identidade nominal ausente em `/auth/me`, tratar dados recentes/stale, limpar timers e abortar requisições, nunca representar posição GPS ou ordem de paradas a partir da ordem alfabética retornada. Diferenciar ocupação do veículo de progresso do percurso. Tema e layout funcionam em 320 px e tablet; botões possuem rótulo e estado acessível.

Verificações: `tsc --noEmit`, testes Node isolados de regras/cliente, exportação Expo web e bundling Android, navegador com API simulada exclusivamente no teste quando disponível. Sem alegar validação de dispositivo/iOS/MySQL ou dados reais. A execução combina adaptadores existentes e coordenação manual para testes TypeScript e integração; não será descrita como execução automática completa do Engine de Python.


## Otimização da infraestrutura multiagente — 17/10/2026

Nova tarefa aprovada pelo usuário, separada do frontend acima. Plano e critérios: [.agent-system/OPTIMIZATION_PLAN.md](.agent-system/OPTIMIZATION_PLAN.md). Implementação restrita à infraestrutura; evidências em [.agent-system/OPTIMIZATION_RESULTS.md](.agent-system/OPTIMIZATION_RESULTS.md). Sem autorização para novas inferências Cloud de integração/benchmark.
