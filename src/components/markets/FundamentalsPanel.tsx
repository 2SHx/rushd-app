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
        return isAr ? `${trils.toFixed(2)} تريليون` : `$${trils.toFixed(2)}T`;
      }
      const billions = val / 1e9;
      return isAr ? `${billions.toFixed(2)} مليار` : `$${billions.toFixed(2)}B`;
    } else {
      const millions = val / 1e6;
      if (millions >= 1) {
        return isAr ? `${millions.toFixed(2)} مليون` : `${millions.toFixed(2)}M`;
      }
      return val.toLocaleString();
    }
  };

  const currency = data.market === 'TASI' ? (isAr ? 'ر.س' : 'SAR') : 'USD';

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
              <span className="text-gray-400">{isAr ? 'سعر الافتتاح' : 'Open Price'}</span>
              <span className="font-bold font-mono">
                {currency === 'USD' ? '$' : ''}{stats.open}{currency === 'SAR' ? ` ${currency}` : ''}
              </span>
            </div>

            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-gray-400">{isAr ? 'الإغلاق السابق' : 'Prev Close'}</span>
              <span className="font-bold font-mono">
                {currency === 'USD' ? '$' : ''}{stats.prevClose}{currency === 'SAR' ? ` ${currency}` : ''}
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
    </div>
  );
}
