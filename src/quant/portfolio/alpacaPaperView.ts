import type { SessionUser } from '@/lib/auth-credentials';
import {
  ALPACA_PAPER_BASE_URL,
  AlpacaPaperBroker,
  isExactAlpacaPaperBaseUrl,
  type AlpacaPaperPortfolioSnapshot,
} from '@/quant/execution/alpacaPaper';

export type AlpacaPaperViewModel =
  | { status: 'hidden' }
  | { status: 'unconfigured' }
  | { status: 'error' }
  | ({ status: 'ready' } & AlpacaPaperPortfolioSnapshot);

function isAuthorizedViewer(user: SessionUser, env: NodeJS.ProcessEnv): boolean {
  if (user.role !== 'PARENT') return false;
  if (env.NODE_ENV === 'development') return true;
  const viewerIds = (env.ALPACA_PORTFOLIO_VIEWER_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return viewerIds.includes(user.id);
}

export async function loadAlpacaPaperView(
  user: SessionUser,
  env: NodeJS.ProcessEnv = process.env,
  loadSnapshot?: () => Promise<AlpacaPaperPortfolioSnapshot>,
): Promise<AlpacaPaperViewModel> {
  if (!isAuthorizedViewer(user, env)) return { status: 'hidden' };

  const baseUrl = env.ALPACA_BASE_URL || ALPACA_PAPER_BASE_URL;
  const isPaperUrl = isExactAlpacaPaperBaseUrl(baseUrl);
  const configured = !!env.ALPACA_API_KEY
    && !!env.ALPACA_API_SECRET
    && env.ALPACA_PAPER !== 'false'
    && isPaperUrl;
  if (!configured) return { status: 'unconfigured' };

  try {
    const snapshot = await (loadSnapshot
      ? loadSnapshot()
      : new AlpacaPaperBroker(env.ALPACA_API_KEY!, env.ALPACA_API_SECRET!, baseUrl).getPortfolioSnapshot());
    return { status: 'ready', ...snapshot };
  } catch {
    console.warn('[alpaca-paper] Portfolio snapshot unavailable.');
    return { status: 'error' };
  }
}
