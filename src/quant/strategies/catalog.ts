import { gapperOrbSetup } from './gapperOrb';
import { bollingerMrLongSetup } from './bollingerMrLong';

export const STRATEGY_SETUP_CATALOG = Object.freeze({
  [gapperOrbSetup.id]: gapperOrbSetup,
  [bollingerMrLongSetup.id]: bollingerMrLongSetup,
});
