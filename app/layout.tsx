import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://scribbly-notes.fpibul.chatgpt.site'),
  title: 'Scribbly — notes that think with you',
  description: 'A tactile notebook for writing, organizing, and compiling your notes.',
  openGraph: {
    title: 'Scribbly — notes that think with you',
    description: 'Your handwriting. A little magic.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Scribbly handwriting notebook' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Scribbly — notes that think with you',
    description: 'Your handwriting. A little magic.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
