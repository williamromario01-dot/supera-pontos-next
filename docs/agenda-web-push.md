# Web Push da Agenda

## Configuração

Defina na Vercel, separadamente por ambiente:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: chave pública VAPID em Base64 URL-safe.
- `VAPID_PRIVATE_KEY`: chave privada VAPID, somente no servidor.
- `VAPID_SUBJECT`: contato `mailto:` ou URL HTTPS controlada pela organização.
- `CRON_SECRET`: segredo aleatório forte (mínimo recomendado pela Vercel: 16 caracteres).

Gere o par VAPID fora do repositório com uma ferramenta confiável, por exemplo `npx web-push generate-vapid-keys`, após autorização operacional. Não grave a chave privada em arquivos versionados, logs ou variáveis `NEXT_PUBLIC_*`. Para rotacionar, gere um novo par, atualize as variáveis em conjunto e peça aos usuários que ativem novamente as notificações; subscriptions criadas com a chave anterior não podem ser reutilizadas com o novo par.

O processamento é feito por `GET /api/cron/planner-reminders`, protegido por `Authorization: Bearer <CRON_SECRET>`. Em projetos Vercel Hobby, o endpoint pode ser acionado por um scheduler HTTPS externo; `CRON_SECRET` continua obrigatório. O cron usa UTC, enquanto os horários da Agenda são convertidos explicitamente de `America/Sao_Paulo`.

## Dispositivos e teste

Em Android/Chrome e navegadores desktop compatíveis, abra a Agenda e toque em **Ativar notificações**. O prompt nunca é aberto automaticamente. Confirme a criação de um registro ativo em `pushSubscriptions`, crie um evento próximo com lembrete e acompanhe a execução do cron.

No iPhone/iPad (iOS/iPadOS 16.4 ou posterior), o site precisa ser adicionado à Tela de Início e aberto pelo ícone instalado antes de solicitar permissão. A interface orienta esse fluxo usando detecção de recursos e do modo standalone.

O repositório não contém logo oficial utilizável como ícone PWA. O manifest funciona sem inventar ou substituir a marca, mas a instalação fica sem ícones dedicados até que sejam fornecidos assets oficiais nos tamanhos recomendados (incluindo 192×192 e 512×512).

Push é complementar: sem suporte, sem permissão, sem VAPID ou com cron indisponível, a Agenda continua funcionando normalmente. Teste push real somente em HTTPS com chaves configuradas.
