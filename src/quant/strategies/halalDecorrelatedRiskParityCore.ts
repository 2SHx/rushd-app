// QDR-11 DIVERSIFICATION candidate: `halal-decorrelated-risk-parity-core@v1`.
//
// THE ONE VARIABLE IS THE UNIVERSE RULE. Everything else — the monthly month-end rebalance, the
// inverse-volatility (1/sigma, 252d) sizing, the 20% per-name cap, the 15-name breadth floor, the
// 40-name sleeve size, seed 42 — is `halal-risk-parity-core@v1`, held byte-identical.
//
// It is held identical by DELEGATION rather than by duplication. Every mechanism function below
// calls straight through to `halalRiskParityCoreSetup`, and `defaultParams` is the same frozen
// object, so the arms cannot drift apart in a later edit: there is no second copy to edit. A
// re-implementation "matching" the incumbent would be a second variable waiting to happen, and the
// A/B-isolation diff at seal would not catch a divergence introduced afterwards.
//
// WHERE THE VARIABLE ACTUALLY LIVES: not here. The universe rule is applied by `runLab`, which forms
// a rolling PIT sleeve per QDR-11 and hands the engine a per-session membership set. This setup runs
// TWICE inside one terminal evaluation — once under correlation-balanced selection (treatment) and
// once under the incumbent dollar-volume rule (comparator) — with the same code, same params, same
// series and same policy, differing only in which membership resolver the policy carries.
//
// NO PLATEAU NEIGHBORHOOD, deliberately. QDR-11's plateau gates a mean EFFECTIVE-BET RATIO across
// the sealed {sectorCap} x {poolSize} grid, not an expectancy, and that grid is evaluated from
// per-cell sleeve formations — nine selections, no engine runs. Declaring a profit-plateau here
// would be measured in the wrong unit, and `runLab` refuses the combination outright.
//
// NO RETURN CLAIM IS PERMITTED for this version, anywhere, ever — card, ledger, UI, or copy below.
// Permitted vocabulary: diversification, effective bets, pairwise correlation, book volatility,
// universe-construction rule, sector balance, Sharia compliance.
import type { AnalystSignal, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategySetup,
  UniversePrepareInput,
} from './types';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import {
  HALAL_RISK_PARITY_CORE_V1,
  HalalRiskParityCoreParamsSchema,
  halalRiskParityCoreBookPolicy,
  halalRiskParityCoreSetup,
  type HalalRiskParityCoreParams,
} from './halalRiskParityCore';

/** The incumbent's schema and frozen params, reused so the arms cannot diverge by edit. */
export const HalalDecorrelatedRiskParityCoreParamsSchema = HalalRiskParityCoreParamsSchema;
export type HalalDecorrelatedRiskParityCoreParams = HalalRiskParityCoreParams;
export const HALAL_DECORRELATED_RISK_PARITY_CORE_V1 = HALAL_RISK_PARITY_CORE_V1;

/** Byte-identical to the incumbent's policy; `runLab` adds only the sleeve-membership resolver. */
export function halalDecorrelatedRiskParityCoreBookPolicy(
  params?: HalalDecorrelatedRiskParityCoreParams,
): StrategyBookPolicy {
  return halalRiskParityCoreBookPolicy(params);
}

function paramsOrDefault(
  params?: HalalDecorrelatedRiskParityCoreParams,
): HalalDecorrelatedRiskParityCoreParams {
  return HalalDecorrelatedRiskParityCoreParamsSchema.parse(params ?? HALAL_DECORRELATED_RISK_PARITY_CORE_V1);
}

export const halalDecorrelatedRiskParityCoreSetup: StrategySetup<HalalDecorrelatedRiskParityCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
  plateauNeighborhood?: undefined;
} = {
  id: 'halal-decorrelated-risk-parity-core',
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_DECORRELATED_RISK_PARITY_CORE_V1,

  prepareUniverse(input) { halalRiskParityCoreSetup.prepareUniverse(input); },

  tradableBookSymbols(replayScope, paramSets) {
    return halalRiskParityCoreSetup.tradableBookSymbols!(replayScope, paramSets);
  },

  // Deliberately absent — see the header. The QDR-11 plateau is the sealed sectorCap x poolSize
  // grid, measured in effective-bet ratios by the evidence path, not here.
  plateauNeighborhood: undefined,

  targetWeight(ctx, params) {
    return halalRiskParityCoreSetup.targetWeight!(ctx, paramsOrDefault(params));
  },

  screen(ctx, params) { return halalRiskParityCoreSetup.screen(ctx, paramsOrDefault(params)); },
  entry(ctx, params) { return halalRiskParityCoreSetup.entry(ctx, paramsOrDefault(params)); },
  exit(ctx, params) { return halalRiskParityCoreSetup.exit(ctx, paramsOrDefault(params)); },

  /**
   * The one function NOT delegated. The incumbent's rationale names its own id and describes a
   * "dollar-volume sleeve" — both false here, and the second is a claim about the very universe rule
   * under test. Rewritten in QDR-11's permitted vocabulary, in both locales, with no return,
   * Sharpe, edge, or outperformance language of any kind.
   */
  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params);
    const target = this.targetWeight!(ctx, p);
    const stance: Stance = target !== null && target > 0
      ? 'BULLISH'
      : target === 0 && ctx.positionQty.gt(0) ? 'BEARISH' : 'NEUTRAL';
    const stanceAr = stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة';
    const delegated = halalRiskParityCoreSetup.signal(ctx, p);
    return {
      ...delegated,
      stance,
      rationaleEn: `${this.id} ${p.version}: ${stance}; monthly inverse-volatility (risk-parity) weight, `
        + `capped at ${(p.perNameCap * 100).toFixed(0)}% per name, over a sleeve chosen for LOW PAIRWISE `
        + 'CORRELATION and SECTOR BALANCE instead of dollar volume. No directional signal. This version '
        + 'tests a universe-construction rule only: whether the basket holds more effective bets and '
        + 'swings less. It makes no claim about returns of any kind, in either direction. Research-only.',
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ وزن شهري عكسي للتقلب (تكافؤ المخاطر)، بحد أقصى `
        + `${(p.perNameCap * 100).toFixed(0)}% لكل اسم، على سلة مختارة حسب انخفاض الارتباط الزوجي والتوازن `
        + 'القطاعي بدلًا من حجم التداول. لا إشارة اتجاهية. تختبر هذه النسخة قاعدة اختيار الأسهم فقط: هل '
        + 'تحتوي السلة على عدد أكبر من الرهانات الفعّالة وتقلب أقل. ولا تُقدّم أي ادعاء بشأن العوائد بأي '
        + 'اتجاه. لأغراض البحث فقط.',
    };
  },
};

/** Compile-time proof that the two arms share one params object rather than two equal ones. */
const _sameParams: typeof HALAL_RISK_PARITY_CORE_V1 = HALAL_DECORRELATED_RISK_PARITY_CORE_V1;
void _sameParams;
void (undefined as PlateauNeighborhood<HalalDecorrelatedRiskParityCoreParams> | undefined);
