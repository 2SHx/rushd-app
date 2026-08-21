import { describe, expect, it } from 'vitest';
import { computeMetrics, computePortfolioMetrics, type PortfolioEquityPoint } from './metrics';
import { bootstrapTradeOutcomes, signFlipPermutationTest } from './monteCarlo';

/**
 * QDR-19 ADDITIVITY PIN.
 *
 * QDR-19 adds MANDATORY PUBLISHED EVIDENCE and NOTHING ELSE: "no existing output may change
 * byte-for-byte". These strings were captured by running the PRE-QDR-19 implementations
 * (`git show HEAD:src/quant/backtest/{metrics,monteCarlo}.ts` at commit b0a3641) against the exact
 * deterministic curve rebuilt below, and are asserted as whole-object JSON — so a reordered key, a
 * renamed field or a moved decimal all fail, not just a changed number.
 *
 * The same comparison was additionally run live against the HEAD sources over 200 random equity
 * curves (both annualization modes), 200 portfolio curves, 200 capture-ratio pairs, 60 bootstraps
 * (iid and moving-block) and 40 permutation/monthly-block runs; every one was byte-identical. This
 * file is the permanent residue of that check — the frozen HEAD copies are deliberately NOT kept in
 * the tree, because a duplicated implementation drifts and starts lying.
 */
const day = (n: number): Date => new Date(2024, 0, 1 + n);

/** Deterministic LCG — no RNG dependency, no snapshot file, reproducible on any machine. */
function fixtureCurve(): PortfolioEquityPoint[] {
  let s = 2026;
  const rng = (): number => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const curve: PortfolioEquityPoint[] = [{ ts: day(0), equity: 100, cash: 10, spy: 100, spus: 100 }];
  for (let i = 1; i < 260; i++) {
    const p = curve[i - 1];
    curve.push({
      ts: day(i),
      equity: p.equity * (1 + (rng() - 0.47) * 0.05),
      cash: 10,
      spy: p.spy * (1 + (rng() - 0.49) * 0.02),
      spus: p.spus * (1 + (rng() - 0.49) * 0.03),
    });
  }
  return curve;
}

const GOLDEN_METRICS_FIXED = "{\"cagr\":1.249872035943174,\"sharpe\":2.552981992649326,\"deflatedSharpe\":0.5857843232289484,\"maxDrawdown\":0.12110972482025043,\"hitRate\":0.5521235521235521,\"trades\":123,\"turnover\":4.5,\"implausible\":false}";
const GOLDEN_METRICS_CALENDAR = "{\"cagr\":1.249872035943174,\"sharpe\":3.073566354572974,\"deflatedSharpe\":0.5857843232289484,\"maxDrawdown\":0.12110972482025043,\"hitRate\":0.5521235521235521,\"trades\":123,\"turnover\":4.5,\"implausible\":true}";
const GOLDEN_PORTFOLIO = "{\"cagr\":1.249872035943174,\"sharpe\":2.548048689503056,\"deflatedSharpe\":0.5838743379133648,\"maxDrawdown\":0.12110972482025043,\"hitRate\":0.5521235521235521,\"trades\":123,\"turnover\":4.5,\"alphaVsSpy\":1.208831019626048,\"alphaVsSpus\":1.4824761052892799,\"irVsSpy\":0.14326456951356356,\"irVsSpus\":0.1783900896291943,\"trackingErrorVsSpy\":0.24377204256401616,\"trackingErrorVsSpus\":0.2681970118402059,\"upCaptureVsSpy\":0.6486706792652983,\"upCaptureVsSpus\":0.34293915471384717,\"downCaptureVsSpy\":-0.2633307998411038,\"downCaptureVsSpus\":-0.2740097043391909}";
const GOLDEN_BOOTSTRAP_IID = "{\"resamples\":1000,\"tradesPerPath\":259,\"method\":\"iid\",\"finalEquity\":{\"p5\":121878.60676701843,\"p50\":179312.16875769547,\"p95\":257391.65041224143},\"maxDrawdown\":{\"p5\":0.0766908440954392,\"p50\":0.1229953196463345,\"p95\":0.1982747382949007},\"riskOfRuin\":0}";
const GOLDEN_BOOTSTRAP_BLOCK20 = "{\"resamples\":1000,\"tradesPerPath\":259,\"method\":\"moving-block\",\"finalEquity\":{\"p5\":124471.6661072561,\"p50\":170326.43041486613,\"p95\":223136.96041244332},\"maxDrawdown\":{\"p5\":0.07600598246569289,\"p50\":0.1054843569457721,\"p95\":0.17482661690409707},\"riskOfRuin\":0,\"observationUnit\":\"book-day\",\"blockLength\":20}";
const GOLDEN_BOOTSTRAP_BLOCK1 = "{\"resamples\":1000,\"tradesPerPath\":259,\"method\":\"moving-block\",\"finalEquity\":{\"p5\":121878.60676701843,\"p50\":179312.16875769547,\"p95\":257391.65041224143},\"maxDrawdown\":{\"p5\":0.0766908440954392,\"p50\":0.1229953196463345,\"p95\":0.1982747382949007},\"riskOfRuin\":0,\"observationUnit\":\"book-day\",\"blockLength\":1}";
const GOLDEN_PERMUTATION = "{\"observedMean\":0.0023270453301197386,\"pValue\":0.004,\"permutations\":1000,\"method\":\"independent-sign-flip\"}";

