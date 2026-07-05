import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { NextResponse } from 'next/server';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'mock-key',
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

const QuizSchema = z.object({
  topic: z.string(),
  question: z.string(),
  options: z.array(z.string()).length(4),
  correctOptionIndex: z.number().min(0).max(3),
  explanation: z.string()
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const topic = searchParams.get('topic') || 'Stock Market Basics';

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing API Key");
    }

    const model = openai('qwen2.5-72b-instruct');

    const result = await generateObject({
      model,
      schema: QuizSchema,
      system: `You are an expert financial educator. Generate a multiple-choice quiz question about the given topic. The quiz is for a gamified financial platform.`,
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
      explanation: 'The price-to-earnings ratio (P/E ratio) is the ratio for valuing a company that measures its current share price relative to its earnings per share.'
    });
  }
}
