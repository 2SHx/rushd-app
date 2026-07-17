import { z } from 'zod';

/**
 * Rushd Academy diagnostic questionnaire — schema (DR-19).
 *
 * Zero LLM in the profiling path: this is closed-question, code-resident,
 * zod-validated TypeScript content, mirroring src/academy/schema.ts. Every
 * learner-facing string is REQUIRED bilingual (en + ar) — no exceptions.
 *
 * IMPORTANT: this questionnaire must never ask a CHILD their age (or any
 * other personal/identifying data). Questions probe self-assessed
 * knowledge, experience, goals and preferences only.
 */

export const BilingualTextSchema = z.object({
  en: z.string().min(1).describe('English text'),
  ar: z.string().min(1).describe('Modern Standard Arabic text — required, not optional'),
});
export type BilingualText = z.infer<typeof BilingualTextSchema>;

export const DiagnosticOptionSchema = z.object({
  id: z.string().min(1).describe('Stable option id, unique within its question'),
  label: BilingualTextSchema,
  // 0-3 weight buckets used by the deterministic scorer. Both dimensions
  // are declared per-option so content authors can tune knowledge vs.
  // hands-on-skill signal independently.
  knowledgeWeight: z.number().int().min(0).max(3),
  skillWeight: z.number().int().min(0).max(3),
});
export type DiagnosticOption = z.infer<typeof DiagnosticOptionSchema>;

export const DiagnosticQuestionSchema = z.object({
  id: z.string().min(1).describe('Stable question id, unique within the questionnaire'),
  question: BilingualTextSchema,
  options: z.array(DiagnosticOptionSchema).min(3).max(5),
});
export type DiagnosticQuestion = z.infer<typeof DiagnosticQuestionSchema>;

export interface DiagnosticValidationError {
  path: string;
  message: string;
}

export interface DiagnosticValidationResult {
  valid: boolean;
  errors: DiagnosticValidationError[];
}

/**
 * Content-lint for the diagnostic questionnaire, mirroring
 * validateAcademyContentList: fails fast on missing bilingual text,
 * duplicate ids, or an out-of-range question count.
 */
export function validateDiagnosticContentList(questions: unknown): DiagnosticValidationResult {
  const errors: DiagnosticValidationError[] = [];

  if (!Array.isArray(questions)) {
    return { valid: false, errors: [{ path: 'questions', message: 'diagnosticQuestions must be an array' }] };
  }

  if (questions.length < 6 || questions.length > 8) {
    errors.push({ path: 'questions', message: `expected 6-8 questions, got ${questions.length}` });
  }

  const seenQuestionIds = new Set<string>();

  questions.forEach((questionRaw, questionIndex) => {
    const questionId = typeof (questionRaw as any)?.id === 'string' ? (questionRaw as any).id : `#${questionIndex}`;
    const questionPath = `question[${questionId}]`;

    if (seenQuestionIds.has(questionId)) {
      errors.push({ path: questionPath, message: `duplicate question id "${questionId}"` });
    }
    seenQuestionIds.add(questionId);

    const parsed = DiagnosticQuestionSchema.safeParse(questionRaw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        let path = questionPath;
        let node: any = questionRaw;
        for (let i = 0; i < issue.path.length; i++) {
          const segment = issue.path[i];
          const next = issue.path[i + 1];
          if (segment === 'options' && typeof next === 'number') {
            const option = node?.options?.[next];
            path += `.option[${option?.id ?? next}]`;
            node = option;
            i++;
            continue;
          }
          path += `.${String(segment)}`;
          node = node?.[segment as any];
        }
        errors.push({ path, message: issue.message });
      }
      return;
    }

    const seenOptionIds = new Set<string>();
    for (const option of parsed.data.options) {
      if (seenOptionIds.has(option.id)) {
        errors.push({
          path: `${questionPath}.option[${option.id}]`,
          message: `duplicate option id "${option.id}" within question "${questionId}"`,
        });
      }
      seenOptionIds.add(option.id);
    }
  });

  return { valid: errors.length === 0, errors };
}
