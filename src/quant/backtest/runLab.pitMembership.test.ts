import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  loadFixtures: vi.fn(),
  simulateDaily: vi.fn(),
  simulateBook: vi.fn(),
  createBacktestRun: vi.fn(),
}));

vi.mock('../data/fixtureLoader', () => ({ loadAllFixtures: calls.loadFixtures }));
vi.mock('./engine', async (importOriginal) => ({
  ...await importOriginal<typeof import('./engine')>(),
  simulateSetupDaily: calls.simulateDaily,
}));
vi.mock('./portfolioEngine', async (importOriginal) => ({
  ...await importOriginal<typeof import('./portfolioEngine')>(),
  simulateStrategyBook: calls.simulateBook,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    backtestRun: { create: calls.createBacktestRun },
    $disconnect: vi.fn(),
  },
}));

import { runLab } from './runLab';
import {
  DataQualityPitError,
  historicalMembershipMarker,
  PIT_MEMBERSHIP_REQUIRED_SETUP_IDS,
  assertTerminalPointInTimeMembership,
} from '../universe/pointInTimeMembership';

describe('runLab terminal PIT membership fence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks every audited terminal setup before load, simulation, or persistence', async () => {
    const writeFile = vi.spyOn(fs, 'writeFileSync');

    for (const setup of PIT_MEMBERSHIP_REQUIRED_SETUP_IDS) {
      try {
        await runLab({
          setup,
          from: '2020-01-01',
          to: '2020-12-31',
          writeResultsFile: true,
          persistRun: true,
        });
        throw new Error(`expected ${setup} to fail PIT preflight`);
      } catch (error) {
        expect(error).toBeInstanceOf(DataQualityPitError);
        expect((error as DataQualityPitError).reasonCode).toBe('DATA_QUALITY_PIT_FAILURE');
        expect((error as DataQualityPitError).detailCode)
          .toBe('HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING');
        expect((error as DataQualityPitError).evidence).toEqual({
          failure: 'HISTORICAL_MEMBERSHIP_SNAPSHOTS_MISSING',
          setupId: setup,
        });
      }
    }

    expect(calls.loadFixtures).not.toHaveBeenCalled();
    expect(calls.simulateDaily).not.toHaveBeenCalled();
    expect(calls.simulateBook).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(calls.createBacktestRun).not.toHaveBeenCalled();
  });

  it('does not block an unaffected terminal setup or an explicit diagnostic', () => {
    expect(() => assertTerminalPointInTimeMembership({
      setupId: 'dual-momentum-rotation',
      terminal: true,
    })).not.toThrow();
    expect(() => assertTerminalPointInTimeMembership({
      setupId: PIT_MEMBERSHIP_REQUIRED_SETUP_IDS[0],
      terminal: false,
    })).not.toThrow();
    expect(historicalMembershipMarker(PIT_MEMBERSHIP_REQUIRED_SETUP_IDS[0], false))
      .toBe('unverified-diagnostic-only');
  });
});
