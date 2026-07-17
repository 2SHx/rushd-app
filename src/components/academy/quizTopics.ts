/** Single source of truth for quiz topics — shared by /quiz and /academy/practice. */
export const QUIZ_TOPICS = [
  { id: 'stockBasics', topic: 'Stock Market Basics', level: 1 },
  { id: 'savingsJars', topic: 'Savings & Jars', level: 1 },
  { id: 'compoundInterest', topic: 'Compound Interest', level: 1 },
  { id: 'shariaCompliance', topic: 'Sharia Compliance', level: 2 },
  { id: 'riskManagement', topic: 'Risk Management', level: 2 },
  { id: 'valueInvesting', topic: 'Value Investing', level: 2 },
  { id: 'wealthGoals', topic: 'Wealth Goals & 50/30/20', level: 2 },
  { id: 'halalFunds', topic: 'Halal Mutual Funds', level: 3 },
  { id: 'sukukDiversification', topic: 'Sukuk & Asset Allocation', level: 3 },
  { id: 'tasiMarkets', topic: 'TASI Markets', level: 3 },
  { id: 'nasdaqMarkets', topic: 'NASDAQ Markets', level: 3 },
] as const;

export function isValidQuizTopic(topic: string): boolean {
  return QUIZ_TOPICS.some((item) => item.topic === topic);
}
