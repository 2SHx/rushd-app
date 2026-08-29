// Does the basket produce ALPHA, or does it produce BETA?
//
// WHY THIS EXISTS: a 45.80%/yr basket at 47.0%/yr volatility and a 17.64%/yr benchmark at 18.9%
// have almost the same return-per-unit-of-risk. That is the signature of a leveraged market
// exposure, not of security selection. Distinguishing them requires a regression, not a ratio.
//
// This applies the SAME evidentiary bar that killed halal-fast-momentum-core, the concentrated
// momentum book and the gross-profitability book: an effect is not established until its t-statistic
// survives the standard error implied by its own volatility over its own sample length. Those books
// were rejected on this test. It would be dishonest to exempt this one.
//
// Newey-West (Lag 5) standard errors: daily equity returns are mildly autocorrelated and strongly
// heteroskedastic, and OLS standard errors would overstate significance in exactly the direction
// that flatters the result.
//
// Reads ONLY the on-disk archive. No DB writes, no network.
import { readArchive, listArchivedSymbols, type ArchivedBar } from './backfill-alpaca-sip';
import { anchor, declareBasis } from './lib/research-assertions';

const BASKET = (process.argv.find((a) => a.startsWith('--symbols='))?.split('=')[1]
  ?? 'AMD,GOOGL,RKLB,MU,HIMS,MRVL,NVDA,INOD').split(',').map((s) => s.trim().toUpperCase());
const TRADING_DAYS = 252;
const NW_LAG = 5;
/**
 * Cash rate over the window. 2020-11 to 2026-08 spans ZIRP, the 2022-23 hiking cycle and the
 * subsequent cuts; ~3.5% is the approximate average of 3M T-bills across it. Used ONLY to compute
 * a comparable Sharpe — the portfolio itself must not hold interest-bearing instruments, and the
 * zakat treatment is handled separately in QDR-23.
 */
const CASH_RATE = 0.035;

type Series = Map<string, number>;
const series = new Map<string, Series>();
for (const s of listArchivedSymbols()) {
  const a = readArchive(s);
  if (!a?.bars.length) continue;
  const m: Series = new Map();
  for (const b of a.bars as ArchivedBar[]) m.set(b.d, b.c);
  series.set(s, m);
}

function lastBefore(s: Series, d: string): number {
  let best = 0;
  for (const [k, v] of Array.from(s.entries())) if (k < d) best = v;
  return best;
}

function nav(symbols: string[], dates: string[]): number[] {
  const shares = new Map<string, number>();
  const stranded = new Map<string, number>();
  for (const s of symbols) {
    const p0 = series.get(s)?.get(dates[0]);
    if (!p0) throw new Error(`${s}: no bar at ${dates[0]}`);
    shares.set(s, (1 / symbols.length) / p0);
  }
  return dates.map((d) => {
    let v = 0;
    for (const s of symbols) {
      const p = series.get(s)!.get(d);
      if (p !== undefined) v += shares.get(s)! * p;
      else if (stranded.has(s)) v += stranded.get(s)!;
      else { const f = shares.get(s)! * lastBefore(series.get(s)!, d); stranded.set(s, f); v += f; }
    }
    return v;
  });
}

const rets = (n: number[]) => n.slice(1).map((v, i) => v / n[i] - 1);

/** OLS y = a + b*x with Newey-West standard errors. */
function regress(y: number[], x: number[]) {
  const n = y.length;
  const my = y.reduce((a, b) => a + b, 0) / n;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  let sxy = 0; let sxx = 0;
  for (let i = 0; i < n; i += 1) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const beta = sxy / sxx;
  const alpha = my - beta * mx;
  const resid = y.map((v, i) => v - alpha - beta * x[i]);

  // Newey-West meat matrix for the 2x2 OLS sandwich, computed for the intercept term.
  const z = x.map((v) => v - mx); // demeaned regressor -> intercept and slope are orthogonal
  let s0 = 0;
  for (let i = 0; i < n; i += 1) s0 += resid[i] ** 2;
  let varAlphaNW = s0;
  for (let l = 1; l <= NW_LAG; l += 1) {
    const w = 1 - l / (NW_LAG + 1);
    let c = 0;
    for (let i = l; i < n; i += 1) c += resid[i] * resid[i - l];
    varAlphaNW += 2 * w * c;
  }
  const seAlpha = Math.sqrt(varAlphaNW) / n;

  let varBeta = 0;
  for (let i = 0; i < n; i += 1) varBeta += (z[i] * resid[i]) ** 2;
  for (let l = 1; l <= NW_LAG; l += 1) {
    const w = 1 - l / (NW_LAG + 1);
    let c = 0;
    for (let i = l; i < n; i += 1) c += z[i] * resid[i] * z[i - l] * resid[i - l];
    varBeta += 2 * w * c;
  }
  const seBeta = Math.sqrt(varBeta) / sxx;

  const residVar = resid.reduce((a, b) => a + b * b, 0) / (n - 2);
  const totVar = y.reduce((a, b) => a + (b - my) ** 2, 0) / (n - 1);
  return {
    alpha, beta, seAlpha, seBeta,
    tAlpha: alpha / seAlpha,
    tBeta: beta / seBeta,
    r2: 1 - residVar / totVar,
    residVol: Math.sqrt(residVar * TRADING_DAYS),
  };
}

