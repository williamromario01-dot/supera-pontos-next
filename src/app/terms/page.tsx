import Link from "next/link";
import { LEGAL_DRAFT_NOTICE, TERMS_VERSION } from "@/lib/legal";

const sections = [
  ["Serviço", "O SUPERPONTOS é uma plataforma SaaS da GFarS Soluções Inteligentes para gestão de unidades, usuários, atividades pedagógicas, pontos e benefícios."],
  ["Conta e responsabilidades", "A empresa cliente deve manter dados corretos, controlar seus acessos e usar a plataforma de modo lícito. Credenciais são pessoais e não devem ser compartilhadas."],
  ["Assinatura e pagamento", "Planos, preços, vencimentos e meios de pagamento são apresentados no fluxo de contratação. A ativação depende da confirmação válida do provedor de pagamento."],
  ["Cancelamento", "Cancelamento, reativação e alteração de capacidade seguem as condições apresentadas no painel financeiro, sem ativação manual que contorne a cobrança."],
  ["Uso aceitável", "É proibido abusar do serviço, violar direitos, tentar acessar outro tenant, introduzir código malicioso ou usar a plataforma para finalidade ilegal."],
  ["Propriedade intelectual", "A plataforma, marca e materiais próprios permanecem protegidos. Dados inseridos pela empresa cliente continuam sujeitos aos direitos e responsabilidades aplicáveis."],
  ["Disponibilidade", "A GFarS buscará manter o serviço disponível, mas manutenções, incidentes e dependências externas podem causar indisponibilidade temporária."],
  ["Responsabilidade", "Os limites de responsabilidade e garantias dependem de validação jurídica e do contrato comercial aplicável."],
  ["Encerramento e alterações", "Contas podem ser encerradas conforme o contrato e a legislação. Mudanças relevantes destes termos devem ser comunicadas e versionadas."],
  ["Contato", "Canal jurídico e dados societários: [CONFIGURAÇÃO/VALIDAÇÃO JURÍDICA NECESSÁRIA]."],
];

export default function TermsPage() {
  return <main className="min-h-screen bg-slate-50 px-4 py-10"><article className="mx-auto max-w-3xl rounded-3xl border bg-white p-6 shadow-sm sm:p-10">
    <Link href="/" className="font-bold text-orange-700">← SUPERPONTOS</Link><p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-900">{LEGAL_DRAFT_NOTICE}</p>
    <h1 className="mt-6 text-3xl font-black">Termos de Uso</h1><p className="mt-2 text-sm text-slate-500">Versão {TERMS_VERSION}</p>
    <div className="mt-8 space-y-7">{sections.map(([title, body]) => <section key={title}><h2 className="text-lg font-bold">{title}</h2><p className="mt-2 leading-7 text-slate-700">{body}</p></section>)}</div>
  </article></main>;
}
