import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

type NextMode = 'dev' | 'build' | 'start';
interface LockRecord { pid: number; mode: NextMode; startedAt: string }

function readLock(lockPath: string): LockRecord | null {
  try {
    const value = JSON.parse(readFileSync(lockPath, 'utf8')) as Partial<LockRecord>;
    return typeof value.pid === 'number' && typeof value.mode === 'string'
      ? value as LockRecord
      : null;
  } catch {
    return null;
  }
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function acquireWorkspaceLock(lockPath: string, mode: NextMode, pid = process.pid): void {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(lockPath, 'wx');
      writeFileSync(descriptor, JSON.stringify({ pid, mode, startedAt: new Date().toISOString() }));
      closeSync(descriptor);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = readLock(lockPath);
      if (owner && processIsRunning(owner.pid)) {
        throw new Error(
          `Next ${owner.mode} is already running for this workspace (PID ${owner.pid}). Stop it before starting Next ${mode}.`,
        );
      }
      unlinkSync(lockPath);
    }
  }
  throw new Error('Could not acquire the Next workspace lock.');
}

export function releaseWorkspaceLock(lockPath: string, pid = process.pid): void {
  const owner = readLock(lockPath);
  if (owner?.pid !== pid) return;
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function runNext(mode: NextMode): void {
  const lockPath = resolve(process.cwd(), '.next-workspace.lock');
  acquireWorkspaceLock(lockPath, mode);
  const executable = resolve(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'next.cmd' : 'next',
  );
  const child = spawn(executable, [mode], { env: process.env, stdio: 'inherit' });
  const cleanup = () => releaseWorkspaceLock(lockPath);
  const forwardSignal = (signal: NodeJS.Signals) => child.kill(signal);

  process.once('SIGINT', forwardSignal);
  process.once('SIGTERM', forwardSignal);
  process.once('exit', cleanup);
  child.once('error', error => {
    cleanup();
    console.error(error);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    cleanup();
    process.removeListener('SIGINT', forwardSignal);
    process.removeListener('SIGTERM', forwardSignal);
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
  });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode !== 'dev' && mode !== 'build' && mode !== 'start') {
    console.error('Usage: tsx scripts/next-workspace.ts <dev|build|start>');
    process.exitCode = 1;
  } else {
    try {
      runNext(mode);
    } catch (error) {
      console.error((error as Error).message);
      process.exitCode = 1;
    }
  }
}
