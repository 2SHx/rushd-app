'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Calendar, Filter, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { RiyalSymbol } from '@/lib/currency';

interface FinancialStatementsPanelProps {
  data: any;
  locale: string;
}

type StatementType = 'income' | 'balance' | 'cashflow';
type FrequencyType = 'annual' | 'quarterly';

export default function FinancialStatementsPanel({ data, locale }: FinancialStatementsPanelProps) {
  const t = useTranslations('Markets');
  const isAr = locale === 'ar';
  const isSAR = data.market === 'TASI';

  const [statement, setStatement] = useState<StatementType>('income');
  const [frequency, setFrequency] = useState<FrequencyType>('annual');

  const annualYears = ['2026', '2025', '2024', '2023'];
  const quarterlyPeriods = ['Q2 2026', 'Q1 2026', 'Q4 2025', 'Q3 2025'];
  const periods = frequency === 'annual' ? annualYears : quarterlyPeriods;

  // Mock financial statement datasets derived from stock base metrics
  const mcap = data.statistics?.marketCap || 2.5e12;
  const baseRev = mcap * 0.08;

  const incomeStatementData = [
    { label: 'Total Revenue', values: [baseRev, baseRev * 0.85, baseRev * 0.70, baseRev * 0.55], format: 'curr', isBold: true },
    { label: 'Cost of Revenue', values: [baseRev * 0.26, baseRev * 0.28, baseRev * 0.30, baseRev * 0.35], format: 'curr' },
    { label: 'Gross Profit', values: [baseRev * 0.74, baseRev * 0.72, baseRev * 0.70, baseRev * 0.65], format: 'curr', isBold: true },
    { label: 'Gross Margin', values: [74.1, 72.3, 70.0, 65.0], format: 'pct' },
    { label: 'Operating Expenses', values: [baseRev * 0.14, baseRev * 0.15, baseRev * 0.16, baseRev * 0.18], format: 'curr' },
    { label: 'R&D Expenses', values: [baseRev * 0.09, baseRev * 0.095, baseRev * 0.10, baseRev * 0.11], format: 'curr' },
    { label: 'Operating Income', values: [baseRev * 0.60, baseRev * 0.57, baseRev * 0.54, baseRev * 0.47], format: 'curr', isBold: true },
    { label: 'Operating Margin', values: [60.4, 57.0, 54.0, 47.0], format: 'pct' },
    { label: 'Net Income', values: [baseRev * 0.55, baseRev * 0.52, baseRev * 0.48, baseRev * 0.40], format: 'curr', isBold: true },
    { label: 'Net Margin', values: [55.6, 52.0, 48.0, 40.0], format: 'pct' },
  ];

  const balanceSheetData = [
    { label: 'Cash & Short-Term Investments', values: [baseRev * 0.35, baseRev * 0.30, baseRev * 0.25, baseRev * 0.20], format: 'curr', isBold: true },
    { label: 'Total Assets', values: [baseRev * 0.80, baseRev * 0.75, baseRev * 0.68, baseRev * 0.60], format: 'curr', isBold: true },
    { label: 'Total Liabilities', values: [baseRev * 0.20, baseRev * 0.22, baseRev * 0.24, baseRev * 0.25], format: 'curr' },
    { label: 'Total Debt', values: [baseRev * 0.05, baseRev * 0.06, baseRev * 0.07, baseRev * 0.08], format: 'curr' },
    { label: 'Stockholders\' Equity', values: [baseRev * 0.60, baseRev * 0.53, baseRev * 0.44, baseRev * 0.35], format: 'curr', isBold: true },
    { label: 'Debt / Equity Ratio', values: [0.08, 0.11, 0.15, 0.22], format: 'num' },
  ];

  const cashFlowData = [
    { label: 'Operating Cash Flow', values: [baseRev * 0.52, baseRev * 0.48, baseRev * 0.42, baseRev * 0.36], format: 'curr', isBold: true },
    { label: 'Capital Expenditures (CapEx)', values: [-(baseRev * 0.07), -(baseRev * 0.06), -(baseRev * 0.05), -(baseRev * 0.04)], format: 'curr' },
    { label: 'Free Cash Flow (FCF)', values: [baseRev * 0.45, baseRev * 0.42, baseRev * 0.37, baseRev * 0.32], format: 'curr', isBold: true },
    { label: 'FCF Margin', values: [44.8, 42.0, 37.0, 32.0], format: 'pct' },
  ];

  const activeData = statement === 'income' ? incomeStatementData : statement === 'balance' ? balanceSheetData : cashFlowData;

  const formatVal = (val: number, fmt: string) => {
    if (fmt === 'pct') return `${val.toFixed(1)}%`;
    if (fmt === 'num') return val.toFixed(2);
    const inBillions = val / 1e9;
    return isSAR
      ? <span className="inline-flex items-center gap-0.5">{isAr ? (
          <><span>{inBillions.toFixed(2)}B</span><RiyalSymbol /></>
        ) : (
          <><RiyalSymbol /><span>{inBillions.toFixed(2)}B</span></>
        )}</span>
      : `$${inBillions.toFixed(2)}B`;
  };

  return (
    <div className="glass-panel rounded-3xl p-6 space-y-6 text-start">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-4">
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          <FileText className="w-5 h-5 text-accent" />
          <h3 className="text-lg font-extrabold text-foreground">{t('financialStatements')}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Statement Switcher */}
          <div className="flex p-1 bg-foreground/[0.04] dark:bg-white/[0.04] rounded-2xl border border-foreground/[0.05]">
            <button
              onClick={() => setStatement('income')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statement === 'income' ? 'bg-accent text-white shadow-sm' : 'text-foreground/60 hover:text-foreground'
              }`}
            >
              {t('incomeStatement')}
            </button>
            <button
              onClick={() => setStatement('balance')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statement === 'balance' ? 'bg-accent text-white shadow-sm' : 'text-foreground/60 hover:text-foreground'
              }`}
            >
              {t('balanceSheet')}
            </button>
            <button
              onClick={() => setStatement('cashflow')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statement === 'cashflow' ? 'bg-accent text-white shadow-sm' : 'text-foreground/60 hover:text-foreground'
              }`}
            >
              {t('cashFlow')}
            </button>
          </div>

          {/* Frequency Toggle */}
          <div className="flex p-1 bg-foreground/[0.04] dark:bg-white/[0.04] rounded-2xl border border-foreground/[0.05]">
            <button
              onClick={() => setFrequency('annual')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                frequency === 'annual' ? 'bg-accent text-white shadow-sm' : 'text-foreground/60 hover:text-foreground'
              }`}
            >
              Annual
            </button>
            <button
              onClick={() => setFrequency('quarterly')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                frequency === 'quarterly' ? 'bg-accent text-white shadow-sm' : 'text-foreground/60 hover:text-foreground'
              }`}
            >
              Quarterly
            </button>
          </div>
        </div>
      </div>

      {/* Statement Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-start text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-color)] text-foreground/50">
              <th className="p-3 text-start">Line Item</th>
              {periods.map((p) => (
                <th key={p} className="p-3 text-end font-mono font-bold text-foreground">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/[0.04]">
            {activeData.map((row, idx) => (
              <tr key={idx} className={row.isBold ? 'bg-foreground/[0.02] dark:bg-white/[0.02]' : ''}>
                <td className={`p-3 ${row.isBold ? 'font-black text-foreground' : 'font-semibold text-foreground/70'}`}>
                  {row.label}
                </td>
                {row.values.map((val, pIdx) => (
                  <td
                    key={pIdx}
                    className={`p-3 text-end font-mono ${
                      row.isBold ? 'font-black text-foreground' : 'font-medium text-foreground/80'
                    }`}
                  >
                    {formatVal(val, row.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
