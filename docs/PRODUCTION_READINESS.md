# SUPERPONTOS — Production Readiness

Atualizado em 2026-10-21. Este checklist não autoriza ativação financeira. `ASAAS_ENV` deve permanecer em `sandbox` até uma etapa posterior com autorização explícita.

## Evidências verificadas

- [x] Domínio oficial centralizado por `APP_URL`: `https://superpontos.gfars.com.br`
- [x] Variáveis necessárias inventariadas em `.env.example`, sem valores reais
- [x] Rate limit distribuído persistido em MongoDB e aplicado às rotas públicas sensíveis
- [x] CSRF/origin check para mutações por cookie; webhook Asaas é exceção autenticada
- [x] Headers de segurança e CSP Report-Only configurados
- [x] Setup de super_admin e cadastro legado bloqueados em produção
- [x] Parser de importação sem a dependência `xlsx`
- [x] Healthcheck mínimo e sem detalhes internos
- [x] Suíte, TypeScript, build e diff check validados nesta etapa
- [x] Painel super_admin read-only com autorização server-side

## Pendências obrigatórias antes do lançamento

- [ ] Confirmar domínio e redirect permanente do domínio antigo no provedor DNS/Vercel
- [ ] Validar todas as envs no ambiente Vercel sem expor seus valores
- [ ] Confirmar plano, índices e conectividade do MongoDB Atlas em produção
- [ ] Verificar e testar política de backup/restauração do MongoDB Atlas
- [ ] Configurar e validar domínio/remetente Resend
- [ ] Revisar juridicamente Termos, Privacidade, menores e retenção (`LEGAL_RETENTION_POLICY_REQUIRED`)
- [ ] Definir canal operacional para solicitações LGPD e seus SLAs
- [ ] Configurar monitoramento externo e alertas; logging local seguro já existe
- [ ] Validar CSP Report-Only com telemetria antes de considerar enforcement
- [ ] Definir runbook de suporte e incidentes
- [ ] Definir e testar rollback de deploy e banco

## Asaas produção — etapa futura separada

- [ ] Obter credencial exclusiva de produção
- [ ] Configurar endpoint e token de webhook exclusivos de produção
- [ ] Alterar `ASAAS_ENV` somente na etapa autorizada
- [ ] Garantir que nenhum ID de Sandbox seja reutilizado
- [ ] Criar customer de produção controlado
- [ ] Criar subscription de produção controlada
- [ ] Executar primeira cobrança real controlada
- [ ] Verificar webhook real, idempotência e reconciliação
- [ ] Documentar rollback financeiro e suporte

## Decisões técnicas

- React 18.3.1 permanece nesta etapa: o peer dependency local do Next.js 16.4.2 aceita `^18.2.0`, os testes e o build passam. O warning de depreciação exige migração planejada antes do Next.js 17, não uma atualização apressada nesta etapa.
- O CSP permanece `REPORT_ONLY`; ativação bloqueante sem relatórios observados poderia quebrar fluxos legítimos.
- Convites seguros têm templates e abstração disponíveis, mas a migração completa do modelo atual de credenciais depende de decisão de produto e não foi imposta retroativamente.
- Exclusão LGPD é solicitação administrativa, nunca uma deleção automática. Prazos legais de retenção aguardam revisão jurídica.
- `BACKUP_CONFIGURATION_VERIFIED = NO`: não há evidência acessível no repositório sobre configuração do Atlas.
- `EMAIL_PROVIDER_CONFIGURATION_REQUIRED = YES`: a abstração Resend falha de forma segura sem credenciais.
