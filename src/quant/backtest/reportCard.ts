// Rushd Quant — QDR-6 validation report card. Assembles the metrics + measured daily-return
// distribution + Monte Carlo gate + promotion checklist into one honest, persistable object,
// and renders it as a compact terminal table. Every claim carries a dataFeed label; an
// implausible flag (Sharpe > 3 or a daily-return claim ≥ 3σ of history) prints in RED.
// Pure formatting — no DB, no LLM, no randomness.
import type { BacktestMetrics } from './metrics';
import type { DailyReturnDistribution } from './distribution';
import type { BootstrapResult, PermutationResult } from './monteCarlo';

export type DataFeed = 'alpaca-iex' | 'fixtures-real' | 'yahoo-short-history' | 'yahoo-daily';

export const MIN_TRADES_FOR_VALIDATION = 100;

export interface PromotionChecklist {
  walkForward: boolean;
  oosHoldoutPct: number; // fraction reserved out-of-sample
  oosHoldoutOk: boolean; // ≥ 0.20
  enoughTrades: boolean; // ≥ 100
  deflatedSharpeOk: boolean; // DSR > 0.95
  profitPlateau: boolean; // parameter robustness (evaluated upstream; false until proven)
  mcMaxDDWithinBreaker: boolean; // MC maxDD p95 ≤ drawdown breaker
}

export interface ReportCard {
  setup: string;
  symbols: string[];
  from: string;
  to: string;
  dataFeed: DataFeed;
  seed: number;
  gitSha: string;
  full: BacktestMetrics;
  oos: BacktestMetrics;
  distribution: DailyReturnDistribution;
  bootstrap: BootstrapResult;
  permutation: PermutationResult;
  kellyFraction: number;
  kellyClampedQty: number;
  checklist: PromotionChecklist;
  implausible: boolean;
  verdict: 'INSUFFICIENT_TRADES' | 'FAILED_PROMOTION' | 'PROMOTABLE';
}

export interface AssembleArgs {
  setup: string;
  symbols: string[];
  from: string;
  to: string;
  dataFeed: DataFeed;
  seed: number;
  gitSha: string;
  full: BacktestMetrics;
  oos: BacktestMetrics;
  distribution: DailyReturnDistribution;
  bootstrap: BootstrapResult;
  permutation: PermutationResult;
  kellyFraction: number;
  kellyClampedQty: number;
  oosFraction: number;
  drawdownBreakerPct: number;
  profitPlateau?: boolean;
}

export function assembleReportCard(a: AssembleArgs): ReportCard {
  const enoughTrades = a.full.trades >= MIN_TRADES_FOR_VALIDATION;
  const mcMaxDDWithinBreaker = a.bootstrap.maxDrawdown.p95 <= a.drawdownBreakerPct;
  const checklist: PromotionChecklist = {
    walkForward: enoughTrades, // walk-forward only meaningful with a real trade population
    oosHoldoutPct: a.oosFraction,
    oosHoldoutOk: a.oosFraction >= 0.2,
    enoughTrades,
    deflatedSharpeOk: a.oos.deflatedSharpe > 0.95,
    profitPlateau: a.profitPlateau ?? false,
    mcMaxDDWithinBreaker,
  };
  const implausible = a.full.implausible || a.oos.implausible;
  const promotable = Object.values(checklist).every((v) => (typeof v === 'boolean' ? v : true)) &&
    checklist.oosHoldoutOk && !implausible;
  const verdict: ReportCard['verdict'] = !enoughTrades
    ? 'INSUFFICIENT_TRADES'
    : promotable ? 'PROMOTABLE' : 'FAILED_PROMOTION';

  return {
    setup: a.setup, symbols: a.symbols, from: a.from, to: a.to, dataFeed: a.dataFeed,
    seed: a.seed, gitSha: a.gitSha, full: a.full, oos: a.oos, distribution: a.distribution,
    bootstrap: a.bootstrap, permutation: a.permutation, kellyFraction: a.kellyFraction,
    kellyClampedQty: a.kellyClampedQty, checklist, implausible, verdict,
  };
}

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const yn = (b: boolean) => (b ? `${GREEN}yes${RESET}` : `${RED}no${RESET}`);

