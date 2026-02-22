import type { Metadata } from 'next';
import { Bebas_Neue, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}>{children}</body>
    </html>
  );
}
