# Persistência de atividades — Etapa 2A

Esta etapa define os documentos, índices e planos de mutação do novo fluxo de
atividades. Nenhum helper abre conexão com MongoDB e nenhuma rota usa estes
artefatos ainda.

## Coleções

- `activityRecords`: registro informado pelo aluno, semana da realização,
  quantidade, página/livro, estado de revisão, educador e revisões CAS.
- `weeklyScoreLedgers`: acumulador único por escola, aluno, categoria e semana,
  com snapshot imutável de meta/teto e pontos apenas calculados.
- `activityAuditEvents`: trilha append-only de decisões, quantidades anteriores e
  posteriores, diferenças calculadas, ator e chave de idempotência.
- `activityAdjustmentPendencies`: solicitações de correção que não puderam ser
  efetivadas sem tornar o saldo negativo.

## Concorrência, isolamento e idempotência

- Toda consulta ou mutação planejada inclui `schoolId`.
- Os filtros de decisão exigem a revisão esperada tanto da atividade quanto do
  ledger. A aplicação futura deverá ocorrer em uma única transação e exigir uma
  modificação em cada documento.
- Submissões e eventos de auditoria possuem chaves únicas dentro da escola.
- O ledger possui identidade única por escola/aluno/categoria/semana.
- O primeiro ledger é criado com `$setOnInsert`; chamadas posteriores não podem
  trocar `configurationSnapshot`. Divergências são rejeitadas explicitamente.

## Limites desta etapa

O contrato `buildActivitySubmissionPersistencePlan` prepara o congelamento na
primeira submissão ainda pendente. A garantia somente estará ativa quando um
futuro serviço aplicar, na mesma transação, o registro, o `$setOnInsert` do
ledger e a auditoria `submitted`. Nenhuma rota faz essa integração atualmente.
