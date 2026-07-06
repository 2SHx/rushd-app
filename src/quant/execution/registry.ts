// Rushd Quant — broker registry. Selects the execution adapter by market + key presence,
// defaulting to the InternalSimBroker so the whole path runs keyless (QUANT_DESIGN.md §5).
import type { Market } from '@prisma/client';
import type { BrokerAdapter } from './broker';
import { pickBrokerKind } from './broker';
import { InternalSimBroker } from './internalSim';
import { AlpacaPaperBroker } from './alpacaPaper';

export function selectBroker(market: Market, env: NodeJS.ProcessEnv = process.env): BrokerAdapter {
  if (pickBrokerKind(market, env) === 'ALPACA_PAPER') {
    return new AlpacaPaperBroker(env.ALPACA_API_KEY as string, env.ALPACA_API_SECRET ?? '');
  }
  return new InternalSimBroker();
}
