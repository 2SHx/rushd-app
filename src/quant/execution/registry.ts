// Rushd Quant — generic broker registry. InternalSim is the only currently reachable adapter;
// external paper is reserved for M17's bounded preflight/reconciliation runner.
import type { Market } from '@prisma/client';
import type { BrokerAdapter } from './broker';
import { pickBrokerKind } from './broker';
import { InternalSimBroker } from './internalSim';

export function selectBroker(market: Market, env: NodeJS.ProcessEnv = process.env): BrokerAdapter {
  if (pickBrokerKind(market, env) === 'ALPACA_PAPER') {
    // Generic committee/rebalance routes do not carry M17's current preflight, caps, ownership,
    // and reconciliation proof. The future bounded shadow runner may construct this adapter only
    // after those gates; keeping it unreachable here prevents an env-only bypass.
    throw new Error('ALPACA_PAPER is restricted to the bounded shadow-paper runner');
  }
  return new InternalSimBroker();
}
