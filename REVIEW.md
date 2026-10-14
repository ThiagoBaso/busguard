# Revisão — infraestrutura multiagente automatizada

Tarefa atual: implementar o sistema independente em `.agent-system/`, conforme o pedido anexado do usuário e o plano da raiz. Data: 14 de outubro de 2026. Reviewer: agente independente `/root/review_multiagent_rules`.

Resultado final da revisão de código e das verificações locais: **aprovado**, com todos os achados obrigatórios resolvidos. Revisados os módulos do orquestrador, adaptadores, validação, segurança, cópias de trabalho, checks, monitoramento, relatórios, benchmark, CLI, testes e README. Os arquivos adicionados ainda não rastreados foram lidos diretamente. A revisão não modificou implementação/configuração.

As reproduções executadas pelo Reviewer utilizaram mocks e arquivos temporários independentes, sem inferência ou chamada Cloud. O Coordenador também executou um smoke de inferência local real, cujos artefatos foram inspecionados nesta revisão. **A integração Cloud real continua pendente:** Codex CLI estava sem login neste ambiente e não houve autorização para testes pagos. Esta aprovação cobre a implementação revisada, os contratos mockados e a integração local demonstrada; não confirma funcionamento Cloud real.

| ID | Gravidade | Obrigatório | Estado | Local |
| --- | --- | --- | --- | --- |
| R1 | alta | sim | resolvido | `.agent-system/agent_system/providers.py`, `OpenCodeCLI.probe` |
| R2 | alta | sim | resolvido | `.agent-system/agent_system/benchmark.py`, `model_session.py` e `engine.py`, troca/exclusividade dos modelos |
| R3 | média | sim | resolvido | `.agent-system/agent_system/providers.py`, `LMStudio.request`/`inventory` |
| R4 | média | sim | resolvido | `.agent-system/agent_system/providers.py`, redirecionamentos HTTP |
| R5 | alta | sim | resolvido | `.agent-system/agent_system/engine.py`, integridade do resultado após os checks |
| R6 | alta | sim | resolvido | `.agent-system/agent_system/workspace.py` e `providers.py`, fronteira Git do OpenCode |

## R1 — normalização da versão do OpenCode

Evidência: o executável instalado informa `opencode v2.0.16`; a versão inicial do adaptador verificava `version.startswith("2.")`, recusando a instalação compatível antes de executar o Coder.

Impacto: tarefas locais eram bloqueadas no preflight.

Correção verificada: o adaptador extrai a versão semântica e preserva `version_raw`. Reprodução mockada com a saída real retornou `version: "2.0.16"` e `version_raw: "opencode v2.0.16"`. **Resolvido.**

## R2 — benchmark com múltiplos modelos e exclusividade

Evidência: a configuração padrão exige `require_exclusive_model: true`. O fluxo inicial carregava o modelo selecionado, mas não descarregava os anteriores. Com apenas o primeiro carregado, a segunda rodada falhava por modelo descarregado; com `--load-model`, o segundo permanecia junto do primeiro e falhava na exclusividade, ou no carregamento por memória insuficiente. Se ambos estivessem carregados inicialmente, nenhuma rodada atendia à exclusividade.

Impacto: a comparação automática de dois aliases não podia completar ambas as execuções em condições exclusivas equivalentes. O mock inicial retornava inventário vazio, ocultando a incompatibilidade.

Critério de resolução: implementar troca explicitamente autorizada, com preservação/restauração verificável do estado anterior do runtime e registro das limitações de restauração. Sem essa autorização, não descarregar modelos do usuário. Cobrir dois aliases usando um inventário mockado que muda de estado durante load/unload, incluindo falha/interrupção e restauração.

Reavaliação: `--manage-models` e `ModelSession` agora trocam os modelos sequencialmente com `parallel=1`, guardam o estado original e restauram os parâmetros suportados em `finally`. O inventário mutável confirmou troca exclusiva e restauração de contexto/parallel. IDs personalizados de instâncias agora são mapeados à chave do modelo antes de descarregá-las; reprodução de `custom-slot` usou corretamente `lms load qwen3-14b --identifier custom-slot`.

Correção final verificada: `activate` consulta o inventário antes de descarregar a instância própria, permitindo continuar quando um carregamento anterior falhou sem criar uma instância. A regressão `test_model_session_recovers_from_oom_then_handles_custom_instance` usa inventário mutável, provoca OOM no 35B, executa depois `custom-slot` com a chave `qwen3-14b` e confirma a restauração da instância original. O teste de troca exclusiva/restauração de contexto e parallel também passou. **Resolvido.**

## R3 — respostas LM Studio não confiáveis

Evidência: uma resposta JSON `[]` fazia `inventory()` chamar `.get` em uma lista, lançando `AttributeError`. Essa exceção escapava do contrato de erros da CLI/Engine, em vez de gerar indisponibilidade/estado de falha corretamente.

Impacto: respostas malformadas podiam interromper a CLI com traceback e deixar um relatório com estado anterior à falha.

Correção verificada: validação do objeto raiz, da lista de modelos e das estruturas nativas foi adicionada. A reprodução de `inventory()` com `[]` passou a gerar `ProviderError` explicativo. **Resolvido.**

## R4 — bloqueio de redirecionamentos antes da conexão

