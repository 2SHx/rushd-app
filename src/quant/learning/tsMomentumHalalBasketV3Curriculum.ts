import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  TS_MOMENTUM_HALAL_BASKET_V3,
  TsMomentumHalalBasketV3ParamsSchema,
  type TsMomentumHalalBasketV3Params,
} from '../strategies/tsMomentumHalalBasketV3';
import type { StrategyLearningAnswer, StrategyLearningOption, StrategyLearningQuestion } from './bollingerMrLongV2Curriculum';

type PolicyKey = 'targetVolBudget' | 'regimeSmaPeriod' | 'basketVolLookback' | 'targetAnnualVol' | 'maxOpenPositions';
export interface CompiledTsMomentumHalalBasketV3Policy {
  setupId: 'ts-momentum-halal-basket-v3'; setupVersion: 'v3';
  questionSetVersion: 'ts-momentum-halal-basket-v3.questions.v1';
  policyVersion: 'ts-momentum-halal-basket-v3.policy.v1';
  params: TsMomentumHalalBasketV3Params; policyHash: string;
}

const option = (id: string, en: string, ar: string, feedbackEn: string, feedbackAr: string): StrategyLearningOption => ({
  id, label: { en, ar }, feedback: { en: feedbackEn, ar: feedbackAr },
});

