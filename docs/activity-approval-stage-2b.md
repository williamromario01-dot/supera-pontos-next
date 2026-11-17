# Motor transacional de aprovação — Etapa 2B

O serviço interno `processActivityApproval` aplica, em uma transação MongoDB,
a decisão da atividade, o acumulador semanal, o saldo do aluno, um `pointEvent`
compatível com os consumidores existentes e o evento de auditoria.

## Garantias

- A semana e seu fechamento são derivados da data da atividade em
  `America/Sao_Paulo`; após segunda-feira às 06:00 a decisão é recusada.
- O primeiro ledger congela `weeklyGoal` e `defaultPoints`. Mudanças posteriores
  da categoria não alteram o snapshot daquela semana.
- O cliente não informa pontos. O total vem das funções puras da Etapa 1 e o
  crédito/estorno é `calculado - creditado`.
- Revisão esperada, transação e chave de idempotência impedem duplicidade.
- Correções geram `pointEvents` compensatórios negativos; eventos anteriores não
  são excluídos ou reescritos.
- Um estorno que deixaria o saldo negativo cria uma única pendência administrativa
  e não altera atividade, ledger, saldo ou eventos anteriores.
- Educador precisa receber a lista de alunos autorizados pela futura camada de
  entrada; admin fica restrito à escola; `company_admin` é recusado.

## Compatibilidade e ativação

Os eventos preservam `studentId`, `categoryId`, `educatorId`, `points` e
`createdAt`, usados hoje por histórico, ranking e relatórios. Metadados novos são
aditivos. O serviço não é chamado por rota alguma nesta etapa e, portanto, não
está ativo para usuários reais.

Antes da ativação serão necessários os índices definidos na Etapa 2A e a
integração das categorias legadas sem `schoolId` persistido. Nenhum índice ou
migração é executado por este módulo.

## Resolução futura de pendências

Uma pendência aberta não representa estorno concluído. Um fluxo administrativo
futuro deverá revalidar saldo, revisões, semana e escopo em nova transação. Se o
estorno se tornar possível, esse fluxo criará o evento compensatório, atualizará
saldo/ledger/atividade e marcará a pendência como `resolved`, com responsável,
data e observação. Se a correção for considerada indevida, deverá marcá-la como
`cancelled`. Resgates concluídos nunca serão apagados ou reescritos.

O congelamento na submissão está preparado por
`buildActivitySubmissionPersistencePlan`, mas ainda não está ativo porque não
existe serviço ou rota de submissão conectado nesta etapa.
