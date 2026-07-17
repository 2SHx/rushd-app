import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      '/api/cron/quant-intraday': ['./src/quant/data/fixtures/intraday/**/*.json'],
    },
  },
};

export default withNextIntl(nextConfig);
