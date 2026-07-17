import { ACADEMY_CONTENT_TRACKS } from './content';
import {
  type AcademyValidationResult,
  type Track,
  validateAcademyContentList,
} from './schema';

/** The full Rushd Academy track registry (DR-17). */
export const ACADEMY_TRACKS: Track[] = ACADEMY_CONTENT_TRACKS;

/**
 * Validates the registry (or an explicit list, for tests). Errors name the
 * exact track/unit/lesson path — see `AcademyValidationError`.
 */
export function validateAcademyContent(tracks: unknown = ACADEMY_TRACKS): AcademyValidationResult {
  return validateAcademyContentList(tracks);
}

export * from './schema';
