import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import LegalFooter from '@/components/LegalFooter';
import PwaServiceWorkerRegistration from '@/components/PwaServiceWorkerRegistration';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SUPERPONTOS',
  description: 'Engajamento, evolução e gestão em uma única plataforma.',
  manifest: '/manifest.webmanifest',
  applicationName: 'SUPERPONTOS',
  icons: {
    icon: [
      { url: '/icons/superpontos-icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/superpontos-icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: [{ url: '/icons/favicon-32x32.png', type: 'image/png', sizes: '32x32' }],
    apple: [{ url: '/icons/apple-touch-icon.png', type: 'image/png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'SUPERPONTOS', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f97316',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-slate-50 text-slate-900 min-h-screen`}>
        <PwaServiceWorkerRegistration />
        {children}
        <LegalFooter />
      </body>
    </html>
  );
}
