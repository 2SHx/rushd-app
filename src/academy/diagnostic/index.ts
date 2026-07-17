/**
 * Rushd Academy diagnostic questionnaire — public surface (DR-19).
 *
 * FROZEN INTERFACE — a parallel backend dispatch (LearnerProfile
 * model/API) imports this module directly. Zero LLM/AI-SDK imports here.
 */
export { diagnosticQuestions } from './content';
export type { DiagnosticQuestion, DiagnosticOption, BilingualText } from './schema';
export { validateDiagnosticContentList } from './schema';
export type { DiagnosticValidationError, DiagnosticValidationResult } from './schema';
export {
  DIAGNOSTIC_VERSION,
  PERSONAS,
  diagnosticAnswersSchema,
  scoreDiagnostic,
  defaultProfile,
} from './scorer';
export type { Persona, DiagnosticProfile } from './scorer';
