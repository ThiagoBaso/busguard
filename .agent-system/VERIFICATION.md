# Verificação da infraestrutura multiagente

Data: **14 de outubro de 2026**, ambiente Windows. Escopo: somente infraestrutura de desenvolvimento; nenhuma funcionalidade de transporte escolar foi implementada.

## Ambiente consultado de verdade

| Recurso | Resultado |
| --- | --- |
| Python | 3.14.3 local; código e AST compatíveis com sintaxe Python 3.12. Runtime 3.12 não executado. |
| Git | 2.53.0.windows.2; snapshots, diff sem commits e fronteira Git temporária verificados. |
| Codex CLI | Consulta inicial: 0.162.0-alpha.17.2 sem login. Verificação posterior: 0.162.1 autenticado via ChatGPT, com sessões reais de Planner/Reviewer aprovadas no teste descrito abaixo. |
| OpenCode | 2.0.16; `--version`, ajuda de `run`, resolução do `.exe` e configuração isolada conferidos. |
| LM Studio/lms | CLI commit 69d945a; servidor local na porta 1234; `/v1/models`, `/api/v1/models`, `/api/v0/models`, `lms ls`, `lms ps` e ajuda load/unload consultados. |
| GPUs | RTX 3070 e RTX 3060 Ti, cada uma com 8192 MiB; nome, memória e utilização consultados por `nvidia-smi`. |
| Modelos | `qwen3-14b` e `qwen/qwen3.6-35b-a3b` no inventário, Q4_K_M. Q5_K_M não encontrado nesta inspeção. |

## Testes automatizados

`python -B -m unittest discover -s .agent-system/tests -v`: **48 testes aprovados**. Provedores e decisões Cloud utilizam mocks; não há inferência ou consumo Cloud na suíte.

Cobertura: falhas dos CLIs, LM Studio indisponível e respostas malformadas, modelo ausente/descarregado, ausência de GPU, OOM, timeout/encerramento de processo, planos inválidos e dependências, budget antes de chamadas inclusive falhas, rejeição/revisão/correções, testes pendentes, proteção do plano e arquivos, paths Windows/traversal, comandos perigosos, redirects, credenciais no ambiente/contexto, snapshots com alterações rastreadas e não rastreadas, preservação do índice, benchmark com baseline compartilhado, troca exclusiva e recuperação de modelos após falha, geração de relatórios e métricas desconhecidas.

Git real e execução unittest sobre código sintético foram exercitados em diretórios temporários. Não foram iniciados MySQL, Docker, backend, Expo ou testes de autenticação da aplicação.

## CLI e integração local reais

- `--help`, `--dry-run --model qwen35b`, `--hardware` e `--status`: executados sem chamadas a modelos Cloud. Modelos e sensores foram consultados de verdade.
- Benchmark sintético com Qwen3 14B, sem Cloud, orçamento de correções zero: o OpenCode alterou a fixture, mas não encerrou a sessão em 600 segundos. O orquestrador registrou `failed`, preservou artefatos e encerrou a árvore de processos. Nenhum OpenCode permaneceu ativo; o LM Studio voltou a `idle`. Esse resultado **não é aprovação do benchmark**.
- Smoke posterior, em um repositório sintético mínimo com fronteira Git própria e snapshots internos desativados: **`local_verified`**. O OpenCode escreveu somente `smoke.py` com `value = 42`; checks AST e diff passaram. Duração do subprocesso: **45,11 segundos**, uma chamada de ferramenta, zero erros de ferramenta. Eventos reais informaram 1947 tokens de entrada, 35 de saída, 229 de raciocínio e zero tokens de cache. Tempo exclusivo de inferência e tokens/s não foram fornecidos e permanecem `null`.
- Amostras de GPU/RAM antes, durante e depois das chamadas ficaram nos relatórios locais; representam consumo do sistema inteiro. A distribuição do modelo entre as GPUs não pôde ser confirmada.

Artefatos ignorados pelo Git:

- Benchmark com timeout: `runs/20261014T140930Z-91eb13998f/benchmark.json` e execução `runs/20261014T140930Z-e95e0174f5/report.json`.
- Smoke aprovado: `runs/smoke-repository/.agent-system/runs/20261014T142228Z-4724202227/report.json`.

O smoke carregou o Qwen3 14B pelo comando nativo `lms load`; não descarregou modelos do usuário. A troca gerenciada entre 14B e 35B foi validada com inventário mutável mockado, sem executar o modelo 35B de verdade.

## Limitações pendentes de integração externa

Após o usuário realizar login e autorizar explicitamente o teste, foram executadas **duas sessões reais Cloud**, uma por papel, com o adaptador `CodexCLI` existente. O Planner retornou JSON válido, restrito ao schema de embarque; o Reviewer recebeu o plano validado, as fontes antes/depois e o relatório dos 15 testes locais e retornou **approved**, sem achados. O teste confirmou autenticação, execução não interativa, respostas estruturadas, validação de escopo e métricas. Não chamou o Coder nem alterou código da aplicação.

| Sessão | Duração do subprocesso | Tokens de entrada | Tokens de saída | Chamadas de ferramenta |
| --- | --- | --- | --- | --- |
| Planner | 16,20 s | 10.670 | 598 | 0 |
| Reviewer | 10,24 s | 11.892 | 160 | 0 |

Orçamento: duas chamadas, incluindo falhas; consumidas duas, sem repetição automática. Artefatos: `runs/cloud-login-check/cloud-check.json`, `planner.json`, `reviewer.json` e prompts de entrada. A revisão Cloud analisou evidências de execução local; não executou testes por conta própria. Foi conferida a preservação do schema por hash antes/depois. Tokens de raciocínio, tempo exclusivo de inferência e velocidade não foram informados.

Neste ambiente, `login status` e `--status` dentro do sandbox externo informaram ausência de login; fora dele, ambos reconheceram a sessão ChatGPT. O teste autorizado usou acesso à sessão fora desse sandbox, mantendo as restrições do adaptador: CLI em `read-only`, sem ferramentas, apps, MCP ou descoberta de skills. Nenhuma credencial foi incluída nos prompts. O uso no terminal do usuário deve ser verificado com `--status`; não presuma que o login esteja visível em qualquer ambiente de execução.

O **ciclo completo automatizado** Planner → Coder → checks → Reviewer, incluindo correções, ainda não foi validado integralmente com provedores reais numa única execução. Este teste verificou os dois adaptadores Cloud separadamente e reutilizou a entrega local já revisada; não transforma os relatórios anteriores em `completed`. A suíte de mocks continua sendo a evidência dos cenários de falha e orçamento.

Não foi executada comparação real entre 14B e 35B nem verificação de offload/placement por camada. Quantização, contexto, processos concorrentes e placement nativo podem mudar tempo e memória. Recuperação gerenciada restaura apenas parâmetros suportados; use o inventário/auditoria para recuperar configurações extras manualmente.

A infraestrutura não altera arquivos de backend, mobile, SQL ou Docker. Os arquivos preexistentes `opencode.json` e `prompts/coder.txt` são preservados. A revisão independente está em [REVIEW.md](../REVIEW.md).
