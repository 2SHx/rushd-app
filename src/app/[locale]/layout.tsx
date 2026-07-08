import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import Navigation from '@/components/Navigation';
import DisclaimerBanner from '@/components/DisclaimerBanner';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';

const SUPPORTED_LOCALES = ['en', 'ar'];

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });

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
                var theme = localStorage.getItem('theme') || 'dark';
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
      <body className={`${inter.variable} antialiased min-h-screen pb-16 md:pb-0 md:ps-64 bg-slate-50 text-slate-900 dark:bg-[#0B0F19] dark:text-white transition-colors duration-200`}>
        <NextIntlClientProvider messages={messages}>
          <DisclaimerBanner />
          <LanguageSwitcher locale={locale} />
          <ThemeToggle />
          <Navigation locale={locale} />
          <main className="flex-1 w-full p-4 md:p-8">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
