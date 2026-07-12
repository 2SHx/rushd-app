import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const finite = z.number().finite();
const ratio = finite.min(0).max(1);
const nonNegative = finite.min(0);
const whole = z.number().finite().int().nonnegative();
const optionalFinite = finite.optional().transform((value) => value ?? null);
const optionalRatio = ratio.optional().transform((value) => value ?? null);
const optionalNonNegative = nonNegative.optional().transform((value) => value ?? null);
const optionalWhole = whole.optional().transform((value) => value ?? null);

const metricsSchema = z.object({
  cagr: finite.min(-1),
  sharpe: finite,
  deflatedSharpe: ratio,
  maxDrawdown: ratio,
  hitRate: ratio,
  trades: whole,
  turnover: nonNegative,
  implausible: z.boolean(),
});

const finalEquityPercentilesSchema = z.object({ p5: optionalNonNegative, p50: optionalNonNegative, p95: optionalNonNegative });
const drawdownPercentilesSchema = z.object({ p5: optionalRatio, p50: optionalRatio, p95: optionalRatio });

const rejectionReasonSchema = z.enum([
  'INSUFFICIENT_SAMPLE',
  'OOS_FAILURE',
  'DSR_FAILURE',
  'DRAWDOWN_RISK_FAILURE',
  'IMPLAUSIBLE_RESULT',
  'NO_PROFIT_PLATEAU_OVERFIT',
  'SHARIA_NON_COMPLIANT',
  'SHARIA_UNVERIFIABLE',
  'DATA_QUALITY_PIT_FAILURE',
  'REPRODUCIBILITY_FAILURE',
]);

const comparisonPointSchema = z.object({
  ts: z.string().datetime(),
  value: nonNegative,
});
const comparisonSchema = z.object({
  basis: z.literal('NORMALIZED_100_WEEKLY_CLOSE_PRICE_NO_DIVIDENDS'),
  strategyKind: z.literal('POOLED_TRADE_SEQUENCED_SIMULATED_EQUITY'),
  benchmarkKind: z.literal('ETF_CLOSE_PRICE_PROXY'),
  start: z.string().datetime(),
  end: z.string().datetime(),
  oosStart: z.string().datetime(),
  sources: z.object({
    spy: z.array(z.enum(['YAHOO', 'ALPACA'])).min(1),
    spus: z.array(z.enum(['YAHOO', 'ALPACA'])).min(1),
  }),
  series: z.object({
    model: z.array(comparisonPointSchema).min(2),
    spy: z.array(comparisonPointSchema).min(2),
    spus: z.array(comparisonPointSchema).min(2),
  }),
}).superRefine((comparison, context) => {
  const start = Date.parse(comparison.start);
  const end = Date.parse(comparison.end);
  const ordered = start < end && Object.values(comparison.series).every((series) => (
    series[0].ts === comparison.start
    && series.at(-1)?.ts === comparison.end
    && Math.abs(series[0].value - 100) < 1e-9
    && series.every((point, index) => index === 0 || Date.parse(point.ts) > Date.parse(series[index - 1].ts))
  ));
  if (!ordered) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'comparison series must share ordered normalized endpoints' });
  }
});

