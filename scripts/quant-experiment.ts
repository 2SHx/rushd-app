// Version-scoped experiment lifecycle CLI. FULL execution delegates to scripts/backtest.ts;
// this file owns only manifest transitions and never duplicates simulation math.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
  type ResolvedComparator,
} from '../src/quant/backtest/experimentProtocol';
import { productClassFromConfig } from '../src/quant/backtest/gatePower';
import { historicalAnchorIndex } from '../src/quant/backtest/historicalAnchors';
import {
  parseArgs,
  parseRunLabOptions,
  protocolConfigForOptions,
  runBacktestCli,
} from './backtest';

/**
 * Every manifest in the experiments directory, keyed `setupId@version`, with whether it ever reached
 * SEALED. A DRAFT is deliberately reported as `sealed: false` rather than omitted: "exists but was
 * never sealed" and "does not exist" are both refusals, and reporting the distinction makes the
 * error message tell the truth about which one happened.
 */
async function readSealedManifestInventory(directory: string): Promise<Map<string, ResolvedComparator>> {
  const inventory = new Map<string, ResolvedComparator>();
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return inventory; // no inventory ⇒ nothing resolves ⇒ a DIVERSIFICATION seal is refused
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const parsed: unknown = JSON.parse(await readFile(join(directory, entry), 'utf8'));
      const manifest = parsed as { setupId?: unknown; version?: unknown; state?: unknown; config?: unknown };
      if (typeof manifest.setupId !== 'string' || typeof manifest.version !== 'string') continue;
      inventory.set(`${manifest.setupId}@${manifest.version}`, {
        versionId: `${manifest.setupId}@${manifest.version}`,
        sealed: manifest.state !== 'DRAFT',
        config: (manifest.config ?? null) as ResolvedComparator['config'],
      });
    } catch {
      // An unreadable manifest must not silently become a missing one; it also must not abort every
      // other seal. It stays absent from the inventory, so anything naming it is refused.
    }
  }
  return inventory;
}

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
    // QDR-11: a DIVERSIFICATION seal must resolve `comparatorVersionId` against the real sealed
    // inventory. Non-DIVERSIFICATION seals never consult it, so this scan costs them nothing.
    const inventory = await readSealedManifestInventory(dirname(manifestPath));
    // QDR-12: a real sealed manifest ALWAYS wins. The historical-anchor registry is consulted only
    // when none exists, so an anchor can never shadow or soften a manifest that does.
    const anchors = historicalAnchorIndex();
    await writeManifest(manifestPath, sealExperiment(await readManifest(manifestPath), {
      resolveComparator: (versionId) => {
        const sealed = inventory.get(versionId);
        if (sealed) return sealed;
        const anchor = anchors.get(versionId);
        if (!anchor) return null;
        console.log(
          `comparator ${versionId} resolved to a QDR-12 HISTORICAL ANCHOR (preregistered `
          + `${anchor.preregisteredAt} at ${anchor.preregistrationSha}, before the manifest protocol). `
          + 'Admissible for A/B identity and isolation ONLY — it is never evidence and contributes no result.',
        );
        return { versionId: anchor.versionId, sealed: true, config: anchor.config };
      },
    }));
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
    // The terminal label is CLASS-SCOPED: `assertStatusMatchesSealedClass` refuses a bare 'REJECTED'
    // on a BETA or DIVERSIFICATION manifest, so hardcoding it made those classes unabandonable — a
    // lane could be started and then never closed. The class is read from the SEALED config, so the
    // label is hash-anchored and cannot be softened by choosing a different one here.
    const abandoned = await readManifest(manifestPath);
    const abandonedClass = productClassFromConfig(abandoned.config);
    const abandonStatus = abandonedClass === 'DIVERSIFICATION'
      ? 'REJECTED_DIVERSIFICATION' as const
      : abandonedClass === 'BETA' ? 'REJECTED_BETA' as const : 'REJECTED' as const;
    await finalizeExperiment(manifestPath, {
      runKind: 'ABANDONED',
      status: abandonStatus,
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
