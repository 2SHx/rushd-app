import {
  BOLLINGER_MR_LONG_V2_CURRICULUM,
  compileBollingerMrLongV2Policy,
  type StrategyLearningAnswer,
  type StrategyLearningQuestion,
} from './bollingerMrLongV2Curriculum';
import {
  TS_MOMENTUM_HALAL_BASKET_V2_CURRICULUM,
  compileTsMomentumHalalBasketV2Policy,
} from './tsMomentumHalalBasketV2Curriculum';
import {
  TS_MOMENTUM_HALAL_BASKET_V3_CURRICULUM,
  compileTsMomentumHalalBasketV3Policy,
} from './tsMomentumHalalBasketV3Curriculum';
import { TOM_OVERLAY_CURRICULUM, compileTomOverlayPolicy } from './tomOverlayCurriculum';
import { DUAL_MOMENTUM_ROTATION_CURRICULUM, compileDualMomentumRotationPolicy } from './dualMomentumRotationCurriculum';
import { STOCKS_IN_PLAY_ORB_CURRICULUM, compileStocksInPlayOrbPolicy } from './stocksInPlayOrbCurriculum';
import { VWAP_RECLAIM_CURRICULUM, compileVwapReclaimPolicy } from './vwapReclaimCurriculum';
import { STOP_HUNT_REVERSAL_CURRICULUM, compileStopHuntReversalPolicy } from './stopHuntReversalCurriculum';
import {
  loadBollingerMrLongV2LearningFixture,
  loadTsMomentumHalalBasketV2LearningFixture,
  loadTsMomentumHalalBasketV3LearningFixture,
  loadTomOverlayLearningFixture,
  loadDualMomentumRotationLearningFixture,
  loadStocksInPlayOrbLearningFixture,
  loadVwapReclaimLearningFixture,
  loadStopHuntReversalLearningFixture,
  replayBollingerMrLongV2LearningPolicy,
  replayTsMomentumHalalBasketV2LearningPolicy,
  replayTsMomentumHalalBasketV3LearningPolicy,
  replayTomOverlayLearningPolicy,
  replayDualMomentumRotationLearningPolicy,
  replayStocksInPlayOrbLearningPolicy,
  replayVwapReclaimLearningPolicy,
  replayStopHuntReversalLearningPolicy,
  type StrategyLearningFixture,
  type StrategyLearningReplayResult,
} from './strategyLearningReplay';

export const STRATEGY_LEARNING_SETUP_IDS = [
  'bollinger-mr-long-v2',
  'ts-momentum-halal-basket-v2',
  'ts-momentum-halal-basket-v3',
  'tom-overlay',
  'dual-momentum-rotation',
  'stocks-in-play-orb',
  'vwap-reclaim',
  'stop-hunt-reversal-long',
] as const;

export type StrategyLearningSetupId = (typeof STRATEGY_LEARNING_SETUP_IDS)[number];

export interface CompiledStrategyLearningModulePolicy {
  setupId: StrategyLearningSetupId;
  setupVersion: string;
  questionSetVersion: string;
  policyVersion: string;
  params: unknown;
  policyHash: string;
}

export interface StrategyLearningModule {
  curriculum: {
    setupId: StrategyLearningSetupId;
    setupVersion: string;
    questionSetVersion: string;
    policyVersion: string;
    complianceTag: 'EDUCATIONAL_ONLY';
    title: { en: string; ar: string };
    questions: readonly StrategyLearningQuestion[];
  };
  compile(answers: readonly StrategyLearningAnswer[]): CompiledStrategyLearningModulePolicy;
  loadFixture(): StrategyLearningFixture;
  replay(
    answers: readonly StrategyLearningAnswer[],
    fixture: StrategyLearningFixture,
  ): StrategyLearningReplayResult;
}

const STRATEGY_LEARNING_MODULES: Record<StrategyLearningSetupId, StrategyLearningModule> = {
  'bollinger-mr-long-v2': {
    curriculum: BOLLINGER_MR_LONG_V2_CURRICULUM,
    compile: compileBollingerMrLongV2Policy,
    loadFixture: loadBollingerMrLongV2LearningFixture,
    replay: replayBollingerMrLongV2LearningPolicy,
  },
  'ts-momentum-halal-basket-v2': {
    curriculum: TS_MOMENTUM_HALAL_BASKET_V2_CURRICULUM,
    compile: compileTsMomentumHalalBasketV2Policy,
    loadFixture: loadTsMomentumHalalBasketV2LearningFixture,
    replay: replayTsMomentumHalalBasketV2LearningPolicy,
  },
  'ts-momentum-halal-basket-v3': {
    curriculum: TS_MOMENTUM_HALAL_BASKET_V3_CURRICULUM,
    compile: compileTsMomentumHalalBasketV3Policy,
    loadFixture: loadTsMomentumHalalBasketV3LearningFixture,
    replay: replayTsMomentumHalalBasketV3LearningPolicy,
  },
  'tom-overlay': {
    curriculum: TOM_OVERLAY_CURRICULUM,
    compile: compileTomOverlayPolicy,
    loadFixture: loadTomOverlayLearningFixture,
    replay: replayTomOverlayLearningPolicy,
  },
  'dual-momentum-rotation': {
    curriculum: DUAL_MOMENTUM_ROTATION_CURRICULUM,
    compile: compileDualMomentumRotationPolicy,
    loadFixture: loadDualMomentumRotationLearningFixture,
    replay: replayDualMomentumRotationLearningPolicy,
  },
  'stocks-in-play-orb': {
    curriculum: STOCKS_IN_PLAY_ORB_CURRICULUM,
    compile: compileStocksInPlayOrbPolicy,
    loadFixture: loadStocksInPlayOrbLearningFixture,
    replay: (answers, fixture) => replayStocksInPlayOrbLearningPolicy(
      answers,
      fixture as ReturnType<typeof loadStocksInPlayOrbLearningFixture>,
    ),
  },
  'vwap-reclaim': {
    curriculum: VWAP_RECLAIM_CURRICULUM,
    compile: compileVwapReclaimPolicy,
    loadFixture: loadVwapReclaimLearningFixture,
    replay: (answers, fixture) => replayVwapReclaimLearningPolicy(
      answers,
      fixture as ReturnType<typeof loadVwapReclaimLearningFixture>,
    ),
  },
  'stop-hunt-reversal-long': {
    curriculum: STOP_HUNT_REVERSAL_CURRICULUM,
    compile: compileStopHuntReversalPolicy,
    loadFixture: loadStopHuntReversalLearningFixture,
    replay: (answers, fixture) => replayStopHuntReversalLearningPolicy(
      answers,
      fixture as ReturnType<typeof loadStopHuntReversalLearningFixture>,
    ),
  },
};

export const DEFAULT_STRATEGY_LEARNING_SETUP_ID: StrategyLearningSetupId =
  STRATEGY_LEARNING_SETUP_IDS[0];

export function isStrategyLearningSetupId(value: string): value is StrategyLearningSetupId {
  return STRATEGY_LEARNING_SETUP_IDS.includes(value as StrategyLearningSetupId);
}

export function getStrategyLearningModule(setupId: StrategyLearningSetupId): StrategyLearningModule {
  return STRATEGY_LEARNING_MODULES[setupId];
}