export const TS_MOMENTUM_HALAL_BASKET_V3_CURRICULUM = Object.freeze({
  setupId: 'ts-momentum-halal-basket-v3' as const,
  setupVersion: 'v3' as const,
  questionSetVersion: 'ts-momentum-halal-basket-v3.questions.v1' as const,
  policyVersion: 'ts-momentum-halal-basket-v3.policy.v1' as const,
  complianceTag: 'EDUCATIONAL_ONLY' as const,
  title: { en: 'Governing trend exposure at the whole-basket level', ar: 'ضبط التعرض للاتجاه على مستوى السلة كاملة' },
  questions: [
    {
      id: 'know-two-layers', role: 'KNOWLEDGE_CHECK', area: 'ENTRY',
      prompt: { en: 'What did v3 add above the v2 dual-momentum signal?', ar: 'ماذا أضاف الإصدار الثالث فوق إشارة الزخم المزدوج في الإصدار الثاني؟' },
      options: [
        option('portfolio-governor', 'A portfolio volatility governor and holding-count cap', 'ضابط لتقلب المحفظة وحد لعدد المراكز', 'Correct: the per-name signal remains v2 while the book receives a new deterministic layer.', 'صحيح: تبقى إشارة كل سهم كما في الإصدار الثاني وتضاف طبقة حتمية للمحفظة.'),
        option('price-forecast', 'An AI price forecast', 'توقع سعري بالذكاء الاصطناعي', 'The setup remains deterministic and uses no generated forecast.', 'تبقى الاستراتيجية حتمية ولا تستخدم توقعاً مولداً.'),
        option('short-selling', 'A short-selling leg', 'طرف للبيع على المكشوف', 'The team remains long-only; no short leg is executable.', 'يبقى الفريق للشراء فقط ولا ينفذ طرف بيع على المكشوف.'),
      ],
      correctOptionId: 'portfolio-governor',
      explanation: { en: 'v3 keeps v2 entry and exit rules, then scales gross exposure from trailing basket volatility and caps concurrent holdings.', ar: 'يحافظ الإصدار الثالث على قواعد الدخول والخروج في الإصدار الثاني، ثم يضبط التعرض الإجمالي وفق تقلب السلة ويحد المراكز المتزامنة.' },
    },
    {
      id: 'policy-name-vol', role: 'POLICY_DECISION', area: 'SIZING', policyKey: 'targetVolBudget', teamOptionId: 'team-0_004',
      prompt: { en: 'What daily per-name volatility budget should create the initial size proposal?', ar: 'ما ميزانية التقلب اليومية لكل سهم التي ينبغي أن تكوّن اقتراح الحجم الأولي؟' },
      options: [
        option('low-0_003', 'Conservative: 0.30%', 'محافظة: 0.30٪', 'Proposes smaller name weights before book controls.', 'تقترح أوزاناً أصغر قبل ضوابط السلة.'),
        option('team-0_004', 'Team rule: 0.40%', 'قاعدة الفريق: 0.40٪', 'Uses the frozen v3 per-name budget.', 'تستخدم ميزانية الإصدار الثالث المجمدة لكل سهم.'),
        option('high-0_005', 'Higher: 0.50%', 'أعلى: 0.50٪', 'Proposes more name exposure, still subject to every shared cap.', 'تقترح تعرضاً أكبر للسهم مع بقائه خاضعاً لجميع الحدود المشتركة.'),
      ],
    },
    {
      id: 'policy-regime', role: 'POLICY_DECISION', area: 'RISK', policyKey: 'regimeSmaPeriod', teamOptionId: 'team-200',
      prompt: { en: 'Which moving average should gate new entries when the basket regime weakens?', ar: 'أي متوسط متحرك ينبغي أن يمنع الدخول الجديد عند ضعف حالة السلة؟' },
      options: [
        option('fast-150', 'Responsive: 150 sessions', 'سريع الاستجابة: 150 جلسة', 'Changes the regime state sooner.', 'يغير حالة السوق في وقت أبكر.'),
        option('team-200', 'Team rule: 200 sessions', 'قاعدة الفريق: 200 جلسة', 'Uses the frozen long-term regime brake.', 'يستخدم مكبح حالة السوق طويل الأجل والمجمد.'),
        option('slow-250', 'Slower: 250 sessions', 'أبطأ: 250 جلسة', 'Needs a longer shift before changing the regime state.', 'يتطلب تحولاً أطول قبل تغيير حالة السوق.'),
      ],
    },
    {
      id: 'policy-book-vol-window', role: 'POLICY_DECISION', area: 'RISK', policyKey: 'basketVolLookback', teamOptionId: 'team-60',
      prompt: { en: 'How much recent history should estimate whole-basket realized volatility?', ar: 'ما مقدار التاريخ الحديث الذي ينبغي أن يقدّر التقلب المحقق للسلة كاملة؟' },
      options: [
        option('fast-40', 'Responsive: 40 sessions', 'سريع الاستجابة: 40 جلسة', 'The gross-exposure governor reacts sooner to volatility changes.', 'يستجيب ضابط التعرض الإجمالي أسرع لتغير التقلب.'),
        option('team-60', 'Team rule: 60 sessions', 'قاعدة الفريق: 60 جلسة', 'Uses the frozen portfolio-volatility window.', 'يستخدم نافذة تقلب المحفظة المجمدة.'),
        option('stable-80', 'Smoother: 80 sessions', 'أكثر سلاسة: 80 جلسة', 'Smooths short bursts but reacts later.', 'يخفف أثر القفزات القصيرة لكنه يستجيب لاحقاً.'),
      ],
    },
    {
      id: 'policy-target-vol', role: 'POLICY_DECISION', area: 'SIZING', policyKey: 'targetAnnualVol', teamOptionId: 'team-0_15',
      prompt: { en: 'What annual volatility target should scale total basket exposure?', ar: 'ما هدف التقلب السنوي الذي ينبغي أن يضبط إجمالي تعرض السلة؟' },
      options: [
        option('low-0_12', 'Lower: 12%', 'أقل: 12٪', 'Reduces gross exposure at the same realized volatility.', 'يخفض التعرض الإجمالي عند مستوى التقلب المحقق نفسه.'),
        option('team-0_15', 'Team rule: 15%', 'قاعدة الفريق: 15٪', 'Uses the team’s frozen basket target.', 'يستخدم هدف السلة المجمد لدى الفريق.'),
        option('high-0_18', 'Higher: 18%', 'أعلى: 18٪', 'Permits more gross exposure before unchanged hard caps.', 'يسمح بتعرض إجمالي أكبر قبل الحدود الصارمة غير المتغيرة.'),
      ],
    },
    {
      id: 'policy-holdings', role: 'POLICY_DECISION', area: 'RISK', policyKey: 'maxOpenPositions', teamOptionId: 'team-6',
      prompt: { en: 'How many positions may the basket hold at once?', ar: 'كم مركزاً يمكن للسلة الاحتفاظ به في الوقت نفسه؟' },
      options: [
        option('focused-4', 'More focused: 4', 'أكثر تركيزاً: 4', 'Concentrates the eligible book in fewer names.', 'يركز السلة المؤهلة في عدد أقل من الأسهم.'),
        option('team-6', 'Team rule: 6', 'قاعدة الفريق: 6', 'Uses the frozen concurrent-holding cap.', 'يستخدم الحد المجمد للمراكز المتزامنة.'),
        option('broad-8', 'Broader: 8', 'أوسع: 8', 'Allows more simultaneous names without weakening per-name caps.', 'يسمح بأسهم متزامنة أكثر دون إضعاف حدود كل سهم.'),
      ],
    },
    {
      id: 'know-hard-vetoes', role: 'KNOWLEDGE_CHECK', area: 'RISK',
      prompt: { en: 'May either volatility layer override the Sharia veto or hard risk envelope?', ar: 'هل يمكن لأي من طبقتي التقلب تجاوز المنع الشرعي أو ضوابط المخاطر الصارمة؟' },
      options: [
        option('no', 'No. They can only shape or reduce proposals', 'لا. لا يمكنهما إلا تشكيل الاقتراحات أو خفضها', 'Correct: compliance and the deterministic envelope remain authoritative.', 'صحيح: تبقى الضوابط الشرعية وضوابط المخاطر الحتمية صاحبة السلطة.'),
        option('yes', 'Yes, when realized volatility is low', 'نعم، عندما يكون التقلب المحقق منخفضاً', 'Low volatility never grants permission to bypass a hard veto.', 'لا يمنح انخفاض التقلب إذناً بتجاوز منع إلزامي.'),
      ],
      correctOptionId: 'no',
      explanation: { en: 'The learner compiler cannot disable Sharia screening, exposure caps, fills, or the drawdown breaker.', ar: 'لا يستطيع مُصرّف سياسة المتعلم تعطيل الفحص الشرعي أو حدود التعرض أو قواعد التنفيذ أو قاطع التراجع.' },
    },
  ] satisfies readonly StrategyLearningQuestion[],
});

