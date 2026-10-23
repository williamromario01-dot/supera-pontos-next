# Relatório Semanal de Gestão — metodologia v1

## Fechamento e período

O relatório usa `America/Sao_Paulo`. O fechamento elegível ocorre na segunda-feira às 13:00 e representa a semana anterior, de segunda-feira 00:00 até a segunda-feira seguinte 00:00 (limite exclusivo). `weekStart` e `weekEnd` são datas civis `YYYY-MM-DD`; `periodStartAt` e `nextWeekStartAt` preservam os limites UTC usados nas consultas.

O endpoint interno `GET /api/cron/weekly-management-reports` exige `Authorization: Bearer <WEEKLY_REPORT_CRON_SECRET>`. Não há agendamento no `vercel.json`; um scheduler HTTPS externo pode acioná-lo. Se a execução de segunda falhar, uma chamada posterior fecha a mesma semana elegível e registra `generatedBy: "recovery"`. Uma execução na segunda após 13:00 usa `generatedBy: "automatic"`. Depois do primeiro snapshot, o processo detecta lacunas desde o último fechamento e recupera até 12 semanas por execução; no primeiro uso, fecha somente a semana elegível mais recente, evitando criar retroativamente snapshots anteriores à implantação.

## Evolução e atingimento

Para cada aluno e categoria aplicável:

`performancePercentage = realizado / weeklyGoal * 100`

O índice não é limitado a 100%; valores superiores preservam o atingimento adicional. Apenas o indicador analítico é limitado a 200%, sem alterar pontos ou qualquer dado operacional.

A diferença entre a semana analisada e a anterior é medida em pontos percentuais:

- `>= +10`: `EVOLVED`;
- `> -10` e `< +10`: `MAINTAINED`;
- `<= -10`: `DECLINED`;
- sem duas bases aplicáveis: `INSUFFICIENT_DATA`.

Zero real é desempenho de 0%. Ausência de meta aplicável ou de base histórica não é convertida em zero. Aluno novo e categoria nova ficam com `INSUFFICIENT_DATA` até existir comparação.

`goalReached` (`performancePercentage >= 100`) é armazenado separadamente de `evolutionStatus`. A evolução geral do aluno é a diferença entre as médias das mesmas categorias comparáveis nas duas semanas; cada categoria tem peso igual, independentemente da quantidade de lançamentos.

## Snapshot, imutabilidade e isolamento

A collection `weeklyReports` recebe um documento `CLOSED` com `reportVersion: 1`. O `_id` determinístico tem o formato `schoolId:weekStart`; a unicidade nativa de `_id` protege contra concorrência e garante um relatório por escola/semana sem migration ou índice manual. O código usa somente `insertOne`: consultas normais nunca recalculam nem sobrescrevem snapshots fechados.

O snapshot contém nomes históricos de escola, empresa, alunos, categorias, turmas, educadores e produtos necessários para apresentação futura. A API nunca reconstrói um relatório fechado a partir do estado atual.

Rotas de consulta:

- `GET /api/management-reports`: lista metadados, mais recentes primeiro;
- `GET /api/management-reports/[id]`: retorna o snapshot fechado.

`admin` acessa somente a própria escola. `super_admin` precisa informar `schoolId` explicitamente. `company_admin`, `educator` e `student` não recebem acesso nesta versão. Todas as consultas incluem `schoolId`; não há consolidado empresarial.

## Indicadores suportados

- alunos e educadores ativos e turmas ativas no fechamento;
- pontos pedagógicos positivos por categoria e quantidade de registros;
- desempenho, atingimento e evolução por aluno e categoria;
- população ativa e população comparável separadas;
- cobertura pedagógica: aluno com pelo menos um `pointEvent` da semana cujo `categoryId` é válido;
- métricas de educador e turma, sem ranking por volume de pontos;
- resgates e pontos gastos em `pointStoreRedemptions`;
- indicações criadas na semana, agrupadas pelos status reais e `attendanceStatus`;
- estoque final observado em `pointStoreProducts` e `productsSupera`, incluindo produtos zerados.

## Limitações atuais dos dados

- Metas numéricas não possuem histórico próprio: a v1 preserva no snapshot o `categories.weeklyGoal` existente no fechamento e o usa nas duas semanas comparadas. Alterações anteriores ao primeiro fechamento não podem ser reconstruídas.
- O estado ativo/inativo de usuários, turmas e categorias também não possui histórico temporal completo.
- O fluxo de Produtos Supera abre contato no WhatsApp, mas não persiste venda concluída. `salesMetrics.available` é `false`.
- Não existe ledger confiável para entradas e ajustes de estoque. O snapshot guarda o estoque observado no fechamento; estoque inicial, entradas, movimentação e limite de estoque baixo ficam indisponíveis.
- Não existe frequência escolar. A presença em indicações significa comparecimento do indicado, não frequência do aluno. `attendanceMetrics.available` é `false`, e ausência de pontos nunca é interpretada como falta.
- Status de indicação representa o estado observado no fechamento; não há reconstrução retroativa além do que o documento já preserva.

Esta etapa não gera Excel, relatório mensal, comparação entre unidades ou dashboard analítico avançado.
