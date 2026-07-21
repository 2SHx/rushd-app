// scripts/backtest.ts — QDR-6 user-runnable validation CLI.
//   npm run backtest -- --setup <id> --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--symbols GME,SNDL]
//                       [--candidates=path.json] [--seed 42] [--feed fixtures-real|alpaca-iex]
//
// Runs a cataloged StrategySetup against stored historical minute bars with ZERO LLM calls,
// prints the QDR-6 report card, writes results/<setup>-<from>-<to>.json, and persists a
// BacktestRun (seed + gitSha) for reproducibility. `--diagnostic` prints but performs neither write.
// Reads ONLY real fixtures / IntradayBar rows —
// no synthetic bars anywhere. Exits nonzero on any look-ahead detection.
//
// THIN WRAPPER (QDR-lab): all orchestration (resolve period/universe → simulate → assemble card →
// persist) lives in `src/quant/backtest/runLab.ts`, shared byte-for-byte with the
// POST /api/quant/lab/run API route. This file only parses argv into RunLabOptions and maps
// runLab's thrown errors to CLI exit codes (2 = bad --setup, 1 = everything else).
import { pathToFileURL } from 'node:url';
import { LookaheadError } from '../src/quant/data/pointInTime';
import { runLab, backtestRunMode, UsageError, type RunLabOptions, type RunLabResult } from '../src/quant/backtest/runLab';
import {
  claimFull,
  isExperimentRejectionReasonCode,
  readManifest,
  recordDiagnostic,
  recordFullResult,
  stableConfigHash,
  type JsonValue,
} from '../src/quant/backtest/experimentProtocol';

// Re-export the pure helpers for existing unit tests (src/quant/**/*.test.ts import them from here).
export * from '../src/quant/backtest/runLab';

export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const equalsAt = argv[i].indexOf('=');
      if (equalsAt > 2) {
        out[argv[i].slice(2, equalsAt)] = argv[i].slice(equalsAt + 1);
        continue;
      }
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

export function parseRunLabOptions(args: Record<string, string>): RunLabOptions {
  // Validated up front (as before) so a bad --diagnostic value fails identically to prior behavior.
  const runMode = backtestRunMode(args.diagnostic);
  return {
    setup: args.setup,
    period: args.period,
    from: args.from,
    to: args.to,
    universe: args.universe,
    symbols: args.symbols ? args.symbols.split(',').map((s) => s.trim()) : null,
    confirmFull: args['confirm-full'] === 'true',
    candidatesPath: args.candidates,
    seed: Number(args.seed ?? '42'),
    oosFraction: Number(args.oos ?? '0.3'),
    engine: args.engine,
    feed: args.feed,
    source: args.source as 'fixtures' | 'db' | undefined,
    diagnostic: runMode === 'DIAGNOSTIC_NON_TERMINAL',
  };
}

export function protocolConfigForOptions(options: RunLabOptions): JsonValue {
  return JSON.parse(JSON.stringify({
    setup: options.setup,
    period: options.period,
    from: options.from,
    to: options.to,
    universe: options.universe,
    symbols: options.symbols ?? null,
    confirmFull: options.confirmFull ?? false,
    candidatesPath: options.candidatesPath,
    seed: options.seed ?? 42,
    oosFraction: options.oosFraction ?? 0.3,
    engine: options.engine,
    feed: options.feed,
    source: options.source,
  })) as JsonValue;
}

async function assertFrozenCliConfig(manifestPath: string, options: RunLabOptions): Promise<void> {
  const manifest = await readManifest(manifestPath);
  if (manifest.setupId !== options.setup || manifest.configHash !== stableConfigHash(protocolConfigForOptions(options))) {
    throw new Error('CLI config does not match the sealed experiment manifest');
  }
}

export async function runBacktestCli(argv: string[]): Promise<RunLabResult> {
  const args = parseArgs(argv);
  const options = parseRunLabOptions(args);
  const manifestPath = args.manifest;

  if (options.diagnostic) {
    if (!manifestPath) return runLab(options);
    if (!args.implementer) throw new UsageError('--implementer is required with a diagnostic manifest');
    await assertFrozenCliConfig(manifestPath, options);
    await recordDiagnostic(manifestPath, args.implementer);
    return runLab(options);
  }

  if (!manifestPath || !args.runner) {
    throw new UsageError('Terminal FULL runs require --manifest <path> and --runner <identity>');
  }
  await assertFrozenCliConfig(manifestPath, options);
  await claimFull(manifestPath, args.runner);

  try {
    const result = await runLab(options);
    await recordFullResult(manifestPath, args.runner, {
      outcome: 'FULL',
      status: result.card.status,
      reasonCodes: [...result.card.rejectionReasonCodes],
      ...(result.outFile ? { evidencePath: result.outFile } : {}),
    });
    return result;
  } catch (error) {
    const suppliedReason = (error as { reasonCode?: unknown }).reasonCode;
    const reasonCode = isExperimentRejectionReasonCode(suppliedReason)
      ? suppliedReason
      : 'REPRODUCIBILITY_FAILURE';
    try {
      await recordFullResult(manifestPath, args.runner, {
        outcome: 'FAILURE', status: 'REJECTED', reasonCodes: [reasonCode],
      });
    } catch (receiptError) {
      console.error(`Failed to record claimed FULL failure: ${(receiptError as Error).message}`);
    }
    throw error;
  }
}

async function main() {
  try {
    await runBacktestCli(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(err.message);
      process.exit(2);
    }
    if (err instanceof LookaheadError) process.exit(1);
    throw err;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
