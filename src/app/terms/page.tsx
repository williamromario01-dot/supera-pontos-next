import Link from "next/link";
import { TERMS_VERSION } from "@/lib/legal";

const sections = [
  ["1. Do SUPERPONTOS", "O SUPERPONTOS é oferecido por 53.296.767 WILLIAM ROMARIO SOUZA FARIAS, CNPJ 53.296.767/0001-76, sob a marca GFarS Soluções Inteligentes, em São José dos Pinhais/PR. É uma plataforma de software como serviço para gestão de unidades, usuários, atividades pedagógicas, pontuação, rankings, indicações, produtos e benefícios relacionados às atividades da CONTRATANTE."],
  ["2. Da CONTRATANTE", "CONTRATANTE é a pessoa jurídica ou organização que contrata ou utiliza o SUPERPONTOS, administra suas unidades e autoriza representantes e usuários a operar a plataforma."],
  ["3. Responsabilidades da CONTRATANTE", "A CONTRATANTE deve manter seus dados corretos, controlar acessos, definir finalidades legítimas, observar as bases legais aplicáveis e inserir somente dados adequados e necessários. Também responde pelas instruções que fornece à GFARS e pelas decisões sobre os dados cadastrados por ela."],
  ["4. Dados de alunos", "A CONTRATANTE decide quais alunos serão cadastrados e deve assegurar a legitimidade da coleta e do uso. O cadastro padrão deve limitar-se aos dados necessários às funcionalidades, sem inclusão desnecessária de documentos ou dados sensíveis."],
  ["5. Crianças e adolescentes", "Quando houver dados de crianças ou adolescentes, a CONTRATANTE é responsável pelas decisões que lhe competem sobre a identificação da base legal adequada, a legitimidade do cadastro, a observância do melhor interesse, as informações ou comunicações aos responsáveis quando aplicáveis, a obtenção e conservação de eventual autorização ou consentimento quando juridicamente exigido e a minimização dos dados inseridos. Isso não significa que o consentimento dos pais ou responsáveis seja sempre obrigatório. O SUPERPONTOS não exige a coleta adicional de idade ou documentos para essas finalidades e não tenta inferir automaticamente a idade do aluno."],
  ["6. Papéis no tratamento de dados", "Em regra, a CONTRATANTE atua como controladora dos dados pessoais que decide inserir no SUPERPONTOS, especialmente de alunos, educadores e usuários. A GFARS atua, em regra, como operadora quando trata esses dados em nome da CONTRATANTE e segundo suas instruções legítimas, sem prejuízo das obrigações legais próprias da GFARS relacionadas ao tratamento realizado por ela."],
  ["7. Segurança e confidencialidade", "A GFARS adota medidas técnicas e administrativas proporcionais para proteger os dados contra acessos não autorizados, perda, alteração ou tratamento inadequado. A CONTRATANTE deve gerenciar permissões e comunicar suspeitas de comprometimento."],
  ["8. Exclusão e anonimização", "Pedidos de exclusão ou anonimização serão validados e analisados antes da execução. A eliminação poderá ser substituída por anonimização ou limitada quando houver fundamento legítimo para retenção, obrigação legal ou necessidade de exercício regular de direitos."],
  ["9. Encerramento e retenção", "O encerramento não implica apagamento imediato de todos os dados. Poderá existir período operacional para exportação, seguido de exclusão ou anonimização, preservando-se apenas o que tiver fundamento legítimo. Backups seguem seus ciclos de rotação."],
  ["10. Solicitações de privacidade", "Solicitações de acesso, correção, exportação ou exclusão podem ser feitas pelo fluxo do administrador empresarial ou pelo e-mail gfars.solucoes@gmail.com. A identidade e a legitimidade do solicitante poderão ser verificadas."],
  ["11. Contas e credenciais", "Credenciais são pessoais e não devem ser compartilhadas. Cada usuário deve proteger sua senha e a CONTRATANTE deve revogar acessos que deixem de ser necessários."],
  ["12. Planos, preços e cobrança", "Planos, capacidade, preços, vencimentos e meios de pagamento são apresentados no fluxo comercial e financeiro. A ativação e a continuidade podem depender da confirmação do provedor de pagamentos."],
  ["13. Inadimplência, suspensão e cancelamento", "A inadimplência pode gerar período de regularização, suspensão de operações ou cancelamento conforme as condições apresentadas no painel. A suspensão não autoriza eliminação imediata e indiscriminada de dados."],
  ["14. Disponibilidade", "A GFARS busca manter o serviço disponível, mas manutenções, incidentes e dependências externas podem causar indisponibilidade temporária. Eventos relevantes serão tratados de modo proporcional à sua natureza."],
  ["15. Prestadores de serviços", "A GFARS pode utilizar prestadores de infraestrutura, e-mail, armazenamento, suporte e pagamentos, limitando o tratamento ao necessário para suas funções e adotando salvaguardas compatíveis."],
  ["16. Propriedade intelectual", "A plataforma, marca, código e materiais próprios permanecem protegidos. O uso do serviço não transfere direitos de propriedade intelectual. Os dados inseridos continuam sujeitos aos direitos e responsabilidades aplicáveis."],
  ["17. Uso indevido", "É proibido violar direitos, acessar dados de outra empresa, contornar controles, introduzir código malicioso, sobrecarregar deliberadamente o serviço ou utilizá-lo para finalidade ilícita."],
  ["18. Responsabilidades", "Cada parte responde pelos atos e decisões sob sua esfera de controle, observados a legislação, o contrato e as circunstâncias concretas. Estes Termos não excluem responsabilidades que não possam ser afastadas por lei."],
  ["19. Alterações dos Termos", "Alterações relevantes serão versionadas. Quando necessário, o administrador empresarial será informado ou solicitado a realizar novo aceite antes de continuar atos sujeitos à nova versão."],
  ["20. Aceite eletrônico", "O aceite eletrônico registra as versões vigentes, data e identificação disponível do representante. O representante declara possuir poderes adequados para aceitar estes Termos em nome da CONTRATANTE."],
  ["21. Política de Privacidade", "A Política de Privacidade integra estas condições e detalha categorias de dados, finalidades, compartilhamentos, retenção e exercício de direitos."],
  ["22. Identificação e contato", "SUPERPONTOS — GFarS Soluções Inteligentes — 53.296.767 WILLIAM ROMARIO SOUZA FARIAS — CNPJ 53.296.767/0001-76 — São José dos Pinhais/PR. E-mail: gfars.solucoes@gmail.com."],
  ["23. Legislação aplicável", "Estes Termos são regidos pela legislação brasileira, inclusive normas de proteção de dados, relações contratuais e direitos aplicáveis à natureza da contratação."],
  ["24. Disposições finais", "A eventual invalidade de uma disposição não invalida as demais. A tolerância a um descumprimento não representa renúncia de direito. Condições comerciais específicas podem complementar estes Termos sem afastar direitos obrigatórios."],
] as const;

export default function TermsPage() {
  return <main className="bg-slate-50 px-4 py-10"><article className="mx-auto max-w-4xl rounded-3xl border bg-white p-6 shadow-sm sm:p-10">
    <Link href="/" className="font-bold text-orange-700">← SUPERPONTOS</Link>
    <h1 className="mt-6 text-3xl font-black">TERMOS DE USO DO SUPERPONTOS</h1>
    <p className="mt-2 text-sm text-slate-500">Versão {TERMS_VERSION}</p>
    <div className="mt-8 space-y-7">{sections.map(([title, body]) => <section key={title}><h2 className="text-lg font-bold">{title}</h2><p className="mt-2 leading-7 text-slate-700">{body}</p></section>)}</div>
  </article></main>;
}
