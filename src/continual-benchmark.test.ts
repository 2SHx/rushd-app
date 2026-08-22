import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as continualBenchmark from '../scripts/continual-benchmark.mjs';
import * as continualHarness from '../scripts/continual-harness.mjs';

type JsonObject = Record<string, unknown>;
type BenchmarkCase = JsonObject & {
  caseId: string;
  caseVersion: number;
  role: string;
  task: string;
  primaryPath: string;
  taskTags: string[];
  startCommit: string;
  acceptanceCommands: string[];
  rubric: Array<{ rubricId: string; description: string; weight: number }>;
  safetyCommands: string[];
  caseHash: string;
};
type Manifest = JsonObject & {
  schemaVersion: 1;
  episodesPerArm: number;
  candidateThreshold: number;
  failureCodes: string[];
  caseFiles: string[];
  suiteHash: string;
};
type Event = ReturnType<typeof continualHarness.createEvent>;
type VerificationContext = {
  ledger: Event[];
  checkpoint: { schemaVersion: 1; eventCount: number; headHash: string };
};
type EpisodeOutcomeInput = {
  dispatchFailureCode: null | 'DISPATCH_ERROR' | 'TIMEOUT';
  patch: string;
  changedPaths: string[];
  allowedChangedPaths: string[];
  acceptanceExitStatuses: number[];
  safetyExitStatuses: number[];
  rubricIds: string[];
};

const {
  canonicalize,
  commandDigest,
  evaluateEpisodeOutcome,
  hashCase,
  hashSuite,
  parseBenchmarkCommand,
  scoreEpisode,
  scorecardSubjectHash,
  verifyManifest,
  verifyReviewArtifact,
  verifyScorecard,
} = continualBenchmark as typeof continualBenchmark & {
  canonicalize: (value: unknown) => string;
  commandDigest: (command: string) => string;
  parseBenchmarkCommand: (command: string) => string[];
  evaluateEpisodeOutcome: (input: EpisodeOutcomeInput) => {
    passedRubricIds: string[]; score: number; failureCode: string;
  };
  hashCase: (benchmarkCase: BenchmarkCase) => string;
  hashSuite: (cases: BenchmarkCase[]) => string;
  scoreEpisode: (
    rubric: BenchmarkCase['rubric'],
    passedRubricIds: string[],
  ) => number;
  scorecardSubjectHash: (scorecard: JsonObject) => string;
  verifyManifest: (manifest: Manifest, cases: BenchmarkCase[]) => boolean;
  verifyReviewArtifact: (scorecard: JsonObject, artifactBytes: string | Buffer) => boolean;
  verifyScorecard: (
    scorecard: JsonObject,
    manifest: Manifest,
    cases: BenchmarkCase[],
    context: VerificationContext,
  ) => boolean;
};

