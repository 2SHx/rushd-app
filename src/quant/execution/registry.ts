// Rushd Quant — generic broker registry. InternalSim is the only currently reachable adapter;
// external paper is reserved for M17's bounded preflight/reconciliation runner.
import type { Market } from '@prisma/client';
import type { BrokerAdapter } from './broker';
import { pickBrokerKind } from './broker';
import { InternalSimBroker } from './internalSim';
import { AlpacaPaperBroker, ALPACA_PAPER_BASE_URL, isExactAlpacaPaperBaseUrl } from './alpacaPaper';

export function selectBroker(market: Market, env: NodeJS.ProcessEnv = process.env): BrokerAdapter {
  if (pickBrokerKind(market, env) === 'ALPACA_PAPER') {
    // Generic committee/rebalance routes do not carry M17's current preflight, caps, ownership,
    // and reconciliation proof. The future bounded shadow runner may construct this adapter only
    // after those gates; keeping it unreachable here prevents an env-only bypass.
    throw new Error('ALPACA_PAPER is restricted to the bounded shadow-paper runner');
  }
  return new InternalSimBroker();
}

/**
 * M17/DR-11 bounded-runner-only construction path. NOT exported for/used by selectBroker's
 * callers (committee, rebalance, executeDecision's default path, /api/quant/execute) — only
 * src/quant/execution/shadowPaperRunner.ts may call this. Reuses pickBrokerKind's existing
 * key/market/exact-URL checks and adds the explicit mutation flag + a belt-and-suspenders exact
 * paper-host re-check, so an env misconfiguration fails closed here too, not only in pickBrokerKind.
 */
export function selectShadowPaperBroker(env: NodeJS.ProcessEnv = process.env): AlpacaPaperBroker {
  if (env.QUANT_SHADOW_PAPER_MUTATIONS !== '1') {
    throw new Error('ALPACA_PAPER mutations are disabled (set QUANT_SHADOW_PAPER_MUTATIONS=1)');
  }
  const kind = pickBrokerKind('NASDAQ', env);
  if (kind !== 'ALPACA_PAPER') {
    throw new Error(`Shadow-paper runner requires ALPACA_PAPER to be selected (resolved ${kind})`);
  }
  const baseUrl = env.ALPACA_BASE_URL || ALPACA_PAPER_BASE_URL;
  if (!isExactAlpacaPaperBaseUrl(baseUrl)) {
    throw new Error('Shadow-paper runner requires the exact Alpaca paper host');
  }
  return new AlpacaPaperBroker(env.ALPACA_API_KEY as string, env.ALPACA_API_SECRET as string, baseUrl);
}
