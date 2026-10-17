# Resultado das otimizações — 17/10/2026

Escopo aprovado: quatro fases da infraestrutura multiagente. Não foram alteradas
funcionalidades, contratos, dependências ou código do backend/mobile nesta entrega.
As alterações anteriores do frontend e seus arquivos de plano/revisão foram preservados.

## Implementação

1. **Coder local:** a política real do OpenCode 2.0.16 usa buffer padrão de 20000
   tokens. Para contexto 8192 e saída 2048, o adaptador mantém `auto=true`, buffer
   1024 e retenção de 1024; rejeita políticas incompatíveis. Não modifica o runtime.
2. **Contabilidade e limites:** report.json/report.md separam Planner, Coder e
   Reviewer por ambiente. O SQLite por task-id mantém tentativas, reservas,
   chamadas, correções e duração. Reservas sem resposta permanecem desconhecidas.
   O histórico de uso finalizado não pode ser sobrescrito.
3. **Projeto:** scripts nomeados dos workspaces são executados em cópias descartáveis,
   incluindo hooks pre/post originais. Alterar comandos de verificação exige revisão.
   Scripts ausentes ficam pendentes. Dependências existentes podem ser copiadas,
   sem links, instalação ou alteração da origem. Lockfiles de até 2 MB entram no
   snapshot. Correções inalteradas ou que retornem a um estado anterior interrompem o ciclo.
4. **Comparação:** Coder Local ou Cloud, com snapshot/plano/checks equivalentes,
   workspaces separados, tokens por ambiente, resultados dos testes, achados e
   consumo por tarefa concluída, incluindo tentativas malsucedidas. O Coder Cloud
   usa JSON de arquivos e não recebe shell; a diferença de ferramentas é declarada.

## Validações realmente executadas

- Suíte original: 48 testes aprovados antes das mudanças.
- Fase 1: 50 testes aprovados; fase 2: 61; fase 3: 68; fase 4: 74.
- Regressões adicionais e fechamento: **89 testes aprovados** na suíte da
  infraestrutura (`python -B -m unittest discover -s .agent-system/tests -q`).
  Incluem reservas desconhecidas, histórico imutável,
  orçamento entre tentativas, cópia de dependências, retorno ao Coder Local e
  ultrapassagem registrada na última chamada.
- Mobile real em cópia isolada: **26 testes aprovados e typecheck aprovado**,
  em **49,00 s**, incluindo cópia de dependências e limpeza. Nenhuma inferência.
  Artefato: `runs/optimization-mobile-validation-cc037d0c/validation.json`.
- Nenhuma nova inferência Cloud de integração/benchmark foi executada. Os testes
  do Coder Cloud e da comparação utilizam provedores simulados.

## Métricas locais observadas

| Execução | Resultado | Compactações | Tokens registrados | Duração |
| --- | --- | --- | --- | --- |
| Smoke anterior da auditoria | Concluído | 2 | 10591 | 49,68 s total; 45,11 s subprocesso |
| Repetição com timeout de 180 s | Arquivo correto; sessão interrompida | 0 observadas | Uso parcial, não total completo | 220,92 s com preflight |
| Smoke mínimo após correção | Concluído | 0 | 4102 | 32,46 s de subprocesso |
| Mesma tarefa pelo Engine atualizado | local_verified | 0 | 4852 | 20,01 s total; 14,72 s subprocesso |

O último smoke utilizou prompt mínimo com `/no_think`; o anterior tinha outro
prompt e condições de hardware concorrentes. Esses dados comprovam a execução
sem compactação desnecessária; **não medem economia equivalente nem redução
comparável de tempo**. Os 4102 tokens incluem duas respostas e uma chamada
auxiliar: entrada 4022, saída 80, raciocínio 0, cache 0.
Fonte: `runs/optimization-phase1/smoke.json` e banco OpenCode correspondente.

O smoke final reutilizou **o mesmo objetivo** do smoke anterior, pelo Engine com
o prompt normal (sem `/no_think`), OpenCode **2.0.16**, Qwen3 14B, contexto 8192.
Registrou entrada 4488, saída 124, raciocínio 240, cache 0, duas respostas,
nenhuma compactação e nenhum token auxiliar adicional. O ledger registra uma
tentativa, zero correções e zero chamadas Cloud. Trata-se de uma repetição da
tarefa, não de um experimento com hardware/caches/geração controlados; não
generalizamos os ganhos nem os convertemos em economia Cloud ou financeira.
Fonte: `runs/smoke-repository/.agent-system/runs/20261017T165148Z-040893d424/report.json`.

Revisões locais independentes e suas métricas são preservadas em
`runs/optimization-review/`. Achados e limitações ficam documentados separadamente;
aprovação de um escopo não representa execução real do Coder Cloud.
As revisões locais totalizaram **28227 tokens** (entrada 20544, saída 7683,
incluindo raciocínio), registrados pelas respostas do LM Studio. As revisões
iniciais e os achados anteriores foram preservados. As revisões finais dos
escopos de contabilidade e executores foram aprovadas; ver
[OPTIMIZATION_REVIEW.md](OPTIMIZATION_REVIEW.md).

## Limites práticos

- O consumo do chat do editor é externo ao Engine; não foi auditado novamente.
- Entrada em cache e entrada não cacheada continuam distintas. Não calculamos
  economia financeira ou preço equivalente sem faturamento/preços aplicáveis.
- Tokens podem chegar somente ao final da chamada. O limite impede novas chamadas;
  se a última operação ultrapassar o limite, o resultado é `budget_exceeded`.
- Uso incompleto bloqueia inferências sob o limite aplicável; não é convertido em zero.
- Cada retomada deve reutilizar o mesmo task-id e objetivo. Tarefas antigas sem
  ledger não são escalonadas automaticamente. Uma queda abrupta com tentativa
  aberta exige conferência dos artefatos; o orçamento não é zerado para prosseguir.
- Cópias não são sandbox de processos. Scripts exigem autorização de execução;
  dependências, builds nativos, MySQL e dispositivos devem ser preparados à parte.
- Comparações interrompidas pelo orçamento global são identificadas; não são
  evidência de qualidade inferior do candidato afetado.
