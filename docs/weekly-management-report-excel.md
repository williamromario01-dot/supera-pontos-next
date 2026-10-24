# Exportação Excel do Relatório Semanal de Gestão

## Fonte dos dados

O arquivo é gerado sob demanda exclusivamente a partir de documentos `CLOSED` da collection `weeklyReports`. O gerador não recebe conexão com banco e não consulta usuários, turmas, categorias, eventos de pontos, indicações, resgates ou estoque operacionais.

O relatório principal usa o snapshot solicitado. A comparação, quando disponível, usa somente outro snapshot `CLOSED` da mesma escola cujo `weekStart` seja exatamente sete dias anterior. A ausência desse documento é apresentada como falta de base comparável.

## Download e segurança

Endpoint: `GET /api/management-reports/[id]/excel`.

- usuário não autenticado: `401`;
- `admin`: somente a escola vinculada à autenticação;
- `super_admin`: exige `schoolId` explícito e válido;
- `company_admin`, `educator` e `student`: `403`;
- snapshot inexistente ou de outra escola: `404`;
- snapshot incompatível: `422`.

As buscas combinam `_id`, `schoolId` autorizado e `status: "CLOSED"`. O `schoolId` enviado pelo browser nunca substitui a escola autenticada de um administrador. A resposta usa cache privado com `no-store`.

## Versões

O despacho é explícito por `reportVersion`. A versão suportada atualmente é a `1`. Uma versão desconhecida é rejeitada e não gera um arquivo potencialmente incorreto. Novas versões devem adicionar um gerador e validações próprios antes de serem aceitas.

## Abas

1. **Resumo Executivo** — identificação, indicadores consolidados, comparação semanal, evolução e pontos de atenção.
2. **Alunos** — nome e turmas históricos, desempenho, evolução, atingimento e cobertura pedagógica.
3. **Aluno x Categoria** — estrutura normalizada com meta, realizado, desempenhos, variação, evolução e atingimento.
4. **Categorias** — indicadores dinâmicos por categoria.
5. **Educadores** — acompanhamento alfabético e não competitivo.
6. **Turmas** — indicadores por turma e educador histórico.
7. **Indicações** — totais agregados por status e comparecimento do indicado.
8. **Resgates** — totais e itens históricos disponíveis.
9. **Estoque** — posição observada no fechamento e produtos sem estoque.
10. **Frequência** — indisponibilidade explícita.
11. **Vendas** — indisponibilidade explícita.

As abas tabulares possuem filtros, cabeçalho congelado, tipos numéricos preservados e formatação brasileira de datas e percentuais.

## Limitações do snapshot v1

O snapshot não armazena:

- pontos atribuídos, resgates ou saldo individual por aluno;
- pontos atribuídos por turma;
- detalhamento nominal das indicações;
- nome histórico do aluno associado a cada resgate;
- quantidade por item resgatado;
- estoque mínimo ou classificação confiável de estoque baixo;
- movimentação histórica de estoque;
- frequência escolar;
- vendas concluídas.

Esses dados não são reconstruídos a partir do estado atual. Colunas sem base histórica foram omitidas, e indicadores oficialmente indisponíveis recebem mensagens explícitas em vez de zero.

## Testes

Os testes usam fixtures em memória e reabrem o XLSX gerado para validar assinatura, abas, nomes históricos, categorias personalizadas, datas, percentuais numéricos, mensagens de indisponibilidade, comparação, filename e imutabilidade do objeto de origem. Nenhum teste insere snapshots no MongoDB.
