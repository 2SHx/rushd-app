import {getRequestConfig} from 'next-intl/server';

const locales = ['en', 'ar'];
const defaultLocale = 'ar';

export default getRequestConfig(async ({requestLocale}) => {
  const requested = await requestLocale;
  const locale = locales.includes(requested as string) ? (requested as string) : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
