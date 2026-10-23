# Retenção, exclusão e anonimização — SUPERPONTOS

## Status interno

Conteúdo preparado para operação do SUPERPONTOS. Recomendada revisão jurídica profissional antes da primeira contratação paga, especialmente quanto a crianças e adolescentes, relação controlador/operador, retenção e cláusulas de responsabilidade.

Esta política técnica não define prazo legal universal e não autoriza destruição em produção.

## Ciclo inicial

1. Dados operacionais ativos permanecem disponíveis enquanto necessários ao serviço.
2. O encerramento pode iniciar um período operacional para exportação, suporte e validação de pendências.
3. Depois da análise, dados sem fundamento de retenção devem ser excluídos ou anonimizados.
4. Registros necessários a obrigação legal, segurança, auditoria ou exercício regular de direitos permanecem restritos pelo período justificável.
5. Dados removidos dos sistemas ativos podem permanecer temporariamente em backups protegidos até a rotação correspondente.

## Categorias

- Dados operacionais ativos: empresa, unidades, usuários, turmas, categorias, pontos e recursos contratados.
- Dados após encerramento: ficam bloqueados para novas operações enquanto exportação, suporte e solicitações são tratados.
- Registros legais/financeiros: aceites, solicitações, assinaturas e eventos financeiros exigem avaliação antes de eliminação.
- Logs técnicos: devem ter acesso restrito e retenção proporcional à segurança e investigação.
- Backups: seguem rotação própria; não há apagamento seletivo nesta etapa.

## Exclusão empresarial

Uma solicitação do tipo `deletion` apenas abre o workflow: solicitação, validação, análise, confirmação administrativa, futura execução controlada e registro da conclusão. Não existe execução automática.

`src/lib/privacy-deletion.ts` mantém o inventário inicial. O plano é obrigatoriamente `DRY_RUN`, retorna `executionAllowed: false` e não contém operações de escrita ou exclusão.

## Alunos

O DELETE operacional de aluno foi convertido em arquivamento: a conta fica inativa, as sessões são encerradas e referências históricas são preservadas. Uma futura anonimização das referências dependerá de inventário, fixtures, validação jurídica e autorização específica.

## Exportação

A exportação atual é empresarial e inclui empresa, unidades, usuários, assinatura e solicitações. Ela exclui credenciais. Turmas, eventos de pontos, indicações, produtos, resgates e outros vínculos permanecem como gap documentado; a ampliação deve ocorrer somente após definir projeções e relações tenant-safe para cada coleção.
