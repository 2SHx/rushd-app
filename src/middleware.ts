// src/middleware.ts
// DR-1: compose next-intl (locale) then Auth.js (session) — unauthenticated
// hits on protected prefixes redirect to `/[locale]/login`. `/api/*` routes
// (including `/api/auth/*`) are outside this matcher and protect themselves
// with in-route 401s, not middleware redirects.
import createIntlMiddleware from 'next-intl/middleware';
import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';

const locales = ['en', 'ar'];
const defaultLocale = 'ar';
const PROTECTED_PREFIXES = ['/dashboard', '/markets', '/quiz', '/profile', '/family'];

const intlMiddleware = createIntlMiddleware({ locales, defaultLocale });

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const localeMatch = pathname.match(/^\/(en|ar)(?=\/|$)/);
  const locale = localeMatch ? localeMatch[1] : defaultLocale;
  const pathAfterLocale = localeMatch ? pathname.slice(localeMatch[0].length) || '/' : pathname;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathAfterLocale === prefix || pathAfterLocale.startsWith(`${prefix}/`)
  );

  if (isProtected && !req.auth?.user) {
    return NextResponse.redirect(new URL(`/${locale}/login`, req.url));
  }

  return intlMiddleware(req);
});

export const config = {
  matcher: ['/', '/(ar|en)/:path*']
};
