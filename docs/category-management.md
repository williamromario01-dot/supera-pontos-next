# Gestão de categorias e frequência

## Diagnóstico confirmado no repositório

As categorias com os cinco IDs do cadastro migrado eram associadas à unidade Jardim das Américas por `category-scope.ts`, mas `canManageCategory` as bloqueava incondicionalmente na API e na interface. Categorias sem `schoolId` também eram recusadas pelo teste de propriedade baseado apenas no campo persistido. Essa combinação permitia listar registros legados e impedia gerenciá-los.

A consulta somente de leitura confirmou DoaCao com ID `6ace5b1954b8a80fa371c4f4`, `categoryType: extra` e `schoolId: 6ab7dd70428f96c0cae8f35c`. Existem 21 referências em `pointEvents` e nenhuma em `attendanceSessions`. Ela não é um dos cinco IDs bloqueados por legado: sua exclusão física é impedida corretamente pelo histórico de pontuação. O fluxo anterior oferecia apenas a recusa, sem botão de arquivamento. A correção disponibiliza arquivamento, preservando seus 21 registros. Não foi executada a requisição original do usuário nem qualquer mutação em produção.

O texto “Antiga • tipo não identificado” era um fallback da interface para qualquer valor diferente de `categoryType: official/extra`. Agora a leitura aceita também `type` quando contém um desses valores explícitos; sem classificação confiável, mostra “Classificação original não informada”. Não se infere tipo pelo nome ou pela data.

## Propriedade e personalização

O `schoolId` persistido continua tendo precedência. A lista dos cinco IDs concede escopo de leitura na unidade migrada somente quando não há escola persistida; não constitui autorização para reatribuir propriedade nem comprovação de uso exclusivo.

Para esses registros sem propriedade exclusiva comprovada, editar cria ou atualiza uma personalização em `categoryOverrides`, com `_id` determinístico `schoolId:categoryId`. O original não é alterado; o ID apresentado e usado nos históricos permanece o original. Excluir o original compartilhado é proibido; arquivar afeta apenas a unidade. Categorias sem vínculo conhecido não são disponibilizadas automaticamente. Categorias com escola persistida podem ser gerenciadas somente no escopo autorizado.

## Frequência

`schools.attendanceCategoryId` é a seleção canônica única. Ausência do campo mantém compatibilidade de leitura com `attendanceSchoolKey`; `null` significa desmarcação explícita. A primeira alteração preserva a seleção anterior mesmo quando um cliente antigo envia apenas o nome.

Criação e edição aceitam `isAttendance`. A interface sempre apresenta o checkbox e a categoria atual. Substituição exige confirmação e envia `expectedAttendanceCategoryId`; se outra requisição mudar a seleção, a API responde 409. A troca atualiza a referência e desmarca a anterior na mesma transação. Categorias compartilhadas usam personalização local.

As chamadas novas gravam o ID e nome da categoria vigente. Correções mantêm a identificação original. Trocar a seleção não modifica chamadas existentes, saldos, `pointEvents` ou relatórios fechados e não gera pontos.

## Exclusão, arquivamento e concorrência

Exclusão física só é permitida para categoria própria fora da configuração ativa de frequência e sem referências protegidas. A verificação contempla IDs em ObjectId e string, incluindo pontos, chamadas, resgates, metas e métricas de relatórios. Falhas não são convertidas em sucesso. Registro que já representou frequência, mas não possui dependências, pode ser excluído após desmarcação.

Arquivar usa PATCH com `active: false`. A interface confirma a operação e, se necessário, a desmarcação atômica da frequência. A categoria desaparece das listas operacionais; consultas históricas continuam acessando seus registros. GET `/api/categories?includeArchived=true` permite consultar também arquivadas no escopo autorizado.

Mutações de categorias, novos pontos, novas chamadas, metas semanais e fechamento de relatórios escrevem a revisão da mesma escola dentro de transações MongoDB. Isso estabelece conflito de escrita entre exclusão e criação de referências. Edições da interface também enviam `expectedVersion`, rejeitando versões antigas. Um índice parcial único impede colisões entre nomes canônicos de categorias próprias gerenciadas, sem reescrever registros legados. Personalizações usam ID determinístico e verificação de nomes sob o bloqueio da unidade.

Não há migração destrutiva. Transações exigem um replica set ou cluster MongoDB compatível, como o já utilizado pelo lançamento de pontos. Os testes automatizados usam fixtures isoladas, com serialização e rollback simulados; não substituem um ensaio de concorrência em MongoDB real. Em produção foram executadas apenas consultas de leitura para diagnóstico, sem alteração de dados.

## Arquivos e APIs

- `src/app/categories/page.tsx`: formulário, confirmação, mensagens, personalização e arquivamento.
- `src/app/api/categories/route.ts`: GET e POST de categorias no escopo da unidade.
- `src/app/api/categories/[id]/route.ts`: PATCH e DELETE, com transações e diagnósticos.
- `src/lib/category-management.ts`: personalização, seleção canônica, concorrência e dependências.
- `src/lib/category-scope.ts`: precedência da propriedade persistida sobre o escopo legado.
- `src/app/api/classes/[id]/attendance/route.ts`: captura da categoria vigente ao registrar chamada.
- `src/app/api/points/route.ts`: bloqueio transacional e revalidação antes de novos pontos.
- `src/app/api/weekly-goals/route.ts`: proteção concorrente das referências em metas.
- `src/app/api/rankings/route.ts` e `src/app/api/weekly/route.ts`: respeito ao arquivamento e às personalizações locais.
- `src/lib/weekly-management-report.ts`: referências protegidas no fechamento, preservando snapshots existentes.
- `tests/attendance-category.test.mjs`, `tests/class-attendance.test.mjs`, `tests/category-school-scoping.test.mjs` e `tests/weekly-management-report.test.mjs`: cobertura de comportamento e contratos atualizados.
- `tests/legacy-school-weekly-report.test.mjs`: fechamento da unidade migrada com sessão transacional, mantendo a integridade dos dados e dos snapshots.

## Validação

- Testes direcionados: 88 aprovados.
- Suíte completa (`npm test`): 559 aprovados, sem falhas.
- TypeScript (`tsc --noEmit`): aprovado.
- ESLint (`npm run lint`): aprovado, sem erros; 15 avisos em arquivos não alterados.
- `git diff --check`: aprovado.
- Os testes cobrem os 18 cenários solicitados, além de lançamento de pontos concorrente com exclusão, edição com versão desatualizada e compatibilidade da seleção antiga.
