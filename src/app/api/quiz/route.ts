import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/services/engines';
import { TokenBucket } from '@/services/marketData';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'mock-key',
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

const TOPIC_ALLOWLIST = [
  'Stock Market Basics',
  'Savings & Jars',
  'Compound Interest',
  'Sharia Compliance',
  'Risk Management',
  'Value Investing',
  'Halal Mutual Funds',
  'TASI Markets',
  'NASDAQ Markets'
];

const QuizSchema = z.object({
  topic: z.string(),
  question: z.string(),
  options: z.array(z.string()).length(4),
  correctOptionIndex: z.number().min(0).max(3),
  explanation: z.string(),
  complianceTag: z.enum(['HALAL', 'HARAM', 'MASHBOOH', 'EDUCATIONAL_ONLY']),
});

// Limit LLM quiz calls: max 5, refills 0.1 per second (1 every 10s)
const quizLimiter = new TokenBucket(5, 0.1);

export async function GET(req: Request) {
  if (!quizLimiter.tryAcquire()) {
    return NextResponse.json(
      { error: 'rate_limit_exceeded', message: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const rawTopic = searchParams.get('topic') || 'Stock Market Basics';
    
    // Sanitize input using the allowlist
    const topic = TOPIC_ALLOWLIST.includes(rawTopic) ? rawTopic : 'Stock Market Basics';

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing API Key");
    }

    const model = openai('qwen2.5-72b-instruct');

    const result = await generateObject({
      model,
      schema: QuizSchema,
      system: `You are an expert financial educator for 'Rushd Financial'. Generate a multiple-choice quiz question about the given topic. The quiz is for a gamified family financial platform.
      Constraints:
      1. Content must be minor-appropriate (ages ~8-17) and educational. Never provide real investment advice.
      2. Output must be Arabic-first (Modern Standard Arabic, clear financial literacy register). Do not use transliterated English jargon where proper Arabic terms exist (use محفظة, سهم, ربح).
      3. Categorize the topic's compliance with Sharia/AAOIFI standards. Set complianceTag to: HALAL, HARAM, MASHBOOH, or EDUCATIONAL_ONLY.`,
      prompt: `Generate a quiz about: ${topic}`
    });

    return NextResponse.json(result.object);
  } catch (error) {
    // Fallback Mock Response
    return NextResponse.json({
      topic: 'Stock Market Basics',
      question: 'What does P/E Ratio stand for?',
      options: [
        'Price to Earnings Ratio',
        'Profit to Equity Ratio',
        'Performance to Estimate Ratio',
        'Portfolio to Exchange Ratio'
      ],
      correctOptionIndex: 0,
      explanation: 'The price-to-earnings ratio (P/E ratio) is the ratio for valuing a company that measures its current share price relative to its earnings per share.',
      complianceTag: 'EDUCATIONAL_ONLY'
    });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSession();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    const parsed = z
      .object({
        topic: z.string().min(1),
        score: z.number().int().min(0).max(100),
        passed: z.boolean(),
      })
      .safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { topic, score, passed } = parsed.data;

    // Save the attempt in the database
    const attempt = await prisma.quizAttempt.create({
      data: {
        userId: user.id,
        topic,
        score,
        passed,
      },
    });

    let xp = 0;
    let level = 1;
    let leveledUp = false;

    // Lazily get profile, or create it if missing
    let profile = await prisma.gamificationProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      profile = await prisma.gamificationProfile.create({
        data: { userId: user.id, xp: 0, level: 1 },
      });
    }

    xp = profile.xp;
    level = profile.level;

    if (passed) {
      const reward = 50; // XP reward for passing a quiz
      const res = await addXP(user.id, reward);
      if (res) {
        xp = res.xp;
        level = res.level;
        leveledUp = res.leveledUp;
      }
    }

    return NextResponse.json({
      attemptId: attempt.id,
      xp,
      level,
      leveledUp,
    });
  } catch (error) {
    // Check if error is AuthzError
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as any).response;
    }
    console.error('Quiz completion tracking failed:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
