# Ações manuais para o go-live

Este arquivo contém somente ações externas ao código. Não registrar secrets nas evidências.

## AÇÃO 1 — Revisão jurídica

**Serviço:** assessoria jurídica/LGPD  
**Onde entrar:** processo jurídico contratado  
**O que verificar/configurar:** Termos, Privacidade, menores, papéis operador/controlador, retenção, exclusão, canal de atendimento e responsabilidades do cliente. Substituir placeholders somente após aprovação e versionar novos documentos.  
**Resultado esperado:** minutas aprovadas formalmente e política de retenção definida.  
**Como provar:** parecer/aprovação arquivada e versões aprovadas registradas.  
**Pode bloquear vendas? SIM**

## AÇÃO 2 — MongoDB Atlas

**Serviço:** MongoDB Atlas  
**Onde entrar:** projeto e cluster usados pela produção  
**O que verificar/configurar:** backup/snapshots disponíveis no plano, retenção, restore capability, alertas, Network Access, Database Access e privilégio mínimo. Executar restore de teste apenas em ambiente isolado conforme `BACKUP_AND_RESTORE.md`.  
**Resultado esperado:** backup confirmado, restore testado e RPO/RTO definidos.  
**Como provar:** captura/configuração sem URI/credenciais e relatório do restore isolado.  
**Pode bloquear vendas? SIM**

## AÇÃO 3 — Resend e DNS de e-mail

**Serviço:** Resend + provedor DNS  
**Onde entrar:** painel Resend, seção Domains; depois painel DNS do domínio  
**O que verificar/configurar:** adicionar/verificar domínio remetente; copiar somente os registros fornecidos pelo Resend; configurar DNS; aguardar verificação; definir remetente; criar `RESEND_API_KEY`; configurar `RESEND_API_KEY` e `RESEND_FROM_EMAIL` na Vercel; redeploy; posteriormente executar um único teste controlado. SPF, DKIM e DMARC devem usar valores do provedor, nunca inventados.  
**Resultado esperado:** domínio e sender verificados, recuperação entregue no teste controlado.  
**Como provar:** status Verified no Resend e teste recebido, sem revelar chave/token.  
**Pode bloquear vendas? SIM**

## AÇÃO 4 — Vercel e domínio

**Serviço:** Vercel  
**Onde entrar:** projeto SUPERPONTOS, Settings > Environment Variables e Domains  
**O que verificar/configurar:** em Production confirmar `MONGODB_URI`, `APP_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ASAAS_ENV`, `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`; nesta etapa Asaas permanece Sandbox. Confirmar `superpontos.gfars.com.br`, HTTPS e associação do domínio antigo para o redirect.  
**Resultado esperado:** deploy saudável, domínio oficial com HTTPS e envs presentes.  
**Como provar:** status Vercel sem exibir valores e resposta HTTPS/healthcheck.  
**Pode bloquear vendas? SIM**

## AÇÃO 5 — Monitoramento

**Serviço:** Vercel/Atlas e ferramenta de uptime/error tracking compatível com o plano  
**Onde entrar:** painéis de observabilidade/alertas  
**O que verificar/configurar:** uptime do domínio e `/api/health`, 5xx, Mongo, Resend, webhook/billing e rate limit anormal; definir destinatários e escalonamento.  
**Resultado esperado:** alertas testados e responsável definido.  
**Como provar:** teste de alerta recebido sem dados pessoais/secrets.  
**Pode bloquear vendas? SIM**

## AÇÃO 6 — Homologação Asaas produção (Etapa 9)

**Serviço:** Asaas + Vercel  
**Onde entrar:** somente após autorização explícita da Etapa 9  
**O que verificar/configurar:** credencial e webhook exclusivos de produção, separação total de IDs Sandbox, primeira assinatura/cobrança controlada, webhook, idempotência e reconciliação.  
**Resultado esperado:** fluxo financeiro real homologado de ponta a ponta.  
**Como provar:** checklist da Etapa 9, sem expor secrets.  
**Pode bloquear vendas? SIM**
