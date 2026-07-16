'use client';

import { useTranslations } from 'next-intl';
import { HelpCircle, ShieldCheck, Building2, User, Users, MapPin, BarChart3 } from 'lucide-react';

interface FundamentalsPanelProps {
  data: any;
  locale: string;
}

export default function FundamentalsPanel({ data, locale }: FundamentalsPanelProps) {
  const t = useTranslations('Markets');
  const isAr = locale === 'ar';
  
  if (!data) return null;

  const stats = data.statistics;
  const financials = data.financials;
  const compliance = financials?.complianceRatios;

  // Format large numbers for display
  const formatNumber = (val: number, type: 'volume' | 'mcap') => {
    if (!val) return '-';
    if (type === 'mcap') {
      const trils = val / 1e12;
      if (trils >= 1) {
        return t('trillions', { amount: trils.toFixed(2) });
      }
      const billions = val / 1e9;
      return t('billions', { amount: billions.toFixed(2) });
    } else {
      const millions = val / 1e6;
      if (millions >= 1) {
        return t('millions', { amount: millions.toFixed(2) });
      }
      return val.toLocaleString();
    }
  };

  const currency = data.market === 'TASI' ? t('currencyTasi') : t('currencyNasdaq');

  return (
    <div className="space-y-6">
      {/* Story Mode Company Biography */}
      <div className="glass-panel rounded-3xl p-5 space-y-4">
        <h3 className="font-bold text-sm text-accent flex items-center space-x-2 rtl:space-x-reverse">
          <Building2 className="w-4 h-4" />
          <span>{t('companyStory')}</span>
        </h3>
        <p className="text-xs text-foreground/60 leading-relaxed text-start">
          {isAr ? data.aboutTextArabic || data.aboutTextEnglish : data.aboutTextEnglish || data.aboutTextArabic}
        </p>

        {/* Company profile list */}
        <div className="grid grid-cols-2 gap-4 pt-2 text-xs">
          <div className="flex items-center space-x-2.5 rtl:space-x-reverse text-start">
            <User className="w-4 h-4 text-accent/70" />
            <div>
              <span className="text-[10px] text-foreground/50 block uppercase">{t('ceo')}</span>
              <span className="font-bold text-foreground truncate block">{data.ceo || '-'}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2.5 rtl:space-x-reverse text-start">
            <Users className="w-4 h-4 text-accent/70" />
            <div>
              <span className="text-[10px] text-foreground/50 block uppercase">{t('employees')}</span>
              <span className="font-bold text-foreground truncate block">
                {data.employees ? data.employees.toLocaleString() : '-'}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2.5 rtl:space-x-reverse text-start">
            <MapPin className="w-4 h-4 text-accent/70" />
            <div>
              <span className="text-[10px] text-foreground/50 block uppercase">{t('hq')}</span>
              <span className="font-bold text-foreground truncate block">{data.headquarters || '-'}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2.5 rtl:space-x-reverse text-start">
            <BarChart3 className="w-4 h-4 text-accent/70" />
            <div>
              <span className="text-[10px] text-foreground/50 block uppercase">{t('sector')}</span>
              <span className="font-bold text-foreground truncate block">
                {isAr ? data.sectorArabic || data.sectorEnglish : data.sectorEnglish || data.sectorArabic}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sharia compliance ratios indicators (AAOIFI) */}
      {compliance && (
        <div className="glass-panel rounded-3xl p-5 space-y-4 text-start">
          <h3 className="font-bold text-sm text-accent flex items-center space-x-2 rtl:space-x-reverse">
            <ShieldCheck className="w-4 h-4" />
            <span>{t('complianceRatios')}</span>
          </h3>

          {/* Debt ratio bar */}
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-foreground/60">
              <span>{t('debtToMcap')} (&lt;30%)</span>
              <span className="font-mono font-bold tabular-nums text-up">
                {Number(compliance.debtToMcap).toFixed(2)}%
              </span>
            </div>
            <div className="h-2 bg-foreground/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-up rounded-full"
                style={{ width: `${Math.min(compliance.debtToMcap * 3, 100)}%` }}
              />
            </div>
          </div>

          {/* Non-compliant income bar */}
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-foreground/60">
              <span>{t('interestToRevenue')} (&lt;5%)</span>
              <span className="font-mono font-bold tabular-nums text-up">
                {Number(compliance.interestIncomeToRevenue).toFixed(2)}%
              </span>
            </div>
            <div className="h-2 bg-foreground/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-up rounded-full"
                style={{ width: `${Math.min(compliance.interestIncomeToRevenue * 15, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Corporate statistics */}
      {stats && (
        <div className="glass-panel rounded-3xl p-5 space-y-4 text-start">
          <h3 className="font-bold text-sm text-foreground">{t('prevClose')}</h3>

          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <div className="flex justify-between text-foreground/60">
                <span>{t('dayRange')}</span>
                <span className="font-mono tabular-nums">
                  {currency === 'USD' ? '$' : ''}{stats.dayRange[0]?.toFixed(2)} - {stats.dayRange[1]?.toFixed(2)}{currency === 'SAR' ? ` ${currency}` : ''}
                </span>
              </div>
              <div className="h-1 bg-foreground/10 rounded-full relative">
                <div className="absolute left-[35%] right-[25%] h-1 bg-accent rounded-full" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-foreground/60">
                <span>{t('yearRange')}</span>
                <span className="font-mono tabular-nums">
                  {currency === 'USD' ? '$' : ''}{stats.yearRange[0]?.toFixed(2)} - {stats.yearRange[1]?.toFixed(2)}{currency === 'SAR' ? ` ${currency}` : ''}
                </span>
              </div>
              <div className="h-1 bg-foreground/10 rounded-full relative">
                <div className="absolute left-[50%] right-[10%] h-1 bg-accent rounded-full" />
              </div>
            </div>
          </div>

          <hr className="border-[var(--border-color)]" />

          {/* Grid fields */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="flex justify-between border-b border-[var(--border-color)] pb-1.5">
              <span className="text-foreground/60">{t('openPrice')}</span>
              <span className="font-bold font-mono tabular-nums text-foreground">
                {currency === 'USD' ? '$' : ''}{stats.open?.toFixed(2)}{currency === 'SAR' || currency === 'ر.س' ? ` ${currency}` : ''}
              </span>
            </div>

            <div className="flex justify-between border-b border-[var(--border-color)] pb-1.5">
              <span className="text-foreground/60">{t('prevCloseLabel')}</span>
              <span className="font-bold font-mono tabular-nums text-foreground">
                {currency === 'USD' ? '$' : ''}{stats.prevClose?.toFixed(2)}{currency === 'SAR' || currency === 'ر.س' ? ` ${currency}` : ''}
              </span>
            </div>

            <div className="flex justify-between border-b border-[var(--border-color)] pb-1.5">
              <span className="text-foreground/60">{t('volume')}</span>
              <span className="font-bold font-mono tabular-nums text-foreground">{formatNumber(stats.volume, 'volume')}</span>
            </div>

            <div className="flex justify-between border-b border-[var(--border-color)] pb-1.5">
              <span className="text-foreground/60">{t('avgVolume')}</span>
              <span className="font-bold font-mono tabular-nums text-foreground">{formatNumber(stats.avgVolume, 'volume')}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-foreground/60">{t('marketCap')}</span>
              <span className="font-bold font-mono tabular-nums text-foreground">{formatNumber(stats.marketCap, 'mcap')}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-foreground/60">{t('peRatio')}</span>
              <span className="font-bold font-mono tabular-nums text-foreground">{stats.peRatio}</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