/** Compact, colorized table. `color=false` yields plain text (for logs/CI diffing). */
export function renderReportCard(c: ReportCard, color = true): string {
  const paint = (s: string, code: string) => (color ? `${code}${s}${RESET}` : s);
  const L: string[] = [];
  L.push('════════════════════════════════════════════════════════════════');
  L.push(`  QDR-6 VALIDATION REPORT CARD — ${c.setup}`);
  L.push(`  ${c.symbols.join(', ')}  |  ${c.from} → ${c.to}`);
  L.push(paint(`  dataFeed=${c.dataFeed}  seed=${c.seed}  gitSha=${c.gitSha}`, DIM));
  L.push('────────────────────────────────────────────────────────────────');
  L.push(`  Trades (full):        ${c.full.trades}   Turnover: ${c.full.turnover.toFixed(2)}x`);
  L.push(`  CAGR:                 ${pct(c.full.cagr)}   (OOS ${pct(c.oos.cagr)})`);
  L.push(`  Sharpe:               ${c.full.sharpe.toFixed(2)}   (OOS ${c.oos.sharpe.toFixed(2)})`);
  L.push(`  Deflated Sharpe:      ${c.full.deflatedSharpe.toFixed(3)}   (OOS ${c.oos.deflatedSharpe.toFixed(3)})`);
  L.push(`  Max Drawdown:         ${pct(c.full.maxDrawdown)}   Hit-rate: ${pct(c.full.hitRate)}`);
  L.push('──── measured daily-return distribution (no promised returns) ────');
  L.push(`  Days observed:        ${c.distribution.count}`);
  L.push(`  Mean / Std (daily):   ${pct(c.distribution.mean)} / ${pct(c.distribution.std)}`);
  L.push(`  ${paint(`P(day ≥ +5%): ${pct(c.distribution.probDayGe5pct)}`, YELLOW)}   ${paint(`P(day ≤ −5%): ${pct(c.distribution.probDayLe5pct)}`, YELLOW)}`);
  L.push('──── Monte Carlo gate (seeded) ────');
  L.push(`  Bootstrap resamples:  ${c.bootstrap.resamples}  (${c.bootstrap.tradesPerPath} trades/path)`);
  L.push(`  Max DD p5/p50/p95:    ${pct(c.bootstrap.maxDrawdown.p5)} / ${pct(c.bootstrap.maxDrawdown.p50)} / ${pct(c.bootstrap.maxDrawdown.p95)}`);
  L.push(`  Risk of ruin:         ${pct(c.bootstrap.riskOfRuin)}`);
  L.push(`  Entry-jitter p-value: ${c.permutation.pValue.toFixed(3)}  (mean/trade ${pct(c.permutation.observedMean)})`);
  L.push(`  Kelly fraction:       ${c.kellyFraction.toFixed(4)}  → clamped qty ${c.kellyClampedQty.toFixed(4)}`);
  L.push('──── promotion checklist (all required) ────');
  L.push(`  walk-forward:${yn(c.checklist.walkForward)}  OOS≥20% (${pct(c.checklist.oosHoldoutPct)}):${yn(c.checklist.oosHoldoutOk)}  trades≥100:${yn(c.checklist.enoughTrades)}`);
  L.push(`  deflated-Sharpe:${yn(c.checklist.deflatedSharpeOk)}  profit-plateau:${yn(c.checklist.profitPlateau)}  MC-maxDD≤breaker:${yn(c.checklist.mcMaxDDWithinBreaker)}`);
  L.push('────────────────────────────────────────────────────────────────');
  if (c.implausible) {
    L.push(paint('  ⚠ IMPLAUSIBLE: Sharpe > 3 or daily claim ≥ 3σ — treat as overfit/bug', RED));
  }
  const vColor = c.verdict === 'PROMOTABLE' ? GREEN : c.verdict === 'INSUFFICIENT_TRADES' ? YELLOW : RED;
  L.push(paint(`  VERDICT: ${c.verdict}`, vColor));
  if (c.verdict === 'INSUFFICIENT_TRADES') {
    L.push(paint(`  (need ≥ ${MIN_TRADES_FOR_VALIDATION} trades; the fixture spine is too small to validate — backfill required)`, YELLOW));
  }
  L.push('════════════════════════════════════════════════════════════════');
  return L.join('\n');
}