const answerSchema = z.object({ questionId: z.string().min(1), optionId: z.string().min(1) }).strict();
const selectionsSchema = z.object({
  targetVolBudget: z.enum(['low-0_003', 'team-0_004', 'high-0_005']),
  regimeSmaPeriod: z.enum(['fast-150', 'team-200', 'slow-250']),
  basketVolLookback: z.enum(['fast-40', 'team-60', 'stable-80']),
  targetAnnualVol: z.enum(['low-0_12', 'team-0_15', 'high-0_18']),
  maxOpenPositions: z.enum(['focused-4', 'team-6', 'broad-8']),
}).strict();
const VOL = { 'low-0_003': 0.003, 'team-0_004': 0.004, 'high-0_005': 0.005 } as const;
const REGIME = { 'fast-150': 150, 'team-200': 200, 'slow-250': 250 } as const;
const WINDOW = { 'fast-40': 40, 'team-60': 60, 'stable-80': 80 } as const;
const TARGET = { 'low-0_12': 0.12, 'team-0_15': 0.15, 'high-0_18': 0.18 } as const;
const HOLDINGS = { 'focused-4': 4, 'team-6': 6, 'broad-8': 8 } as const;

export function compileTsMomentumHalalBasketV3Policy(input: readonly StrategyLearningAnswer[]): CompiledTsMomentumHalalBasketV3Policy {
  const parsed = z.array(answerSchema).parse(input);
  const questions = TS_MOMENTUM_HALAL_BASKET_V3_CURRICULUM.questions;
  if (parsed.length !== questions.length) throw new Error('learning_answer_count_mismatch');
  const byQuestion = new Map<string, string>();
  for (const answer of parsed) {
    if (byQuestion.has(answer.questionId)) throw new Error('duplicate_learning_answer');
    const question = questions.find(item => item.id === answer.questionId);
    if (!question) throw new Error('unknown_learning_question');
    if (!question.options.some(item => item.id === answer.optionId)) throw new Error('unknown_learning_option');
    byQuestion.set(answer.questionId, answer.optionId);
  }
  const selected: Partial<Record<PolicyKey, string>> = {};
  for (const question of questions) {
    const optionId = byQuestion.get(question.id);
    if (!optionId) throw new Error('missing_learning_answer');
    if (question.role === 'POLICY_DECISION') selected[question.policyKey as PolicyKey] = optionId;
  }
  const policy = selectionsSchema.parse(selected);
  const params = TsMomentumHalalBasketV3ParamsSchema.parse({
    ...TS_MOMENTUM_HALAL_BASKET_V3,
    targetVolBudget: VOL[policy.targetVolBudget], regimeSmaPeriod: REGIME[policy.regimeSmaPeriod],
    basketVolLookback: WINDOW[policy.basketVolLookback], targetAnnualVol: TARGET[policy.targetAnnualVol],
    maxOpenPositions: HOLDINGS[policy.maxOpenPositions],
  });
  const c = TS_MOMENTUM_HALAL_BASKET_V3_CURRICULUM;
  const payload = JSON.stringify({ setupId: c.setupId, setupVersion: c.setupVersion, questionSetVersion: c.questionSetVersion, policyVersion: c.policyVersion, params });
  return { setupId: c.setupId, setupVersion: c.setupVersion, questionSetVersion: c.questionSetVersion, policyVersion: c.policyVersion, params, policyHash: `sha256:${createHash('sha256').update(payload).digest('hex')}` };
}
