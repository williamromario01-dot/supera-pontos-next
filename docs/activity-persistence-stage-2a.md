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

`calculatedPoints` representa apenas a projeção proporcional. `creditedPoints`
permanece zero: não há escrita em `users.points`, `pointEvents`, ranking, loja,
resgates ou relatórios. A execução transacional dos planos, autorização em rota
e ativação de créditos dependem de etapas futuras expressamente autorizadas.
