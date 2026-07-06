// src/app/[locale]/markets/page.tsx
import { fetchMarketData } from '@/services/marketData';
import { auth } from '@/auth';
import AdvancedTradingChart from '@/components/AdvancedTradingChart';
import Link from 'next/link';
import { Activity, ShieldCheck, ShieldAlert, ArrowUpRight, CheckCircle2 } from 'lucide-react';

const TICKERS = {
  TASI: [
    { symbol: '2222.SR', name: 'Saudi Aramco' },
    { symbol: '1120.SR', name: 'Al Rajhi Bank' },
    { symbol: '1180.SR', name: 'Alinma Bank' }
  ],
  NASDAQ: [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'TSLA', name: 'Tesla Motors' },
    { symbol: 'META', name: 'Meta Platforms' },
    { symbol: 'MSFT', name: 'Microsoft Corp.' }
  ]
};

interface MarketsPageProps {
  searchParams: {
    symbol?: string;
    market?: string;
  };
}

export default async function MarketsPage({ searchParams }: MarketsPageProps) {
  const session = await auth();
  const rawMarket = searchParams.market === 'NASDAQ' ? 'NASDAQ' : 'TASI';
  const defaultSymbol = rawMarket === 'TASI' ? '2222.SR' : 'AAPL';
  const symbol = searchParams.symbol || defaultSymbol;

  const currentData = await fetchMarketData(symbol, rawMarket);
  const isParent = session?.user?.role === 'PARENT';

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent">
          Financial Markets
        </h1>
        <p className="text-gray-400 mt-1">Explore TASI and NASDAQ, analyze compliance, and run mock trades.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Selector */}
        <div className="space-y-6">
          <div className="glass-panel p-4 space-y-4">
            <h3 className="font-bold text-gray-400 text-xs uppercase tracking-wider">TASI Exchange</h3>
            <div className="space-y-2">
              {TICKERS.TASI.map((t) => {
                const isActive = symbol === t.symbol && rawMarket === 'TASI';
                return (
                  <Link
                    key={t.symbol}
                    href={`/markets?symbol=${t.symbol}&market=TASI`}
                    className={`block p-3 rounded-xl transition-all border text-sm ${
                      isActive 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-semibold' 
                        : 'bg-white/5 border-transparent text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>{t.name}</span>
                      <span className="font-mono text-xs">{t.symbol.replace('.SR', '')}</span>
                    </div>
                  </Link>
                );
              })}
            </div>

            <h3 className="font-bold text-gray-400 text-xs uppercase tracking-wider pt-2">NASDAQ Exchange</h3>
            <div className="space-y-2">
              {TICKERS.NASDAQ.map((t) => {
                const isActive = symbol === t.symbol && rawMarket === 'NASDAQ';
                return (
                  <Link
                    key={t.symbol}
                    href={`/markets?symbol=${t.symbol}&market=NASDAQ`}
                    className={`block p-3 rounded-xl transition-all border text-sm ${
                      isActive 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-semibold' 
                        : 'bg-white/5 border-transparent text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>{t.name}</span>
                      <span className="font-mono text-xs">{t.symbol}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Details and Chart */}
        <div className="lg:col-span-3 space-y-6">
          <div className="glass-panel p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                  {rawMarket} exchange
                </span>
                <h3 className="text-2xl font-bold">{currentData.symbol}</h3>
                <p className="text-3xl font-bold mt-2">
                  {currentData.price.toFixed(2)}{' '}
                  <span className="text-sm font-normal text-gray-400">
                    {rawMarket === 'TASI' ? 'SAR' : 'USD'}
                  </span>
                </p>
              </div>
              <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                <Activity className="w-4 h-4 animate-pulse" />
                <span className="text-sm font-medium">Live Feed</span>
              </div>
            </div>
            <AdvancedTradingChart data={currentData.history} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sharia Status Card */}
            <div className="glass-panel p-6 space-y-4">
              <h3 className="font-bold flex items-center space-x-2 rtl:space-x-reverse">
                <span>Sharia Verdict</span>
              </h3>

              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Compliance Status</span>
                {currentData.isShariaCompliant ? (
                  <span className="flex items-center space-x-1.5 rtl:space-x-reverse px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-semibold">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Compliant (Halal)</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1.5 rtl:space-x-reverse px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-semibold">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Non-Compliant (Haram)</span>
                  </span>
                )}
              </div>

              {!currentData.isShariaCompliant ? (
                <div className="bg-red-500/10 border border-red-500/20 p-3.5 rounded-xl text-center space-y-1">
                  <p className="text-xs text-red-400 font-bold">
                    غير متوافق مع الشريعة — تعليمي فقط
                  </p>
                  <p className="text-[10px] text-red-400/80">
                    Not Sharia-compliant — educational purposes only
                  </p>
                </div>
              ) : (
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-3.5 rounded-xl text-center">
                  <p className="text-xs text-emerald-400 font-bold">
                    تم التأكد وفق معايير هيئة المحاسبة والمراجعة للمؤسسات المالية الإسلامية (AAOIFI)
                  </p>
                </div>
              )}
            </div>

            {/* Trading Actions */}
            <div className="glass-panel p-6 flex flex-col justify-between space-y-6">
              <div className="space-y-2">
                <h3 className="font-bold">Execution Engine</h3>
                <p className="text-sm text-gray-400">
                  {isParent 
                    ? 'Supervising accounts are read-only and locked from executing trades.' 
                    : 'Run simulated transactions on this asset.'}
                </p>
              </div>

              <button
                disabled={isParent || !currentData.isShariaCompliant}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 font-bold text-white shadow-lg shadow-emerald-500/20 disabled:from-gray-700 disabled:to-gray-800 disabled:text-gray-500 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isParent ? (
                  <span>Supervision Mode (Locked)</span>
                ) : !currentData.isShariaCompliant ? (
                  <span>Trade Blocked (Haram Asset)</span>
                ) : (
                  <>
                    <ArrowUpRight className="w-4 h-4" />
                    <span>Execute Mock Trade</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
