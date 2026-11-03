import Link from "next/link";

/** Navigation only. The existing credential directory and API retain all authorization. */
export function StudentCredentialActions({ role, studentId }: { role?: string; studentId: string }) {
  if (!studentId || !role || !["super_admin", "company_admin", "admin", "educator"].includes(role)) return null;
  const target = encodeURIComponent(studentId);
  return <div className="flex flex-wrap justify-end gap-2">
    <Link href={`/users/credentials?userId=${target}&action=email`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Alterar e-mail</Link>
    <Link href={`/users/credentials?userId=${target}&action=password`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Redefinir senha</Link>
  </div>;
}
