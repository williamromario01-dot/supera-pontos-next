# Isenção: ciclo de vida e operação

Esta alteração é local. Não concede isenção, não executa migração e não altera o Asaas ou o MongoDB de produção durante desenvolvimento/testes.

## Contrato

- Apenas `super_admin` concede, altera, reconcilia ou encerra isenções.
- Modalidades: período inclusivo, 1/2/3/6/12 meses, indefinida. Datas seguem UTC e o cálculo de meses já existente.
- Preço permanece teórico. Isenção ativa tem cobrança efetiva zero e prioridade sobre inadimplência no controle de acesso.
- A assinatura é suspensa com `INACTIVE`; nunca excluída pelo fluxo de isenção. O customer e o histórico permanecem.
- Vínculos de ambiente diferente, ambíguos ou de outra empresa impedem qualquer chamada ao provedor. Não há fallback de credenciais.

## Estados

`scheduled` aguarda início; `suspending` identifica intenção em execução; `pending_provider_action` exige revisão/retry; `active` significa suspensão verificada e capacidade liberada; `resume_pending` identifica retomada incompleta; `ended` conclui o ciclo.

Uma isenção agendada não é considerada ativa apenas pela data: precisa concluir a suspensão. Uma isenção verificada que expirou conserva acesso operacional durante a reconciliação de retomada, exibindo estado explícito de pendência. Isso evita bloquear a empresa por indisponibilidade financeira externa. Não representa perdão de dívidas preservadas.

## Ativação

1. Validar empresa, assinatura local, modalidade e confirmação explícita.
2. Registrar intenção com atualização condicional e lease; recusar operações financeiras concorrentes.
3. Registrar auditoria. Validar o vínculo pelo ambiente configurado, empresa e assinatura interna.
4. Validar assinatura remota: customer, ID e externalReference, ciclo mensal.
5. Suspender recorrência e reler até confirmar `INACTIVE`.
6. Enumerar todas as páginas de cobranças da assinatura. Validar escopo de cada cobrança.
7. Aplicar a decisão financeira registrada, verificando cada remoção.
8. Confirmar novamente a suspensão. Em transação MongoDB, ativar isenção/empresa/assinatura, liberar capacidade e registrar conclusão.

Sem assinatura remota, ativação é local; exige assinatura local existente. Uma cobrança órfã impede ativação automática. Não se cria customer nem assinatura no fluxo de isenção.

## Cobranças existentes

- `preserve`: manter obrigações existentes, inclusive pendentes/vencidas. Nunca simulá-las como pagas.
- `forgive_selected`: remover exclusivamente IDs escolhidos e confirmados pelo super_admin. Reler antes de remover; aceitar apenas `PENDING`/`OVERDUE`, validar customer/assinatura e verificar `deleted` depois.
- Pagamentos recebidos/confirmados nunca são removidos pelo fluxo.
- Ausência de decisão diante de cobranças não pagas deixa a operação pendente. Suspensão já confirmada pode permanecer; o administrador deve reconciliar.
- Auditoria registra intenção e confirmação por cobrança. Nenhum payload bruto do provedor ou erro contendo segredo é armazenado.

## Capacidade

`requestedMaxUnits` representa quantidade contratada solicitada; `maxUnits` é capacidade liberada; `unitCount` é ocupação e não pode ser fabricada pela isenção.

Ativação libera o maior entre quantidade solicitada, capacidade já autorizada e unidades ativas realmente vinculadas, respeitando os limites de planos. Recalcula o preço teórico oficial. Não migra unidades nem altera `unitCount`.

## Encerramento e retomada

Encerramento manual e expiração usam a mesma saga. Persistir `resume_pending` e data antes de chamar o provedor. Reativar a mesma assinatura, com preço vigente e `updatePendingPayments: false`. Não criar nova assinatura ou cobrar meses isentos.

`nextDueDate` reutiliza `nextReactivationDueDate`: dia seguinte em UTC ao processamento da retomada. Se uma tentativa antiga não ocorreu e o provedor permanece inativo, avançar para o dia seguinte atual. Se o provedor já gerou a primeira cobrança e avançou o calendário, reconhecer a cobrança correspondente antes de concluir, sem repetir PUT com vencimento antigo. Divergência deixa revisão pendente.

Cancelar uma isenção futura que nunca iniciou preserva o calendário e estado financeiro anterior. Sem assinatura remota, o encerramento prepara `pending`/`pending_payment` para o checkout normal, sem criar cobrança escondida.

## Reconciliação e proteções

- Checkout, customer, subscription, reactivation e cancellation recusam isenção não encerrada. Os filtros de aquisição de locks financeiros também recusam os estados protegidos.
- Alteração de quantidade durante isenção ativa continua local; estados intermediários não podem iniciar atualização financeira.
- Webhooks de pagamentos existentes registram resultado real sem sobrescrever capacidade/status protegido da saga.
- Eventos oficiais novos: `PAYMENT_DELETED`, `SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_INACTIVATED`, `SUBSCRIPTION_DELETED`. São observações autenticadas e deduplicadas por ambiente/evento; marcam reconciliação, não concedem isenção nem perdoam dívida.
- `GET/PATCH/POST/DELETE src/app/api/admin/companies/[id]/billing-exemption/route.ts`: inspeção, concessão/alteração, reconciliação (`action: reconcile`, `confirm: true`) e encerramento.
- `GET/POST src/app/api/cron/billing-exemptions/route.ts`: exige `CRON_SECRET`; processa até 20 registros por execução. O agendamento externo precisa ser configurado na implantação; não foi configurado/publicado nesta tarefa.
- Resumo financeiro e acesso operacional também reconciliam início/expiração quando necessário. Não dependem exclusivamente do job para avaliar o acesso.

## Falhas e limites operacionais

Não existe transação distribuída MongoDB/Asaas. Auditoria e intenção persistentes permitem retomar uma operação remota confirmada mesmo quando a gravação final falhou. Lease e filtros condicionais impedem cliques concorrentes; retries verificam antes de repetir operações idempotentes.

Uma execução interrompida libera retry após expirar o lease (15 minutos). Agendamento futuro requer execução periódica para suspender no início mesmo sem acessos. Não há promessa de suspensão pontual se toda a infraestrutura de processamento estiver indisponível.

O Asaas não oferece neste fluxo uma comparação atômica entre status de cobrança lido e remoção; intervenção financeira concorrente no painel precisa ser evitada. Reativação externa inesperada marca reconciliação; a suspensão só pode ser reparada quando o reconciliador executar.

Homologar com mocks e, em etapa autorizada separada, com Sandbox. Produção depende de credenciais corretas e dos gates oficiais já existentes. Nenhuma credencial deve ser copiada para código ou relatório. Não houve homologação financeira real nesta tarefa.

## Fontes oficiais

- https://docs.asaas.com/reference/atualizar-assinatura-existente
- https://docs.asaas.com/reference/excluir-cobranca
- https://docs.asaas.com/docs/eventos-para-assinaturas
