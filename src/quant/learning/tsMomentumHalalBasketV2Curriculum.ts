import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  TS_MOMENTUM_HALAL_BASKET_V2,
  TsMomentumHalalBasketV2ParamsSchema,
  type TsMomentumHalalBasketV2Params,
} from '../strategies/tsMomentumHalalBasketV2';
import type {
  StrategyLearningAnswer,
  StrategyLearningOption,
  StrategyLearningQuestion,
} from './bollingerMrLongV2Curriculum';

type PolicyKey = 'longMomLookback' | 'shortMomLookback' | 'targetVolBudget' | 'maxNameFraction' | 'regimeSmaPeriod';

export interface CompiledTsMomentumHalalBasketV2Policy {
  setupId: 'ts-momentum-halal-basket-v2';
  setupVersion: 'v2';
  questionSetVersion: 'ts-momentum-halal-basket-v2.questions.v1';
  policyVersion: 'ts-momentum-halal-basket-v2.policy.v1';
  params: TsMomentumHalalBasketV2Params;
  policyHash: string;
}

const option = (
  id: string,
  labelEn: string,
  labelAr: string,
  feedbackEn: string,
  feedbackAr: string,
): StrategyLearningOption => ({
  id,
  label: { en: labelEn, ar: labelAr },
  feedback: { en: feedbackEn, ar: feedbackAr },
});

