import Link from "next/link";

export default function LegalFooter() {
  return <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
    <p className="font-semibold text-slate-700">GFarS Soluções Inteligentes</p>
    <nav aria-label="Documentos jurídicos" className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-2">
      <Link href="/terms" className="hover:text-orange-700 hover:underline">Termos de Uso</Link>
      <Link href="/privacy" className="hover:text-orange-700 hover:underline">Política de Privacidade</Link>
    </nav>
  </footer>;
}
