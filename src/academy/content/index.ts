import type { Track } from '../schema';
import { foundationsTrack } from './foundationsTrack';
import { ECONOMICS_TRACK } from './economicsTrack';
import { ADVANCED_ANALYSIS_TRACK } from './advancedAnalysisTrack';
import { wealthTrack } from './wealthTrack';

/**
 * Real curriculum content modules (M12-B2, per docs/SYSTEM_DESIGN.md DR-17):
 * Finance Foundations, Economics, Advanced Financial Analysis, Wealth & Ethical Investing.
 *
 * O(1) track addition: each track is its own module exporting a single
 * `Track`; add it to this array and the registry + content-lint test pick
 * it up automatically.
 */
export const ACADEMY_CONTENT_TRACKS: Track[] = [
  foundationsTrack,
  ECONOMICS_TRACK,
  ADVANCED_ANALYSIS_TRACK,
  wealthTrack,
];