const BENCHMARK_ROOT = path.join(process.cwd(), '.agents', 'continual', 'benchmarks');
const manifest = JSON.parse(fs.readFileSync(
  path.join(BENCHMARK_ROOT, 'manifest.json'),
  'utf8',
)) as Manifest;
const cases = manifest.caseFiles.map((caseFile) => JSON.parse(fs.readFileSync(
  path.join(BENCHMARK_ROOT, caseFile),
  'utf8',
)) as BenchmarkCase);
const caseById = new Map(cases.map((benchmarkCase) => [benchmarkCase.caseId, benchmarkCase]));
const HEAD_SHA = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const EVALUATOR_PATH = 'scripts/continual-benchmark.mjs';
const EVALUATOR_COMMIT = execFileSync(
  'git',
  ['log', '-1', '--format=%H', '--', EVALUATOR_PATH],
  { encoding: 'utf8' },
).trim();
const REVIEW_ARTIFACT_PATH = '.agents/continual/benchmarks/fixtures/m16-qa-review.json';
const REVIEW_ARTIFACT_BYTES = execFileSync(
  'git',
  ['show', `${HEAD_SHA}:${REVIEW_ARTIFACT_PATH}`],
);
const UNRELATED_ARTIFACT_PATH = '.agents/continual/head.json';
const UNRELATED_ARTIFACT_BYTES = execFileSync(
  'git',
  ['show', `${HEAD_SHA}:${UNRELATED_ARTIFACT_PATH}`],
);
const PASS_DIGEST = createHash('sha256').update('PASS').digest('hex');
const PATCH_HASH = createHash('sha256').update('development-only benchmark patch').digest('hex');
const BASELINE_PROJECTION_HASH = createHash('sha256').update('baseline projection').digest('hex');
const CANDIDATE_PROJECTION_HASH = createHash('sha256').update('candidate projection').digest('hex');
const FIXTURE_RUNNER = 'deterministic-unit-fixture-runner';
const FIXTURE_MODEL = 'non-claiming-unit-fixture-model';
const FAILURE_CODES = [
  'NONE',
  'DISPATCH_ERROR',
  'TIMEOUT',
  'NO_ARTIFACT',
  'SCOPE_VIOLATION',
  'ACCEPTANCE_FAIL',
  'SAFETY_FAIL',
  'EVIDENCE_INVALID',
] as const;
const PROPOSAL_EVENT = continualHarness.createEvent({
  schemaVersion: 1,
  eventId: 'm16-benchmark-proposal-v1',
  action: 'PROPOSE',
  lessonId: 'g11-evidence-integrity',
  lessonVersion: 1,
  roles: ['quant-strategist'],
  paths: ['src/quant'],
  taskTags: ['continual-benchmark'],
  text: 'Bind benchmark evidence to reviewed semantic inputs.',
  proposedBy: 'benchmark-proposer',
});

