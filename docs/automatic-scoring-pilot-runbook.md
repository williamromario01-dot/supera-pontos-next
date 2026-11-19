# Piloto da pontuação automática — ativação e reversão seguras

Este runbook prepara um piloto em **uma única escola**. Ele não autoriza deploy,
acesso ao MongoDB de produção, criação de índices em produção, ativação de flags
em produção ou qualquer alteração em cobranças e assinaturas Asaas.

## Pré-requisitos

1. Ambiente de homologação isolado, com credenciais próprias e sem dados reais.
2. MongoDB replica set ou Atlas com suporte a transações.
3. Build correspondente ao commit aprovado e suíte completa verde.
4. Escola, alunos, educadores, categorias e produtos exclusivamente de teste.
5. Meta semanal e teto de pontos revisados para cada categoria do piloto.
6. Responsáveis definidos para monitoramento e decisão de interrupção.

## Índices

Antes de ativar qualquer flag em homologação, executar somente contra um banco
cujo nome contenha `staging`, `homolog`, `test` ou `dev`:

```powershell
$env:NODE_ENV='development'
$env:ACTIVITY_INDEX_SETUP_ALLOWED='true'
$env:MONGODB_ACTIVITY_STAGING_URI='<URI EXCLUSIVA DE HOMOLOGAÇÃO>'
$env:MONGODB_ACTIVITY_STAGING_DB='supera_pontos_homolog'
npm.cmd run indexes:activity:staging
```

O comando recusa `NODE_ENV=production`, recusa URI igual a `MONGODB_URI`, exige
confirmação explícita e verifica nome/unicidade após a criação. Usa apenas
`createIndex`/`createIndexes` suportados pelo driver oficial e pelo MongoDB Atlas.

Índices obrigatórios do piloto:

- `activityRecords`: `activity_submission_idempotency` (unique),
  `activity_school_student_week`, `activity_school_category_week` e
  `activity_company_school_status`.
- `weeklyScoreLedgers`: `weekly_ledger_identity` (unique) e
  `weekly_ledger_company_school_week`.
- `activityAuditEvents`: `activity_audit_idempotency` (unique) e
  `activity_audit_record_timeline`.
- `schoolScoringModeChanges`: `school_scoring_mode_effective`,
  `school_scoring_mode_one_change_per_effective_date` (unique) e
  `school_scoring_mode_idempotency` (unique).
- Dependência adicional: dois índices de `activityAdjustmentPendencies`, usados
  para correções que não podem estornar pontos sem saldo negativo.

## Ordem das feature flags

Todas começam `false`. Em homologação, habilitar nesta ordem, verificando saúde
e respostas 404/200 entre cada passo:

1. `ACTIVITY_SUBMISSIONS_ENABLED=true` — expõe leitura/submissão, mas escolas em
   modo tradicional continuam recusando mutações automáticas.
2. `ACTIVITY_APPROVALS_ENABLED=true` — ainda não credita sem o gate seguinte.
3. `AUTOMATIC_ACTIVITY_SCORING_ENABLED=true` — libera crédito somente para escola
   cujo modo automático já esteja vigente.
4. `SCORING_MODE_CONFIGURATION_ENABLED=true` — por último, libera o agendamento
   administrativo. Não habilitar esta flag antes de índices e monitoramento.

## Ativação de uma única escola

1. Manter todas as demais escolas no modo `legacy` (default).
2. Administrador da escola ou superadministrador com escola explicitamente
   selecionada agenda `automatic` usando chave de idempotência única.
3. Confirmar `effectiveAt` na próxima segunda-feira, 00:00 em
   `America/Sao_Paulo`; até esse instante o modo tradicional continua vigente.
4. Não lançar o mesmo trabalho nos dois motores. Após a vigência, usar apenas
   atividades para as categorias do piloto; bônus especiais permanecem no fluxo
   explícito e idempotente de 100 pontos.
5. Fazer uma submissão pequena, aprovar e comparar ledger, saldo e `pointEvent`
   antes de ampliar o grupo.

## Monitoramento

Durante o piloto, por escola/aluno/categoria/semana, conferir:

- pendências, aprovações, correções, rejeições e revisões CAS;
- `weeklyScoreLedgers.calculatedPoints === creditedPoints` após decisões aplicadas;
- soma dos `pointEvents` automáticos compatível com a variação de `users.points`,
  descontando resgates e outros eventos identificados;
- ausência de chaves de idempotência duplicadas e de erros 409 inesperados;
- ranking, histórico, estoque/resgates e RGS v2 coerentes;
- fila `activityAdjustmentPendencies` sem crescimento não explicado.

## Critérios de interrupção

Interromper novas submissões/aprovações se ocorrer qualquer um destes casos:

- divergência entre ledger, eventos e saldo;
- crédito duplicado, ausência de evento, perda de pontos ou isolamento violado;
- transação sem rollback integral;
- índice obrigatório ausente ou conflito de unicidade não explicado;
- aumento de pendências de ajuste sem procedimento de resolução;
- RGS, ranking ou resgate apresentando valores incompatíveis.

Desabilitar primeiro `ACTIVITY_APPROVALS_ENABLED` para parar créditos, depois
`ACTIVITY_SUBMISSIONS_ENABLED`. Preservar documentos e logs para diagnóstico.

## Reversão para o modo tradicional

1. Bloquear novas aprovações pela flag e aguardar transações em andamento.
2. Registrar contagens e somas de atividades, ledgers, auditorias, eventos e
   saldos; nunca apagar ou reescrever histórico.
3. Resolver ou cancelar formalmente pendências abertas; não forçar estorno que
   deixe saldo negativo.
4. Agendar `legacy` para a próxima segunda-feira. A mudança não é retroativa:
   semanas automáticas fechadas e seus snapshots permanecem imutáveis.
5. Após a vigência, validar que submissões automáticas são recusadas e o motor
   tradicional volta a aceitar lançamentos conforme suas regras.
6. Manter flags globais ligadas somente se outra escola homologada depender
   delas; caso contrário, desligar configuração, scoring, aprovações e submissões.

## Proteção contra duplicidade ou perda de pontos

- Nunca copiar atividades automáticas para lançamentos tradicionais.
- Reusar a mesma chave somente em retry da mesma operação; não gerar nova chave
  quando a resposta for incerta antes de consultar auditoria/ledger.
- Considerar `pointEvents` append-only: correções usam evento compensatório.
- Comparar `creditedPoints`, eventos e saldo antes e depois da janela de troca.
- Não editar `effectiveAt` manualmente nem antecipar a reversão no banco.
- Resgates concluídos e snapshots RGS v1/v2 nunca são removidos ou recalculados.
