import { z } from 'zod';
import { isStrategyLearningSetupId } from '@/quant/learning/strategyLearningModules';

/**
 * Rushd Academy content engine — schema (DR-17).
 *
 * Content is code-resident, zod-validated TypeScript (no CMS, no MDX).
 * Every learner-facing text field is REQUIRED bilingual (en + ar) — Arabic
 * is non-optional because the product is Arabic-primary (DR-6). Every
 * lesson carries a `complianceTag` (DR-5) and an `ageSegment`; every unit
 * declares at least one `practiceLink` into DR-14 strategy learning or a
 * quiz topic.
 */

// Ordinal so a track's `minimumAgeSegment` can be compared against a
// lesson's `ageSegment` (KIDS < TEENS < ADULTS).
export const AGE_SEGMENTS = ['KIDS', 'TEENS', 'ADULTS'] as const;
export const AgeSegmentSchema = z.enum(AGE_SEGMENTS);
export type AgeSegment = z.infer<typeof AgeSegmentSchema>;

const AGE_SEGMENT_RANK: Record<AgeSegment, number> = {
  KIDS: 0,
  TEENS: 1,
  ADULTS: 2,
};

// Matches the `complianceTag` enum already used by src/app/api/quiz/route.ts
// (DR-5: teach every concept, persistently label the non-compliant ones).
export const COMPLIANCE_TAGS = ['HALAL', 'HARAM', 'MASHBOOH', 'EDUCATIONAL_ONLY'] as const;
export const ComplianceTagSchema = z.enum(COMPLIANCE_TAGS);
export type ComplianceTag = z.infer<typeof ComplianceTagSchema>;

// Structural bilingual parity: `ar` is required, never `.optional()`.
export const BilingualTextSchema = z.object({
  en: z.string().min(1).describe('English text'),
  ar: z.string().min(1).describe('Modern Standard Arabic text — required, not optional'),
});
export type BilingualText = z.infer<typeof BilingualTextSchema>;

export const CheckpointOptionSchema = BilingualTextSchema;

export const CheckpointQuestionSchema = z
  .object({
    id: z.string().min(1).describe('Stable id for the checkpoint question'),
    question: BilingualTextSchema,
    options: z.array(CheckpointOptionSchema).min(2).max(6).describe('Bilingual answer options'),
    correctOptionIndex: z.number().int().min(0).describe('Zero-based index into options'),
    explanation: BilingualTextSchema.describe('Why the correct answer is correct'),
    complianceTag: ComplianceTagSchema,
  })
  .superRefine((checkpoint, ctx) => {
    if (checkpoint.correctOptionIndex >= checkpoint.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `correctOptionIndex ${checkpoint.correctOptionIndex} is out of range for ${checkpoint.options.length} options`,
        path: ['correctOptionIndex'],
      });
    }
  });
export type CheckpointQuestion = z.infer<typeof CheckpointQuestionSchema>;

// A unit's practical link either targets a DR-14 strategy-learning setup
// (validated against src/quant/learning/strategyLearningModules.ts) or a
// quiz topic (validated against the quiz route's topic allowlist).
export const PracticeLinkSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('strategySetup'),
    setupId: z.string().min(1).describe('Id from STRATEGY_LEARNING_SETUP_IDS'),
  }),
  z.object({
    kind: z.literal('quizTopic'),
    topic: z.string().min(1).describe('Quiz topic string'),
  }),
]);
export type PracticeLink = z.infer<typeof PracticeLinkSchema>;

export const LessonSchema = z.object({
  id: z.string().min(1).describe('Stable id, unique within its unit'),
  title: BilingualTextSchema,
  summary: BilingualTextSchema,
  body: BilingualTextSchema,
  complianceTag: ComplianceTagSchema,
  ageSegment: AgeSegmentSchema,
  contentVersion: z.number().int().min(1).describe('Bumped on any learner-visible content change; pins progress'),
  checkpoint: CheckpointQuestionSchema,
});
export type Lesson = z.infer<typeof LessonSchema>;

export const UnitSchema = z.object({
  id: z.string().min(1).describe('Stable id, unique within its track'),
  title: BilingualTextSchema,
  lessons: z.array(LessonSchema).min(1),
  practiceLinks: z.array(PracticeLinkSchema).min(1).describe('At least one theory→practice link (DR-14)'),
});
export type Unit = z.infer<typeof UnitSchema>;

