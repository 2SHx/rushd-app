import { getCachedShariaVerdict, registry } from '@/services/marketData';
import { TICKERS } from '@/lib/tickers';

export interface HalalUniverseEntry {
  symbol: string;
  name: string;
  arName: string;
  market: 'TASI' | 'NASDAQ';
  purificationRatio: number; // e.g. 0.0150 (1.5%)
}

// broader liquid tech/growth roster for US factor core
const NASDAQ_CANDIDATES = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ADBE',
  'PEP', 'COST', 'CSCO', 'NFLX', 'CMCSA', 'AMD', 'QCOM', 'TXN', 'HON',
  'AMGN', 'ISRG', 'SBUX', 'INTU', 'BKNG', 'REGN', 'VRTX', 'ADI'
];

function getMockPurificationRatio(symbol: string): number {
  const clean = symbol.replace('.SR', '').toUpperCase();
  // Assign deterministic, compliant (<5% / 0.0500) mock ratios for keyless developer setup
  switch (clean) {
    case 'AAPL': return 0.0032;
    case 'MSFT': return 0.0045;
    case 'GOOGL': return 0.0125;
    case 'AMZN': return 0.0085;
    case 'NVDA': return 0.0015;
    case 'AVGO': return 0.0180;
    case 'ADBE': return 0.0060;
    case 'PEP': return 0.0380;
    case 'COST': return 0.0025;
    case 'CSCO': return 0.0140;
    case 'NFLX': return 0.0090;
    case 'AMD': return 0.0010;
    case 'QCOM': return 0.0210;
    case 'SBUX': return 0.0150;
    case 'INTU': return 0.0075;
    case '2222': return 0.0020;
    case '1120': return 0.0005;
    case '1180': return 0.0010;
    default: return 0.0050; // default 0.5%
  }
}

/**
 * Iterates over the candidate stock roster, queries Sharia compliance status via
 * registry.getScreener() and returns the filtered set of compliant assets with purification ratios.
 * Fail-closed: if the screener throws or errors, candidates are excluded.
 */
export async function getHalalUniverse(
  market: 'TASI' | 'NASDAQ',
  symbolAllowlist?: readonly string[]
): Promise<HalalUniverseEntry[]> {
  const screener = registry.getScreener();
  const results: HalalUniverseEntry[] = [];

  // Determine candidates list
  let candidates: { symbol: string; name: string; arName: string }[] = [];
  if (market === 'TASI') {
    // Seed TASI watchlist tickers
    candidates = TICKERS.TASI.map(t => ({
      symbol: t.symbol,
      name: t.name,
      arName: t.arName
    }));
  } else {
    // Seed NASDAQ candidates from our roster
    candidates = NASDAQ_CANDIDATES.map(sym => {
      const match = TICKERS.NASDAQ.find(t => t.symbol === sym);
      return {
        symbol: sym,
        name: match ? match.name : `${sym} Corp`,
        arName: match ? match.arName : sym
      };
    });
  }

  if (symbolAllowlist) {
    const allowed = new Set(symbolAllowlist.map(symbol => symbol.toUpperCase()));
    candidates = candidates.filter(candidate => allowed.has(candidate.symbol.toUpperCase()));
  }

  for (const c of candidates) {
    try {
      const verdict = await getCachedShariaVerdict(screener, c.symbol, market);
      const verifiedForMode = process.env.MARKET_DATA_MODE !== 'live' || verdict.source === 'zoya';
      if (verdict && verdict.compliant && verifiedForMode) {
        // Find ratio from screener ratios or default fallback
        const purificationRatio = verdict.ratios?.nonCompliantIncomeToIncome ?? 
                                  getMockPurificationRatio(c.symbol);
        
        results.push({
          symbol: c.symbol,
          name: c.name,
          arName: c.arName,
          market,
          purificationRatio
        });
      }
    } catch (err) {
      console.warn(`Sharia screener error for candidate ${c.symbol} (fail-closed):`, err);
    }
  }

  return results;
}
