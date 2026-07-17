import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./NewChildForm.tsx', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('./ChildAgeSegmentSettings.tsx', import.meta.url), 'utf8');

describe('NewChildForm Academy age segment contract', () => {
  it('requires the parent to choose only a KIDS or TEENS segment and persists it', () => {
    expect(source).toContain("useState<'KIDS' | 'TEENS'>('KIDS')");
    expect(source).toContain('<option value="KIDS">');
    expect(source).toContain('<option value="TEENS">');
    expect(source).not.toContain('<option value="ADULTS">');
    expect(source).toContain('JSON.stringify({ name, username, pin, ageSegment })');
  });

  it('keeps later edits parent-scoped through the family settings API', () => {
    expect(source).toContain('family/settings');
    expect(settingsSource).toContain("method: 'PATCH'");
    expect(settingsSource).toContain('JSON.stringify({ childId, ageSegment: segments[childId] })');
    expect(settingsSource).not.toContain('value="ADULTS"');
  });
});
