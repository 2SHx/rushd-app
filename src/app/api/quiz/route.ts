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

const TOPIC_AR_MAP: Record<string, string> = {
  'Stock Market Basics': 'أساسيات سوق الأسهم',
  'Savings & Jars': 'الادخار والحصالات',
  'Compound Interest': 'الفائدة المركبة',
  'Sharia Compliance': 'التوافق الشرعي',
  'Risk Management': 'إدارة المخاطر',
  'Value Investing': 'استثمار القيمة',
  'Halal Mutual Funds': 'الصناديق الاستثمارية الحلال',
  'TASI Markets': 'سوق تاسي المالي',
  'NASDAQ Markets': 'سوق ناسداك المالي'
};

const QuizSchema = z.object({
  topic: z.string(),
  topicAr: z.string().optional(),
  question: z.string(),
  options: z.array(z.string()).length(4),
  correctOptionIndex: z.number().min(0).max(3),
  explanation: z.string(),
  complianceTag: z.enum(['HALAL', 'HARAM', 'MASHBOOH', 'EDUCATIONAL_ONLY']),
});

const LOCAL_QUESTION_BANK: Record<string, Array<{
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  complianceTag: 'HALAL' | 'HARAM' | 'MASHBOOH' | 'EDUCATIONAL_ONLY';
}>> = {
  'Stock Market Basics': [
    {
      question: 'What is a stock representing? / ماذا يمثل السهم في الشركة؟',
      options: [
        'A loan to the government / قرض للحكومة',
        'Share of ownership in a company / حصة ملكية في الشركة',
        'A fixed corporate debt / دين شركة محدد',
        'A savings account deposit / وديعة حساب ادخار'
      ],
      correctOptionIndex: 1,
      explanation: 'A stock represents fractional ownership in a corporation, giving shareholders a claim on part of the assets and earnings. / يمثل السهم حصة ملكية جزئية في الشركة، مما يمنح المساهمين حق المطالبة بجزء من الأصول والأرباح.',
      complianceTag: 'EDUCATIONAL_ONLY'
    },
    {
      question: 'What does the P/E Ratio compare? / ماذا يقارن مكرر الأرباح (P/E Ratio)؟',
      options: [
        'Stock price vs Earnings per share / سعر السهم مقابل عائد السهم الواحد',
        'Assets vs Liabilities / الأصول مقابل الالتزامات',
        'Dividend vs Stock Price / التوزيعات النقدية مقابل سعر السهم',
        'Cash vs Total Debt / النقد مقابل إجمالي الديون'
      ],
      correctOptionIndex: 0,
      explanation: 'The P/E Ratio measures a company\'s current share price relative to its earnings per share. / يقيس مكرر الأرباح سعر السهم الحالي للشركة بالنسبة إلى أرباحها لكل سهم.',
      complianceTag: 'EDUCATIONAL_ONLY'
    },
    {
      question: 'Who regulates the Saudi Stock Market? / من هي الجهة المنظمة لسوق الأسهم السعودية؟',
      options: [
        'Capital Market Authority (CMA) / هيئة السوق المالية',
        'Saudi Central Bank (SAMA) / البنك المركزي السعودي',
        'Ministry of Finance / وزارة المالية',
        'Tadawul Group / مجموعة تداول'
      ],
      correctOptionIndex: 0,
      explanation: 'CMA regulates and supervises the Saudi capital market to protect investors. / تقوم هيئة السوق المالية بتنظيم ومراقبة السوق المالية السعودية لحماية المستثمرين.',
      complianceTag: 'EDUCATIONAL_ONLY'
    }
  ],
  'Savings & Jars': [
    {
      question: 'What is a savings jar designed for? / فيم تستخدم حصالة الادخار؟',
      options: [
        'To set aside money for specific goals / لتجنيب الأموال لأهداف محددة',
        'To borrow money from friends / لاقتراض المال من الأصدقاء',
        'To buy speculative options / لشراء خيارات المضاربة',
        'To pay off tax liabilities / لدفع الالتزامات الضريبية'
      ],
      correctOptionIndex: 0,
      explanation: 'Savings jars help children segment their virtual money to focus on specific financial goals. / تساعد حصالات الادخار الأطفال على تقسيم أموالهم الافتراضية للتركيز على أهداف مالية محددة.',
      complianceTag: 'HALAL'
    },
    {
      question: 'In Mudarabah savings, who manages the fund? / في ادخار المضاربة، من يدير الأموال؟',
      options: [
        'The Platform (Mudarib) / المنصة (المضارب)',
        'The Child Depositor (Rab-al-Mal) / الطفل المودع (رب المال)',
        'The Regulator / المشرّع',
        'Third-party banks / بنوك خارجية'
      ],
      correctOptionIndex: 0,
      explanation: 'In Mudarabah, the depositor provides the capital, and the manager (Mudarib) manages the investments. / في عقد المضاربة، يقدم المودع رأس المال، ويتولى المدير (المضارب) إدارة الاستثمارات.',
      complianceTag: 'HALAL'
    }
  ],
  'Compound Interest': [
    {
      question: 'What is compound interest? / ما هي الفائدة المركبة؟',
      options: [
        'Earning interest on interest / كسب أرباح/فائدة على الفوائد السابقة',
        'A fixed corporate loan fee / رسوم قرض شركة ثابتة',
        'Stock price appreciation / ارتفاع قيمة سعر السهم',
        'A government tax / ضريبة حكومية'
      ],
      correctOptionIndex: 0,
      explanation: 'Compound interest is the addition of interest to the principal sum, earning interest on interest. / الفائدة المركبة هي إضافة الفائدة إلى رأس المال الأصلي، مما يؤدي لكسب فوائد على الفوائد المتراكمة.',
      complianceTag: 'HARAM'
    }
  ],
  'Sharia Compliance': [
    {
      question: 'What is the maximum allowed debt ratio under AAOIFI? / ما هو الحد الأقصى لنصيب الديون الربوية إلى القيمة السوقية وفق معايير أيقوفي؟',
      options: [
        'Less than 30% / أقل من 30%',
        'Less than 10% / أقل من 10%',
        'Less than 5% / أقل من 5%',
        'Less than 50% / أقل من 50%'
      ],
      correctOptionIndex: 0,
      explanation: 'AAOIFI standards require interest-bearing debt to be under 30% of market capitalization. / تشترط معايير أيقوفي ألا تتجاوز الديون التي تحمل فوائد 30% من القيمة السوقية للشركة.',
      complianceTag: 'HALAL'
    },
    {
      question: 'What is the maximum non-compliant income limit under AAOIFI? / ما هو الحد الأقصى للإيرادات غير المتوافقة المسموح بها وفق معايير أيقوفي؟',
      options: [
        'Less than 5% / أقل من 5%',
        'Less than 15% / أقل من 15%',
        'Less than 10% / أقل من 10%',
        'Less than 20% / أقل من 20%'
      ],
      correctOptionIndex: 0,
      explanation: 'Under AAOIFI, non-compliant income must not exceed 5% of total revenue. / تشترط معايير أيقوفي ألا تتجاوز الإيرادات غير المتوافقة 5% من إجمالي إيرادات الشركة.',
      complianceTag: 'HALAL'
    }
  ],
  'Risk Management': [
    {
      question: 'What is portfolio diversification? / ما هو تنويع المحفظة الاستثمارية؟',
      options: [
        'Spreading money across multiple stocks / توزيع الأموال على عدة أسهم',
        'Buying only one tech stock / شراء سهم تكنولوجي واحد فقط',
        'Putting all money in cash / وضع كل الأموال في نقد سائل',
        'Borrowing money to trade / اقتراض المال للمضاربة'
      ],
      correctOptionIndex: 0,
      explanation: 'Diversification reduces risk by spreading investments across various stocks and sectors. / يقلل التنويع المخاطر عن طريق توزيع الاستثمارات على أسهم وقطاعات متنوعة.',
      complianceTag: 'EDUCATIONAL_ONLY'
    }
  ],
  'Value Investing': [
    {
      question: 'What does value investing focus on? / على ماذا يركز الاستثمار بالقيمة؟',
      options: [
        'Stocks trading below intrinsic value / الأسهم التي تتداول بأقل من قيمتها العادلة',
        'Fast-growing speculative cryptos / العملات الرقمية سريعة النمو',
        'Buying high and selling low / الشراء بسعر مرتفع والبيع بسعر منخفض',
        'Day-trading penny stocks / المضاربة اليومية بالأسهم الصغيرة'
      ],
      correctOptionIndex: 0,
      explanation: 'Value investing focuses on buying solid companies trading below their calculated intrinsic value. / يركز الاستثمار بالقيمة على شراء أسهم شركات قوية تتداول بأقل من قيمتها الذاتية المحسوبة.',
      complianceTag: 'EDUCATIONAL_ONLY'
    }
  ],
  'Halal Mutual Funds': [
    {
      question: 'What is a mutual fund? / ما هو الصندوق الاستثماري المشترك؟',
      options: [
        'Pooled investment managed by professionals / استثمار مشترك يديره متخصصون',
        'A single corporate stock share / حصة سهم شركة واحدة فقط',
        'An interest-based credit card / بطاقة ائتمانية تعتمد على الفائدة',
        'A government tax fund / صندوق ضرائب حكومي'
      ],
      correctOptionIndex: 0,
      explanation: 'Mutual funds pool money from many investors to purchase a diversified portfolio. / تقوم الصناديق المشتركة بجمع الأموال من مستثمرين متعددين لشراء محفظة استثمارية متنوعة.',
      complianceTag: 'HALAL'
    }
  ],
  'TASI Markets': [
    {
      question: 'What is TASI? / ما هو مؤشر تاسي؟',
      options: [
        'Saudi Stock Market Index / مؤشر سوق الأسهم السعودية الرئيسي',
        'Technology index in US / مؤشر التكنولوجيا في أمريكا',
        'Islamic corporate bond / صكوك شركات إسلامية',
        'Saudi Central Bank portal / بوابة البنك المركزي السعودي'
      ],
      correctOptionIndex: 0,
      explanation: 'TASI is the Tadawul All Share Index, tracking all listed Saudi companies. / تاسي هو المؤشر الرئيسي لسوق الأسهم السعودية (تداول)، ويتتبع أداء جميع الشركات المدرجة.',
      complianceTag: 'EDUCATIONAL_ONLY'
    }
  ],
  'NASDAQ Markets': [
    {
      question: 'What characterizes the NASDAQ exchange? / ما الذي يميز سوق ناسداك؟',
      options: [
        'Heavy focus on technology companies / التركيز الكبير على شركات التكنولوجيا',
        'It is located in Saudi Arabia / يقع مقره في المملكة العربية السعودية',
        'It only trades government bonds / يتداول السندات الحكومية فقط',
        'It works only on weekends / يعمل في عطلات نهاية الأسبوع فقط'
      ],
      correctOptionIndex: 0,
      explanation: 'NASDAQ is a global electronic marketplace for buying and selling securities, heavily focused on technology. / ناسداك هي سوق مالية إلكترونية عالمية لتداول الأوراق المالية، وتتميز بتركيزها القوي على التكنولوجيا.',
      complianceTag: 'EDUCATIONAL_ONLY'
    }
  ]
};

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

    // Local randomized fallback if API key is not present
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'mock-key') {
      const pool = LOCAL_QUESTION_BANK[topic] || LOCAL_QUESTION_BANK['Stock Market Basics'];
      const randomQuestion = pool[Math.floor(Math.random() * pool.length)];
      return NextResponse.json({
        topic,
        ...randomQuestion
      });
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
    // Fallback Mock Response matching schema
    const pool = LOCAL_QUESTION_BANK['Stock Market Basics'];
    const randomQuestion = pool[Math.floor(Math.random() * pool.length)];
    return NextResponse.json({
      topic: 'Stock Market Basics',
      ...randomQuestion
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
