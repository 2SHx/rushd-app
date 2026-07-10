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
                  {currency === 'USD' ? '$' : ''}{stats.dayRange[0]} - {stats.dayRange[1]}{currency === 'SAR' ? ` ${currency}` : ''}
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
                  {currency === 'USD' ? '$' : ''}{stats.yearRange[0]} - {stats.yearRange[1]}{currency === 'SAR' ? ` ${currency}` : ''}
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
                {currency === 'USD' ? '$' : ''}{stats.open}{currency === 'SAR' || currency === 'ر.س' ? ` ${currency}` : ''}
              </span>
            </div>

            <div className="flex justify-between border-b border-[var(--border-color)] pb-1.5">
              <span className="text-foreground/60">{t('prevCloseLabel')}</span>
              <span className="font-bold font-mono tabular-nums text-foreground">
                {currency === 'USD' ? '$' : ''}{stats.prevClose}{currency === 'SAR' || currency === 'ر.س' ? ` ${currency}` : ''}
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

      {/* Analyst Ratings (Visual Dummy Data) */}
      <div className="glass-panel rounded-3xl p-5 space-y-4 text-start">
        <h3 className="font-bold text-sm text-foreground">{t('analystRatings')}</h3>
        <div className="flex items-center space-x-4 rtl:space-x-reverse">
          <div className="w-16 h-16 rounded-full border-4 border-up flex items-center justify-center">
            <span className="text-xl font-bold tabular-nums text-up">76%</span>
          </div>
          <div className="flex-1 space-y-2 text-xs">
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <span className="w-8 text-foreground/60">{t('buyRating')}</span>
              <div className="flex-1 h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                <div className="h-full bg-up rounded-full" style={{ width: '76%' }} />
              </div>
              <span className="w-6 text-end tabular-nums text-up">76%</span>
            </div>
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <span className="w-8 text-foreground/60">{t('holdRating')}</span>
              <div className="flex-1 h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                <div className="h-full bg-foreground/40 rounded-full" style={{ width: '20%' }} />
              </div>
              <span className="w-6 text-end tabular-nums text-foreground/60">20%</span>
            </div>
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <span className="w-8 text-foreground/60">{t('sellRating')}</span>
              <div className="flex-1 h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                <div className="h-full bg-down rounded-full" style={{ width: '4%' }} />
              </div>
              <span className="w-6 text-end tabular-nums text-down">4%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Earnings (Visual Dummy Data) */}
      <div className="glass-panel rounded-3xl p-5 space-y-4 text-start">
        <h3 className="font-bold text-sm text-foreground">{t('earningsSummary')}</h3>
        <p className="text-xs text-foreground/50">{t('expectedVsActual')}</p>
        <div className="h-32 flex items-end justify-between px-2 pt-4 relative">
          {/* Chart Background Grid Lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
            <div className="border-b border-[var(--border-color)] w-full h-0" />
            <div className="border-b border-[var(--border-color)] w-full h-0" />
            <div className="border-b border-[var(--border-color)] w-full h-0" />
          </div>

          {[
            { quarter: t('q1'), expected: 0.8, actual: 0.9 },
            { quarter: t('q2'), expected: 0.85, actual: 0.8 },
            { quarter: t('q3'), expected: 0.9, actual: 0.95 },
            { quarter: t('q4'), expected: 0.95, actual: 1.1 }
          ].map((item, idx) => (
            <div key={idx} className="flex flex-col items-center space-y-2 z-10 w-8">
              <div className="flex space-x-1 rtl:space-x-reverse items-end h-20">
                <div
                  className="w-2 bg-foreground/25 rounded-t-sm"
                  style={{ height: `${item.expected * 50}%` }}
                />
                <div
                  className={`w-2 rounded-t-sm ${item.actual >= item.expected ? 'bg-up' : 'bg-down'}`}
                  style={{ height: `${item.actual * 50}%` }}
                />
              </div>
              <span className="text-[10px] text-foreground/60 font-bold">{item.quarter}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
