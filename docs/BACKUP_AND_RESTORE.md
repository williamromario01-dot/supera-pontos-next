# Backup e restauração — SUPERPONTOS

`BACKUP_CONFIGURATION_VERIFIED = UNKNOWN`. O repositório não fornece evidência sobre backup do MongoDB Atlas.

## O que proteger

Banco `supera_pontos`, incluindo empresas, usuários, escolas, turmas, categorias, eventos de pontos, assinaturas e eventos financeiros locais, solicitações LGPD, sessões e tokens ainda válidos. Secrets continuam fora do banco/repositório e devem ser protegidos no gerenciador da Vercel.

## Verificação no MongoDB Atlas

1. Abrir o projeto e cluster corretos no Atlas.
2. Identificar o tier/plano e verificar se Cloud Backup ou snapshots estão disponíveis e habilitados.
3. Registrar frequência, janela e retenção realmente exibidas pelo Atlas; não presumir valores.
4. Conferir alertas de falha de snapshot e responsáveis por recebê-los.
5. Revisar Network Access, Database Access e privilégio mínimo do usuário da aplicação.

## Teste de restauração isolado

- [ ] Definir RPO e RTO com o responsável operacional; são decisões humanas.
- [ ] Criar destino temporário e isolado, nunca sobrescrever produção.
- [ ] Selecionar um snapshot conhecido e restaurar segundo o fluxo oficial do Atlas.
- [ ] Usar credenciais separadas e bloquear acesso público desnecessário.
- [ ] Validar contagens e relacionamentos de companies, schools, users, subscriptions, billingEvents e pointEvents.
- [ ] Confirmar que a aplicação de teste inicia sem executar cobrança, e-mail ou webhook real.
- [ ] Documentar duração, snapshot, resultado, falhas e responsável.
- [ ] Remover o ambiente temporário de forma controlada após aprovação.

Rollback de aplicação não restaura dados. Billing events e pagamentos nunca devem ser apagados para “voltar” estado.
