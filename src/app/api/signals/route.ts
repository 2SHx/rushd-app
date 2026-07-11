import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { getCachedShariaVerdict, registry, TokenBucket } from '@/services/marketData';

const DEFAULT_APP_LLM_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_APP_LLM_MODEL = 'openai/gpt-oss-20b:free';

function appLlmEnabled() {
  return process.env.APP_LLM_MODE === 'live' && !!process.env.APP_LLM_API_KEY;
}

function offlineSignal(symbol: string) {
  return {
    action: 'HOLD' as const,
    asset: symbol,
    reasoningArabic: 'الوضع المحلي التعليمي لا يولّد توصية تداول؛ راجع بيانات السهم ومخاطره قبل التعلّم بالمحاكاة.',
    reasoningEnglish: 'Local educational mode does not generate a trade recommendation; review the asset data and risks in the simulator.',
    educationalConcept: 'A HOLD result means no simulated position change is proposed without an explicitly enabled live model.',
    xpReward: 0,
    complianceTag: 'EDUCATIONAL_ONLY' as const,
  };
}

// Limit LLM signal calls: max 5, refills 0.1 per second (1 every 10s)
const signalsLimiter = new TokenBucket(5, 0.1);

const SignalSchema = z.object({
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  asset: z.string(),
  reasoningArabic: z.string(),
  reasoningEnglish: z.string(),
  educationalConcept: z.string(),
  xpReward: z.number(),
  complianceTag: z.enum(['HALAL', 'HARAM', 'MASHBOOH', 'EDUCATIONAL_ONLY']),
});

export async function POST(req: Request) {
  let requestedSymbol: string | undefined;
  try {
    // 1. Authenticate Request
    const user = await requireSession();

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    // 2. Validate Request Parameters
    const parsed = z
      .object({
        symbol: z.string().min(1).max(10),
        market: z.enum(['TASI', 'NASDAQ']),
        currentPrice: z.number().positive(),
      })
      .safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { symbol, market, currentPrice } = parsed.data;
    requestedSymbol = symbol;

    // Apply strict symbol regex pattern checks: numeric for TASI, alphabetic for NASDAQ
    if (market === 'TASI' && !/^\d+$/.test(symbol)) {
      return NextResponse.json({ error: 'invalid_tasi_symbol' }, { status: 400 });
    }
    if (market === 'NASDAQ' && !/^[a-zA-Z]+$/.test(symbol)) {
      return NextResponse.json({ error: 'invalid_nasdaq_symbol' }, { status: 400 });
    }

    if (!appLlmEnabled()) return NextResponse.json(offlineSignal(symbol));

    // 3. Server-Derive Portfolio Holdings (Never trust client input)
    const portfolioItems = await prisma.portfolioItem.findMany({
      where: { userId: user.id },
    });

    const portfolioHoldings = portfolioItems.map((item) => ({
      symbol: item.symbol,
      shares: Number(item.shares),
      market: item.market,
    }));

    if (!signalsLimiter.tryAcquire()) {
      return NextResponse.json(
        { error: 'rate_limit_exceeded', message: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    const provider = createOpenAI({
      apiKey: process.env.APP_LLM_API_KEY,
      baseURL: process.env.APP_LLM_BASE_URL || DEFAULT_APP_LLM_BASE_URL,
    });
    const model = provider(process.env.APP_LLM_MODEL || DEFAULT_APP_LLM_MODEL);

    const result = await generateObject({
      model,
      schema: SignalSchema,
      system: `You are an expert financial advisor AI for 'Rushd Financial', a gamified family investment platform.
      Analyze the provided asset in the ${market} market and issue a recommendation (BUY, SELL, HOLD).
      Constraints:
      1. Content must be minor-appropriate (ages ~8-17) and educational. Never provide real investment advice.
      2. Output must be Arabic-first (Modern Standard Arabic, clear financial literacy register). Do not use transliterated English jargon where proper Arabic terms exist (use محفظة, سهم, ربح).
      3. Set complianceTag to EDUCATIONAL_ONLY. The server applies deterministic Sharia screening; do not infer compliance.`,
      prompt: `Analyze ${symbol} currently trading at ${currentPrice}. User portfolio holdings: ${JSON.stringify(portfolioHoldings)}.`
    });

    const verdict = await getCachedShariaVerdict(registry.getScreener(), symbol, market);
    const verified = verdict.source === 'zoya';
    const safeSignal = {
      ...result.object,
      asset: symbol,
      action: (!verified || (!verdict.compliant && result.object.action === 'BUY'))
        ? ('HOLD' as const)
        : result.object.action,
      complianceTag: verified
        ? (verdict.compliant ? ('HALAL' as const) : ('HARAM' as const))
        : ('EDUCATIONAL_ONLY' as const),
    };

    return NextResponse.json(safeSignal);
  } catch (error) {
    // Check if error is AuthzError
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as any).response;
    }
    
    return NextResponse.json(offlineSignal(requestedSymbol || 'UNKNOWN'));
  }
}
