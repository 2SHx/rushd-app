import { getTranslations } from 'next-intl/server';

export default async function DisclaimerBanner() {
  const t = await getTranslations('Disclaimer');

  return (
    <div className="w-full bg-emerald-950/60 border-b border-emerald-800/50 px-4 py-1.5 text-center text-xs text-emerald-300">
      {t('banner')}
    </div>
  );
}