describe('pure benchmark episode safety seams', () => {
  it.each([
    ['npx tsc --noEmit', ['npx', 'tsc', '--noEmit']],
    ['npx vitest run src/continual-benchmark.test.ts', [
      'npx', 'vitest', 'run', 'src/continual-benchmark.test.ts',
    ]],
    ['npx vitest run src/quant/backtest/experimentProtocol.test.ts', [
      'npx', 'vitest', 'run', 'src/quant/backtest/experimentProtocol.test.ts',
    ]],
  ])('parses the exact allowed argv form %s', (command, argv) => {
    expect(parseBenchmarkCommand(command)).toEqual(argv);
  });

  it.each([
    'npx tsc --noEmit && echo unsafe',
    'npx tsc --noEmit extra',
    'npx vitest run src/example.test.ts; echo unsafe',
    'npx vitest run src/example.test.ts | tee output.txt',
    'npx vitest run src/example.test.ts --reporter verbose',
    'npx vitest run --runInBand',
    'npx vitest run /tmp/example.test.ts',
    'npx vitest run C:\\tmp\\example.test.ts',
    'npx vitest run ../example.test.ts',
    'npx vitest run src/../example.test.ts',
    'npx vitest run src/example.spec.ts',
    'npx vitest run src/one.test.ts src/two.test.ts',
    'npx vitest run $(whoami).test.ts',
    'npm test',
  ])('rejects unsafe or non-exact benchmark command %s', (command) => {
    expect(() => parseBenchmarkCommand(command)).toThrow(/argv|path|allowed|exact|operator|unsafe/i);
  });

  const successfulEpisode: EpisodeOutcomeInput = {
    dispatchFailureCode: null,
    patch: 'diff --git a/src/example.ts b/src/example.ts',
    changedPaths: ['src/example.ts'],
    allowedChangedPaths: ['src/example.ts'],
    acceptanceExitStatuses: [0],
    safetyExitStatuses: [0, 0],
    rubricIds: ['behavior', 'safety'],
  };

  it('awards every rubric id and 100 only to a fully successful episode', () => {
    expect(evaluateEpisodeOutcome({
      ...successfulEpisode,
      changedPaths: [...successfulEpisode.changedPaths],
      allowedChangedPaths: [...successfulEpisode.allowedChangedPaths],
      acceptanceExitStatuses: [...successfulEpisode.acceptanceExitStatuses],
      safetyExitStatuses: [...successfulEpisode.safetyExitStatuses],
      rubricIds: [...successfulEpisode.rubricIds],
    })).toEqual({
      passedRubricIds: ['behavior', 'safety'],
      score: 100,
      failureCode: 'NONE',
    });
  });

  const failureCases: Array<[string, Partial<EpisodeOutcomeInput>, string]> = [
    ['dispatch error', { dispatchFailureCode: 'DISPATCH_ERROR', patch: '', changedPaths: ['outside.ts'], acceptanceExitStatuses: [1], safetyExitStatuses: [1] }, 'DISPATCH_ERROR'],
    ['timeout', { dispatchFailureCode: 'TIMEOUT', patch: '', changedPaths: ['outside.ts'], acceptanceExitStatuses: [1], safetyExitStatuses: [1] }, 'TIMEOUT'],
    ['no artifact', { patch: '   ', changedPaths: ['outside.ts'], acceptanceExitStatuses: [1], safetyExitStatuses: [1] }, 'NO_ARTIFACT'],
    ['scope violation', { changedPaths: ['src/outside.ts'], acceptanceExitStatuses: [1], safetyExitStatuses: [1] }, 'SCOPE_VIOLATION'],
    ['simultaneous acceptance and safety failure', { acceptanceExitStatuses: [1], safetyExitStatuses: [1] }, 'SAFETY_FAIL'],
    ['safety failure', { safetyExitStatuses: [1] }, 'SAFETY_FAIL'],
  ];

  it.each(failureCases)('returns empty rubric credit with prioritized %s', (_label, overrides, failureCode) => {
    const input: EpisodeOutcomeInput = {
      ...successfulEpisode,
      changedPaths: [...successfulEpisode.changedPaths],
      allowedChangedPaths: [...successfulEpisode.allowedChangedPaths],
      acceptanceExitStatuses: [...successfulEpisode.acceptanceExitStatuses],
      safetyExitStatuses: [...successfulEpisode.safetyExitStatuses],
      rubricIds: [...successfulEpisode.rubricIds],
    };
    Object.assign(input, overrides);
    expect(evaluateEpisodeOutcome(input)).toEqual({ passedRubricIds: [], score: 0, failureCode });
  });
});
const VERIFICATION_CONTEXT: VerificationContext = {
  ledger: [PROPOSAL_EVENT],
  checkpoint: {
    schemaVersion: 1,
    eventCount: 1,
    headHash: PROPOSAL_EVENT.eventHash,
  },
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function commandResults(commands: string[]) {
  return commands.map((command) => ({
    command,
    commandDigest: commandDigest(command),
    exitStatus: 0,
    outputDigest: PASS_DIGEST,
  }));
}

function verify(scorecard: JsonObject, context: VerificationContext = VERIFICATION_CONTEXT) {
  return verifyScorecard(scorecard, manifest, cases, context);
}

function localScorecardSubjectHash(scorecard: JsonObject) {
  const { reviewedBy: _reviewedBy, reviewArtifact: _reviewArtifact, ...subject } = scorecard;
  return createHash('sha256').update(canonicalize(subject)).digest('hex');
}

function canonicalReviewArtifact(scorecard: JsonObject, overrides: JsonObject = {}) {
  return {
    schemaVersion: 1,
    runId: scorecard.runId,
    scorecardSubjectHash: localScorecardSubjectHash(scorecard),
    verdict: 'PASS',
    reviewedBy: scorecard.reviewedBy,
    ...overrides,
  };
}

function episode(
  benchmarkCase: BenchmarkCase,
  arm: 'baseline' | 'candidate',
  index: number,
) {
  const passedRubricIds = arm === 'candidate'
    && benchmarkCase.caseId === 'g11-semantic-evidence-hash-binding'
    ? ['semantic-payload-bound', 'offline-focused-change']
    : [benchmarkCase.rubric[0].rubricId];
  return {
    caseId: benchmarkCase.caseId,
    caseVersion: benchmarkCase.caseVersion,
    caseHash: benchmarkCase.caseHash,
    arm,
    index,
    startCommit: benchmarkCase.startCommit,
    endCommit: EVALUATOR_COMMIT,
    patchHash: PATCH_HASH,
    dispatch: {
      runner: FIXTURE_RUNNER,
      model: FIXTURE_MODEL,
      effort: 'high',
      task: benchmarkCase.task,
      environment: { apiKeys: 'unset', locale: 'C' },
      projectionHash: arm === 'baseline'
        ? BASELINE_PROJECTION_HASH
        : CANDIDATE_PROJECTION_HASH,
    },
    acceptanceCommands: commandResults(benchmarkCase.acceptanceCommands),
    safetyCommands: commandResults(benchmarkCase.safetyCommands),
    passedRubricIds,
    score: scoreEpisode(benchmarkCase.rubric, passedRubricIds),
    failureCode: 'NONE',
  };
}

function passingScorecard(): JsonObject {
  const episodes = cases.flatMap((benchmarkCase) => (
    (['baseline', 'candidate'] as const).flatMap((arm) => (
      [1, 2, 3].map((index) => episode(benchmarkCase, arm, index))
    ))
  ));
  const scorecard: JsonObject = {
    schemaVersion: 1,
    runId: 'm16-development-contract-fixture',
    createdAt: '2026-08-16T00:00:00.000Z',
    evaluatorCommit: EVALUATOR_COMMIT,
    suiteHash: manifest.suiteHash,
    proposal: {
      proposalHash: PROPOSAL_EVENT.eventHash,
      lessonId: PROPOSAL_EVENT.lessonId,
      lessonVersion: PROPOSAL_EVENT.lessonVersion,
    },
    baselineProjectionHash: BASELINE_PROJECTION_HASH,
    candidateProjectionHash: CANDIDATE_PROJECTION_HASH,
    runner: FIXTURE_RUNNER,
    model: FIXTURE_MODEL,
    effort: 'high',
    generatedBy: 'benchmark-generator',
    episodes,
    comparison: {
      baselineMean: 45,
      candidateMean: 55,
      delta: 10,
      perCaseMeans: {
        'g11-authoritative-roster-seal': { baseline: 45, candidate: 45 },
        'g11-semantic-evidence-hash-binding': { baseline: 45, candidate: 65 },
      },
      threshold: 10,
      safetyVeto: false,
      result: 'PASS',
    },
    reviewedBy: 'qa-reviewer',
  };
  scorecard.reviewArtifact = {
    path: REVIEW_ARTIFACT_PATH,
    digest: createHash('sha256').update(REVIEW_ARTIFACT_BYTES).digest('hex'),
    commit: HEAD_SHA,
  };
  return scorecard;
}

describe('frozen continual benchmark manifest', () => {
  it('verifies exactly two development-only, hash-pinned three-by-three tracer cases', () => {
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      episodesPerArm: 3,
      candidateThreshold: 10,
      failureCodes: FAILURE_CODES,
    });
    expect(cases.map(({ caseId }) => caseId).sort()).toEqual([
      'g11-authoritative-roster-seal',
      'g11-semantic-evidence-hash-binding',
    ]);
    expect(cases).toHaveLength(2);
    expect(cases.every(({ task }) => /development-only/i.test(task))).toBe(true);
    expect(cases.every(({ task }) => /do not .*claim investment performance/i.test(task))).toBe(true);
    expect(verifyManifest(manifest, cases)).toBe(true);
  });

  it('uses stable canonical case and suite hashes and detects semantic drift', () => {
    for (const benchmarkCase of cases) {
      expect(hashCase(benchmarkCase)).toBe(benchmarkCase.caseHash);
      expect(hashCase(Object.fromEntries(
        Object.entries(benchmarkCase).reverse(),
      ) as BenchmarkCase)).toBe(benchmarkCase.caseHash);
      expect(hashCase({ ...benchmarkCase, task: `${benchmarkCase.task} changed` }))
        .not.toBe(benchmarkCase.caseHash);
    }
    expect(hashSuite(cases)).toBe(manifest.suiteHash);
    expect(hashSuite([...cases].reverse())).toBe(manifest.suiteHash);
  });

  it.each([
    ['task', (benchmarkCase: BenchmarkCase) => {
      benchmarkCase.task = `${benchmarkCase.task} Semantically rewritten.`;
    }],
    ['acceptance command', (benchmarkCase: BenchmarkCase) => {
      benchmarkCase.acceptanceCommands[0] = 'npx vitest run substituted-semantic-contract.test.ts';
    }],
  ])('rejects a recomputed %s against the evaluator-pinned suite', (_label, mutate) => {
    const changedCases = clone(cases);
    mutate(changedCases[0]);
    changedCases[0].caseHash = hashCase(changedCases[0]);
    const changedManifest = { ...manifest, suiteHash: hashSuite(changedCases) };
    expect(() => verifyManifest(changedManifest, changedCases)).toThrow(/evaluator|pinned|frozen|suite/i);
  });

  it.each([
    ['an abbreviated start commit', cases[0].startCommit.slice(0, 12)],
    ['an unresolved start commit', '0'.repeat(40)],
  ])('rejects %s', (_label, startCommit) => {
    const changedCases = clone(cases);
    changedCases[0].startCommit = startCommit;
    changedCases[0].caseHash = hashCase(changedCases[0]);
    const changedManifest = { ...manifest, suiteHash: hashSuite(changedCases) };
    expect(() => verifyManifest(changedManifest, changedCases)).toThrow(/commit|resolve|40/i);
  });
});