describe('QDR-19 is purely additive — pre-QDR-19 outputs are byte-identical', () => {
  const curve = fixtureCurve();
  const bookDayReturns = curve.slice(1).map((p, i) => p.equity / curve[i].equity - 1);
  const opts = { trades: 123, turnover: 4.5, trials: 60 };

  it('computeMetrics (fixed and calendar annualization) is unchanged', () => {
    expect(JSON.stringify(computeMetrics(curve, opts))).toBe(GOLDEN_METRICS_FIXED);
    expect(JSON.stringify(computeMetrics(curve, { ...opts, annualization: 'calendar' })))
      .toBe(GOLDEN_METRICS_CALENDAR);
  });

  it('computePortfolioMetrics — including every benchmark-relative field — is unchanged', () => {
    expect(JSON.stringify(computePortfolioMetrics(curve, opts))).toBe(GOLDEN_PORTFOLIO);
  });

  it('bootstrapTradeOutcomes percentiles for a fixed seed are unchanged, ulcerIndex aside', () => {
    // The new `ulcerIndex` block is derived from the already-drawn path indices and consumes no
    // extra RNG, so `finalEquity`/`maxDrawdown`/`riskOfRuin` for a seed cannot move. Stripping it
    // must reproduce the pre-QDR-19 object exactly — key order included.
    const strip = (r: ReturnType<typeof bootstrapTradeOutcomes>): string => {
      const { ulcerIndex, ...rest } = r;
      expect(ulcerIndex).toBeDefined();
      return JSON.stringify(rest);
    };
    expect(strip(bootstrapTradeOutcomes(bookDayReturns, { seed: 42, resamples: 1000 })))
      .toBe(GOLDEN_BOOTSTRAP_IID);
    expect(strip(bootstrapTradeOutcomes(bookDayReturns, {
      seed: 42, resamples: 1000, observationUnit: 'book-day', blockLength: 20,
    }))).toBe(GOLDEN_BOOTSTRAP_BLOCK20);
    // QDR-16's IID disclosure is `blockLength: 1`, which IS iid — already shipped, not duplicated.
    expect(strip(bootstrapTradeOutcomes(bookDayReturns, {
      seed: 42, resamples: 1000, observationUnit: 'book-day', blockLength: 1,
    }))).toBe(GOLDEN_BOOTSTRAP_BLOCK1);
  });

  it('signFlipPermutationTest is unchanged', () => {
    expect(JSON.stringify(signFlipPermutationTest(bookDayReturns, { seed: 42, permutations: 1000 })))
      .toBe(GOLDEN_PERMUTATION);
  });

  it('the bootstrap Ulcer percentiles are ordered and bounded by the max-drawdown percentiles', () => {
    const r = bootstrapTradeOutcomes(bookDayReturns, {
      seed: 42, resamples: 1000, observationUnit: 'book-day', blockLength: 20,
    });
    const ui = r.ulcerIndex;
    expect(ui).toBeDefined();
    expect(ui!.p5).toBeLessThanOrEqual(ui!.p50);
    expect(ui!.p50).toBeLessThanOrEqual(ui!.p95);
    expect(ui!.p5).toBeGreaterThanOrEqual(0);
    // Ulcer is an RMS over the whole path; max drawdown is that path's single worst point, so the
    // former can never exceed the latter. A violation means the accumulator is wrong.
    expect(ui!.p95).toBeLessThanOrEqual(r.maxDrawdown.p95 + 1e-12);
  });
});
