# Runbook de suporte — SUPERPONTOS

## Princípios

Confirmar identidade e tenant, coletar horário/código sanitizado, consultar primeiro em modo read-only, registrar evidência e escalar. Nunca solicitar senha ou secret.

## Casos comuns

- **Login falha:** confirmar URL, e-mail normalizado, role e status local sem revelar existência da conta a terceiros; verificar 429 e infraestrutura de auth.
- **Forgot-password falha:** verificar somente o status de configuração Resend no painel, domínio remetente e logs sanitizados. Não executar recovery em conta do cliente.
- **Empresa não ativou:** comparar subscription/billingEvents locais com uma consulta read-only do provedor autorizada; validar ownership e idempotência.
- **Pagamento não refletiu/webhook falhou:** conferir assinatura do webhook, evento, ownership e idempotência; reconciliar pelo procedimento aprovado.
- **Unidade não pode ser criada:** verificar status da subscription, capacidade, contagem de unidades ativas e duplicidade.
- **Usuário bloqueado:** confirmar `active`, role, tenant e motivo; não trocar senha manualmente.
- **Sistema indisponível:** verificar `/api/health`, deploy Vercel, 5xx, MongoDB e dependências; iniciar rollback de código se aplicável.
- **MongoDB:** verificar status Atlas, rede, usuário e timeouts. Não editar documentos como solução normal.
- **Resend:** verificar configuração, domínio/sender e status do provedor sem expor API key.

## Incidentes financeiros — proibições

Nunca criar pagamento duplicado, confirmar pagamento manualmente sem reconciliação, ativar subscription diretamente no MongoDB, inventar webhook ou repetir PUT sem preflight. Priorizar consulta read-only ao provedor, estado local, ownership, reconciliação e idempotência.
