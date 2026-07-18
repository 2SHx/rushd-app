import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireWorkspaceLock, releaseWorkspaceLock } from '../../scripts/next-workspace';

const created: string[] = [];

afterEach(() => {
  for (const directory of created.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function lockFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'rushd-next-lock-'));
  created.push(directory);
  return join(directory, '.next-workspace.lock');
}

describe('Next workspace lifecycle lock', () => {
  it('rejects a second live Next process', () => {
    const lockPath = lockFixture();
    acquireWorkspaceLock(lockPath, 'dev', process.pid);

    expect(() => acquireWorkspaceLock(lockPath, 'build', process.pid)).toThrow(
      /Next dev is already running/,
    );
  });

  it('recovers a stale lock and only lets its owner release it', () => {
    const lockPath = lockFixture();
    writeFileSync(lockPath, JSON.stringify({ pid: 999_999, mode: 'dev', startedAt: 'stale' }));

    acquireWorkspaceLock(lockPath, 'build', process.pid);
    expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toMatchObject({ pid: process.pid, mode: 'build' });

    releaseWorkspaceLock(lockPath, process.pid + 1);
    expect(() => readFileSync(lockPath)).not.toThrow();
    releaseWorkspaceLock(lockPath, process.pid);
    expect(() => readFileSync(lockPath)).toThrow();
  });
});
