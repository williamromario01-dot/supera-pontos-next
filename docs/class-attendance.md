# Alocação e frequência

A gestão de cada turma permite alocar, trocar e remover seu educador. Apenas admin da unidade e super_admin no contexto explícito da unidade podem alterar a alocação. A criação de turmas usa a mesma restrição. O responsável deve ser um educador ativo da mesma escola e, quando registrado, da mesma empresa. Ausência de educatorId permanece sem alocação.

## Categoria de frequência

`schools.attendanceCategoryId` identifica a categoria vigente sem depender do nome. A seleção é única por unidade e a substituição ocorre em uma transação, com confirmação da seleção anterior. O checkbox está disponível na criação e edição. Categorias legadas com escopo conhecido podem usar uma personalização da unidade, preservando o registro original. A leitura de `attendanceSchoolKey` permanece como compatibilidade até a primeira configuração local. Veja [Gestão de categorias](category-management.md).

Uma categoria que já foi configurada mantém a marca histórica `attendanceHistoryProtected`, mas a decisão de exclusão considera as dependências reais. A configuração ativa precisa ser removida ou substituída. Havendo chamadas, pontos ou outras referências, a exclusão física fica bloqueada e a categoria pode ser arquivada. Chamadas e exclusão disputam uma revisão transacional da escola, impedindo referências órfãs sob concorrência.

Os índices são criados pela aplicação na primeira operação autorizada correspondente. Nenhuma migração ou marcação automática de dados existentes foi adicionada.

## Sessões explícitas de chamada

`attendanceSessions` registra escola, empresa, turma, data civil em America/Sao_Paulo e identificação textual obrigatória da sessão (por exemplo, Aula 1 e Aula 2). O índice único `(schoolId, classId, date, session)` impede duplicidade. As datas devem existir e não podem ser futuras.

A sessão contém fotografia dos alunos esperados, nomes e presença booleana de cada aluno. A criação valida o conjunto exato de alunos ativos da turma e escola; correções mantêm o conjunto original. Não há inferência por pointEvents ou dias sem chamada. Nenhum saldo ou evento de pontos é escrito. A integração de pontuação depende de uma regra futura aprovada.

Admin e super_admin autorizado podem registrar e corrigir; educador pode fazê-lo somente nas turmas em que é responsável. Company_admin e student não recebem permissão operacional. Correções exigem motivo, versão atual e comparação atômica da versão; a auditoria registra autor, data e estados anterior e posterior. A interface permite consultar esse histórico.

## Relatórios

O fechamento/recovery oficial consulta chamadas pela escola e data civil do período e grava os totais e faltantes no snapshot semanal existente. Frequência é presenças / oportunidades × 100; sem chamadas, o percentual é null e a interface informa “Sem registros de frequência no período”. Nomes históricos, turma, sessão e datas das faltas aparecem na tela e no Excel.

Relatórios já fechados continuam imutáveis. Corrigir uma chamada de um período fechado mantém a auditoria da chamada e não modifica o relatório já publicado. Nenhum relatório é duplicado ou recalculado silenciosamente.

## Verificação

Os testes usam dados isolados e mocks das coleções. Incluem disputa concorrente pela categoria e sessão, permissões, composição histórica, correções com versão, cálculos e preservação dos relatórios e dos dados de pontos. A exclusividade de sessões usa índice único; a seleção de categoria usa a referência única da escola e transações, sem depender de consulta prévia isolada. A validação atual e o diagnóstico somente de leitura da DoaCao estão em [Gestão de categorias](category-management.md); os resultados abaixo registram a implementação anterior do módulo.

## Arquivos da implementação

APIs:

- `src/app/api/classes/route.ts`: criação com a mesma regra de alocação.
- `src/app/api/classes/[id]/route.ts`: alocação, troca e remoção.
- `src/app/api/classes/[id]/attendance/route.ts`: consulta, registro e correção auditada.
- `src/app/api/educators/route.ts`: consulta compatível com referências escolares em ObjectId/string.
- `src/app/api/categories/route.ts`: leitura e criação da configuração estrutural.
- `src/app/api/categories/[id]/route.ts`: exclusividade, troca, desativação e proteção de exclusão.

