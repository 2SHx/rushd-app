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
      <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] rounded-3xl p-5 space-y-4">
        <h3 className="font-bold text-sm text-emerald-400 flex items-center space-x-2 rtl:space-x-reverse">
          <Building2 className="w-4 h-4" />
          <span>{t('companyStory')}</span>
        </h3>
        <p className="text-xs text-gray-400 leading-relaxed text-start">
          {isAr ? data.aboutTextArabic || data.aboutTextEnglish : data.aboutTextEnglish || data.aboutTextArabic}
        </p>

        {/* Company profile list */}
        <div className="grid grid-cols-2 gap-4 pt-2 text-xs">
          <div className="flex items-center space-x-2.5 rtl:space-x-reverse text-start">
            <User className="w-4 h-4 text-emerald-400/70" />
            <div>
              <span className="text-[10px] text-gray-500 block uppercase">{t('ceo')}</span>
              <span className="font-bold text-white truncate block">{data.ceo || '-'}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2.5 rtl:space-x-reverse text-start">
            <Users className="w-4 h-4 text-emerald-400/70" />
            <div>
              <span className="text-[10px] text-gray-500 block uppercase">{t('employees')}</span>
              <span className="font-bold text-white truncate block">
                {data.employees ? data.employees.toLocaleString() : '-'}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2.5 rtl:space-x-reverse text-start">
            <MapPin className="w-4 h-4 text-emerald-400/70" />
            <div>
              <span className="text-[10px] text-gray-500 block uppercase">{t('hq')}</span>
              <span className="font-bold text-white truncate block">{data.headquarters || '-'}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2.5 rtl:space-x-reverse text-start">
            <BarChart3 className="w-4 h-4 text-emerald-400/70" />
            <div>
              <span className="text-[10px] text-gray-500 block uppercase">{t('sector')}</span>
              <span className="font-bold text-white truncate block">
                {isAr ? data.sectorArabic || data.sectorEnglish : data.sectorEnglish || data.sectorArabic}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sharia compliance ratios indicators (AAOIFI) */}
      {compliance && (
        <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] rounded-3xl p-5 space-y-4 text-start">
          <h3 className="font-bold text-sm text-emerald-400 flex items-center space-x-2 rtl:space-x-reverse">
            <ShieldCheck className="w-4 h-4" />
            <span>{t('complianceRatios')}</span>
          </h3>

          {/* Debt ratio bar */}
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-400">
              <span>{t('debtToMcap')} (&lt;30%)</span>
              <span className="font-mono font-bold text-emerald-400">
                {Number(compliance.debtToMcap).toFixed(2)}%
              </span>
            </div>
            <div className="h-2 bg-black/40 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full" 
                style={{ width: `${Math.min(compliance.debtToMcap * 3, 100)}%` }} 
              />
            </div>
          </div>

          {/* Non-compliant income bar */}
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-400">
              <span>{t('interestToRevenue')} (&lt;5%)</span>
              <span className="font-mono font-bold text-emerald-400">
                {Number(compliance.interestIncomeToRevenue).toFixed(2)}%
              </span>
            </div>
            <div className="h-2 bg-black/40 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full" 
                style={{ width: `${Math.min(compliance.interestIncomeToRevenue * 15, 100)}%` }} 
              />
            </div>
          </div>
        </div>
      )}

      {/* Corporate statistics */}
      {stats && (
        <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] rounded-3xl p-5 space-y-4 text-start">
          <h3 className="font-bold text-sm text-gray-200">{t('prevClose')}</h3>
          
          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <div className="flex justify-between text-gray-400">
                <span>{t('dayRange')}</span>
                <span className="font-mono">
                  {currency === 'USD' ? '$' : ''}{stats.dayRange[0]} - {stats.dayRange[1]}{currency === 'SAR' ? ` ${currency}` : ''}
                </span>
              </div>
              <div className="h-1 bg-black/40 rounded-full relative">
                <div className="absolute left-[35%] right-[25%] h-1 bg-emerald-400 rounded-full" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-gray-400">
                <span>{t('yearRange')}</span>
                <span className="font-mono">
                  {currency === 'USD' ? '$' : ''}{stats.yearRange[0]} - {stats.yearRange[1]}{currency === 'SAR' ? ` ${currency}` : ''}
                </span>
              </div>
              <div className="h-1 bg-black/40 rounded-full relative">
                <div className="absolute left-[50%] right-[10%] h-1 bg-emerald-400 rounded-full" />
              </div>
            </div>
          </div>

          <hr className="border-white/5" />

          {/* Grid fields */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-gray-400">{t('openPrice')}</span>
              <span className="font-bold font-mono">
                {currency === 'USD' ? '$' : ''}{stats.open}{currency === 'SAR' || currency === 'ر.س' ? ` ${currency}` : ''}
              </span>
            </div>

            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-gray-400">{t('prevCloseLabel')}</span>
              <span className="font-bold font-mono">
                {currency === 'USD' ? '$' : ''}{stats.prevClose}{currency === 'SAR' || currency === 'ر.س' ? ` ${currency}` : ''}
              </span>
            </div>

            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-gray-400">{t('volume')}</span>
              <span className="font-bold font-mono">{formatNumber(stats.volume, 'volume')}</span>
            </div>

            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-gray-400">{t('avgVolume')}</span>
              <span className="font-bold font-mono">{formatNumber(stats.avgVolume, 'volume')}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-400">{t('marketCap')}</span>
              <span className="font-bold font-mono">{formatNumber(stats.marketCap, 'mcap')}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-400">{t('peRatio')}</span>
              <span className="font-bold font-mono">{stats.peRatio}</span>
            </div>
          </div>
        </div>
      )}

      {/* Analyst Ratings (Visual Dummy Data) */}
      <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] rounded-3xl p-5 space-y-4 text-start">
        <h3 className="font-bold text-sm text-gray-200">{t('analystRatings')}</h3>
        <div className="flex items-center space-x-4 rtl:space-x-reverse">
          <div className="w-16 h-16 rounded-full border-4 border-emerald-500 flex items-center justify-center">
            <span className="text-xl font-bold text-emerald-400">76%</span>
          </div>
          <div className="flex-1 space-y-2 text-xs">
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <span className="w-8 text-gray-400">{t('buyRating')}</span>
              <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '76%' }} />
              </div>
              <span className="w-6 text-end text-emerald-400">76%</span>
            </div>
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <span className="w-8 text-gray-400">{t('holdRating')}</span>
              <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
                <div className="h-full bg-gray-500 rounded-full" style={{ width: '20%' }} />
              </div>
              <span className="w-6 text-end text-gray-400">20%</span>
            </div>
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <span className="w-8 text-gray-400">{t('sellRating')}</span>
              <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: '4%' }} />
              </div>
              <span className="w-6 text-end text-red-400">4%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Earnings (Visual Dummy Data) */}
      <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] rounded-3xl p-5 space-y-4 text-start">
        <h3 className="font-bold text-sm text-gray-200">{t('earningsSummary')}</h3>
        <p className="text-xs text-gray-500">{t('expectedVsActual')}</p>
        <div className="h-32 flex items-end justify-between px-2 pt-4 relative">
          {/* Chart Background Grid Lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
            <div className="border-b border-white/5 w-full h-0" />
            <div className="border-b border-white/5 w-full h-0" />
            <div className="border-b border-white/5 w-full h-0" />
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
                  className="w-2 bg-gray-600 rounded-t-sm" 
                  style={{ height: `${item.expected * 50}%` }} 
                />
                <div 
                  className={`w-2 rounded-t-sm ${item.actual >= item.expected ? 'bg-emerald-400' : 'bg-red-400'}`} 
                  style={{ height: `${item.actual * 50}%` }} 
                />
              </div>
              <span className="text-[10px] text-gray-400 font-bold">{item.quarter}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
