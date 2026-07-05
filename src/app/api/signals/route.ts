import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { NextResponse } from 'next/server';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'mock-key',
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

const SignalSchema = z.object({
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  asset: z.string(),
  reasoningArabic: z.string(),
  reasoningEnglish: z.string(),
  educationalConcept: z.string(),
  xpReward: z.number()
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { symbol, market, currentPrice, portfolioHoldings } = body;

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing API Key");
    }

    const model = openai('qwen2.5-72b-instruct');

    const result = await generateObject({
      model,
      schema: SignalSchema,
      system: `You are an expert financial advisor AI for 'Rushd Financial', a gamified family investment platform.
      Analyze the provided asset in the ${market} market. Provide a trade recommendation (BUY, SELL, HOLD).
      You must also teach a financial concept. Output strictly valid JSON.`,
      prompt: `Analyze ${symbol} currently trading at ${currentPrice}. User holds: ${JSON.stringify(portfolioHoldings)}.`
    });

    return NextResponse.json(result.object);
  } catch (error) {
    // Fallback Mock Response for MVP without API keys
    return NextResponse.json({
      action: 'BUY',
      asset: 'AAPL',
      reasoningArabic: "يبدو أن السهم مقوم بأقل من قيمته الحقيقية ويوفر فرصة نمو جيدة.",
      reasoningEnglish: "The stock appears undervalued based on technicals and offers a strong growth opportunity.",
      educationalConcept: "Value Investing: The strategy of selecting stocks that trade for less than their intrinsic values.",
      xpReward: 50
    });
  }
}
