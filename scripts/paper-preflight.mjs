export const ALPACA_PAPER_BASE_URL = 'https://paper-api.alpaca.markets';

function decimalSign(value) {
  const normalized = String(value ?? '').trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const negative = normalized.startsWith('-');
  const digits = normalized.replace('-', '').replace('.', '').replace(/^0+/, '');
  if (!digits) return 0;
  return negative ? -1 : 1;
}

function decimalParts(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  return { whole: whole.replace(/^0+(?=\d)/, ''), fraction: fraction.replace(/0+$/, '') };
}

function decimalGte(left, right) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (!a || !b) return false;
  if (a.whole.length !== b.whole.length) return a.whole.length > b.whole.length;
  if (a.whole !== b.whole) return a.whole > b.whole;
  const width = Math.max(a.fraction.length, b.fraction.length);
  return a.fraction.padEnd(width, '0') >= b.fraction.padEnd(width, '0');
}

/** Exact-quantity decimal -> signed BigInt micro-units (6dp, matching the Decimal(18,6) qty
 * columns). Returns null on anything unparseable or with more than 6 fractional digits, so a
 * mismatch in precision fails closed rather than silently truncating. */
function toMicroUnits(value) {
  const normalized = String(value ?? '').trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return null;
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > 6) return null;
  const micros = BigInt(whole + fraction.padEnd(6, '0'));
  return sign === '-' ? -micros : micros;
}

/**
 * A broker-reported position counts as "ours" (reconciled) ONLY when:
 *  - its side is 'long' (a 'short' — or any non-long/unparseable side — is never reconcilable,
 *    unconditionally: we could never legitimately have created one under the Sharia charter), AND
 *  - the net of OUR durable FILLED order records for that exact symbol (BUY adds, SELL subtracts)
 *    equals the broker-reported qty EXACTLY.
 * Any ambiguity — malformed qty on either side, an unrecognized order side in our own records —
 * fails closed (not reconciled), never defaults to "trust it".
 */
function isPositionReconciled(position, ourFilledOrders) {
  const side = String(position?.side ?? '').toLowerCase();
  if (side !== 'long') return false;
  const symbol = String(position?.symbol ?? '');
  if (!symbol) return false;
  const positionQty = toMicroUnits(position?.qty);
  if (positionQty === null || positionQty < 0n) return false;

  let net = 0n;
  for (const order of ourFilledOrders) {
    if (String(order?.symbol ?? '') !== symbol) continue;
    const orderSide = String(order?.side ?? '').toUpperCase();
    const qty = toMicroUnits(order?.qty);
    if (qty === null || qty < 0n) return false;
    if (orderSide === 'BUY') net += qty;
    else if (orderSide === 'SELL') net -= qty;
    else return false;
  }
  return net === positionQty;
}

export function isExactAlpacaPaperUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === ALPACA_PAPER_BASE_URL
      && (url.pathname === '/' || url.pathname === '')
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

/**
 * Pure, redacted readiness decision shared by the CLI and focused tests.
 *
 * `ourFilledOrders` is OUR durable evidence — every FILLED ShadowPaperOrder record the caller
 * has for this exact account (fetched by the caller, e.g. from Postgres; this function stays
 * pure and never reaches out itself). A broker-reported position only counts as "reconciled"
 * (accounted for) when it nets exactly against this evidence; "UNRECONCILED_POSITIONS" now means
 * "we hold no matching durable record for this position", not merely "a position exists".
 *
 * @param {{ baseUrl: string, account: unknown, positions: unknown[], openOrders: unknown[],
 *   runCap?: string, ourFilledOrders?: Array<{ symbol: string, side: string, qty: string }> }} args
 */
export function evaluateAlpacaPaperPreflight({
  baseUrl, account, positions, openOrders, runCap = '500', ourFilledOrders,
}) {
  const blockers = [];
  if (!isExactAlpacaPaperUrl(baseUrl)) blockers.push('NON_PAPER_ENDPOINT');
  if (String(account?.status ?? '').toUpperCase() !== 'ACTIVE') blockers.push('ACCOUNT_NOT_ACTIVE');
  if (String(account?.currency ?? '').toUpperCase() !== 'USD') blockers.push('ACCOUNT_NOT_USD');
  if (account?.trading_blocked !== false) blockers.push('TRADING_BLOCKED');

  const cashSign = decimalSign(account?.cash);
  if (cashSign === null) blockers.push('INVALID_CASH');
  else if (cashSign !== 1) blockers.push('NON_POSITIVE_CASH');
  else if (!decimalGte(account.cash, runCap)) blockers.push('CASH_BELOW_RUN_CAP');

  if (!Array.isArray(positions)) blockers.push('INVALID_POSITIONS');
  if (!Array.isArray(openOrders)) blockers.push('INVALID_OPEN_ORDERS');
  const rows = Array.isArray(positions) ? positions : [];
  const ownRecords = Array.isArray(ourFilledOrders) ? ourFilledOrders : [];
  if (rows.some((row) => !isPositionReconciled(row, ownRecords))) blockers.push('UNRECONCILED_POSITIONS');
  if (rows.some((row) => String(row?.side ?? '').toLowerCase() === 'short' || decimalSign(row?.qty) === -1)) {
    blockers.push('SHORT_POSITION');
  }
  if (Array.isArray(openOrders) && openOrders.length > 0) blockers.push('OPEN_ORDERS');

  return {
    ready: blockers.length === 0,
    blockers,
    account: {
      status: String(account?.status ?? 'UNKNOWN'),
      currency: String(account?.currency ?? 'UNKNOWN'),
      cash: String(account?.cash ?? 'UNKNOWN'),
      buyingPower: String(account?.buying_power ?? 'UNKNOWN'),
      tradingBlocked: account?.trading_blocked !== false,
    },
    positionCount: rows.length,
    openOrderCount: Array.isArray(openOrders) ? openOrders.length : 0,
  };
}