function main() {
  const spus = series.get('SPUS')!;
  const start = BASKET.map((s) => Array.from(series.get(s)!.keys())[0]).reduce((a, b) => (a > b ? a : b));
  const end = Array.from(spus.keys()).reduce((a, b) => (a > b ? a : b));
  const dates = Array.from(spus.keys()).filter((d) => d >= start && d <= end);
  const years = (new Date(end).getTime() - new Date(dates[0]).getTime()) / (365.2425 * 86_400_000);

  const bNav = nav(BASKET, dates);
  const bRet = rets(bNav);
  const cagrB = (bNav[bNav.length - 1] / bNav[0]) ** (1 / years) - 1;
  const volB = Math.sqrt(
    bRet.reduce((a, r) => a + (r - bRet.reduce((p, q) => p + q, 0) / bRet.length) ** 2, 0)
    / (bRet.length - 1) * TRADING_DAYS,
  );

  console.log(`${BASKET.join(', ')}`);
  console.log(`${dates[0]} .. ${end}   ${years.toFixed(2)}y   ${bRet.length} daily observations\n`);
  console.log(`basket  ${(cagrB * 100).toFixed(2)}%/yr   vol ${(volB * 100).toFixed(1)}%   `
    + `Sharpe ${((cagrB - CASH_RATE) / volB).toFixed(2)}`);

  for (const bench of ['SPUS', 'SPY', 'QQQ']) {
    if (!series.get(bench)?.get(dates[0])) continue;
    const mNav = nav([bench], dates);
    const mRet = rets(mNav);
    const cagrM = (mNav[mNav.length - 1] / mNav[0]) ** (1 / years) - 1;
    const mMean = mRet.reduce((a, b) => a + b, 0) / mRet.length;
    const volM = Math.sqrt(mRet.reduce((a, r) => a + (r - mMean) ** 2, 0) / (mRet.length - 1) * TRADING_DAYS);
    const rfD = CASH_RATE / TRADING_DAYS;
    const r = regress(bRet.map((v) => v - rfD), mRet.map((v) => v - rfD));
    const alphaAnn = r.alpha * TRADING_DAYS;

    console.log(`\n--- vs ${bench} (${(cagrM * 100).toFixed(2)}%/yr, vol ${(volM * 100).toFixed(1)}%, `
      + `Sharpe ${((cagrM - CASH_RATE) / volM).toFixed(2)}) ---`);
    console.log(`  beta            ${r.beta.toFixed(3)}   (t=${r.tBeta.toFixed(1)})`);
    console.log(`  alpha           ${(alphaAnn * 100).toFixed(2)}%/yr`);
    console.log(`  t(alpha)        ${r.tAlpha.toFixed(2)}   ${Math.abs(r.tAlpha) > 1.96
      ? 'SIGNIFICANT at 5%' : 'NOT significant at 5% (|t| < 1.96)'}`);
    console.log(`  R^2             ${(r.r2 * 100).toFixed(1)}%`);
    console.log(`  residual vol    ${(r.residVol * 100).toFixed(1)}%/yr`);
    console.log(`  info ratio      ${(alphaAnn / r.residVol).toFixed(2)}`);

    // Decomposition: how much of the excess return is explained by simply carrying beta?
    const explained = r.beta * (cagrM - CASH_RATE);
    console.log(`  DECOMPOSITION of ${((cagrB - CASH_RATE) * 100).toFixed(2)}pp excess return:`);
    console.log(`     beta x market   ${(explained * 100).toFixed(2)}pp   `
      + `(${(explained / (cagrB - CASH_RATE) * 100).toFixed(0)}% of it)`);
    console.log(`     residual        ${((cagrB - CASH_RATE - explained) * 100).toFixed(2)}pp`);
    console.log(`  What ${r.beta.toFixed(2)}x ${bench} alone would have returned: `
      + `${((CASH_RATE + r.beta * (cagrM - CASH_RATE)) * 100).toFixed(2)}%/yr`);
  }

  // How long a track record would be needed to establish an alpha of this size at this vol?
  const spusNav = nav(['SPUS'], dates);
  const rfD = CASH_RATE / TRADING_DAYS;
  const r = regress(bRet.map((v) => v - rfD), rets(spusNav).map((v) => v - rfD));
  const needed = (1.96 * r.residVol / (r.alpha * TRADING_DAYS)) ** 2;
  console.log(`\nYEARS REQUIRED to reach |t|=1.96 at this alpha and residual vol: ${needed.toFixed(1)}`);
  console.log(`Years available:                                                 ${years.toFixed(1)}`);

  declareBasis({
    prices: 'Alpaca SIP adjustment=all (split/dividend-adjusted total-return bars)',
    'risk-free rate': `flat ${(CASH_RATE * 100).toFixed(1)}% — used only for Sharpe/alpha, never held`,
    'standard errors': `Newey-West, lag ${NW_LAG} — plain OLS overstates significance here`,
  });
  const spusCagr = (spusNav[spusNav.length - 1] / spusNav[0]) ** (1 / years) - 1;
  // Same external check as measure-owner-basket.ts: SPUS's own return over this window is known
  // independently of the regression machinery above (~17.6%/yr, agents/objective.json). A miss here
  // means the NAV loop shared by the regression has drifted, and beta/alpha below are not trustworthy.
  anchor('SPUS CAGR over the regression window', spusCagr, 0.176, 0.3);
}

main();
