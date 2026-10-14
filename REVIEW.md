# Revisão — ID positivo de passageiro no embarque

Data: 14 de outubro de 2026. Reviewer independente: `/root/review_boarding_id`.
Plano: `PLAN.md`, etapas B1–B5 e revisão B2b. Pedido: escolher uma tarefa pequena e executá-la pelo sistema multiagente existente.

Resultado final: **aprovado**, sem achados obrigatórios abertos. Proposta, arquivos integrados, documentação e evidências conferidos pelo Reviewer independente.

## Escopo revisado

O Coder real OpenCode + LM Studio (`qwen3-14b`) gerou a alteração em `.agent-system/runs/20261014T151441Z-fa9bacb6cd/workspace/backend/app/schemas/mobile_trips.py`: importar `Field` e declarar `passenger_id: int = Field(gt=0)`. O diff preserva `checked_in` obrigatório, nomes dos campos, schemas de resposta e todos os demais campos. IDs zero e negativos passam a receber HTTP 422 na validação de entrada, antes de chamar o serviço.

Os oito testes fornecidos pela coordenação foram lidos integralmente. Exercitam Pydantic e a rota real `driver.py`, isolando autenticação, banco e serviço. Cobrem IDs positivos e inválidos, campos obrigatórios, preservação de `checked_in=False`, ausência de chamada do serviço em entradas inválidas, bloqueio de perfil responsável e documentação OpenAPI. Módulos simulados são restaurados por `patch.dict`; nenhuma conexão com banco é aberta. `backend/requirements-test.txt` declara `httpx==0.28.1` apenas para testes e inclui as dependências runtime existentes.

## Evidências e ocorrências verificadas

| ID | Gravidade | Obrigatório | Estado | Evidência e resolução |
| --- | --- | --- | --- | --- |
| B-R1 | alta | sim | resolvido | Primeira execução local modificou indevidamente o contrato e produziu testes incompletos; o resultado foi rejeitado e nada integrado. A etapa B2b gerou diff mínimo aderente ao plano, conferido pelo Reviewer. |
| B-R2 | média | sim | resolvido | O adaptador temporário usava `-I`, ocultando dependências instaladas no user-site; o loader reportava uma suíte incompleta devido a falha de import. A fixture estava presente. O adaptador recebeu caminhos explícitos das dependências. A fixture também passou a usar funções distintas para `get_db` e `get_current_user`, evitando colisão de overrides. Os oito testes corrigidos passaram independentemente. |

Reprodução independente do Reviewer no workspace final, diretório `backend`:

```powershell
python -B -m unittest discover -s tests -p test_boarding_request.py -v
```

Resultado: **8 testes aprovados**, sem inferência adicional. Conferidos o diff de duas linhas e `.agent-system/runs/boarding-id-validation/validation.json`, que registra AST Python 3.12, whitespace e testes aprovados depois das correções do adaptador/fixture. O relatório original da execução permanece em `correction_limit`; a verificação posterior está separada e não é apresentada como execução automática integralmente aprovada.

## Resultado integrado

Hashes dos arquivos integrados de schema e testes conferem com os artefatos aprovados. `backend/requirements-test.txt` foi integrado; dependências runtime, rotas, serviços, banco e mobile permanecem sem mudanças. `project.md` registra campos obrigatórios, rejeição HTTP 422, instalação das dependências de teste, avanço parcial de P1-09 e os limites das verificações. Comandos, caminhos e conteúdo da documentação foram conferidos; `git diff --check` aprovado.

Os oito novos testes passaram novamente no backend principal. A suíte completa integrada também foi reproduzida independentemente: **15/15 testes aprovados**, incluindo os sete existentes de autorização e invalidação de JWT após mudança de perfil/exclusão de usuário. Para suprir dependências ausentes do ambiente, o processo de testes adicionou explicitamente ao `sys.path` `.agent-system/runs/boarding-id-validation/test-deps`; nenhum pacote global foi alterado. A evidência da coordenação em `integration-validation.json` concorda com a reprodução do Reviewer. Runtime local: Python 3.14.3; AST dos arquivos alterados verificado para sintaxe Python 3.12.

## Limites e histórico

Nenhuma chamada Cloud feita pelo sistema: orçamento zero e revisão Cloud pelo CLI não executada. Esta aprovação refere-se à revisão independente desta conversa e às verificações locais. Testes de autenticação real, persistência MySQL e aplicativo não são demonstrados pela suíte isolada deste contrato.

Histórico anterior preservado em `.agent-system/runs/boarding-id-validation/previous-REVIEW.md`; o plano anterior está em `previous-PLAN.md` e no histórico de `PLAN.md`.