const reportCardSchema = z.object({
  setup: z.string().min(1),
  symbols: z.array(z.string().min(1)).min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  dataFeed: z.enum(['alpaca-iex', 'fixtures-real', 'yahoo-short-history', 'yahoo-daily']),
  seed: whole,
  gitSha: z.string().min(1),
  full: metricsSchema,
  oos: metricsSchema,
  distribution: z.object({
    count: optionalWhole,
    mean: optionalFinite,
    std: optionalNonNegative,
    min: optionalFinite,
    max: optionalFinite,
    probDayGe5pct: optionalRatio,
    probDayLe5pct: optionalRatio,
  }),
  bootstrap: z.object({
    resamples: optionalWhole,
    tradesPerPath: optionalWhole,
    finalEquity: finalEquityPercentilesSchema,
    maxDrawdown: drawdownPercentilesSchema,
    riskOfRuin: optionalRatio,
  }),
  permutation: z.object({
    observedMean: optionalFinite,
    pValue: optionalRatio,
    permutations: optionalWhole,
  }),
  checklist: z.object({
    walkForward: z.boolean(),
    oosHoldoutPct: optionalRatio,
    oosHoldoutOk: z.boolean(),
    enoughTrades: z.boolean(),
    deflatedSharpeOk: z.boolean(),
    profitPlateau: z.boolean(),
    mcMaxDDWithinBreaker: z.boolean(),
    mcRiskOfRuinWithinLimit: z.boolean(),
    dataQualityPitOk: z.boolean(),
    reproducible: z.boolean(),
  }),
  shariaState: z.enum([
    'VERIFIED_COMPLIANT',
    'VERIFIED_NON_COMPLIANT',
    'UNSCREENED_EXECUTION_BLOCKED',
    'UNVERIFIED',
  ]),
  status: z.enum(['ACCEPTED', 'REJECTED']),
  rejectionReasonCodes: z.array(rejectionReasonSchema),
  acceptanceMeaning: z.literal('AUTO_PAPER_ADMISSION_ONLY'),
  comparison: comparisonSchema.nullish().transform((value) => value ?? null),
}).superRefine((card, context) => {
  const numericChecklistConsistent = card.checklist.enoughTrades === (card.full.trades >= 100)
    && card.checklist.deflatedSharpeOk === (card.oos.deflatedSharpe > 0.95)
    && card.checklist.oosHoldoutOk === (card.checklist.oosHoldoutPct !== null && card.checklist.oosHoldoutPct >= 0.2)
    && (!card.checklist.mcMaxDDWithinBreaker || card.bootstrap.maxDrawdown.p95 !== null)
    && (!card.checklist.mcRiskOfRuinWithinLimit || card.bootstrap.riskOfRuin !== null);
  if (!numericChecklistConsistent) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'promotion checklist conflicts with persisted numeric evidence' });
  }

  const expected: Array<z.infer<typeof rejectionReasonSchema>> = [];
  if (!card.checklist.enoughTrades) expected.push('INSUFFICIENT_SAMPLE');
  if (!card.checklist.walkForward || !card.checklist.oosHoldoutOk || card.oos.cagr <= 0) expected.push('OOS_FAILURE');
  if (!card.checklist.deflatedSharpeOk) expected.push('DSR_FAILURE');
  if (!card.checklist.mcMaxDDWithinBreaker || !card.checklist.mcRiskOfRuinWithinLimit) expected.push('DRAWDOWN_RISK_FAILURE');
  if (card.full.implausible || card.oos.implausible) expected.push('IMPLAUSIBLE_RESULT');
  if (!card.checklist.profitPlateau) expected.push('NO_PROFIT_PLATEAU_OVERFIT');
  if (card.shariaState === 'VERIFIED_NON_COMPLIANT') expected.push('SHARIA_NON_COMPLIANT');
  if (card.shariaState === 'UNSCREENED_EXECUTION_BLOCKED' || card.shariaState === 'UNVERIFIED') expected.push('SHARIA_UNVERIFIABLE');
  if (!card.checklist.dataQualityPitOk) expected.push('DATA_QUALITY_PIT_FAILURE');
  if (!card.checklist.reproducible) expected.push('REPRODUCIBILITY_FAILURE');

  const sameReasons = expected.length === card.rejectionReasonCodes.length
    && expected.every((reason, index) => reason === card.rejectionReasonCodes[index]);
  const expectedStatus = expected.length === 0 ? 'ACCEPTED' : 'REJECTED';
  if (!sameReasons || card.status !== expectedStatus) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'terminal status and ordered reasons must match persisted evidence' });
  }
});

type ParsedReportCard = z.infer<typeof reportCardSchema>;

export interface StrategyLeagueTeam extends Omit<ParsedReportCard, 'setup'> {
  runId: string;
  setupId: string;
  createdAt: string;
}

/** DB-only terminal research cards, newest valid run per setup. */
export async function loadStrategyLeagueViewModel(): Promise<{ teams: StrategyLeagueTeam[] }> {
  const rows = await prisma.backtestRun.findMany({
    where: { strategyId: null },
    select: { id: true, metrics: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const seen = new Set<string>();
  const teams: StrategyLeagueTeam[] = [];

  for (const row of rows) {
    const parsed = reportCardSchema.safeParse(row.metrics);
    if (!parsed.success || seen.has(parsed.data.setup)) continue;
    seen.add(parsed.data.setup);
    const { setup, ...card } = parsed.data;
    teams.push({ runId: row.id, setupId: setup, createdAt: row.createdAt.toISOString(), ...card });
  }

  return { teams };
}
