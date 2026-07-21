// Version-scoped experiment lifecycle CLI. FULL execution delegates to scripts/backtest.ts;
// this file owns only manifest transitions and never duplicates simulation math.
import { pathToFileURL } from 'node:url';
import {
  createDraft,
  finalizeExperiment,
  isExperimentRejectionReasonCode,
  markCodified,
  markQaPass,
  readManifest,
  sealExperiment,
  writeManifest,
} from '../src/quant/backtest/experimentProtocol';
import {
  parseArgs,
  parseRunLabOptions,
  protocolConfigForOptions,
  runBacktestCli,
} from './backtest';

function required(args: Record<string, string>, key: string): string {
  const value = args[key]?.trim();
  if (!value) throw new Error(`--${key} is required`);
  return value;
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const command = argv[0];
  const separator = argv.indexOf('--');
  const lifecycleArgs = parseArgs(argv.slice(1, separator === -1 ? undefined : separator));
  const backtestArgs = separator === -1 ? [] : argv.slice(separator + 1);
  const manifestPath = required(lifecycleArgs, 'manifest');

  if (command === 'draft') {
    const options = parseRunLabOptions(parseArgs(backtestArgs));
    const manifest = createDraft({
      setupId: options.setup,
      version: required(lifecycleArgs, 'version'),
      director: required(lifecycleArgs, 'director'),
      config: protocolConfigForOptions(options),
    });
    await writeManifest(manifestPath, manifest);
    console.log(`DRAFT ${manifest.setupId}@${manifest.version} ${manifestPath}`);
    return;
  }

  if (command === 'seal') {
    await writeManifest(manifestPath, sealExperiment(await readManifest(manifestPath)));
  } else if (command === 'codified') {
    await writeManifest(manifestPath, markCodified(
      await readManifest(manifestPath), required(lifecycleArgs, 'implementer'),
    ));
  } else if (command === 'qa-pass') {
    await writeManifest(manifestPath, markQaPass(
      await readManifest(manifestPath), required(lifecycleArgs, 'auditor'),
    ));
  } else if (command === 'diagnostic') {
    await runBacktestCli([
      ...backtestArgs, '--diagnostic', 'true', '--manifest', manifestPath,
      '--implementer', required(lifecycleArgs, 'implementer'),
    ]);
  } else if (command === 'full') {
    await runBacktestCli([
      ...backtestArgs, '--diagnostic', 'false', '--manifest', manifestPath,
      '--runner', required(lifecycleArgs, 'runner'),
    ]);
  } else if (command === 'finalize') {
    const manifest = await readManifest(manifestPath);
    if (!manifest.fullRun) throw new Error('No FULL result receipt is available for audit');
    await finalizeExperiment(manifestPath, {
      runKind: manifest.fullRun.outcome,
      status: manifest.fullRun.status,
      auditor: required(lifecycleArgs, 'auditor'),
      reasonCodes: manifest.fullRun.reasonCodes,
      ...(manifest.fullRun.evidencePath ? { evidencePath: manifest.fullRun.evidencePath } : {}),
    });
  } else if (command === 'abandon') {
    const requestedReason = lifecycleArgs.reason?.trim() || 'REPRODUCIBILITY_FAILURE';
    if (!isExperimentRejectionReasonCode(requestedReason)) {
      throw new Error('--reason must be a QDR-7 rejection reason code');
    }
    await finalizeExperiment(manifestPath, {
      runKind: 'ABANDONED',
      status: 'REJECTED',
      auditor: required(lifecycleArgs, 'auditor'),
      reasonCodes: [requestedReason],
    });
  } else if (command === 'show') {
    console.log(JSON.stringify(await readManifest(manifestPath), null, 2));
  } else {
    throw new Error('command must be draft, seal, codified, qa-pass, diagnostic, full, finalize, abandon, or show');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
