// Enrich existing Fundamentals.metrics with point-in-time SEC share counts. This deliberately
// updates JSON only: no rows, columns, or migrations are added. Safe to rerun; identical values
// are skipped. SEC `filed` gates visibility, never the fiscal period `end`.
import { Prisma, PrismaClient } from '@prisma/client';
import { loadTickerToCik, fetchPitFundamentalsHistory } from '../src/quant/data/pitFundamentalsFetch';

process.loadEnvFile?.('.env');
const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function coverage() {
  const rows = await prisma.fundamentals.findMany({
    select: { symbol: true, releasedAt: true, metrics: true },
  });
  let rowsWithShares = 0;
  const symbols = new Set<string>();
  let lookaheadViolations = 0;
  let invalidFactOrder = 0;
  for (const row of rows) {
    const metrics = row.metrics as Record<string, unknown>;
    const shares = metrics.sharesOutstanding;
    const filedAt = metrics.sharesOutstandingFiledAt;
    const measuredAt = metrics.sharesOutstandingAsOf;
    if (typeof shares !== 'number' || !Number.isFinite(shares) || shares <= 0) continue;
    rowsWithShares++;
    symbols.add(row.symbol);
    if (typeof filedAt !== 'string' || filedAt > dateKey(row.releasedAt)) lookaheadViolations++;
    if (typeof measuredAt !== 'string' || typeof filedAt !== 'string' || measuredAt > filedAt) invalidFactOrder++;
  }
  return { totalRows: rows.length, rowsWithShares, symbolsWithShares: symbols.size, lookaheadViolations, invalidFactOrder };
}

async function workedExample() {
  const price = await prisma.marketBar.findFirst({
    where: { symbol: 'AAPL', market: 'NASDAQ', interval: 'DAY', source: { in: ['YAHOO', 'ALPACA'] } },
    orderBy: { ts: 'desc' },
    select: { ts: true, close: true },
  });
  if (!price) return null;
  const row = await prisma.fundamentals.findFirst({
    where: { symbol: 'AAPL', market: 'NASDAQ', releasedAt: { lte: price.ts } },
    orderBy: [{ releasedAt: 'desc' }, { asOf: 'desc' }],
    select: { asOf: true, releasedAt: true, period: true, metrics: true },
  });
  if (!row) return null;
  const metrics = row.metrics as Record<string, unknown>;
  const shares = typeof metrics.sharesOutstanding === 'number' ? metrics.sharesOutstanding : null;
  const close = Number(price.close);
  return {
    symbol: 'AAPL',
    decisionDate: dateKey(price.ts),
    fundamentalsPeriod: row.period,
    fiscalPeriodEnd: dateKey(row.asOf),
    sharesOutstanding: shares,
    sharesFiledAt: metrics.sharesOutstandingFiledAt ?? null,
    priceUsd: close,
    marketCapUsd: shares === null ? null : shares * close,
  };
}

async function main(): Promise<void> {
  const delayMs = Number.parseInt(arg('delay-ms') ?? '300', 10);
  const concurrency = Number.parseInt(arg('concurrency') ?? '4', 10);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new Error('--concurrency must be an integer from 1 through 4');
  }
  // Each issuer starts two SEC requests in parallel. Bound starts below 10 requests/second even
  // when responses are instantaneous; ordinary network latency makes the observed rate lower.
  const pacedDelayMs = Math.max(delayMs, Math.ceil((concurrency * 2 * 1_000) / 8));
  const cliSymbols = process.argv.slice(2).filter((value) => !value.startsWith('--')).map((value) => value.toUpperCase());
  const existingSymbols = await prisma.fundamentals.findMany({ distinct: ['symbol'], select: { symbol: true } });
  const symbols = cliSymbols.length ? cliSymbols : existingSymbols.map(({ symbol }) => symbol).sort();
  const before = await coverage();
  const tickerMap = await loadTickerToCik();
  let updatedRows = 0;
  const skipped = new Map<string, number>();
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < symbols.length) {
      const symbol = symbols[nextIndex++];
      const cik = tickerMap.get(symbol);
      if (!cik) {
        skipped.set('no_cik', (skipped.get('no_cik') ?? 0) + 1);
        continue;
      }
      const { filings, skips } = await fetchPitFundamentalsHistory(symbol, cik);
      for (const skip of skips) skipped.set(skip.reasonCode, (skipped.get(skip.reasonCode) ?? 0) + 1);
      const sharesByRow = new Map(filings.map((filing) => [
        `${filing.period}|${filing.asOf}`,
        filing.metrics,
      ]));
      const rows = await prisma.fundamentals.findMany({
        where: { symbol, market: 'NASDAQ' },
        select: { id: true, asOf: true, period: true, metrics: true },
      });
      const updates = rows.flatMap((row) => {
        const shares = sharesByRow.get(`${row.period}|${dateKey(row.asOf)}`);
        if (!shares?.sharesOutstanding) return [];
        const metrics = row.metrics as Record<string, unknown>;
        if (
          metrics.sharesOutstanding === shares.sharesOutstanding
          && metrics.sharesOutstandingFiledAt === shares.sharesOutstandingFiledAt
          && metrics.sharesOutstandingAsOf === shares.sharesOutstandingAsOf
        ) return [];
        return [prisma.fundamentals.update({
          where: { id: row.id },
          data: {
            metrics: {
              ...metrics,
              sharesOutstanding: shares.sharesOutstanding,
              sharesOutstandingFiledAt: shares.sharesOutstandingFiledAt,
              sharesOutstandingAsOf: shares.sharesOutstandingAsOf,
            } as Prisma.InputJsonValue,
          },
        })];
      });
      if (updates.length) {
        await prisma.$transaction(updates);
        updatedRows += updates.length;
      }
      console.log(`${symbol}: filings=${filings.length} enriched=${updates.length}`);
      await sleep(pacedDelayMs);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const after = await coverage();
  console.log(JSON.stringify({
    symbolsProcessed: symbols.length,
    concurrency,
    pacedDelayMs,
    updatedRows,
    rowCountUnchanged: before.totalRows === after.totalRows,
    before,
    after,
    skipReasons: Object.fromEntries(skipped),
    workedExample: await workedExample(),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
