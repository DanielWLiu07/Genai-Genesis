import type { Metadata } from 'next';
import { Inter, Bangers } from 'next/font/google';
import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import './globals.css';
import { PageTransitionProvider } from '@/components/PageTransition';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const bangers = Bangers({ weight: '400', subsets: ['latin'], variable: '--font-manga' });

export const metadata: Metadata = {
  title: 'MangaMate - AI Book Trailer Generator',
  description: 'Transform written stories into cinematic book trailers using AI',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${bangers.variable} font-sans text-[#111] min-h-screen`} style={{ background: `url('/bg.png') center/cover fixed no-repeat`, backgroundColor: '#f5f5f5' }}>
        <Theme appearance="light" accentColor="gray" radius="none" scaling="100%">
          <PageTransitionProvider>
            {children}
          </PageTransitionProvider>
        </Theme>
      </body>
    </html>
  );
}
