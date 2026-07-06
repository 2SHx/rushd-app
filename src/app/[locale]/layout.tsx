import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import Navigation from '@/components/Navigation';
import DisclaimerBanner from '@/components/DisclaimerBanner';

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
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} className="dark">
      <body className={`${inter.variable} antialiased min-h-screen pb-16 md:pb-0 md:pl-64`}>
        <NextIntlClientProvider messages={messages}>
          <DisclaimerBanner />
          <Navigation locale={locale} />
          <main className="flex-1 w-full p-4 md:p-8">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
