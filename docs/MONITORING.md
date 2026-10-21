# Monitoramento — SUPERPONTOS

Monitoramento externo ainda não foi verificado. A contratação/configuração depende do plano e das contas do proprietário.

## Mínimo antes da primeira venda

- Uptime HTTPS de `https://superpontos.gfars.com.br`.
- Healthcheck de `https://superpontos.gfars.com.br/api/health` esperando HTTP 200 e `status: ok`.
- Alertas para aumento de respostas 5xx e indisponibilidade do MongoDB.
- Alertas para falhas do Resend e recuperação de senha.
- Alertas para falha/rejeição repetida do webhook Asaas e inconsistências de billing.
- Observação de crescimento anormal de 429/rate limiting.

## Operação

Definir responsável, canal, horário de cobertura, severidades e escalonamento. Vercel e MongoDB Atlas podem oferecer logs/alertas conforme o plano atual; verificar sem presumir disponibilidade. Ferramentas externas de uptime ou error tracking podem ser avaliadas depois, sem enviar dados pessoais ou secrets.

Logs devem usar códigos/eventos sanitizados. Nunca registrar senha, cookie, session/reset/invitation token, URI Mongo, chaves Resend/Asaas, webhook token ou payload Pix.
