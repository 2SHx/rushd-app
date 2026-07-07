import { getTranslations } from 'next-intl/server';
import { GraduationCap } from 'lucide-react';
import CommitteeClient from '@/components/quant/CommitteeClient';

export default async function QuantPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations('Quant');

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-extrabold bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent">
          {t('title')}
        </h1>
        <p className="text-gray-400 mt-1 text-sm">{t('subtitle')}</p>
      </div>

      <div className="glass-panel p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 flex items-start gap-3 text-start">
        <GraduationCap className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-emerald-300 font-bold text-sm">{t('disclaimer')}</p>
          <p className="text-gray-400 text-xs leading-relaxed">{t('ultraNote')}</p>
        </div>
      </div>

      <CommitteeClient locale={params.locale} />
    </div>
  );
}
