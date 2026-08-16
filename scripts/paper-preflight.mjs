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

/** Pure, redacted readiness decision shared by the CLI and focused tests. */
export function evaluateAlpacaPaperPreflight({ baseUrl, account, positions, openOrders, runCap = '500' }) {
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
  if (rows.length > 0) blockers.push('UNRECONCILED_POSITIONS');
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