Evidência: `urlopen` segue redirects automaticamente. Conferir `response.geturl()` depois rejeitava somente o processamento, após a conexão ao destino externo já ter acontecido.

Impacto: o cliente anunciado como restrito a loopback podia abrir uma conexão externa durante a consulta ao LM Studio.

Correção verificada: o opener padrão passou a usar `NoRedirect`; sua chamada `redirect_request` lança `ProviderError` antes de seguir o destino. Reprodução sem rede confirmou a rejeição. **Resolvido.**

## R5 — checks sobre conteúdo diferente da entrega final

Evidência: após os checks, a implementação inicial chamava apenas `workspace.inspect_changes(all_allowed)`. Isso permite que um teste modifique um arquivo autorizado depois da checagem de sintaxe. Reprodução com checker mockado que gravou `invalid (` em `sample.py` e retornou checks aprovados resultou em `status: local_verified`, com o arquivo final sintaticamente inválido.

Impacto: o relatório podia declarar verificações aprovadas para conteúdo diferente do resultado entregue; os nomes em `changed_files` também eram calculados antes dessa alteração.

Correção verificada: um checkpoint completo é comparado antes/depois dos checks; alterações são rejeitadas com `SafetyError`. O teste `test_check_cannot_modify_verified_source` passou na verificação independente final. **Resolvido.**

## R6 — fronteira Git independente para descoberta do OpenCode

Evidência: o Coordenador identificou no smoke local que um workspace dentro da raiz, sem `.git` próprio, permite a descoberta do repositório principal. A fonte OpenCode 2.0.16 confirma que essa raiz descoberta também define o diretório interno para acesso a arquivos. Permissões amplas de `grep`/`glob` poderiam alcançar arquivos do projeto principal, apesar das permissões exatas de leitura/edição.

Impacto: a cópia de trabalho não delimitava corretamente o conteúdo acessível pelas ferramentas de busca do Coder.

Correção verificada: o workspace passou a receber `git init --template=` sem commits; metadados iniciais são copiados para o baseline e permanecem sujeitos à conferência de integridade. O adaptador também define `snapshot: false`, cuja interpretação foi confirmada na fonte pelo investigador das CLIs. Teste com Git real em diretório temporário confirmou `rev-parse --show-toplevel` igual ao caminho do workspace e ausência de hooks. **Resolvido.**

## Verificações independentes

`python -B -m unittest discover -s .agent-system/tests`: **48 testes aprovados**, em execução independente final. Provedores, OOM, revisão e trocas de modelos utilizaram mocks; Git e o runner de unittest também foram exercitados de verdade em cópias temporárias com código sintético. Incluídas regressões de preservação das alterações rastreadas e do index do usuário, fronteira Git sem hooks/commits, alteração indevida durante checks e contrato de contexto isolado do Codex.

O contrato Codex desativa descoberta automática de AGENTS com `project_doc_max_bytes=0`, delimita a raiz de contexto, ignora configuração do usuário e desativa descoberta de skills do host, ferramentas, hooks e memórias. A geração desses argumentos foi validada com mocks; não houve inferência Cloud.

README conferido: comandos e opções correspondem à CLI implementada; permissões, autorização de execução de testes, gestão explícita de modelos, recuperação e limitações de validação estão documentadas.

## Evidências locais reais do Coordenador

Artefatos inspecionados: `.agent-system/runs/smoke-repository/.agent-system/runs/20261014T142228Z-4724202227/report.json` e `workspace/smoke.py`.

- OpenCode **2.0.16** e LM Studio com `qwen3-14b` criaram `smoke.py` contendo `value = 42` em repositório sintético independente.
- Resultado `local_verified`, AST Python e diff aprovados, **0 chamadas Cloud**, 1 ferramenta e 0 erros de ferramentas.
- Chamada do Coder: **45,11 s**; tarefa inteira: **49,68 s**. O relatório informa 1947 tokens de entrada, 35 de saída e 229 de raciocínio; métricas de tempo de inferência e velocidade permanecem `null`.
- A fixture de benchmark mais longa terminou com `failed` após timeout de 600 s, registrado em `.agent-system/runs/20261014T140930Z-e95e0174f5/report.json`. Seus checks não foram executados e ela não foi apresentada como sucesso. O encerramento da árvore de processos foi informado pelo runner; o Coordenador confirmou o runtime ocioso depois.

Esses resultados demonstram integração local básica e tratamento de timeout. Não constituem comparação concluída dos dois modelos nem aprovação do benchmark completo.

## Limites da validação

As permissões relativas `read`/`edit`, o carregamento da configuração isolada, eventos JSON e `run --standalone` foram conferidos com o investigador das CLIs a partir da fonte do OpenCode 2.0.16. A inferência real disponível foi a tarefa sintética descrita acima; não se demonstrou desempenho em tarefas extensas da aplicação nem execução real do 35B nesta validação.

Planner/Reviewer Cloud reais permanecem **pendentes de login e autorização específica de teste**. A aplicação FastAPI/MySQL/Expo não foi executada por esta revisão nem recebeu funcionalidades novas. Cópias não são sandbox de processos; execução de testes e restauração de placement das GPUs têm as limitações documentadas. A revisão não autoriza consumo Cloud e não apresenta verificações estáticas como testes de comportamento.
