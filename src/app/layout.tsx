import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import FloatingActions from '@/components/FloatingActions';
import PwaRegister from '@/components/PwaRegister';

const display = Bebas_Neue({
  weight: '400',
  variable: '--font-display',
  subsets: ['latin'],
});

const body = IBM_Plex_Sans({
  weight: ['400', '500', '600'],
  variable: '--font-body',
  subsets: ['latin'],
});

const mono = IBM_Plex_Mono({
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'F1 Predictions',
  description: 'Friends league predictions and scoring',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/pwa-icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'F1 Predictions',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f5f0' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0f14' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  try {
    let t = localStorage.getItem('theme');
    if (t !== 'light' && t !== 'dark') {
      t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = t;
  } catch (e) {
    // ignore
  }
})();`,
          }}
        />
      </head>
      <body className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}>
        <PwaRegister />
        {children}
        <FloatingActions />
      </body>
    </html>
  );
}
