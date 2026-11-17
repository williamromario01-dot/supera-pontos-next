# Pontuação semanal — Etapa 1

Esta etapa define somente contratos e cálculos puros. Ela não lê nem grava dados,
não altera rotas e não integra o cálculo ao saldo do aluno.

## Regras codificadas

- A semana de uma atividade é definida pelo instante de realização em
  `America/Sao_Paulo`: segunda-feira 00:00 (inclusivo) até a segunda seguinte
  00:00 (exclusivo).
- O fechamento é às 06:00 da segunda-feira seguinte, no mesmo fuso.
- O total acumulado da categoria é
  `ceil(quantidade aprovada * máximo / meta)`, limitado ao máximo.
- Cada evento futuro deverá aplicar apenas `novo total - total já creditado`.
  Correções podem, portanto, produzir diferenças negativas auditáveis.
- `WeeklyScoringConfigurationSnapshot` é o contrato da configuração que deverá
  ser copiada e congelada quando o primeiro registro da escola/categoria/semana
  for criado.
- Bônus de 100 pontos por livro ou meta especial não entram nestas funções.

## Casos-limite e decisões

- Quantidade zero vale zero ponto; qualquer fração positiva arredonda para cima.
- Quantidade acima da meta nunca ultrapassa o teto.
- Meta deve ser finita e maior que zero. Quantidades devem ser finitas e não
  negativas; teto e totais de pontos devem ser inteiros seguros e não negativos.
  Entradas inválidas geram `RangeError`.
- As quantidades aceitam números fracionários porque algumas categorias podem
  medir unidades não inteiras. O total calculado permanece inteiro.
- Aprovação atrasada não muda a semana: o chamador deve passar `activityAt`,
  nunca `approvedAt`, ao helper de calendário.
- O helper retorna datas civis (`weekStart`/`weekEnd`) e instantes UTC para evitar
  que consumidores futuros reconstruam fronteiras usando o fuso do servidor.

## Fora do escopo desta etapa

Persistência, idempotência, eventos de crédito/estorno, fechamento RGS, migração,
alteração de `users.points`, `pointEvents`, ranking, loja, resgates, relatórios e
interfaces de aluno/educador serão tratados somente em etapas autorizadas.
