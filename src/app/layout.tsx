import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import LegalFooter from '@/components/LegalFooter';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SUPERPONTOS | GFarS Soluções Inteligentes',
  description: 'Sistema de Pontuação e Gamificação SUPERPONTOS',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'SUPERPONTOS', statusBarStyle: 'default' },
};

export const viewport = { themeColor: '#f97316' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-slate-50 text-slate-900 min-h-screen`}>
        {children}
        <LegalFooter />
      </body>
    </html>
  );
}
