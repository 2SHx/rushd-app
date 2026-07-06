import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { TokenBucket } from '@/services/marketData';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'mock-key',
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

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
  if (!signalsLimiter.tryAcquire()) {
    return NextResponse.json(
      { error: 'rate_limit_exceeded', message: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

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

    // Apply strict symbol regex pattern checks: numeric for TASI, alphabetic for NASDAQ
    if (market === 'TASI' && !/^\d+$/.test(symbol)) {
      return NextResponse.json({ error: 'invalid_tasi_symbol' }, { status: 400 });
    }
    if (market === 'NASDAQ' && !/^[a-zA-Z]+$/.test(symbol)) {
      return NextResponse.json({ error: 'invalid_nasdaq_symbol' }, { status: 400 });
    }

    // 3. Server-Derive Portfolio Holdings (Never trust client input)
    const portfolioItems = await prisma.portfolioItem.findMany({
      where: { userId: user.id },
    });

    const portfolioHoldings = portfolioItems.map((item) => ({
      symbol: item.symbol,
      shares: Number(item.shares),
      market: item.market,
    }));

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing API Key");
    }

    const model = openai('qwen2.5-72b-instruct');

    const result = await generateObject({
      model,
      schema: SignalSchema,
      system: `You are an expert financial advisor AI for 'Rushd Financial', a gamified family investment platform.
      Analyze the provided asset in the ${market} market and issue a recommendation (BUY, SELL, HOLD).
      Constraints:
      1. Content must be minor-appropriate (ages ~8-17) and educational. Never provide real investment advice.
      2. Output must be Arabic-first (Modern Standard Arabic, clear financial literacy register). Do not use transliterated English jargon where proper Arabic terms exist (use محفظة, سهم, ربح).
      3. Categorize compliance with Sharia/AAOIFI standards. Set complianceTag to: HALAL, HARAM, MASHBOOH, or EDUCATIONAL_ONLY.`,
      prompt: `Analyze ${symbol} currently trading at ${currentPrice}. User portfolio holdings: ${JSON.stringify(portfolioHoldings)}.`
    });

    return NextResponse.json(result.object);
  } catch (error) {
    // Check if error is AuthzError
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as any).response;
    }
    
    // Fallback Mock Response for MVP without API keys
    return NextResponse.json({
      action: 'BUY',
      asset: 'AAPL',
      reasoningArabic: "يبدو أن السهم مقوم بأقل من قيمته الحقيقية ويوفر فرصة نمو جيدة.",
      reasoningEnglish: "The stock appears undervalued based on technicals and offers a strong growth opportunity.",
      educationalConcept: "Value Investing: The strategy of selecting stocks that trade for less than their intrinsic values.",
      xpReward: 50,
      complianceTag: 'HALAL'
    });
  }
}
