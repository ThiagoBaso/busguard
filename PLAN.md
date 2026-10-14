# Plano — validar ID de passageiro no embarque

Estado: concluído e aprovado pelo Reviewer independente em 14 de outubro de 2026. Escopo autorizado pelo usuário: escolher uma tarefa pequena e continuar as implementações usando o sistema de agentes.

Objetivo: `BoardingRequest.passenger_id` deve ser maior que zero. IDs inválidos serão rejeitados na validação de entrada, preservando `checked_in`, nomes dos campos, schemas de resposta e regras de autorização.

| Etapa | Responsável | Dependência | Critério de aceite |
| --- | --- | --- | --- |
| B1 | Coordenador / Planner | — | Inspecionar contrato e dependências; gerar plano JSON em `.agent-system/runs/boarding-id-validation/plan.json`. |
| B2 | Coder local, OpenCode + LM Studio | B1 | Alterar somente schema mobile e novo teste; executar pelo Engine existente em workspace isolado, sem chamadas Cloud. |
| B3 | Orquestrador / Coordenador | B2 | AST, diff-check e pelo menos cinco testes de schema/rota real isolada passam; IDs zero/negativos não chegam ao serviço. |
| B4 | Reviewer independente | B3 | Revisar diff e evidências; verificar preservação de contratos e proteção contra regressão. |
| B5 | Coordenador | B4 | Integrar apenas arquivos revisados após conferir baseline; repetir teste necessário no repositório e atualizar project.md. |

Arquivos permitidos para o Coder: `backend/app/schemas/mobile_trips.py`, `backend/tests/test_boarding_request.py`. O Coordenador pode atualizar `project.md` e artefatos do plano; somente o Reviewer atualiza a revisão. Não modificar banco, rotas, mobile, Docker, dependências ou configurações de agentes.

Autorização de testes: a implementação solicitada inclui validação pertinente; o wrapper temporário usa checks determinísticos e testes com dependências isoladas. A autenticação Codex CLI continua indisponível: orçamento Cloud **zero**; não apresentar verificação local como aprovação pelo CLI Cloud.

Histórico do plano/revisão anterior preservado em `.agent-system/runs/boarding-id-validation/previous-PLAN.md` e `previous-REVIEW.md`.

Andamento: B1 concluída. A primeira execução local parou em `correction_limit`: contrato modificado indevidamente e testes incompletos; nada integrado. Orientação do Coordenador para B2b: executar estágio menor, permitindo ao Coder editar somente o campo no schema, fornecendo fonte completa e testes fixos somente leitura. Este estágio terá três passos internos e zero correções/Cloud; preserva os mesmos critérios e escopo da tarefa.

Revisão do plano: os testes passam a ser fixture fornecida pela coordenação para verificação independente da implementação do modelo. `focused-plan.json` e `run_focused.py` registram a orientação e o estágio limitado. Para reproduzir testes HTTP, a integração poderá incluir `backend/requirements-test.txt` com httpx apenas na suíte de testes; `backend/requirements.txt` de produção permanece preservado.

Resultado integrado: B1–B5 concluídas. B4 aprovou o resultado integrado e a documentação em `REVIEW.md`, sem correções obrigatórias pendentes; o Reviewer também reproduziu independentemente os 15 testes. B5 integrou somente schema, testes e dependências de testes, após comparar a fonte com o baseline original. `project.md` registra o contrato, o procedimento de testes e P1-09 parcialmente atendido. Produção mudou apenas a importação de `Field` e a restrição `passenger_id: int = Field(gt=0)`; rotas, serviços, banco e mobile foram preservados.

Verificações integradas: oito novos testes e sete existentes aprovados (**15/15**), AST compatível com sintaxe Python 3.12 e `git diff --check` aprovados. A suíte comum primeiro encontrou duas falhas por `passlib` ausente; a repetição usou pacotes de autenticação em `.agent-system/runs/boarding-id-validation/test-deps`, sem alterar pacotes globais. `integration-validation.json` registra a execução e suas dependências. A restrição Cloud zero foi mantida.

Proveniência: primeira execução `20261014T150025Z-515f3f5584` rejeitada e não integrada. Estágio menor `20261014T151441Z-fa9bacb6cd` produziu o schema correto; o adaptador temporário e a fixture da coordenação tiveram correções, registradas em `validation.json`. O relatório original permanece `correction_limit`; a evidência posterior de aprovação local é separada. Não declarar o fluxo automático completo ou Reviewer Cloud como aprovado.

---

## Histórico — infraestrutura multiagente automatizada

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
