import { gapperOrbSetup } from './gapperOrb';
import { bollingerMrLongSetup } from './bollingerMrLong';
import { tsMomentumHalalBasketSetup } from './tsMomentumHalalBasket';

export const STRATEGY_SETUP_CATALOG = Object.freeze({
  [gapperOrbSetup.id]: gapperOrbSetup,
  [bollingerMrLongSetup.id]: bollingerMrLongSetup,
  [tsMomentumHalalBasketSetup.id]: tsMomentumHalalBasketSetup,
});
