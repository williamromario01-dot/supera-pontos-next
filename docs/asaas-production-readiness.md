# Asaas production readiness

O suporte técnico contempla `sandbox` e `production`, mas toda mutação em Production é *fail closed*. Preparar o código não autoriza cobrança real.

## Ambientes e URLs

`ASAAS_ENV` aceita somente `sandbox` ou `production`. Ausência ou qualquer outro valor falha fechado. As URLs são fixas no código: Sandbox usa `https://api-sandbox.asaas.com/v3`; Production usa `https://api.asaas.com/v3`. Não existe `ASAAS_BASE_URL` configurável.

Credenciais, headers e `User-Agent` são server-only. A chave nunca deve usar prefixo `NEXT_PUBLIC_`.

## Vínculos financeiros

A coleção `billingProviderLinks` separa os vínculos pela chave `(provider, environment, internalSubscriptionId)`. Ela armazena customer, subscription, payment e pagamentos ligados a mudança de quantidade ou reativação. Índices únicos protegem o vínculo interno e IDs remotos por ambiente.

Campos legados da assinatura são lidos somente em Sandbox. Production nunca faz fallback para IDs legados e nunca os sobrescreve. Os IDs Sandbox devem permanecer preservados.

## Kill switches

Todas as variáveis abaixo usam comparação estrita com `true`; ausente, inválida ou `false` bloqueia:

- `ENABLE_ASAAS_PRODUCTION_MUTATIONS`
- `ENABLE_ASAAS_PRODUCTION_CUSTOMER_CREATION`
- `ENABLE_ASAAS_PRODUCTION_SUBSCRIPTION_CREATION`
- `ENABLE_ASAAS_PRODUCTION_SUBSCRIPTION_CHANGES`
- `ENABLE_ASAAS_PRODUCTION_CANCELLATION`
- `ENABLE_ASAAS_PRODUCTION_REACTIVATION`

O switch global prevalece. Os gates restritos de Sandbox continuam independentes.

## Webhook

Rota: `POST /api/webhooks/asaas`, header `asaas-access-token`.

- Sandbox: `ASAAS_SANDBOX_WEBHOOK_TOKEN`, com fallback temporário para `ASAAS_WEBHOOK_TOKEN`.
- Production: `ASAAS_PRODUCTION_WEBHOOK_TOKEN`, sem fallback.

Tokens iguais ou ambíguos são rejeitados. Eventos usam unicidade `(provider, providerEnvironment, providerEventId)`. `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` liquidam e podem ativar; `PAYMENT_OVERDUE` atrasado não regride um pagamento já liquidado; `PAYMENT_REFUNDED` continua válido e pode restringir acesso. O grace period permanece em cinco dias.

## Idempotência e reconciliação

Não é enviado header de idempotência não documentado. Customer e subscription usam `externalReference`, lock, lookup e estado de incerteza. Resultado inconclusivo de criação de subscription não autoriza nova criação cega: primeiro ocorre reconciliação por referência.

Operações inconclusivas usam estados `reconciliation_required` ou marcadores `provider*CreateUncertainAt`. Logs devem conter operação/etapa e códigos, nunca chave, token, CPF/CNPJ completo ou payload PIX.

## Rollback

1. Definir `ENABLE_ASAAS_PRODUCTION_MUTATIONS=false`.
2. Manter a aplicação e o webhook em funcionamento para diagnóstico.
3. Localizar operações `preparing`, `pending_payment` e `reconciliation_required`.
4. Comparar o ambiente e os IDs em `billingProviderLinks` com o Asaas.
5. Reconciliar antes de reabrir cada switch específico.
6. Nunca trocar automaticamente Production por Sandbox.

## Primeira cobrança real controlada

Somente após aprovação manual: confirmar conta/PIX/API/webhook no painel, manter todos os switches desligados, habilitar global + customer para a empresa proprietária, validar o vínculo Production, habilitar subscription, criar uma única assinatura controlada, validar PIX e aguardar webhook real. Confirmar banco, evento e acesso antes de qualquer liberação adicional. Se houver divergência, executar rollback.

## Liberação comercial

Liberar gradualmente, acompanhar erros de webhook e reconciliações, testar cancelamento/reativação/quantity change com casos controlados e manter o switch global como interrupção imediata. Nunca copiar IDs Sandbox para Production.
