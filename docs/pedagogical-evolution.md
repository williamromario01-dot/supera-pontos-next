# Evolução pedagógica

## Metodologia oficial

- Fonte: snapshots semanais fechados do RGS, sem alteração retroativa.
- Cumprimento individual: pontos pedagógicos válidos divididos pela meta vigente em cada período, limitado a 100% apenas para o indicador.
- Evolução: percentual atual menos percentual anterior, em pontos percentuais.
- Consolidação por educador e turma: proporção de oportunidades elegíveis de meta atingida, calculada a partir dos registros individuais comparáveis; não é média simples entre turmas.
- Estabilidade: variação maior que -10 e menor que +10 p.p. A regra está centralizada em `PEDAGOGICAL_STABILITY_MARGIN_PP`.
- Ausência de dados não é queda. Recém-matriculados e registros não comparáveis permanecem sem classificação comparativa.
- Bônus, recompensas e desenvolvimento pessoal dos colaboradores não participam dos cálculos.
- Nenhum cálculo altera pontos, saldo, ranking, meta ou histórico.

## Permissões e isolamento

Gestores autorizados podem consultar comparativos nominais no próprio escopo de empresa e escola. Educadores recebem somente seus alunos e não visualizam comparativos nominais de outros profissionais. Alunos não possuem acesso à API gerencial.

## Validação recuperável

O conjunto `tests/pedagogical-evolution.test.mjs` registra os 40 cenários funcionais e de segurança exigidos. A validação de publicação também inclui os testes de regressão do RGS, exportação Excel, relatórios legados e Desenvolvimento dos Colaboradores, além de TypeScript, ESLint e build de produção.
