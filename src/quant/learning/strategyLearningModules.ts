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
  loadBollingerMrLongV2LearningFixture,
  loadTsMomentumHalalBasketV2LearningFixture,
  replayBollingerMrLongV2LearningPolicy,
  replayTsMomentumHalalBasketV2LearningPolicy,
  type BollingerLearningReplayFixture,
  type StrategyLearningReplayResult,
} from './strategyLearningReplay';

export const STRATEGY_LEARNING_SETUP_IDS = [
  'bollinger-mr-long-v2',
  'ts-momentum-halal-basket-v2',
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
  loadFixture(): BollingerLearningReplayFixture;
  replay(
    answers: readonly StrategyLearningAnswer[],
    fixture: BollingerLearningReplayFixture,
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
};

export const DEFAULT_STRATEGY_LEARNING_SETUP_ID: StrategyLearningSetupId =
  STRATEGY_LEARNING_SETUP_IDS[0];

export function isStrategyLearningSetupId(value: string): value is StrategyLearningSetupId {
  return STRATEGY_LEARNING_SETUP_IDS.includes(value as StrategyLearningSetupId);
}

export function getStrategyLearningModule(setupId: StrategyLearningSetupId): StrategyLearningModule {
  return STRATEGY_LEARNING_MODULES[setupId];
}