export const TS_MOMENTUM_HALAL_BASKET_V2_CURRICULUM = Object.freeze({
  setupId: 'ts-momentum-halal-basket-v2' as const,
  setupVersion: 'v2' as const,
  questionSetVersion: 'ts-momentum-halal-basket-v2.questions.v1' as const,
  policyVersion: 'ts-momentum-halal-basket-v2.policy.v1' as const,
  complianceTag: 'EDUCATIONAL_ONLY' as const,
  title: {
    en: 'Following persistent trends with a market-regime brake',
    ar: 'اتباع الاتجاهات المستمرة مع مكبح لحالة السوق',
  },
  questions: [
    {
      id: 'know-dual-momentum', role: 'KNOWLEDGE_CHECK', area: 'ENTRY',
      prompt: {
        en: 'When may this team open a long position in a basket name?',
        ar: 'متى يمكن لهذا الفريق فتح مركز شراء في أحد أسهم السلة؟',
      },
      options: [
        option('both-positive', 'Both long- and short-horizon momentum are positive', 'يكون الزخم الطويل والقصير الأجل إيجابياً', 'Correct: both horizons must agree before entry.', 'صحيح: يجب أن يتفق الأفقان قبل الدخول.'),
        option('one-positive', 'Either momentum horizon is positive', 'يكفي أن يكون أحد أفقي الزخم إيجابياً', 'One positive horizon is not enough for this frozen rule.', 'لا يكفي أفق إيجابي واحد وفق هذه القاعدة المجمدة.'),
        option('falling-fast', 'Price is falling quickly', 'يهبط السعر بسرعة', 'This is a trend-following setup, not a falling-price entry.', 'هذه استراتيجية تتبع للاتجاه وليست دخولاً عند هبوط السعر.'),
      ],
      correctOptionId: 'both-positive',
      explanation: {
        en: 'The entry requires positive 12-month and 3-month momentum, then separately checks the basket regime.',
        ar: 'يتطلب الدخول زخماً إيجابياً لمدة 12 شهراً و3 أشهر، ثم يفحص حالة السلة بشكل مستقل.',
      },
    },
    {
      id: 'policy-long-lookback', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'longMomLookback', teamOptionId: 'team-252',
      prompt: { en: 'How much history should define the slow trend?', ar: 'ما مقدار التاريخ الذي ينبغي أن يحدد الاتجاه البطيء؟' },
      options: [
        option('responsive-189', 'More responsive: 189 sessions', 'أسرع استجابة: 189 جلسة', 'Reacts sooner but may classify shorter moves as durable trends.', 'يستجيب أسرع لكنه قد يعد الحركات الأقصر اتجاهات مستمرة.'),
        option('team-252', 'Team rule: 252 sessions', 'قاعدة الفريق: 252 جلسة', 'Uses the team’s frozen approximate 12-month horizon.', 'يستخدم أفق الفريق المجمد البالغ نحو 12 شهراً.'),
        option('patient-315', 'More patient: 315 sessions', 'أكثر صبراً: 315 جلسة', 'Requires a longer history before the slow trend changes.', 'يتطلب تاريخاً أطول قبل تغير الاتجاه البطيء.'),
      ],
    },
    {
      id: 'policy-short-lookback', role: 'POLICY_DECISION', area: 'EXIT', policyKey: 'shortMomLookback', teamOptionId: 'team-63',
      prompt: { en: 'Which faster horizon should confirm entry and trigger a momentum exit?', ar: 'أي أفق أسرع ينبغي أن يؤكد الدخول ويطلق الخروج عند ضعف الزخم؟' },
      options: [
        option('fast-42', 'Faster: 42 sessions', 'أسرع: 42 جلسة', 'Responds earlier to trend changes and may trade more often.', 'يستجيب أبكر لتغير الاتجاه وقد يزيد عدد الصفقات.'),
        option('team-63', 'Team rule: 63 sessions', 'قاعدة الفريق: 63 جلسة', 'Uses the team’s frozen approximate 3-month horizon.', 'يستخدم أفق الفريق المجمد البالغ نحو 3 أشهر.'),
        option('slow-84', 'Slower: 84 sessions', 'أبطأ: 84 جلسة', 'Waits longer before declaring the faster trend broken.', 'ينتظر مدة أطول قبل اعتبار الاتجاه الأسرع مكسوراً.'),
      ],
    },
    {
      id: 'policy-vol-budget', role: 'POLICY_DECISION', area: 'SIZING', policyKey: 'targetVolBudget', teamOptionId: 'team-0_004',
      prompt: { en: 'What daily volatility budget should scale each proposed position?', ar: 'ما ميزانية التقلب اليومية التي ينبغي أن تضبط حجم كل مركز مقترح؟' },
      options: [
        option('low-0_003', 'Conservative: 0.30% daily', 'محافظة: 0.30٪ يومياً', 'Proposes smaller weights at the same observed volatility.', 'تقترح أوزاناً أصغر عند مستوى التقلب المرصود نفسه.'),
        option('team-0_004', 'Team rule: 0.40% daily', 'قاعدة الفريق: 0.40٪ يومياً', 'Uses the team’s frozen inverse-volatility budget.', 'تستخدم ميزانية الفريق المجمدة للحجم العكسي مع التقلب.'),
        option('high-0_005', 'Higher: 0.50% daily', 'أعلى: 0.50٪ يومياً', 'Proposes more exposure, while the unchanged envelope may still reduce it.', 'تقترح تعرضاً أكبر مع بقاء ضوابط المخاطر قادرة على تقليصه.'),
      ],
    },
    {
      id: 'policy-name-cap', role: 'POLICY_DECISION', area: 'RISK', policyKey: 'maxNameFraction', teamOptionId: 'team-0_20',
      prompt: { en: 'What maximum book fraction may one name propose before the portfolio envelope?', ar: 'ما الحد الأقصى من المحفظة الذي يمكن لسهم واحد اقتراحه قبل تطبيق ضوابط المحفظة؟' },
      options: [
        option('diversified-0_15', 'More diversified: 15%', 'تنويع أكبر: 15٪', 'Reduces the learner policy’s single-name concentration.', 'يخفض تركز سياسة المتعلم في سهم واحد.'),
        option('team-0_20', 'Team rule: 20%', 'قاعدة الفريق: 20٪', 'Uses the team’s frozen proposal cap.', 'يستخدم حد الاقتراح المجمد لدى الفريق.'),
        option('concentrated-0_25', 'More concentrated: 25%', 'تركيز أكبر: 25٪', 'Allows a larger proposal, but cannot bypass stricter shared risk caps.', 'يسمح باقتراح أكبر لكنه لا يتجاوز ضوابط المخاطر المشتركة الأكثر صرامة.'),
      ],
    },
    {
      id: 'policy-regime-sma', role: 'POLICY_DECISION', area: 'RISK', policyKey: 'regimeSmaPeriod', teamOptionId: 'team-200',
      prompt: { en: 'Which basket moving average should block new entries in a weak market regime?', ar: 'أي متوسط متحرك للسلة ينبغي أن يمنع الدخول الجديد في حالة سوق ضعيفة؟' },
      options: [
        option('responsive-150', 'More responsive: 150 sessions', 'أسرع استجابة: 150 جلسة', 'The regime brake changes state sooner.', 'يتغير مكبح حالة السوق في وقت أبكر.'),
        option('team-200', 'Team rule: 200 sessions', 'قاعدة الفريق: 200 جلسة', 'Uses the frozen long-term basket-regime filter.', 'يستخدم مرشح حالة السلة طويل الأجل والمجمد.'),
        option('slow-250', 'Slower: 250 sessions', 'أبطأ: 250 جلسة', 'Requires a longer trend shift before the regime brake changes.', 'يتطلب تغيراً أطول في الاتجاه قبل تغير مكبح حالة السوق.'),
      ],
    },
    {
      id: 'know-hard-vetoes', role: 'KNOWLEDGE_CHECK', area: 'RISK',
      prompt: { en: 'Can positive momentum override the Sharia veto or shared risk envelope?', ar: 'هل يمكن للزخم الإيجابي تجاوز المنع الشرعي أو ضوابط المخاطر المشتركة؟' },
      options: [
        option('no', 'No. Both remain hard constraints', 'لا. كلاهما يظل قيداً إلزامياً', 'Correct: learner policy choices never outrank compliance or risk controls.', 'صحيح: لا تتقدم اختيارات سياسة المتعلم على الضوابط الشرعية أو ضوابط المخاطر.'),
        option('yes', 'Yes, when both momentum horizons agree', 'نعم، عندما يتفق أفقا الزخم', 'Signal agreement never authorizes bypassing a hard veto.', 'لا يسمح اتفاق الإشارات بتجاوز أي منع إلزامي.'),
      ],
      correctOptionId: 'no',
      explanation: { en: 'Sharia screening and the portfolio envelope remain outside and above the learner compiler.', ar: 'يبقى الفحص الشرعي وضوابط المحفظة خارج مُصرّف سياسة المتعلم وفوقه.' },
    },
  ] satisfies readonly StrategyLearningQuestion[],
});

