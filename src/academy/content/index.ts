import type { Track } from '../schema';

/**
 * Real curriculum content modules land here (M12-B2, per docs/SYSTEM_DESIGN.md
 * DR-17): Finance Foundations, Economics, Advanced Financial Analysis.
 *
 * O(1) track addition: each track is its own module exporting a single
 * `Track`; add it to this array and the registry + content-lint test pick
 * it up automatically. This file intentionally ships with zero tracks —
 * B1 (this change) is the schema/engine only.
 */
export const ACADEMY_CONTENT_TRACKS: Track[] = [];
