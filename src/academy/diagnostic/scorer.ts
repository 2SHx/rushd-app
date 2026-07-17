import { z } from 'zod';
import { diagnosticQuestions } from './content';

/**
 * Rushd Academy diagnostic scorer — pure TS, zero LLM (DR-19).
 *
 * Deterministic: same answers + same `isChild` always yield the same
 * output (no Date.now, no Math.random). Persona is presented to the
 * learner as an adjustable "starting path", never a psychometric claim.
 */

export const DIAGNOSTIC_VERSION = 1;

export const PERSONAS = [
  'CURIOUS_KID',
  'TEEN_SAVER',
  'ADULT_BEGINNER',
  'ADULT_PRACTITIONER',
  'QUANT_CANDIDATE',
] as const;
export type Persona = (typeof PERSONAS)[number];

const questionById = new Map(diagnosticQuestions.map((q) => [q.id, q]));

/**
 * questionId -> optionId. Validated against the live question/option ids
 * so a stale client (or tampered payload) is rejected before scoring.
 */
export const diagnosticAnswersSchema: z.ZodType<Record<string, string>> = z
  .record(z.string(), z.string())
  .superRefine((answers, ctx) => {
    for (const [questionId, optionId] of Object.entries(answers)) {
      const question = questionById.get(questionId);
      if (!question) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown diagnostic question id "${questionId}"`,
          path: [questionId],
        });
        continue;
      }
      if (!question.options.some((option) => option.id === optionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown option id "${optionId}" for question "${questionId}"`,
          path: [questionId],
        });
      }
    }
  });

export interface DiagnosticProfile {
  persona: Persona;
  baselineKnowledge: number;
  skillLevel: number;
  profileVersion: number;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * The honest, skippable default. isChild -> CURIOUS_KID, else ADULT_BEGINNER,
 * both with zero levels (nothing has been assessed yet).
 */
export function defaultProfile(opts: { isChild: boolean }): DiagnosticProfile {
  return {
    persona: opts.isChild ? 'CURIOUS_KID' : 'ADULT_BEGINNER',
    baselineKnowledge: 0,
    skillLevel: 0,
    profileVersion: DIAGNOSTIC_VERSION,
  };
}

/**
 * Deterministic scorer: validates answers, averages each option's
 * knowledge/skill weights (0-3) across ALL answered questions, scales to
 * 0-100 integers, then maps the combined average to a persona. isChild
 * NEVER yields an ADULT_* or QUANT_CANDIDATE persona (hard ceiling).
 *
 * A partial answer set — anything short of ALL questions answered,
 * including empty — never reaches the scored path: it falls back to the
 * honest default profile, same as the explicit skip path. This prevents a
 * single max-weight answer from skewing the persona.
 */
export function scoreDiagnostic(
  answers: Record<string, string>,
  opts: { isChild: boolean },
): DiagnosticProfile {
  const parsed = diagnosticAnswersSchema.parse(answers);

  let knowledgeSum = 0;
  let skillSum = 0;
  let answeredCount = 0;

  // Iterate questions in their fixed content order (not object key order)
  // so the result never depends on answer-object key insertion order.
  for (const question of diagnosticQuestions) {
    const optionId = parsed[question.id];
    if (optionId === undefined) continue;
    const option = question.options.find((o) => o.id === optionId);
    if (!option) continue;
    knowledgeSum += option.knowledgeWeight;
    skillSum += option.skillWeight;
    answeredCount += 1;
  }

  // Require ALL questions to be answered before taking the scored path —
  // a partial answer set (including empty) must not be able to skew the
  // persona (e.g. a single max-weight answer scoring QUANT_CANDIDATE).
  // Falls back to the same honest default as the explicit skip path.
  if (answeredCount < diagnosticQuestions.length) {
    return defaultProfile(opts);
  }

  const knowledgeAvg = knowledgeSum / answeredCount; // 0-3
  const skillAvg = skillSum / answeredCount; // 0-3
  const combinedAvg = (knowledgeAvg + skillAvg) / 2; // 0-3

  const baselineKnowledge = clampInt((knowledgeAvg / 3) * 100, 0, 100);
  const skillLevel = clampInt((skillAvg / 3) * 100, 0, 100);

  let persona: Persona;
  if (opts.isChild) {
    persona = combinedAvg < 1.5 ? 'CURIOUS_KID' : 'TEEN_SAVER';
  } else if (combinedAvg < 1.0) {
    persona = 'ADULT_BEGINNER';
  } else if (combinedAvg < 2.0) {
    persona = 'ADULT_PRACTITIONER';
  } else {
    persona = 'QUANT_CANDIDATE';
  }

  return { persona, baselineKnowledge, skillLevel, profileVersion: DIAGNOSTIC_VERSION };
}