const answerSchema = z.object({ questionId: z.string().min(1), optionId: z.string().min(1) }).strict();
const selectionsSchema = z.object({
  longMomLookback: z.enum(['responsive-189', 'team-252', 'patient-315']),
  shortMomLookback: z.enum(['fast-42', 'team-63', 'slow-84']),
  targetVolBudget: z.enum(['low-0_003', 'team-0_004', 'high-0_005']),
  maxNameFraction: z.enum(['diversified-0_15', 'team-0_20', 'concentrated-0_25']),
  regimeSmaPeriod: z.enum(['responsive-150', 'team-200', 'slow-250']),
}).strict();

const LONG = { 'responsive-189': 189, 'team-252': 252, 'patient-315': 315 } as const;
const SHORT = { 'fast-42': 42, 'team-63': 63, 'slow-84': 84 } as const;
const VOL = { 'low-0_003': 0.003, 'team-0_004': 0.004, 'high-0_005': 0.005 } as const;
const CAP = { 'diversified-0_15': 0.15, 'team-0_20': 0.2, 'concentrated-0_25': 0.25 } as const;
const REGIME = { 'responsive-150': 150, 'team-200': 200, 'slow-250': 250 } as const;

export function compileTsMomentumHalalBasketV2Policy(
  input: readonly StrategyLearningAnswer[],
): CompiledTsMomentumHalalBasketV2Policy {
  const answers = z.array(answerSchema).parse(input);
  const questions = TS_MOMENTUM_HALAL_BASKET_V2_CURRICULUM.questions;
  if (answers.length !== questions.length) throw new Error('learning_answer_count_mismatch');
  const byQuestion = new Map<string, string>();
  for (const answer of answers) {
    if (byQuestion.has(answer.questionId)) throw new Error('duplicate_learning_answer');
    const question = questions.find(candidate => candidate.id === answer.questionId);
    if (!question) throw new Error('unknown_learning_question');
    if (!question.options.some(candidate => candidate.id === answer.optionId)) throw new Error('unknown_learning_option');
    byQuestion.set(answer.questionId, answer.optionId);
  }
  const selected: Partial<Record<PolicyKey, string>> = {};
  for (const question of questions) {
    const optionId = byQuestion.get(question.id);
    if (!optionId) throw new Error('missing_learning_answer');
    if (question.role === 'POLICY_DECISION') selected[question.policyKey as PolicyKey] = optionId;
  }
  const policy = selectionsSchema.parse(selected);
  const params = TsMomentumHalalBasketV2ParamsSchema.parse({
    ...TS_MOMENTUM_HALAL_BASKET_V2,
    longMomLookback: LONG[policy.longMomLookback],
    shortMomLookback: SHORT[policy.shortMomLookback],
    targetVolBudget: VOL[policy.targetVolBudget],
    maxNameFraction: CAP[policy.maxNameFraction],
    regimeSmaPeriod: REGIME[policy.regimeSmaPeriod],
  });
  const metadata = TS_MOMENTUM_HALAL_BASKET_V2_CURRICULUM;
  const payload = JSON.stringify({
    setupId: metadata.setupId,
    setupVersion: metadata.setupVersion,
    questionSetVersion: metadata.questionSetVersion,
    policyVersion: metadata.policyVersion,
    params,
  });
  return {
    setupId: metadata.setupId,
    setupVersion: metadata.setupVersion,
    questionSetVersion: metadata.questionSetVersion,
    policyVersion: metadata.policyVersion,
    params,
    policyHash: `sha256:${createHash('sha256').update(payload).digest('hex')}`,
  };
}
