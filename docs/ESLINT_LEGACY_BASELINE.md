# ESLint baseline legado

Data: 22 de outubro de 2026.

Após a adoção do ESLint 9 com a configuração recomendada do Next.js 16.4.2, o primeiro lint global identificou 51 erros e 28 warnings preexistentes, desconsiderando o único erro introduzido pela Etapa 5.

## Principais regras com erros

- `@typescript-eslint/no-explicit-any`: uso legado de `any` em rotas e páginas.
- `react-hooks/set-state-in-effect`: carregamentos e sincronizações disparados diretamente em efeitos.
- `react-hooks/immutability`: mutações detectadas em componentes existentes.
- `react-hooks/static-components`: componentes criados durante renderização.
- `react/no-unescaped-entities`: entidades não escapadas em conteúdo JSX.
- `@next/next/no-assign-module-variable`: variável chamada `module` em teste legado.

## Principais arquivos e áreas

- Rotas em `src/app/api/admins`, `categories`, `classes`, `educators`, `schools` e `weekly`.
- Páginas de categorias, dashboard, histórico, pontos, loja, perfil, ranking e escolas.
- Páginas empresariais preexistentes em `src/app/company`, incluindo billing e onboarding.
- `tests/sandbox-subscription-creation-gate.test.mjs`.

## Recomendação

Corrigir gradualmente por regra e área funcional, com testes direcionados para cada lote. Não reduzir severidades, criar exclusões artificiais ou aplicar desativações globais. Reexecutar o lint global após cada lote para atualizar este baseline.
