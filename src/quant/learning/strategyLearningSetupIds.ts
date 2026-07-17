export const STRATEGY_LEARNING_SETUP_IDS = [
  'bollinger-mr-long-v2',
  'ts-momentum-halal-basket-v2',
  'ts-momentum-halal-basket-v3',
  'tom-overlay',
  'dual-momentum-rotation',
  'stocks-in-play-orb',
  'vwap-reclaim',
  'stop-hunt-reversal-long',
  'g6b-linear-factor-wide',
] as const;

export type StrategyLearningSetupId = (typeof STRATEGY_LEARNING_SETUP_IDS)[number];

export const DEFAULT_STRATEGY_LEARNING_SETUP_ID: StrategyLearningSetupId =
  STRATEGY_LEARNING_SETUP_IDS[0];

export function isStrategyLearningSetupId(value: string): value is StrategyLearningSetupId {
  return STRATEGY_LEARNING_SETUP_IDS.includes(value as StrategyLearningSetupId);
}
