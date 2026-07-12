import { gapperOrbSetup } from './gapperOrb';
import { stocksInPlayOrbSetup } from './stocksInPlayOrb';
import { bollingerMrLongSetup } from './bollingerMrLong';
import { tsMomentumHalalBasketSetup } from './tsMomentumHalalBasket';
import { cointStatArbLongLegSetup } from './cointStatArbLongLeg';

export const STRATEGY_SETUP_CATALOG = Object.freeze({
  [gapperOrbSetup.id]: gapperOrbSetup,
  [stocksInPlayOrbSetup.id]: stocksInPlayOrbSetup,
  [bollingerMrLongSetup.id]: bollingerMrLongSetup,
  [tsMomentumHalalBasketSetup.id]: tsMomentumHalalBasketSetup,
  [cointStatArbLongLegSetup.id]: cointStatArbLongLegSetup,
});
