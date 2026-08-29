import { describe, it, expect } from 'vitest';
import { INCUBATION_BOOKS, INCUBATION_SYMBOLS, completeUniverseAsOf } from '../automation/incubationBooks';
import { BENCHMARK_SYMBOLS, nasdaqIngestRoster } from './ingestRoster';

/**
 * The roster and its consumers had drifted twice without anything noticing, both times producing a
 * successful-looking no-op rather than an error. These are pure tests on purpose: the invariant is
 * about which symbols are ASKED for, which is decidable without a database or a network call.
 */
describe('nasdaq ingest roster', () => {
  it('covers the screened universe and the benchmark ETFs a stock screen cannot produce', () => {
    const roster = new Set(nasdaqIngestRoster());
    // ~217 screened names; the exact count moves with the SPUS fixture, so assert the shape.
    expect(roster.size).toBeGreaterThan(200);
    for (const etf of BENCHMARK_SYMBOLS) expect(roster.has(etf)).toBe(true);
  });

  it('contains no duplicates, so a symbol is never fetched twice per run', () => {
    const roster = nasdaqIngestRoster();
    expect(roster).toHaveLength(new Set(roster).size);
  });

  /**
   * THE TRIPWIRE.
   *
   * `latestAsOf` resolves through `completeUniverseAsOf`, which returns null unless EVERY charter
   * symbol has a bar. A charter symbol outside the ingest roster can therefore never acquire one,
   * and `runDailyIncubationBooks` returns `{processed:false, reason:'no_incubation_market_day'}`
   * with HTTP 200 on every run, forever. That is what was happening: AllocationDecision and
   * BookEvaluation both held zero rows.
   *
   * The nine names below are a REAL UNRESOLVED DEFECT, not an accepted exception. They sit in
   * `NASDAQ_HALAL_UNIVERSE`, a hand-curated list that predates the SPUS-derived screen, and the
   * screen does not return them. Reconciling the two changes a book's investable universe, which
   * changes the strategy and invalidates its frozen validation prior — so it is an owner decision,
   * not a code change.
   *
   * This test pins the gap exactly. It fails if the set GROWS (new drift) and it fails if the set
   * SHRINKS (the decision was made — delete this fence and assert emptiness instead).
   */
  it('pins the unreconciled charter symbols so neither new drift nor a silent fix goes unnoticed', () => {
    const roster = new Set(nasdaqIngestRoster());
    const unreachable = INCUBATION_SYMBOLS.filter((symbol) => !roster.has(symbol)).sort();
    expect(unreachable).toEqual(
      ['AMGN', 'AMZN', 'CMCSA', 'COST', 'HON', 'INTU', 'META', 'NFLX', 'SBUX'],
    );
  });

  it('demonstrates that one unreachable symbol is enough to stall the whole nightly pass', () => {
    const asOf = new Date('2026-08-21T00:00:00.000Z');
    const complete = INCUBATION_SYMBOLS.map((symbol) => ({ symbol, _max: { ts: asOf } }));
    expect(completeUniverseAsOf(INCUBATION_SYMBOLS, complete)).toEqual(asOf);

    // Drop exactly one — the same shape the missing nine produce — and the date resolves to null,
    // which the caller reports as a routine 'no_incubation_market_day' rather than a defect.
    expect(completeUniverseAsOf(INCUBATION_SYMBOLS, complete.slice(1))).toBeNull();
  });

  it('keeps every charter book pointed at a non-empty universe', () => {
    for (const book of INCUBATION_BOOKS) {
      expect(book.universe.length, `${book.bookId} has an empty universe`).toBeGreaterThan(0);
    }
  });
});

/**
 * An ETF holdings file is not a list of securities. SPUS discloses a `CASH&OTHER` line for cash and
 * accrued balances, and it was reaching the tradeable universe — so the scheduled ingest called
 * ingestBars('CASH&OTHER') every run (HTTP 400), and an equal-weight sleeve could have allocated a
 * slot to something that cannot be bought, dying later at execution with `no_market_data`.
 *
 * This pins the shape rule rather than the single symbol: any future non-security line item in the
 * fixture (a futures placeholder, an FX balance) is caught by the same test.
 */
describe('the verified universe contains only tradeable tickers', () => {
  it('admits no non-security line items such as CASH&OTHER', async () => {
    const { buildVerifiedUniverse } = await import('./buildVerifiedUniverse');
    const result = buildVerifiedUniverse();
    const shape = /^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?$/;
    const bad = result.entries.map((e) => e.symbol).filter((s) => !shape.test(s));
    expect(bad).toEqual([]);
    expect(result.entries.map((e) => e.symbol)).not.toContain('CASH&OTHER');
  });

  it('records the exclusion rather than dropping it silently, so counts reconcile', async () => {
    const { buildVerifiedUniverse } = await import('./buildVerifiedUniverse');
    const result = buildVerifiedUniverse();
    expect(result.excluded.some((e) => e.reasonCode === 'not_a_tradeable_security')).toBe(true);
  });

  it('the ingest roster is likewise free of them', () => {
    const roster = nasdaqIngestRoster();
    const shape = /^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?$/;
    expect(roster.filter((s) => !shape.test(s))).toEqual([]);
  });
});
