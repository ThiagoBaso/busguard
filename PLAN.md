# Plano — infraestrutura multiagente automatizada

Estado: aprovado para implementação dentro do escopo solicitado pelo usuário em 14 de outubro de 2026. Autorização: pedido anexado nesta conversa. Testes reais que consumam Cloud continuam dependendo de aprovação específica.

Objetivo: adicionar um sistema Python independente para Planner/Reviewer via Codex CLI e Coder via OpenCode + LM Studio, preservando a aplicação e alterações existentes.

| Etapa | Responsável | Dependência | Entrega e aceite |
| --- | --- | --- | --- |
| P1 | Coordenador | — | Inspecionar repositório, versões, ajuda das CLIs, APIs LM Studio e GPUs; registrar limitações reais. |
| P2 | Coder principal | P1 | Configuração, schemas validados, adaptadores, isolamento de arquivos, permissões e processos com timeout. |
| P3 | Coder principal | P2 | Máquina de estados determinística, limites Cloud/correções, checks permitidos, relatórios JSON/Markdown e CLI. |
| P4 | Coder principal | P3 | Monitoramento por GPU/RAM, benchmark com baseline único e workspaces separados, confirmação específica de Cloud. |
| P5 | Coder principal | P4 | Testes com mocks cobrindo falhas, segurança, limites, seleção de modelos e relatórios; CLI e integração local sem Cloud. |
| P6 | Reviewer independente | P5 | Revisar diff, corrigir achados e verificar novamente; documentação em português e evidências finais. |

Arquivos permitidos: `.agent-system/`, `.gitignore`, `project.md`, `agent.md`, `PLAN.md` (somente Coordenador) e `REVIEW.md` (somente Reviewer). Preservar `opencode.json`, `prompts/coder.txt`, backend, mobile, banco e Docker.

Decisões: biblioteca padrão Python 3.12+; configuração JSON para dispensar dependências; tarefas executadas em cópias sanitizadas, sem aplicação automática ao projeto principal; Cloud recebe contexto selecionado e limitado; testes executados pelo orquestrador por identificadores permitidos, sem comandos arbitrários do modelo; no máximo um Coder ativo por workspace.

Verificações: `python -m unittest discover -s .agent-system/tests -v`, CLI `--help`, `--dry-run`, `--hardware`, `--status`, planejamento/fluxos mockados e benchmark isolado mockado; `git diff --check`; preservação de arquivos preexistentes e ausência de mudanças na aplicação. Não executar inferência Cloud nesta validação sem aprovação do usuário.

Andamento: P1–P6 concluídas para implementação e verificação local. Revisão independente aprovada, achados R1–R6 resolvidos. 48 testes passaram; CLI/help/dry-run/hardware/status e smoke real OpenCode + LM Studio foram verificados. Backend, mobile, banco e Docker não foram alterados.

Limitações registradas em `.agent-system/VERIFICATION.md`: benchmark sintético longo atingiu timeout de 600s, smoke mínimo posterior foi aprovado; comparação real com 35B não foi executada. Planner/Reviewer Cloud foram testados com mocks e interfaces reais consultadas, sem inferência Cloud: o CLI está sem login e um teste pago depende de autorização específica do usuário.
