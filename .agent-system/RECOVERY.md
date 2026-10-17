# Recuperação sem repetir implementação

`--resume-run` cria outra pasta de execução e uma nova tentativa no mesmo
ledger. Copia baseline e workspace, verifica o digest do baseline e o escopo
do plano original. Não chama Planner, Coder ou LM Studio. Nunca integra fontes.

Validação sem inferência, usando os scripts já inspecionados:

```powershell
python -B .agent-system/orchestrator.py --resume-run .agent-system/runs/ORIGEM --allow-test-execution --copy-workspace-dependencies --reference-file refs/image.png
```

Os scripts são executados em outra cópia descartável. As dependências existentes
são copiadas sem seguir links; não são instaladas. `package.json` deve conservar
os comandos do baseline. Sem autorização, os scripts ficam pendentes.
`checks_verified` significa checks aprovados, sem aprovação Cloud, visual ou
integração implícita. O relatório registra `resumed_from`, `source_attempt_id`,
hashes dos fontes, alterações e totais acumulados do ledger. As métricas da
tentativa atual não repetem os tokens herdados.

Uma futura revisão exige autorização separada e explícita:

```powershell
python -B .agent-system/orchestrator.py --resume-run .agent-system/runs/ORIGEM --allow-test-execution --copy-workspace-dependencies --reference-file refs/image.png --confirm-cloud-review
```

Essa opção permite somente uma revisão. Rejeição não dispara correções nem
outras revisões. Os limites acumulados de chamadas, tokens e tempo continuam
valendo. Não use esse comando sem autorização para a inferência Cloud.

## Referências e interpretação visual

- `--reference-file` declara arquivos obrigatórios. Caminhos de imagens e PDFs
  citados na tarefa também são detectados; referências ausentes bloqueiam antes
  do Planner. Para caminhos com espaços, use sempre a opção explícita.
- PNG e JPEG são transportados como bytes para o baseline e workspace, com
  SHA-256. Limites: 2 MB/arquivo, 4 imagens, 8 MB de referências, 20 MB/snapshot,
  8192 px/eixo e 16 milhões de pixels/imagem. Outros binários são recusados.
- Imagens e `--require-visual` tornam interpretação visual obrigatória. Antes
  de implementar, cada adaptador envolvido precisa comprovar suporte e envio.
- O Codex exige `cloud.model` explícito, modalidade `image` no catálogo local
  `models_cache.json` e suporte a `codex exec --image`. O comando recebe os
  anexos reais e as métricas registram seus hashes. Nome de arquivo no prompt
  não é considerado imagem recebida. Catálogo e versão devem ser mantidos pelo
  operador; essa conferência não é um teste remoto de interpretação.
- O adaptador OpenCode atual não comprova transporte multimodal. Portanto,
  tarefas visuais com Coder Local são bloqueadas antes da chamada Cloud, mesmo
  que o modelo local tenha um nome que sugira visão. Não há fallback textual.
- Referências são imutáveis durante a implementação. `required_files` permite
  declarar pré-condições por etapa. Checks determinísticos das etapas
  intermediárias bloqueiam a próxima etapa em caso de falha. O OpenCode deve
  terminar com a confirmação estruturada indicada no prompt; ausência,
  truncamento ou `blocked` interrompem a implementação e preservam o trabalho.

## Aprovação e integração

Revise integralmente `changes.patch`, os resultados dos scripts e as limitações
visuais. Patches novos são gravados em UTF-8/LF, inclusive no Windows.
Não substitua o relatório original nem marque aprovação Cloud manualmente.

Antes de integrar, confira novamente os hashes dos arquivos do projeto contra
o baseline e do snapshot contra a versão validada/aprovada. Só copie a lista
exata de arquivos revisados após autorização do usuário. Nenhum modo de retomada
faz essa cópia, commit, push ou migração.
