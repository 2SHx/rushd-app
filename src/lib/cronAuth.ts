// Shared auth for every signed cron route.
//
// Two defects this consolidates:
//  1. `secretMatches` was duplicated verbatim in three routes while `quant-ingest` used a plain
//     `!==`, a timing side channel on an endpoint that places orders. One canonical home.
//  2. Every cron route exported POST only, but Vercel Cron issues GET, so scheduling them would
//     have returned 405 on every invocation — a scheduler that looks configured in the dashboard
//     and silently never runs. Routes now expose both verbs through the SAME check; GET is not a
//     weaker path, it simply carries no body.
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

/** Constant-time compare. Length is checked first because timingSafeEqual throws on a mismatch. */
export function secretMatches(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Returns a rejection response, or `null` when the caller is authorised.
 *
 * Fails closed on a missing secret: an unconfigured deployment refuses rather than accepting
 * everything. Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically once the
 * variable is set, so the same check serves both the scheduler and manual invocation.
 */
export function rejectUnauthorizedCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET environment variable is missing.');
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !secretMatches(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