describe('paired scorecard contract', () => {
  it('validates equal pairing, frozen dispatch inputs, projections, commands, and arithmetic', () => {
    const scorecard = passingScorecard();
    expect((scorecard.episodes as unknown[])).toHaveLength(12);
    expect(verify(scorecard)).toBe(true);

    const mutations: Array<[string, (changed: JsonObject) => void, RegExp]> = [
      ['unequal arms', (changed) => { (changed.episodes as JsonObject[]).pop(); }, /episode|pair|arm/i],
      ['runner drift', (changed) => {
        (((changed.episodes as JsonObject[])[0].dispatch as JsonObject).runner) = 'other';
      }, /runner|dispatch|identical/i],
      ['model drift', (changed) => {
        (((changed.episodes as JsonObject[])[0].dispatch as JsonObject).model) = 'other';
      }, /model|dispatch|identical/i],
      ['effort drift', (changed) => {
        (((changed.episodes as JsonObject[])[0].dispatch as JsonObject).effort) = 'low';
      }, /effort|dispatch|identical/i],
      ['task drift', (changed) => {
        (((changed.episodes as JsonObject[])[0].dispatch as JsonObject).task) = 'different';
      }, /task|dispatch|identical/i],
      ['environment drift', (changed) => {
        (((changed.episodes as JsonObject[])[0].dispatch as JsonObject).environment) = { locale: 'ar' };
      }, /environment|dispatch|identical/i],
      ['projection drift', (changed) => {
        (((changed.episodes as JsonObject[])[0].dispatch as JsonObject).projectionHash) = CANDIDATE_PROJECTION_HASH;
      }, /projection|arm/i],
      ['score drift', (changed) => { ((changed.episodes as JsonObject[])[0].score as number) += 1; }, /score|rubric/i],
      ['mean drift', (changed) => { ((changed.comparison as JsonObject).candidateMean as number) += 1; }, /mean|arithmetic/i],
      ['command drift', (changed) => {
        const result = ((changed.episodes as JsonObject[])[0].acceptanceCommands as JsonObject[])[0];
        result.commandDigest = '0'.repeat(64);
      }, /command|digest/i],
      ['acceptance command substitution', (changed) => {
        const result = ((changed.episodes as JsonObject[])[0].acceptanceCommands as JsonObject[])[0];
        result.command = 'npx vitest run substituted.test.ts';
        result.commandDigest = commandDigest(String(result.command));
      }, /acceptance|command|case/i],
      ['safety command substitution', (changed) => {
        const result = ((changed.episodes as JsonObject[])[0].safetyCommands as JsonObject[])[0];
        result.command = 'npx tsc --version';
        result.commandDigest = commandDigest(String(result.command));
      }, /safety|command|case/i],
    ];
    for (const [_label, mutate, expected] of mutations) {
      const changed = clone(scorecard);
      mutate(changed);
      expect(() => verify(changed), _label).toThrow(expected);
    }
  });

  it('computes weighted binary scores and enforces the threshold and per-case floor', () => {
    const semanticCase = caseById.get('g11-semantic-evidence-hash-binding')!;
    expect(scoreEpisode(semanticCase.rubric, [])).toBe(0);
    expect(scoreEpisode(semanticCase.rubric, ['semantic-payload-bound'])).toBe(45);
    expect(scoreEpisode(semanticCase.rubric, semanticCase.rubric.map(({ rubricId }) => rubricId)))
      .toBe(100);
    expect(verify(passingScorecard())).toBe(true);

    const belowThreshold = passingScorecard();
    for (const item of belowThreshold.episodes as JsonObject[]) {
      if (item.arm === 'candidate'
        && item.caseId === 'g11-semantic-evidence-hash-binding') {
        item.passedRubricIds = ['semantic-payload-bound'];
        item.score = 45;
      }
    }
    belowThreshold.comparison = {
      baselineMean: 45,
      candidateMean: 45,
      delta: 0,
      perCaseMeans: {
        'g11-authoritative-roster-seal': { baseline: 45, candidate: 45 },
        'g11-semantic-evidence-hash-binding': { baseline: 45, candidate: 45 },
      },
      threshold: 10,
      safetyVeto: false,
      result: 'PASS',
    };
    expect(() => verify(belowThreshold)).toThrow(/threshold|delta|10/i);

    const regress = passingScorecard();
    for (const item of regress.episodes as JsonObject[]) {
      if (item.arm !== 'candidate') continue;
      const benchmarkCase = caseById.get(String(item.caseId))!;
      item.passedRubricIds = item.caseId === 'g11-authoritative-roster-seal'
        ? [benchmarkCase.rubric[2].rubricId]
        : benchmarkCase.rubric.map(({ rubricId }) => rubricId);
      item.score = item.caseId === 'g11-authoritative-roster-seal' ? 20 : 100;
    }
    regress.comparison = {
      baselineMean: 45,
      candidateMean: 60,
      delta: 15,
      perCaseMeans: {
        'g11-authoritative-roster-seal': { baseline: 45, candidate: 20 },
        'g11-semantic-evidence-hash-binding': { baseline: 45, candidate: 100 },
      },
      threshold: 10,
      safetyVeto: false,
      result: 'PASS',
    };
    expect(() => verify(regress)).toThrow(/per-case|regression/i);
  });

  it.each(FAILURE_CODES.slice(1))('never permits a PASS with failure code %s', (failureCode) => {
    const scorecard = passingScorecard();
    (scorecard.episodes as JsonObject[])[0].failureCode = failureCode;
    expect(() => verify(scorecard)).toThrow(/failure|invalid|PASS|veto/i);
  });

  it('rejects unknown failures and applies an unconditional safety veto in either arm', () => {
    const unknown = passingScorecard();
    (unknown.episodes as JsonObject[])[0].failureCode = 'UNKNOWN_FAILURE';
    expect(() => verify(unknown)).toThrow(/failure code|taxonomy/i);

    for (const arm of ['baseline', 'candidate']) {
      const unsafe = passingScorecard();
      const unsafeEpisode = (unsafe.episodes as JsonObject[]).find((item) => item.arm === arm)!;
      (unsafeEpisode.safetyCommands as JsonObject[])[0].exitStatus = 1;
      unsafeEpisode.failureCode = 'SAFETY_FAIL';
      expect(() => verify(unsafe)).toThrow(/safety|veto|PASS/i);
    }
  });

  it.each([
    'prompt',
    'response',
    'rawCommandOutput',
    'transcript',
    'hiddenChainOfThought',
    'credentials',
    'userData',
    'productData',
  ])('rejects recursively prohibited raw field %s', (field) => {
    const scorecard = passingScorecard();
    ((scorecard.episodes as JsonObject[])[0].dispatch as JsonObject).nested = {
      [field]: 'must never be stored',
    };
    expect(() => verify(scorecard)).toThrow(/prohibited|raw|field/i);
  });

  it('serializes verified scorecards to byte-stable canonical JSON', () => {
    const scorecard = passingScorecard();
    expect(verify(scorecard)).toBe(true);
    const first = canonicalize(scorecard);
    const reordered = Object.fromEntries(Object.entries(scorecard).reverse());
    const second = canonicalize(reordered);
    expect(second).toBe(first);
    expect(createHash('sha256').update(second).digest('hex'))
      .toBe(createHash('sha256').update(first).digest('hex'));
  });

  it.each([
    ['the generator as reviewer', (scorecard: JsonObject) => {
      scorecard.reviewedBy = scorecard.generatedBy;
    }, /distinct|review/i],
    ['an abbreviated evaluator commit', (scorecard: JsonObject) => {
      scorecard.evaluatorCommit = HEAD_SHA.slice(0, 12);
    }, /commit|resolve|40/i],
    ['a resolving commit without byte-identical evaluator source', (scorecard: JsonObject) => {
      scorecard.evaluatorCommit = cases[0].startCommit;
    }, /evaluator|source|byte|blob/i],
    ['an unresolved review artifact', (scorecard: JsonObject) => {
      (scorecard.reviewArtifact as JsonObject).commit = '0'.repeat(40);
    }, /artifact|commit|resolve/i],
    ['a review artifact digest not bound to its Git blob', (scorecard: JsonObject) => {
      (scorecard.reviewArtifact as JsonObject).digest = '0'.repeat(64);
    }, /artifact|blob|digest/i],
    ['a review artifact path that resolves to a Git tree', (scorecard: JsonObject) => {
      (scorecard.reviewArtifact as JsonObject).path = '.agents/continual';
    }, /artifact|blob|path/i],
    ['an unrelated valid Git blob', (scorecard: JsonObject) => {
      scorecard.reviewArtifact = {
        path: UNRELATED_ARTIFACT_PATH,
        digest: createHash('sha256').update(UNRELATED_ARTIFACT_BYTES).digest('hex'),
        commit: HEAD_SHA,
      };
    }, /artifact|review|schema|subject/i],
    ['a malformed output digest', (scorecard: JsonObject) => {
      const command = ((scorecard.episodes as JsonObject[])[0].safetyCommands as JsonObject[])[0];
      command.outputDigest = 'not-a-sha256';
    }, /output|digest/i],
  ])('rejects %s', (_label, mutate, expected) => {
    const scorecard = passingScorecard();
    mutate(scorecard);
    expect(() => verify(scorecard)).toThrow(expected);
  });

  it('hashes the scorecard subject excluding only review provenance', () => {
    const scorecard = passingScorecard();
    const expected = localScorecardSubjectHash(scorecard);
    expect(scorecardSubjectHash(scorecard)).toBe(expected);

    const reviewOnlyChange = clone(scorecard);
    reviewOnlyChange.reviewedBy = 'different-reviewer';
    reviewOnlyChange.reviewArtifact = { path: 'different', digest: 'different', commit: 'different' };
    expect(scorecardSubjectHash(reviewOnlyChange)).toBe(expected);

    const subjectChange = clone(scorecard);
    subjectChange.runId = 'different-run';
    expect(scorecardSubjectHash(subjectChange)).not.toBe(expected);
  });

  it('accepts only the canonical structured PASS review for the exact scorecard subject', () => {
    const scorecard = passingScorecard();
    const artifact = canonicalReviewArtifact(scorecard);
    expect(verifyReviewArtifact(scorecard, canonicalize(artifact))).toBe(true);
  });

  it.each([
    ['runId', { runId: 'M16-DEVELOPMENT-CONTRACT-FIXTURE' }],
    ['reviewedBy', { reviewedBy: 'QA-REVIEWER' }],
  ])('accepts a casing-only %s review identity variant', (_label, overrides) => {
    const scorecard = passingScorecard();
    const artifact = canonicalReviewArtifact(scorecard, overrides);
    expect(verifyReviewArtifact(scorecard, canonicalize(artifact))).toBe(true);
  });

  it.each([
    ['subject hash', { scorecardSubjectHash: '0'.repeat(64) }, /subject|hash/i],
    ['run id', { runId: 'another-run' }, /runId|run id/i],
    ['reviewer', { reviewedBy: 'another-reviewer' }, /reviewer/i],
    ['FAIL verdict', { verdict: 'FAIL' }, /verdict|PASS/i],
    ['unknown field', { unexpected: true }, /field|unknown/i],
  ])('rejects review artifact with wrong %s', (_label, overrides, expected) => {
    const scorecard = passingScorecard();
    const artifact = canonicalReviewArtifact(scorecard, overrides);
    expect(() => verifyReviewArtifact(scorecard, canonicalize(artifact))).toThrow(expected);
  });

  it('rejects missing review fields and noncanonical review bytes', () => {
    const scorecard = passingScorecard();
    const artifact = canonicalReviewArtifact(scorecard);
    const missing = clone(artifact) as JsonObject;
    delete missing.reviewedBy;
    expect(() => verifyReviewArtifact(scorecard, canonicalize(missing))).toThrow(/field|missing/i);
    expect(() => verifyReviewArtifact(scorecard, JSON.stringify(artifact, null, 2)))
      .toThrow(/canonical/i);
  });

  it.each([
    ['proposal hash', (scorecard: JsonObject) => {
      (scorecard.proposal as JsonObject).proposalHash = 'f'.repeat(64);
    }],
    ['lesson id', (scorecard: JsonObject) => {
      (scorecard.proposal as JsonObject).lessonId = 'another-lesson';
    }],
    ['lesson version', (scorecard: JsonObject) => {
      (scorecard.proposal as JsonObject).lessonVersion = 2;
    }],
  ])('requires the scorecard %s to match one exact verified PROPOSE', (_label, mutate) => {
    const scorecard = passingScorecard();
    mutate(scorecard);
    expect(() => verify(scorecard)).toThrow(/PROPOSE|proposal|ledger|match/i);
  });

  it.each([
    ['checkpoint', (context: VerificationContext) => {
      context.checkpoint.headHash = '0'.repeat(64);
    }],
    ['ledger event', (context: VerificationContext) => {
      (context.ledger[0] as Event & { text: string }).text = 'Edited after hashing.';
    }],
  ])('rejects an unverified provenance %s', (_label, mutate) => {
    const context = clone(VERIFICATION_CONTEXT);
    mutate(context);
    expect(() => verify(passingScorecard(), context)).toThrow(/checkpoint|ledger|hash|proposal/i);
  });

  it('treats generator and reviewer identities as case-insensitively distinct', () => {
    const scorecard = passingScorecard();
    scorecard.generatedBy = 'QA-Reviewer';
    scorecard.reviewedBy = 'qa-reviewer';
    expect(() => verify(scorecard)).toThrow(/distinct|generator|reviewer/i);
  });

  it.each([
    ['runId', 'run\ninjected'],
    ['generatedBy', 'generator\u0000injected'],
    ['reviewedBy', 'reviewer\rinjected'],
    ['proposal.lessonId', 'lesson\ninjected'],
  ])('rejects newline or control characters in identifier %s', (field, value) => {
    const scorecard = passingScorecard();
    if (field === 'proposal.lessonId') (scorecard.proposal as JsonObject).lessonId = value;
    else scorecard[field] = value;
    expect(() => verify(scorecard)).toThrow(/identifier|control|one line|character/i);
  });
});
