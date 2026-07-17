import type { Tier } from '@prisma/client';
import { can, type Capability } from '@/lib/authz';
import { AGE_SEGMENTS, type AgeSegment, type Track } from '@/academy/registry';

const TRACK_CAPABILITIES: Readonly<Record<string, Capability>> = {
  foundations: 'academy:track:foundations', economics: 'academy:track:economics',
  'advanced-analysis': 'academy:track:advanced-financial-analysis',
};
const SEGMENT_RANK = Object.fromEntries(AGE_SEGMENTS.map((segment, index) => [segment, index])) as Record<AgeSegment, number>;
export type AcademyAudience = { tier: Tier; role: 'PARENT' | 'CHILD'; ageSegment: AgeSegment };

/** Pure server filter: callers must never pass the unfiltered registry to a client component. */
export function filterAcademyTracks(tracks: readonly Track[], audience: AcademyAudience): Track[] {
  return tracks.flatMap((track) => {
    const capability = TRACK_CAPABILITIES[track.id];
    if (!capability || !can({ tier: audience.tier }, capability)) return [];
    const units = track.units.flatMap((unit) => {
      const lessons = audience.role === 'PARENT' ? unit.lessons : unit.lessons.filter((lesson) => SEGMENT_RANK[lesson.ageSegment] <= SEGMENT_RANK[audience.ageSegment]);
      return lessons.length ? [{ ...unit, lessons }] : [];
    });
    return units.length ? [{ ...track, units }] : [];
  });
}

export function practiceLinkHref(link: Track['units'][number]['practiceLinks'][number]): string {
  const params = link.kind === 'strategySetup' ? new URLSearchParams({ setupId: link.setupId }) : new URLSearchParams({ topic: link.topic });
  return `/quiz?${params.toString()}`;
}
