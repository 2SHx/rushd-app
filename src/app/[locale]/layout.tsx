import type { Metadata } from "next";
import localFont from "next/font/local";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "../globals.css";
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import Navigation from '@/components/Navigation';
import DisclaimerBanner from '@/components/DisclaimerBanner';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';

const SUPPORTED_LOCALES = ['en', 'ar'];

const geistSans = localFont({ src: '../fonts/GeistVF.woff', variable: '--font-sans' });
const geistMono = localFont({ src: '../fonts/GeistMonoVF.woff', variable: '--font-mono' });
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  variable: '--font-arabic',
});

export const metadata: Metadata = {
  title: "Rushd Financial",
  description: "Gamified, multi-market investment training and family neobanking",
};

export default async function RootLayout({
  children,
  params: { locale }
}: Readonly<{
  children: React.ReactNode;
  params: { locale: string };
}>) {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var theme = localStorage.getItem('theme') || 'light';
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${plexArabic.variable} ${locale === 'ar' ? 'font-arabic leading-[1.7]' : 'font-sans'} antialiased min-h-screen pb-16 md:pb-0 bg-background text-foreground transition-colors duration-200`}>
        <NextIntlClientProvider messages={messages}>
          <DisclaimerBanner />
          <Navigation locale={locale}>
            <main className="flex-1 w-full p-4 md:p-6 lg:p-8">
              {children}
            </main>
          </Navigation>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
