import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { StrategyLearningAnswer, StrategyLearningQuestion } from './bollingerMrLongV2Curriculum';

interface CurriculumMetadata<S extends string, V extends string, Q extends string, PV extends string> {
  setupId: S;
  setupVersion: V;
  questionSetVersion: Q;
  policyVersion: PV;
  questions: readonly StrategyLearningQuestion[];
}

/** Shared closed-map compiler; clients submit option IDs, never executable values. */
export function compileBoundedLearningPolicy<
  P,
  S extends string = string,
  V extends string = string,
  Q extends string = string,
  PV extends string = string,
>(input: {
  answers: readonly StrategyLearningAnswer[];
  curriculum: CurriculumMetadata<S, V, Q, PV>;
  defaultParams: P;
  choices: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  parseParams(candidate: unknown): P;
}): {
  setupId: S; setupVersion: V; questionSetVersion: Q; policyVersion: PV;
  params: P; policyHash: string;
} {
  const answers = z.array(z.object({
    questionId: z.string().min(1), optionId: z.string().min(1),
  }).strict()).parse(input.answers);
  if (answers.length !== input.curriculum.questions.length) throw new Error('learning_answer_count_mismatch');
  const byQuestion = new Map<string, string>();
  for (const answer of answers) {
    if (byQuestion.has(answer.questionId)) throw new Error('duplicate_learning_answer');
    const question = input.curriculum.questions.find(item => item.id === answer.questionId);
    if (!question) throw new Error('unknown_learning_question');
    if (!question.options.some(item => item.id === answer.optionId)) throw new Error('unknown_learning_option');
    byQuestion.set(answer.questionId, answer.optionId);
  }
  const overrides: Record<string, unknown> = {};
  for (const question of input.curriculum.questions) {
    const optionId = byQuestion.get(question.id);
    if (!optionId) throw new Error('missing_learning_answer');
    if (question.role !== 'POLICY_DECISION') continue;
    const value = input.choices[question.policyKey]?.[optionId];
    if (value === undefined) throw new Error('unmapped_learning_policy_choice');
    overrides[question.policyKey] = value;
  }
  const params = input.parseParams({ ...input.defaultParams, ...overrides });
  const metadata = input.curriculum;
  const payload = JSON.stringify({
    setupId: metadata.setupId, setupVersion: metadata.setupVersion,
    questionSetVersion: metadata.questionSetVersion, policyVersion: metadata.policyVersion, params,
  });
  return {
    setupId: metadata.setupId, setupVersion: metadata.setupVersion,
    questionSetVersion: metadata.questionSetVersion, policyVersion: metadata.policyVersion, params,
    policyHash: `sha256:${createHash('sha256').update(payload).digest('hex')}`,
  };
}
