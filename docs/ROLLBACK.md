# Rollback — SUPERPONTOS

## Aplicação

1. Identificar o último commit comprovadamente saudável e o incidente atual.
2. Preservar logs e evidências, sem secrets.
3. Criar um commit de reversão auditável; não usar reset destrutivo na branch compartilhada.
4. Fazer push e redeploy controlado.
5. Verificar domínio, `/api/health`, login e rotas críticas sem criar dados reais.
6. Confirmar conectividade MongoDB e ausência de novas falhas 5xx.

## Dados

Rollback de código e rollback de dados são processos separados. Não reverter banco automaticamente, não apagar billingEvents/pagamentos e não alterar subscription manualmente. Se houver corrupção, congelar mutações relevantes, avaliar impacto e usar restauração isolada/reconciliação aprovada.

Documentar decisão, responsáveis, commits, horários, validações e próximos passos.
