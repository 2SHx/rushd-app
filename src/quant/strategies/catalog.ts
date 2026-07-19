import { gapperOrbSetup } from './gapperOrb';
import { stocksInPlayOrbSetup } from './stocksInPlayOrb';
import { bollingerMrLongSetup } from './bollingerMrLong';
import { bollingerMrLongV2Setup } from './bollingerMrLongV2';
import { bollingerMrLongV3Setup } from './bollingerMrLongV3';
import { tsMomentumHalalBasketSetup } from './tsMomentumHalalBasket';
import { tsMomentumHalalBasketV2Setup } from './tsMomentumHalalBasketV2';
import { tsMomentumHalalBasketV3Setup } from './tsMomentumHalalBasketV3';
import { tsMomentumHalalBasketV4Setup } from './tsMomentumHalalBasketV4';
import { cointStatArbLongLegSetup } from './cointStatArbLongLeg';
import { vwapReclaimSetup } from './vwapReclaim';
import { stopHuntReversalLongSetup } from './stopHuntReversalLong';
import { dualMomentumRotationSetup } from './dualMomentumRotation';
import { tomOverlaySetup } from './tomOverlay';
import { g6bLinearFactorSetup } from './g6bLinearFactor';
import { g6bLinearFactorWideSetup } from './g6bLinearFactorWide';

export const STRATEGY_SETUP_CATALOG = Object.freeze({
  [gapperOrbSetup.id]: gapperOrbSetup,
  [stocksInPlayOrbSetup.id]: stocksInPlayOrbSetup,
  [vwapReclaimSetup.id]: vwapReclaimSetup,
  [stopHuntReversalLongSetup.id]: stopHuntReversalLongSetup,
  [bollingerMrLongSetup.id]: bollingerMrLongSetup,
  [bollingerMrLongV2Setup.id]: bollingerMrLongV2Setup,
  [bollingerMrLongV3Setup.id]: bollingerMrLongV3Setup,
  [tsMomentumHalalBasketSetup.id]: tsMomentumHalalBasketSetup,
  [tsMomentumHalalBasketV2Setup.id]: tsMomentumHalalBasketV2Setup,
  [tsMomentumHalalBasketV3Setup.id]: tsMomentumHalalBasketV3Setup,
  [tsMomentumHalalBasketV4Setup.id]: tsMomentumHalalBasketV4Setup,
  [cointStatArbLongLegSetup.id]: cointStatArbLongLegSetup,
  [dualMomentumRotationSetup.id]: dualMomentumRotationSetup,
  [tomOverlaySetup.id]: tomOverlaySetup,
  [g6bLinearFactorSetup.id]: g6bLinearFactorSetup,
  [g6bLinearFactorWideSetup.id]: g6bLinearFactorWideSetup,
});