Interfaces:

- `src/app/categories/page.tsx`
- `src/app/dashboard/categories/page.tsx` (reutiliza a interface principal)
- `src/app/schools/[id]/page.tsx`
- `src/app/schools/[id]/classes/[classId]/page.tsx`
- `src/components/ClassEducatorAssignment.tsx`
- `src/components/ClassAttendance.tsx`
- `src/components/WeeklyManagementReportView.tsx`

Modelo e relatórios:

- `src/lib/attendance-core.ts`
- `src/lib/attendance-category.ts`
- `src/lib/weekly-management-report.ts`
- `src/lib/weekly-management-report-types.ts`
- `src/lib/weekly-management-report-excel.ts`

Testes:

- `tests/class-attendance.test.mjs`
- `tests/attendance-category.test.mjs`
- `tests/legacy-school-weekly-report.test.mjs`
- `tests/weekly-management-report.test.mjs`
- `tests/weekly-management-report-excel.test.mjs`

Não foram adicionadas dependências nem alterados arquivos de billing, Asaas ou isenção. Nenhuma escrita em users, pointEvents ou saldos foi adicionada. Não há migração automática de alocações ou categorias antigas.

## Resultado da validação local

- Testes direcionados: 47 aprovados, nenhuma falha.
- Suíte completa: 537 aprovados, nenhuma falha.
- TypeScript (`node node_modules/typescript/bin/tsc --noEmit`): aprovado.
- `git diff --check`: aprovado.
- Lint completo: aprovado com zero erros e 17 avisos preexistentes. Os 37 erros que bloqueavam a publicação foram corrigidos, assim como seis avisos de dependências de efeitos. Nenhuma regra foi desativada ou relaxada.

As correções de lint substituem `any` por tipos dos modelos, entradas `unknown` e tipos de respostas; mantêm os mesmos cálculos, consultas e permissões; aplicam resultados de HTTP nos callbacks das respostas; estabilizam dependências com `useCallback`; escapam aspas de JSX; usam `location.assign` para a mesma navegação externa; e renomeiam a variável local `module` do teste para `compiledModule`.

Inventário dos 37 erros de lint no início da conclusão:

| Arquivo | Erros | Regras |
| --- | ---: | --- |
| `src/app/api/admins/[id]/route.ts` | 2 | no-explicit-any |
| `src/app/api/categories/[id]/route.ts` | 2 | no-explicit-any |
| `src/app/api/classes/[id]/route.ts` | 1 | no-explicit-any |
| `src/app/api/educators/[id]/route.ts` | 2 | no-explicit-any |
| `src/app/api/educators/route.ts` | 1 | no-explicit-any |
| `src/app/api/schools/route.ts` | 2 | no-explicit-any |
| `src/app/api/weekly/route.ts` | 4 | no-explicit-any |
| `src/app/categories/page.tsx` | 3 | no-explicit-any, set-state-in-effect |
| `src/app/company/onboarding/page.tsx` | 1 | set-state-in-effect |
| `src/app/history/page.tsx` | 1 | immutability |
| `src/app/point-store/page.tsx` | 3 | no-explicit-any, set-state-in-effect, immutability |
| `src/app/points/page.tsx` | 3 | immutability, no-unescaped-entities |
| `src/app/profile/page.tsx` | 1 | immutability |
| `src/app/ranking/page.tsx` | 1 | set-state-in-effect |
| `src/app/schools/[id]/classes/[classId]/page.tsx` | 6 | no-explicit-any, set-state-in-effect |
| `src/app/schools/page.tsx` | 3 | no-explicit-any, set-state-in-effect |
| `tests/sandbox-subscription-creation-gate.test.mjs` | 1 | no-assign-module-variable |

O ponto de partida da publicação é `191f17e7ecf743a37e19ae872e079334e50cd3cc`. O stash preservado é `stash@{0}`, hash `7190544f895a8f6cb75d0dd3d9d04531867d785f`; não foi aplicado, removido nem alterado. Não houve acesso a dados de produção, migração, execução de scripts de dados nem deploy manual.
