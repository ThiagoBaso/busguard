# Otimização do sistema multiagente

Plano aprovado pelo usuário em 16/10/2026. Coordenador/Coder: agente principal.
Escopo: somente infraestrutura `.agent-system/` e sua documentação; preservar
alterações existentes, funcionalidades do BusGuard e evidências anteriores.

1. Corrigir a política OpenCode 2.0.16: compactação automática habilitada,
   buffer compatível com 8192 tokens; testes e smoke local isolado antes da fase 2.
2. Métricas completas por papel/tentativa, inclusive falhas; orçamento persistente
   por tarefa para chamadas, tokens registrados, duração e correções. Testar antes da fase 3.
3. Checks de scripts dos workspaces TypeScript/React Native e detecção de ausência
   de progresso; conservar autorização para executar código e testes Python.
4. Coder Cloud selecionável e comparação em snapshots equivalentes; testes com
   provedores simulados. Nenhuma inferência Cloud de benchmark/integração autorizada.

Critérios: suíte existente preservada, regressões das quatro fases aprovadas,
smoke local com métricas recuperáveis, relatórios distinguindo desconhecido de zero,
limites que sobrevivem a novas tentativas e nenhuma integração automática ao app.
Revisão independente curta, sem sessões Cloud adicionais; registrar limitações
e validação Cloud pendente, sem alegar economia financeira.

Progresso em 17/10/2026: quatro fases implementadas e verificadas em sequência.
O fechamento preserva métricas do smoke local, resultados dos testes e revisão
limitada independente em `runs/optimization-review/`. Relatório consolidado em
`OPTIMIZATION_RESULTS.md`. Integração/benchmark Cloud real permanece fora da
autorização atual; a comparação automatizada foi validada com provedores simulados.