export const TrackSchema = z.object({
  id: z.string().min(1).describe('Stable id, unique across the registry'),
  title: BilingualTextSchema,
  minimumAgeSegment: AgeSegmentSchema.describe('No lesson in this track may sit below this segment'),
  units: z.array(UnitSchema).min(1),
});
export type Track = z.infer<typeof TrackSchema>;

export interface AcademyValidationError {
  /** Exact track/unit/lesson path, e.g. `track[foundations].unit[savings].lesson[jars].title.ar` */
  path: string;
  message: string;
}

export interface AcademyValidationResult {
  valid: boolean;
  errors: AcademyValidationError[];
}

/**
 * Walks a zod issue's raw path (schema keys/array indices) against the
 * original (untyped) input data to build a human-readable path that names
 * ids instead of array indices wherever an id is available.
 */
function describeIssuePath(trackRaw: any, trackId: string, issuePath: Array<string | number>): string {
  let node = trackRaw;
  let out = `track[${trackId}]`;
  for (let i = 0; i < issuePath.length; i++) {
    const segment = issuePath[i];
    const next = issuePath[i + 1];

    if (segment === 'units' && typeof next === 'number') {
      const unit = node?.units?.[next];
      out += `.unit[${unit?.id ?? next}]`;
      node = unit;
      i++;
      continue;
    }
    if (segment === 'lessons' && typeof next === 'number') {
      const lesson = node?.lessons?.[next];
      out += `.lesson[${lesson?.id ?? next}]`;
      node = lesson;
      i++;
      continue;
    }
    if (segment === 'practiceLinks' && typeof next === 'number') {
      out += `.practiceLink[${next}]`;
      node = node?.practiceLinks?.[next];
      i++;
      continue;
    }
    if (segment === 'options' && typeof next === 'number') {
      out += `.option[${next}]`;
      node = node?.options?.[next];
      i++;
      continue;
    }
    out += `.${String(segment)}`;
    node = node?.[segment as any];
  }
  return out;
}

/**
 * Validates a list of tracks (defaults to the registry). Used directly by
 * the content-lint test and by any registry consumer that wants a
 * fail-fast check before shipping content.
 */
export function validateAcademyContentList(tracks: unknown): AcademyValidationResult {
  const errors: AcademyValidationError[] = [];

  if (!Array.isArray(tracks)) {
    return { valid: false, errors: [{ path: 'tracks', message: 'ACADEMY_TRACKS must be an array' }] };
  }

  const seenTrackIds = new Set<string>();

  tracks.forEach((trackRaw, trackIndex) => {
    const trackId = typeof (trackRaw as any)?.id === 'string' ? (trackRaw as any).id : `#${trackIndex}`;
    const trackPath = `track[${trackId}]`;

    if (seenTrackIds.has(trackId)) {
      errors.push({ path: trackPath, message: `duplicate track id "${trackId}"` });
    }
    seenTrackIds.add(trackId);

    const parsed = TrackSchema.safeParse(trackRaw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          path: describeIssuePath(trackRaw, trackId, issue.path),
          message: issue.message,
        });
      }
      return;
    }

    const track = parsed.data;
    const minRank = AGE_SEGMENT_RANK[track.minimumAgeSegment];

    for (const unit of track.units) {
      const unitPath = `${trackPath}.unit[${unit.id}]`;

      for (const link of unit.practiceLinks) {
        if (link.kind === 'strategySetup' && !isStrategyLearningSetupId(link.setupId)) {
          errors.push({
            path: `${unitPath}.practiceLink[strategySetup]`,
            message: `unknown strategy learning setup id "${link.setupId}"`,
          });
        }
      }

      for (const lesson of unit.lessons) {
        const lessonPath = `${unitPath}.lesson[${lesson.id}]`;
        const lessonRank = AGE_SEGMENT_RANK[lesson.ageSegment];
        if (lessonRank < minRank) {
          errors.push({
            path: `${lessonPath}.ageSegment`,
            message: `ageSegment "${lesson.ageSegment}" is below track "${trackId}" minimum "${track.minimumAgeSegment}"`,
          });
        }
      }
    }
  });

  return { valid: errors.length === 0, errors };
}
