// Rushd Quant — seed the user's strategy-lab research library into the RAG store (ResearchDoc).
// Additive + idempotent: skips any title that already exists, so it can run after seed-research.ts
// and be re-run safely. Distilled expert notes (not raw PDFs) — the retriever is keyword/tag based
// (src/quant/data/researchRetriever.ts), so dense text with numbers retrieves best.
// Run: npx tsx scripts/seed-research-library.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const docs = [
  {
    title: 'Klarman — Margin of Safety: loss avoidance as the primary objective',
    sourceRef: 'Seth A. Klarman, Margin of Safety (HarperBusiness, 1991)',
    text:
      'Klarman argues loss avoidance must be the cornerstone of any investment program: because of compounding, ' +
      'a steady 16%/yr over 10 years leaves more capital than 20%/yr for 9 years followed by a single -15% year. ' +
      'Value investing is buying at a discount to conservatively appraised value so that error, bad luck, or ' +
      'volatility cannot cause a large permanent loss. He warns against "yield pigs" — investors who chase the ' +
      'highest advertised return and accept hidden principal risk — and against formulas that promise returns; ' +
      'targeting a rate of return does not make it achievable, and risk must be assessed independently of return. ' +
      'Applied to Rushd: promotion gates enforce MC max-drawdown limits before expectancy is even considered, and ' +
      'no strategy is selected purely for the highest backtest return.',
    tags: ['risk-management', 'value-investing', 'drawdown', 'capital-preservation', 'strategy-lab'],
  },
  {
    title: 'Chan — Algorithmic Trading: mean reversion, momentum, and Kelly sizing',
    sourceRef: 'Ernest P. Chan, Algorithmic Trading: Winning Strategies and Their Rationale (Wiley, 2013)',
    text:
      'Chan codifies two families: mean reversion (Bollinger-band entries in stationary regimes, cointegrated ' +
      'pairs via the Engle–Granger two-step, Kalman-filter dynamic hedge ratios) and momentum (time-series ' +
      'momentum with volatility targeting, cross-sectional ranking). Backtest pitfalls he stresses: look-ahead ' +
      'bias, survivorship bias, data-snooping from over-optimization, and unrealistic fills. Position sizing uses ' +
      'the Kelly fraction — but half-Kelly or less in practice because parameter estimates are noisy and full ' +
      'Kelly maximizes growth at the cost of violent drawdowns. Applied to Rushd: bollinger-mr-long, ' +
      'coint-statarb-long-leg, and ts-momentum-halal-basket are the long-only adaptations; fractional Kelly is ' +
      'computed by the Monte Carlo module and clamped by the risk envelope.',
    tags: ['mean-reversion', 'momentum', 'kelly', 'cointegration', 'backtesting', 'strategy-lab'],
  },
  {
    title: 'Zarattini/Aziz/Barbon — Opening Range Breakout: best published intraday momentum',
    sourceRef: 'Swiss Finance Institute Research Paper 24-97 (2024); QuantConnect "Stocks in Play" replication',
    text:
      'A 5-minute opening-range breakout on SPY produced ~19.6% annualized with Sharpe estimates between 1.33 and ' +
      '2.4 and near-zero beta — the strongest peer-reviewed intraday momentum result. The "Stocks in Play" ' +
      'variant applies ORB to high-relative-volume gappers, closely matching the Rushd gapper-orb screener ' +
      '(market cap 10–400M, premarket move >5%, volume >10M shares). Calibration rule: these numbers are the ' +
      'ceiling of published intraday performance; any Rushd backtest an order of magnitude above them triggers ' +
      'the implausible flag rather than a celebration. Related: VWAP band mean-reversion studies report 61–71% ' +
      'win rates at roughly 1.4:1 reward-to-risk.',
    tags: ['orb', 'intraday', 'momentum', 'gapper', 'vwap', 'calibration', 'strategy-lab'],
  },
  {
    title: 'Pricope — Deep RL in quantitative trading: a skeptical survey',
    sourceRef: 'Pricope, arXiv:2106.00123 (2021)',
    text:
      'Survey of critic-only, actor-only, and actor-critic DRL traders finds most published agents were ' +
      'proof-of-concept in unrealistic settings with no decent profitability; the best realistic setups reached ' +
      'roughly 20–60% ANNUAL returns, not daily. Key warnings: backtest performance does not transfer to live ' +
      'trading (latency spikes, API failures, order rejections, slippage, regime shift), exploration is expensive ' +
      'in markets, and reward functions that ignore risk produce dangerous agents. Applied to Rushd: the G6a RL ' +
      'lane starts with a single-agent PPO baseline and must pass the identical walk-forward, out-of-sample, and ' +
      'Monte Carlo gates as every deterministic setup — reinforcement learning gets no special pleading.',
    tags: ['reinforcement-learning', 'drl', 'survey', 'calibration', 'backtesting', 'strategy-lab'],
  },
  {
    title: 'MAPPO-SLSTM crypto trading paper — architecture idea, implausible numbers',
    sourceRef: 'Li, Discover Computing 29:302 (2026), MAPPO-SLSTM',
    text:
      'Proposes multi-agent PPO with a centralized critic over stacked-LSTM temporal features for coordinated ' +
      'multi-asset crypto trading; reports accuracy 0.946 and Sharpe 4.0. Credibility caveats logged as warnings: ' +
      'the dataset is only ~1,070 records, results assume ZERO transaction costs, and the authors concede ' +
      'walk-forward validation could not be fully implemented. A Sharpe of 4.0 exceeds the Rushd implausible ' +
      'threshold (Sharpe > 3 blocks promotion). Transferable ideas only: centralized-critic coordination across ' +
      'assets and temporal feature encoding — candidates for the G6a research lane, never targets.',
    tags: ['reinforcement-learning', 'mappo', 'lstm', 'crypto', 'implausible', 'strategy-lab'],
  },
  {
    title: 'Quantformer — credible transformer cross-sectional factor (monthly beats daily)',
    sourceRef: 'Zhang, Chen, Zhu, Langrené, arXiv:2404.00424v3 (2025)',
    text:
      'Transformer encoder adapted to numeric series (linear embedding replaces word embedding, no positional ' +
      'module) predicts next-period return quantiles across 4,601 Chinese A-shares from just two inputs: ' +
      'accumulated return and turnover rate over 20 timestamps. With a conservative 0.3% transaction cost and a ' +
      'clean 2010–2019 train / 2020+ test split it earns 17–25% annualized, Sharpe 0.9–1.0, alpha ~0.16, beating ' +
      '100 traditional price-volume factors — numbers inside the plausibility band. Two transferable findings: ' +
      'monthly rebalancing outperformed weekly AND daily (lower-frequency cross-sectional factors are more ' +
      'robust than high-frequency signals), and the strategy is long-only by construction because China bans ' +
      'shorting — mapping 1:1 onto the Sharia constraint. Rushd G6b ladder: linear momentum+turnover quantile ' +
      'ranks first; the transformer only if the linear factor leaves measurable signal behind.',
    tags: ['transformer', 'factor-investing', 'cross-sectional', 'momentum', 'turnover', 'calibration', 'strategy-lab'],
  },
  {
    title: 'Quantum statistical arbitrage — classical core is Engle–Granger cointegration',
    sourceRef: 'Zhuang, Chen, Wu, Guo, New J. Phys. 24 073036 (2022)',
    text:
      'Proposes quantum algorithms (variable-time condition-number estimation + quantum linear regression) to ' +
      'accelerate pairs-trading preselection and cointegration testing; requires ~50+ qubits and qRAM, so it is ' +
      'not actionable on classical infrastructure. The economically meaningful core is classical: statistical ' +
      'arbitrage models comovement, preselects multicollinear portfolios, verifies with the Engle–Granger ' +
      'two-step cointegration test (regress, then ADF unit-root test on residuals), and trades the spread ' +
      'reversion to its historical mean. Applied to Rushd: coint-statarb-long-leg trades only the undervalued ' +
      'leg long when the spread exceeds k standard deviations (the short leg is Sharia-vetoed); the full ' +
      'long-short version remains educational-only.',
    tags: ['cointegration', 'statistical-arbitrage', 'pairs-trading', 'mean-reversion', 'strategy-lab'],
  },
  {
    title: 'Practitioner day-trading setup lineage (Market Wizards / Brooks / Raschke)',
    sourceRef: 'User strategy library, 2026 — long-only adaptations per Sharia',
    text:
      'Setup families codified in the Strategy Lab: trend riding (higher-timeframe 100-EMA filter gating lower ' +
      'timeframe long entries), VWAP reclaim after a long wick with volume and no follow-through, RSI exhaustion ' +
      'longs at extreme readings with a reversal candle, stop-hunt reversals (fake break of prior-day low then ' +
      'hard reclaim), bagholder bounces after gap-downs of 20%+ with a flush and first higher low, and ' +
      'time-of-day effects (9:45 reversal window, first-hour trend lock). All short-side variants ' +
      '(broken-parabolic short, fake-halt rug, after-hours pump fade) are excluded from execution under the ' +
      'no-shorting Sharia constraint and retained only as flagged educational content. Every setup is a ' +
      'deterministic rule set validated through walk-forward and Monte Carlo before any automation.',
    tags: ['intraday', 'setups', 'vwap', 'trend-following', 'sharia', 'strategy-lab'],
  },
];

async function main() {
  console.log('Seeding strategy-lab research library...');
  let added = 0;
  for (const doc of docs) {
    const exists = await prisma.researchDoc.findFirst({ where: { title: doc.title }, select: { id: true } });
    if (exists) {
      console.log(`Skip (exists): "${doc.title}"`);
      continue;
    }
    await prisma.researchDoc.create({
      data: {
        title: doc.title,
        sourceRef: doc.sourceRef,
        text: doc.text,
        tags: doc.tags.map((t) => t.toLowerCase()),
        embedding: Array(1536).fill(0.0),
      },
    });
    added += 1;
    console.log(`Ingested: "${doc.title}"`);
  }
  console.log(`Library seeding done — ${added} added, ${docs.length - added} skipped.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
