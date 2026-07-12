import { gapperOrbSetup } from './gapperOrb';
import { stocksInPlayOrbSetup } from './stocksInPlayOrb';
import { bollingerMrLongSetup } from './bollingerMrLong';
import { bollingerMrLongV2Setup } from './bollingerMrLongV2';
import { tsMomentumHalalBasketSetup } from './tsMomentumHalalBasket';
import { tsMomentumHalalBasketV2Setup } from './tsMomentumHalalBasketV2';
import { cointStatArbLongLegSetup } from './cointStatArbLongLeg';

export const STRATEGY_SETUP_CATALOG = Object.freeze({
  [gapperOrbSetup.id]: gapperOrbSetup,
  [stocksInPlayOrbSetup.id]: stocksInPlayOrbSetup,
  [bollingerMrLongSetup.id]: bollingerMrLongSetup,
  [bollingerMrLongV2Setup.id]: bollingerMrLongV2Setup,
  [tsMomentumHalalBasketSetup.id]: tsMomentumHalalBasketSetup,
  [tsMomentumHalalBasketV2Setup.id]: tsMomentumHalalBasketV2Setup,
  [cointStatArbLongLegSetup.id]: cointStatArbLongLegSetup,
});
