'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Calculator, Sliders, Layers, BarChart3, TrendingUp, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface ValuationSuitePanelProps {
  data: any;
  locale: string;
}

type ModelType = 'summary' | 'dcf' | 'eps' | 'rule40' | 'peg';

export default function ValuationSuitePanel({ data, locale }: ValuationSuitePanelProps) {
  const t = useTranslations('Markets');
  const isAr = locale === 'ar';
  const currencySymbol = data.market === 'TASI' ? (isAr ? 'ر.س' : 'SAR') : '$';
  const currentPrice = Number(data.price) || 100;

  const [activeModel, setActiveModel] = useState<ModelType>('summary');

  // DCF Model Inputs
  const [dcfGrowth, setDcfGrowth] = useState<number>(25);
  const [dcfMargin, setDcfMargin] = useState<number>(47);
  const [dcfMultiple, setDcfMultiple] = useState<number>(40);
  const [dcfDiscount, setDcfDiscount] = useState<number>(10);
  const [dcfYears, setDcfYears] = useState<number>(5);
  const [dcfRev, setDcfRev] = useState<number>(data.statistics?.marketCap ? data.statistics.marketCap * 0.15 : 100000000000);

  // EPS Model Inputs
  const [epsCurrent, setEpsCurrent] = useState<number>(data.statistics?.peRatio ? currentPrice / data.statistics.peRatio : 5.5);
  const [epsGrowth, setEpsGrowth] = useState<number>(25);
  const [epsMultiple, setEpsMultiple] = useState<number>(32);
  const [epsYears, setEpsYears] = useState<number>(5);

  // Rule of 40 Inputs
  const [r40Growth, setR40Growth] = useState<number>(35);
  const [r40Margin, setR40Margin] = useState<number>(45);

  // PEG Inputs
  const [pegPe, setPegPe] = useState<number>(data.statistics?.peRatio || 32);
  const [pegGrowth, setPegGrowth] = useState<number>(25);

  // DCF Calculation Engine
  const dcfResults = useMemo(() => {
    let pvSum = 0;
    let currentRev = dcfRev;
    const r = dcfDiscount / 100;
    const g = dcfGrowth / 100;
    const m = dcfMargin / 100;

    for (let i = 1; i <= dcfYears; i++) {
      currentRev = currentRev * (1 + g);
      const fcf = currentRev * m;
      pvSum += fcf / Math.pow(1 + r, i);
    }

    const terminalVal = (currentRev * m) * dcfMultiple;
    const pvTerminal = terminalVal / Math.pow(1 + r, dcfYears);
    const enterpriseValue = pvSum + pvTerminal;

    // Approximate per share value assuming shares = mcap / price
    const mcap = data.statistics?.marketCap || currentPrice * 1e9;
    const shares = mcap / currentPrice;
    const fairValue = enterpriseValue / shares;
    const upside = ((fairValue - currentPrice) / currentPrice) * 100;
    const target5Y = fairValue * Math.pow(1.10, dcfYears);

    return { fairValue, upside, target5Y, enterpriseValue };
  }, [dcfGrowth, dcfMargin, dcfMultiple, dcfDiscount, dcfYears, dcfRev, currentPrice, data]);

  // EPS Calculation Engine
  const epsResults = useMemo(() => {
    const futureEps = epsCurrent * Math.pow(1 + epsGrowth / 100, epsYears);
    const target5Y = futureEps * epsMultiple;
    const discountRate = 0.10;
    const fairValue = target5Y / Math.pow(1 + discountRate, epsYears);
    const upside = ((fairValue - currentPrice) / currentPrice) * 100;

    return { fairValue, upside, target5Y, futureEps };
  }, [epsCurrent, epsGrowth, epsMultiple, epsYears, currentPrice]);

  // Rule of 40 Engine
  const r40Results = useMemo(() => {
    const score = r40Growth + r40Margin;
    let label = t('weak');
    let color = 'text-amber-500 bg-amber-500/10 border-amber-500/30';
    if (score >= 60) {
      label = t('strong');
      color = 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';
    } else if (score >= 40) {
      label = t('neutral');
      color = 'text-indigo-500 bg-indigo-500/10 border-indigo-500/30';
    }
    return { score, label, color };
  }, [r40Growth, r40Margin, t]);

  // PEG Engine
  const pegResults = useMemo(() => {
    const ratio = pegGrowth > 0 ? pegPe / pegGrowth : 0;
    const impliedPrice = ratio > 0 ? (currentPrice / ratio) : currentPrice;
    const upside = ((impliedPrice - currentPrice) / currentPrice) * 100;
    return { ratio, impliedPrice, upside };
  }, [pegPe, pegGrowth, currentPrice]);

  // Presets applicator
  const applyDcfPreset = (preset: 'conservative' | 'moderate' | 'aggressive') => {
    if (preset === 'conservative') {
      setDcfGrowth(10);
      setDcfMargin(25);
      setDcfMultiple(20);
      setDcfDiscount(12);
    } else if (preset === 'moderate') {
      setDcfGrowth(20);
      setDcfMargin(35);
      setDcfMultiple(30);
      setDcfDiscount(10);
    } else {
      setDcfGrowth(35);
      setDcfMargin(47);
      setDcfMultiple(45);
      setDcfDiscount(9);
    }
  };

  // 5x5 Sensitivity Matrix for DCF (Growth vs Multiple)
  const dcfSensitivityMatrix = useMemo(() => {
    const growths = [dcfGrowth - 10, dcfGrowth - 5, dcfGrowth, dcfGrowth + 5, dcfGrowth + 10];
    const multiples = [dcfMultiple - 10, dcfMultiple - 5, dcfMultiple, dcfMultiple + 5, dcfMultiple + 10];
    const mcap = data.statistics?.marketCap || currentPrice * 1e9;
    const shares = mcap / currentPrice;

    return growths.map((gVal) => {
      return multiples.map((mVal) => {
        let pvSum = 0;
        let cRev = dcfRev;
        const r = dcfDiscount / 100;
        const g = gVal / 100;
        const m = dcfMargin / 100;
        for (let i = 1; i <= dcfYears; i++) {
          cRev = cRev * (1 + g);
          pvSum += (cRev * m) / Math.pow(1 + r, i);
        }
        const termVal = cRev * m * mVal;
        const fv = (pvSum + termVal / Math.pow(1 + r, dcfYears)) / shares;
        return {
          g: gVal,
          m: mVal,
          fv,
          isCurrent: gVal === dcfGrowth && mVal === dcfMultiple,
        };
      });
    });
  }, [dcfGrowth, dcfMultiple, dcfMargin, dcfDiscount, dcfYears, dcfRev, currentPrice, data]);

  const modelsList = [
    { id: 'summary', label: t('allModelsSummary'), icon: Layers },
    { id: 'dcf', label: t('dcfModel'), icon: Calculator },
    { id: 'eps', label: t('epsModel'), icon: TrendingUp },
    { id: 'rule40', label: t('ruleOf40Model'), icon: ShieldCheck },
    { id: 'peg', label: t('pegModel'), icon: BarChart3 },
  ];

  const avgFairValue = (dcfResults.fairValue + epsResults.fairValue + pegResults.impliedPrice) / 3;
  const avgUpside = ((avgFairValue - currentPrice) / currentPrice) * 100;

  return (
    <div className="space-y-6 text-start">
      {/* Top Models Navigation Rail */}
      <div className="glass-panel p-2 rounded-2xl flex flex-wrap items-center gap-1.5 border border-[var(--border-color)]">
        {modelsList.map((m) => {
          const Icon = m.icon;
          const isActive = activeModel === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setActiveModel(m.id as ModelType)}
              className={`flex items-center space-x-2 rtl:space-x-reverse px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                isActive
                  ? 'bg-accent text-white shadow-md'
                  : 'text-foreground/60 hover:text-foreground hover:bg-foreground/[0.04]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── ALL MODELS SUMMARY VIEW ── */}
      {activeModel === 'summary' && (
        <div className="glass-panel rounded-3xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-4">
            <div>
              <span className="text-[11px] font-bold text-accent tracking-wider uppercase">{t('valuationModels')}</span>
              <h2 className="text-xl font-extrabold text-foreground flex items-center space-x-2 rtl:space-x-reverse mt-0.5">
                <Sparkles className="w-5 h-5 text-accent" />
                <span>{t('allModelsSummary')}</span>
              </h2>
            </div>
            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <div className="text-end">
                <p className="text-[10px] text-foreground/50">{t('fairValue')}</p>
                <p className="text-lg font-black font-mono text-accent">
                  {currencySymbol}{avgFairValue.toFixed(2)}
                </p>
              </div>
              <div
                className={`px-3 py-1.5 rounded-2xl text-xs font-black border ${
                  avgUpside >= 0
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                }`}
              >
                {avgUpside >= 0 ? '+' : ''}{avgUpside.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Model Matrix Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* DCF Card */}
            <div className="p-4 rounded-2xl bg-foreground/[0.02] dark:bg-white/[0.02] border border-foreground/[0.06] dark:border-white/[0.05] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">{t('dcfModel')}</span>
                <span className="text-xs font-extrabold font-mono text-accent">{currencySymbol}{dcfResults.fairValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-foreground/60">
                <span>5Y Target: {currencySymbol}{dcfResults.target5Y.toFixed(2)}</span>
                <span className={dcfResults.upside >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                  {dcfResults.upside >= 0 ? '+' : ''}{dcfResults.upside.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* EPS Card */}
            <div className="p-4 rounded-2xl bg-foreground/[0.02] dark:bg-white/[0.02] border border-foreground/[0.06] dark:border-white/[0.05] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">{t('epsModel')}</span>
                <span className="text-xs font-extrabold font-mono text-accent">{currencySymbol}{epsResults.fairValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-foreground/60">
                <span>5Y Target: {currencySymbol}{epsResults.target5Y.toFixed(2)}</span>
                <span className={epsResults.upside >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                  {epsResults.upside >= 0 ? '+' : ''}{epsResults.upside.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Rule of 40 Card */}
            <div className="p-4 rounded-2xl bg-foreground/[0.02] dark:bg-white/[0.02] border border-foreground/[0.06] dark:border-white/[0.05] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">{t('ruleOf40Model')}</span>
                <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full border ${r40Results.color}`}>
                  Score {r40Results.score} ({r40Results.label})
                </span>
              </div>
              <p className="text-[11px] text-foreground/60">
                Growth ({r40Growth}%) + Margin ({r40Margin}%)
              </p>
            </div>

            {/* PEG Card */}
            <div className="p-4 rounded-2xl bg-foreground/[0.02] dark:bg-white/[0.02] border border-foreground/[0.06] dark:border-white/[0.05] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">{t('pegModel')}</span>
                <span className="text-xs font-extrabold font-mono text-accent">PEG {pegResults.ratio.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-foreground/60">
                <span>Implied @ 1.0: {currencySymbol}{pegResults.impliedPrice.toFixed(2)}</span>
                <span className={pegResults.upside >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                  {pegResults.upside >= 0 ? '+' : ''}{pegResults.upside.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DCF WORKSPACE ── */}
      {activeModel === 'dcf' && (
        <div className="glass-panel rounded-3xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-4">
            <div>
              <h3 className="text-lg font-extrabold text-foreground">{t('dcfModel')}</h3>
              <p className="text-xs text-foreground/60 mt-0.5">Discounted Cash Flow intrinsic valuation engine</p>
            </div>
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <span className="text-xs font-bold text-foreground/60">{t('presets')}:</span>
              {(['conservative', 'moderate', 'aggressive'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => applyDcfPreset(p)}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-foreground/[0.05] hover:bg-accent hover:text-white transition-colors"
                >
                  {t(p)}
                </button>
              ))}
            </div>
          </div>

          {/* Results Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-accent/[0.03] border border-accent/15">
            <div>
              <p className="text-[10px] text-foreground/50">{t('fairValue')}</p>
              <p className="text-base font-extrabold font-mono text-accent">{currencySymbol}{dcfResults.fairValue.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-foreground/50">Upside / Downside</p>
              <p className={`text-base font-extrabold font-mono ${dcfResults.upside >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {dcfResults.upside >= 0 ? '+' : ''}{dcfResults.upside.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-[10px] text-foreground/50">{t('target5Y')}</p>
              <p className="text-base font-extrabold font-mono text-foreground">{currencySymbol}{dcfResults.target5Y.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-foreground/50">Current Price</p>
              <p className="text-base font-extrabold font-mono text-foreground">{currencySymbol}{currentPrice.toFixed(2)}</p>
            </div>
          </div>

          {/* Controls Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5 p-3.5 rounded-2xl bg-foreground/[0.02] border border-foreground/[0.05]">
              <div className="flex justify-between text-xs font-bold">
                <span>Revenue Growth Rate</span>
                <span className="text-accent">{dcfGrowth}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={dcfGrowth}
                onChange={(e) => setDcfGrowth(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>

            <div className="space-y-1.5 p-3.5 rounded-2xl bg-foreground/[0.02] border border-foreground/[0.05]">
              <div className="flex justify-between text-xs font-bold">
                <span>FCF Margin</span>
                <span className="text-accent">{dcfMargin}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="80"
                value={dcfMargin}
                onChange={(e) => setDcfMargin(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>

            <div className="space-y-1.5 p-3.5 rounded-2xl bg-foreground/[0.02] border border-foreground/[0.05]">
              <div className="flex justify-between text-xs font-bold">
                <span>Terminal Multiple</span>
                <span className="text-accent">{dcfMultiple}x</span>
              </div>
              <input
                type="range"
                min="5"
                max="80"
                value={dcfMultiple}
                onChange={(e) => setDcfMultiple(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>

            <div className="space-y-1.5 p-3.5 rounded-2xl bg-foreground/[0.02] border border-foreground/[0.05]">
              <div className="flex justify-between text-xs font-bold">
                <span>Discount Rate</span>
                <span className="text-accent">{dcfDiscount}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="20"
                value={dcfDiscount}
                onChange={(e) => setDcfDiscount(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
          </div>

          {/* 5x5 Interactive Sensitivity Matrix */}
          <div className="space-y-3 pt-4 border-t border-[var(--border-color)]">
            <h4 className="text-xs font-extrabold text-foreground flex items-center space-x-2 rtl:space-x-reverse">
              <Sliders className="w-4 h-4 text-accent" />
              <span>{t('sensitivityMatrix')} (Growth vs Terminal Multiple)</span>
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-center text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-foreground/50">
                    <th className="p-2">Growth \ Mult</th>
                    {dcfSensitivityMatrix[0]?.map((col, idx) => (
                      <th key={idx} className="p-2 font-mono">{col.m}x</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dcfSensitivityMatrix.map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-foreground/[0.03]">
                      <td className="p-2 font-bold font-mono text-foreground/70">{row[0].g}%</td>
                      {row.map((cell, cIdx) => {
                        const isUnder = cell.fv >= currentPrice;
                        return (
                          <td
                            key={cIdx}
                            className={`p-2 font-mono font-bold transition-all ${
                              cell.isCurrent ? 'ring-2 ring-accent bg-accent/20 rounded-lg' : ''
                            } ${
                              isUnder
                                ? 'text-emerald-500 bg-emerald-500/5'
                                : 'text-rose-500 bg-rose-500/5'
                            }`}
                          >
                            {currencySymbol}{cell.fv.toFixed(0)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── EPS WORKSPACE ── */}
      {activeModel === 'eps' && (
        <div className="glass-panel rounded-3xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-4">
            <h3 className="text-lg font-extrabold text-foreground">{t('epsModel')}</h3>
            <span className="text-xs font-mono font-extrabold text-accent">
              5Y EPS: ${epsResults.futureEps.toFixed(2)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-accent/[0.03] border border-accent/15">
            <div>
              <p className="text-[10px] text-foreground/50">{t('fairValue')}</p>
              <p className="text-base font-extrabold font-mono text-accent">{currencySymbol}{epsResults.fairValue.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-foreground/50">{t('target5Y')}</p>
              <p className="text-base font-extrabold font-mono text-foreground">{currencySymbol}{epsResults.target5Y.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-foreground/50">Upside</p>
              <p className={`text-base font-extrabold font-mono ${epsResults.upside >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {epsResults.upside >= 0 ? '+' : ''}{epsResults.upside.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5 p-3.5 rounded-2xl bg-foreground/[0.02] border border-foreground/[0.05]">
              <div className="flex justify-between text-xs font-bold">
                <span>Current EPS</span>
                <span className="text-accent">${epsCurrent.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="30"
                step="0.5"
                value={epsCurrent}
                onChange={(e) => setEpsCurrent(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>

            <div className="space-y-1.5 p-3.5 rounded-2xl bg-foreground/[0.02] border border-foreground/[0.05]">
              <div className="flex justify-between text-xs font-bold">
                <span>EPS Growth %</span>
                <span className="text-accent">{epsGrowth}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="80"
                value={epsGrowth}
                onChange={(e) => setEpsGrowth(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>

            <div className="space-y-1.5 p-3.5 rounded-2xl bg-foreground/[0.02] border border-foreground/[0.05]">
              <div className="flex justify-between text-xs font-bold">
                <span>Exit P/E Multiple</span>
                <span className="text-accent">{epsMultiple}x</span>
              </div>
              <input
                type="range"
                min="5"
                max="80"
                value={epsMultiple}
                onChange={(e) => setEpsMultiple(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── RULE OF 40 WORKSPACE ── */}
      {activeModel === 'rule40' && (
        <div className="glass-panel rounded-3xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-4">
            <h3 className="text-lg font-extrabold text-foreground">{t('ruleOf40Model')}</h3>
            <span className={`px-3 py-1 rounded-full text-xs font-black border ${r40Results.color}`}>
              Score: {r40Results.score}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 p-4 rounded-2xl bg-foreground/[0.02] border border-foreground/[0.05]">
              <div className="flex justify-between text-xs font-bold">
                <span>YoY Revenue Growth</span>
                <span className="text-accent">{r40Growth}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={r40Growth}
                onChange={(e) => setR40Growth(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>

            <div className="space-y-1.5 p-4 rounded-2xl bg-foreground/[0.02] border border-foreground/[0.05]">
              <div className="flex justify-between text-xs font-bold">
                <span>Net Profit / FCF Margin</span>
                <span className="text-accent">{r40Margin}%</span>
              </div>
              <input
                type="range"
                min="-20"
                max="80"
                value={r40Margin}
                onChange={(e) => setR40Margin(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── PEG WORKSPACE ── */}
      {activeModel === 'peg' && (
        <div className="glass-panel rounded-3xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-4">
            <h3 className="text-lg font-extrabold text-foreground">{t('pegModel')}</h3>
            <span className="text-xs font-extrabold font-mono text-accent">
              Ratio: {pegResults.ratio.toFixed(2)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-accent/[0.03] border border-accent/15">
            <div>
              <p className="text-[10px] text-foreground/50">Implied Fair Price (@ PEG 1.0)</p>
              <p className="text-base font-extrabold font-mono text-accent">{currencySymbol}{pegResults.impliedPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-foreground/50">Upside / Downside</p>
              <p className={`text-base font-extrabold font-mono ${pegResults.upside >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {pegResults.upside >= 0 ? '+' : ''}{pegResults.upside.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 p-4 rounded-2xl bg-foreground/[0.02] border border-foreground/[0.05]">
              <div className="flex justify-between text-xs font-bold">
                <span>Current P/E Ratio</span>
                <span className="text-accent">{pegPe}x</span>
              </div>
              <input
                type="range"
                min="5"
                max="100"
                value={pegPe}
                onChange={(e) => setPegPe(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>

            <div className="space-y-1.5 p-4 rounded-2xl bg-foreground/[0.02] border border-foreground/[0.05]">
              <div className="flex justify-between text-xs font-bold">
                <span>Expected EPS Growth %</span>
                <span className="text-accent">{pegGrowth}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="80"
                value={pegGrowth}
                onChange={(e) => setPegGrowth(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
