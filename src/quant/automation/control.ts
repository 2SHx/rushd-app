// Rushd Quant — kill-switch helpers (QUANT_DESIGN.md §7). QuantControl is a singleton row;
// halted=true stops ALL automation. Read-side self-heals (creates the default row) so a
// missing row is never mistaken for "not halted" via a crash, and never mistaken for halted.
import { prisma } from '@/lib/prisma';

const SINGLETON_ID = 'singleton';

/** True when the kill-switch is engaged. Creates the default (not halted) row if missing. */
export async function isHalted(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Promise<boolean> {
  if (['1', 'true', 'on'].includes((env.QUANT_KILL_SWITCH ?? '').toLowerCase())) return true;
  const control = await prisma.quantControl.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, halted: false },
    update: {},
  });
  return control.halted;
}

/** Engage or release the kill-switch, with an optional reason. */
export async function setHalt(halted: boolean, reason?: string): Promise<void> {
  await prisma.quantControl.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, halted, reason },
    update: { halted, reason },
  });
}
