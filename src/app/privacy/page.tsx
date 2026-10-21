import Link from "next/link";
import { LEGAL_DRAFT_NOTICE, PRIVACY_VERSION } from "@/lib/legal";

export default function PrivacyPage() {
  return <main className="min-h-screen bg-slate-50 px-4 py-10"><article className="mx-auto max-w-3xl rounded-3xl border bg-white p-6 shadow-sm sm:p-10">
    <Link href="/" className="font-bold text-orange-700">← SUPERPONTOS</Link><p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-900">{LEGAL_DRAFT_NOTICE}</p>
    <h1 className="mt-6 text-3xl font-black">Aviso de Privacidade</h1><p className="mt-2 text-sm text-slate-500">Versão {PRIVACY_VERSION}</p>
    <div className="mt-8 space-y-7 leading-7 text-slate-700">
      <section><h2 className="text-lg font-bold text-slate-900">Dados tratados</h2><p>O sistema trata dados da empresa (inclusive CNPJ, responsável, e-mail e telefone), unidades, administradores, educadores, alunos, turmas, categorias, pontos, ranking, indicações, produtos, metadados de cobrança e registros técnicos necessários à segurança.</p></section>
      <section><h2 className="text-lg font-bold text-slate-900">Finalidades e acesso</h2><p>Os dados são usados para prestar, proteger e administrar o serviço. O acesso é limitado por função e empresa. Prestadores essenciais, como infraestrutura, e-mail e pagamentos, podem tratar somente os dados necessários à sua função.</p></section>
      <section><h2 className="text-lg font-bold text-slate-900">Alunos e menores</h2><p>A empresa cliente deve cadastrar apenas dados necessários dos alunos e avaliar, com orientação jurídica própria, a base legal e eventual autorização do responsável. O SUPERPONTOS não solicita dados sensíveis de alunos como requisito padrão.</p></section>
      <section><h2 className="text-lg font-bold text-slate-900">Direitos e solicitações</h2><p>O administrador empresarial pode solicitar acesso, correção, exportação ou exclusão pelo fluxo administrativo. Exclusão não é automática: dados financeiros, segurança e auditoria podem exigir retenção, conforme política ainda sujeita a validação jurídica.</p></section>
      <section><h2 className="text-lg font-bold text-slate-900">Retenção e segurança</h2><p>Senhas são armazenadas como hash; tokens possuem uso e prazo limitados. Prazos jurídicos definitivos de retenção dependem de política aprovada. <strong>LEGAL_RETENTION_POLICY_REQUIRED.</strong></p></section>
      <section><h2 className="text-lg font-bold text-slate-900">Contato</h2><p>Canal do encarregado e dados jurídicos: [CONFIGURAÇÃO/VALIDAÇÃO JURÍDICA NECESSÁRIA].</p></section>
    </div>
  </article></main>;
}
