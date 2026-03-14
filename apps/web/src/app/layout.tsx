import type { Metadata } from 'next';
import { Inter, Bangers } from 'next/font/google';
import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const bangers = Bangers({ weight: '400', subsets: ['latin'], variable: '--font-manga' });

export const metadata: Metadata = {
  title: 'FrameFlow - AI Book Trailer Generator',
  description: 'Transform written stories into cinematic book trailers using AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${bangers.variable} font-sans bg-zinc-950 text-zinc-100 min-h-screen`}>
        <Theme appearance="dark" accentColor="violet" radius="medium">
          {children}
        </Theme>
      </body>
    </html>
  );
}
