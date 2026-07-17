import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  BOLLINGER_MR_LONG_V2,
  BollingerMrLongV2ParamsSchema,
  type BollingerMrLongV2Params,
} from '../strategies/bollingerMrLongV2';

export type StrategyLearningRole = 'KNOWLEDGE_CHECK' | 'POLICY_DECISION';
export type StrategyLearningArea = 'ENTRY' | 'EXIT' | 'SIZING' | 'HOLDING' | 'RISK';

export interface LocalizedLearningText {
  en: string;
  ar: string;
}

export interface StrategyLearningOption {
  id: string;
  label: LocalizedLearningText;
  /** Mechanism feedback only. It deliberately contains no simulated outcome. */
  feedback: LocalizedLearningText;
}

interface LearningQuestionBase {
  id: string;
  area: StrategyLearningArea;
  prompt: LocalizedLearningText;
  options: readonly StrategyLearningOption[];
}

export interface KnowledgeCheckQuestion extends LearningQuestionBase {
  role: 'KNOWLEDGE_CHECK';
  correctOptionId: string;
  explanation: LocalizedLearningText;
}

type PolicyKey = 'entryStdev' | 'atrStopMult' | 'targetVolBudget' | 'maxHoldingDays' | 'varianceRatioMax';

export interface PolicyDecisionQuestion extends LearningQuestionBase {
  role: 'POLICY_DECISION';
  policyKey: string;
  teamOptionId: string;
}

export type StrategyLearningQuestion = KnowledgeCheckQuestion | PolicyDecisionQuestion;

export interface StrategyLearningAnswer {
  questionId: string;
  optionId: string;
}

export interface CompiledStrategyLearningPolicy {
  setupId: 'bollinger-mr-long-v2';
  setupVersion: 'v2';
  questionSetVersion: 'bollinger-mr-long-v2.questions.v1';
  policyVersion: 'bollinger-mr-long-v2.policy.v1';
  params: BollingerMrLongV2Params;
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

/**
 * One reviewed lesson for one exact league setup version. Policy options are identifiers only;
 * executable parameters live in the closed compiler map below and cannot be supplied by the client.
 */
export const BOLLINGER_MR_LONG_V2_CURRICULUM = Object.freeze({
  setupId: 'bollinger-mr-long-v2' as const,
  setupVersion: 'v2' as const,
  questionSetVersion: 'bollinger-mr-long-v2.questions.v1' as const,
  policyVersion: 'bollinger-mr-long-v2.policy.v1' as const,
  complianceTag: 'EDUCATIONAL_ONLY' as const,
  title: {
    en: 'Buying temporary weakness inside an uptrend',
    ar: 'شراء الضعف المؤقت داخل اتجاه صاعد',
  },
  questions: [
    {
      id: 'know-lower-band',
      role: 'KNOWLEDGE_CHECK',
      area: 'ENTRY',
      prompt: {
        en: 'The regime checks pass and price closes at or below the lower Bollinger band. What does that signal mean to this team?',
        ar: 'اجتاز السهم فحوصات حالة السوق وأغلق عند نطاق بولينجر السفلي أو دونه. ماذا تعني هذه الإشارة للفريق؟',
      },
      options: [
        option(
          'temporary-stretch-below-mean',
          'Price may be temporarily stretched below its recent mean',
          'قد يكون السعر قد ابتعد مؤقتاً دون متوسطه الحديث',
          'Correct: the setup tests a bounded mean-reversion entry, not a guarantee that price must rebound.',
          'صحيح: تختبر الاستراتيجية دخولاً محدوداً على أساس العودة إلى المتوسط، ولا تضمن ارتداد السعر.',
        ),
        option(
          'price-above-upper-band',
          'Price has broken above the upper band',
          'اخترق السعر نطاق بولينجر العلوي',
          'The lower-band condition describes weakness below the mean, not an upside breakout.',
          'يصف شرط النطاق السفلي ضعفاً دون المتوسط، وليس اختراقاً صاعداً.',
        ),
        option(
          'loss-is-impossible',
          'A loss is now impossible',
          'أصبحت الخسارة مستحيلة',
          'No indicator removes loss risk; the stop, holding limit, and portfolio envelope still apply.',
          'لا يلغي أي مؤشر مخاطر الخسارة؛ ويظل حد الإيقاف ومدة الاحتفاظ وضوابط المحفظة مطبقة.',
        ),
      ],
      correctOptionId: 'temporary-stretch-below-mean',
      explanation: {
        en: 'Bollinger bands measure distance from a recent mean. The team enters only after separate regime and trend checks also pass.',
        ar: 'تقيس نطاقات بولينجر بُعد السعر عن متوسط حديث. ولا يدخل الفريق إلا بعد اجتياز فحوصات مستقلة لحالة السوق والاتجاه.',
      },
    },
    {
      id: 'policy-entry-band',
      role: 'POLICY_DECISION',
      area: 'ENTRY',
      policyKey: 'entryStdev',
      teamOptionId: 'team-2_00',
      prompt: {
        en: 'How far below the recent mean should price stretch before your policy may enter?',
        ar: 'إلى أي مدى ينبغي أن يبتعد السعر دون متوسطه الحديث قبل أن تسمح سياستك بالدخول؟',
      },
      options: [
        option('earlier-1_75', 'Earlier: 1.75 standard deviations', 'أبكر: 1.75 انحراف معياري', 'Triggers more readily and may admit more ordinary noise.', 'يتحقق بسهولة أكبر وقد يسمح بدخول تقلبات عادية أكثر.'),
        option('team-2_00', 'Team rule: 2.00 standard deviations', 'قاعدة الفريق: 2.00 انحراف معياري', 'Uses the team’s frozen lower-band threshold.', 'يستخدم الحد المجمد للنطاق السفلي لدى الفريق.'),
        option('patient-2_25', 'Patient: 2.25 standard deviations', 'أكثر صبراً: 2.25 انحراف معياري', 'Waits for a rarer, deeper stretch before entry.', 'ينتظر ابتعاداً أندر وأعمق قبل الدخول.'),
      ],
    },
    {
      id: 'policy-atr-stop',
      role: 'POLICY_DECISION',
      area: 'EXIT',
      policyKey: 'atrStopMult',
      teamOptionId: 'team-3_0',
      prompt: {
        en: 'If price keeps falling after entry, how much ATR distance should the hard stop allow?',
        ar: 'إذا واصل السعر الهبوط بعد الدخول، فما المسافة التي يسمح بها حد الإيقاف الصارم بوحدة متوسط المدى الحقيقي؟',
      },
      options: [
        option('tight-2_5', 'Tighter stop: 2.5 ATR', 'إيقاف أضيق: 2.5 من متوسط المدى الحقيقي', 'Cuts the thesis sooner but gives less room for normal movement.', 'ينهي الفرضية أبكر لكنه يترك مجالاً أقل للحركة العادية.'),
        option('team-3_0', 'Team rule: 3.0 ATR', 'قاعدة الفريق: 3.0 من متوسط المدى الحقيقي', 'Uses the team’s frozen volatility-aware stop distance.', 'يستخدم مسافة الإيقاف المجمدة والمراعية للتقلب لدى الفريق.'),
        option('wide-3_5', 'Wider stop: 3.5 ATR', 'إيقاف أوسع: 3.5 من متوسط المدى الحقيقي', 'Allows more movement before the loss boundary, without changing portfolio caps.', 'يسمح بحركة أكبر قبل حد الخسارة من دون تغيير ضوابط المحفظة.'),
      ],
    },
    {
      id: 'policy-size-budget',
      role: 'POLICY_DECISION',
      area: 'SIZING',
      policyKey: 'targetVolBudget',
      teamOptionId: 'team-0_004',
      prompt: {
        en: 'What daily volatility budget should scale each proposed position before the risk envelope clamps it?',
        ar: 'ما ميزانية التقلب اليومية التي تضبط حجم كل مركز مقترح قبل أن تقلصه ضوابط المخاطر؟',
      },
      options: [
        option('conservative-0_003', 'Conservative: 0.30% daily', 'محافظة: 0.30٪ يومياً', 'Proposes smaller weights when observed volatility is unchanged.', 'تقترح أوزاناً أصغر عندما يبقى التقلب المرصود دون تغيير.'),
        option('team-0_004', 'Team rule: 0.40% daily', 'قاعدة الفريق: 0.40٪ يومياً', 'Uses the team’s frozen inverse-volatility budget.', 'تستخدم ميزانية الفريق المجمدة للحجم العكسي مع التقلب.'),
        option('assertive-0_005', 'Assertive: 0.50% daily', 'أعلى: 0.50٪ يومياً', 'Proposes a larger weight, but the unchanged 20% name cap and risk envelope can only reduce it.', 'تقترح وزناً أكبر، لكن حد السهم الثابت عند 20٪ وضوابط المخاطر لا يمكنهما إلا تقليصه.'),
      ],
    },
    {
      id: 'policy-holding',
      role: 'POLICY_DECISION',
      area: 'HOLDING',
      policyKey: 'maxHoldingDays',
      teamOptionId: 'team-20',
      prompt: {
        en: 'If price neither reaches the mean nor hits the hard stop, when should the time limit close the position?',
        ar: 'إذا لم يصل السعر إلى المتوسط ولم يبلغ حد الإيقاف الصارم، فمتى ينبغي للحد الزمني إغلاق المركز؟',
      },
      options: [
        option('short-10', 'After 10 calendar days', 'بعد 10 أيام تقويمية', 'Tests the thesis quickly and frees capital sooner.', 'يختبر الفرضية بسرعة ويحرر رأس المال أبكر.'),
        option('team-20', 'Team rule: after 20 calendar days', 'قاعدة الفريق: بعد 20 يوماً تقويمياً', 'Uses the team’s frozen maximum holding time.', 'يستخدم الحد الأقصى المجمد لمدة الاحتفاظ لدى الفريق.'),
        option('patient-30', 'After 30 calendar days', 'بعد 30 يوماً تقويمياً', 'Allows more time for reversion while keeping a finite exit deadline.', 'يمنح العودة إلى المتوسط وقتاً أطول مع بقاء موعد خروج نهائي.'),
      ],
    },
    {
      id: 'policy-regime',
      role: 'POLICY_DECISION',
      area: 'RISK',
      policyKey: 'varianceRatioMax',
      teamOptionId: 'team-0_85',
      prompt: {
        en: 'How strict should the variance-ratio gate be before allowing a mean-reversion entry?',
        ar: 'ما درجة صرامة بوابة نسبة التباين قبل السماح بدخول قائم على العودة إلى المتوسط؟',
      },
      options: [
        option('strict-0_80', 'Stricter: variance ratio ≤ 0.80', 'أشد صرامة: نسبة التباين ≤ 0.80', 'Requires stronger evidence of a mean-reverting regime.', 'يتطلب دليلاً أقوى على حالة سوق تميل إلى العودة للمتوسط.'),
        option('team-0_85', 'Team rule: variance ratio ≤ 0.85', 'قاعدة الفريق: نسبة التباين ≤ 0.85', 'Uses the team’s frozen regime threshold; the separate uptrend check still applies.', 'يستخدم حد الفريق المجمد لحالة السوق، مع استمرار شرط الاتجاه الصاعد المستقل.'),
        option('flexible-0_90', 'More flexible: variance ratio ≤ 0.90', 'أكثر مرونة: نسبة التباين ≤ 0.90', 'Admits more borderline regimes; it does not weaken the hard portfolio envelope.', 'يسمح بحالات حدودية أكثر، من دون إضعاف ضوابط المحفظة الصارمة.'),
      ],
    },
    {
      id: 'know-hard-vetoes',
      role: 'KNOWLEDGE_CHECK',
      area: 'RISK',
      prompt: {
        en: 'Can a strong lower-band signal override the Sharia veto or the portfolio risk envelope?',
        ar: 'هل يمكن لإشارة قوية عند النطاق السفلي أن تتجاوز المنع الشرعي أو ضوابط مخاطر المحفظة؟',
      },
      options: [
        option('no-hard-vetoes-remain', 'No. Both remain hard constraints', 'لا. كلاهما يظل قيداً إلزامياً', 'Correct: learner choices can shape a bounded policy but cannot bypass Sharia or risk controls.', 'صحيح: يمكن لاختيارات المتعلم تشكيل سياسة محدودة، لكنها لا تتجاوز الضوابط الشرعية أو ضوابط المخاطر.'),
        option('yes-if-signal-strong', 'Yes, if the signal is strong enough', 'نعم، إذا كانت الإشارة قوية بما يكفي', 'Signal strength never grants permission to bypass a hard veto.', 'لا تمنح قوة الإشارة إذناً بتجاوز أي منع إلزامي.'),
      ],
      correctOptionId: 'no-hard-vetoes-remain',
      explanation: {
        en: 'Sharia screening and the risk envelope are enforced outside the learner policy and always retain final authority.',
        ar: 'يُطبّق الفحص الشرعي وضوابط المخاطر خارج سياسة المتعلم، وتبقى لهما السلطة النهائية دائماً.',
      },
    },
  ] satisfies readonly StrategyLearningQuestion[],
});

const StrategyLearningAnswerSchema = z.object({
  questionId: z.string().min(1),
  optionId: z.string().min(1),
}).strict();

const PolicySelectionsSchema = z.object({
  entryStdev: z.enum(['earlier-1_75', 'team-2_00', 'patient-2_25']),
  atrStopMult: z.enum(['tight-2_5', 'team-3_0', 'wide-3_5']),
  targetVolBudget: z.enum(['conservative-0_003', 'team-0_004', 'assertive-0_005']),
  maxHoldingDays: z.enum(['short-10', 'team-20', 'patient-30']),
  varianceRatioMax: z.enum(['strict-0_80', 'team-0_85', 'flexible-0_90']),
}).strict();

const ENTRY_STDEV = { 'earlier-1_75': 1.75, 'team-2_00': 2, 'patient-2_25': 2.25 } as const;
const ATR_STOP = { 'tight-2_5': 2.5, 'team-3_0': 3, 'wide-3_5': 3.5 } as const;
const VOL_BUDGET = { 'conservative-0_003': 0.003, 'team-0_004': 0.004, 'assertive-0_005': 0.005 } as const;
const HOLDING_DAYS = { 'short-10': 10, 'team-20': 20, 'patient-30': 30 } as const;
const VARIANCE_RATIO = { 'strict-0_80': 0.8, 'team-0_85': 0.85, 'flexible-0_90': 0.9 } as const;

/** Compile a complete answer set into reviewed setup parameters. No DB, clock, market data, or randomness. */
export function compileBollingerMrLongV2Policy(
  input: readonly StrategyLearningAnswer[],
): CompiledStrategyLearningPolicy {
  const answers = z.array(StrategyLearningAnswerSchema).parse(input);
  const questions = BOLLINGER_MR_LONG_V2_CURRICULUM.questions;
  if (answers.length !== questions.length) throw new Error('learning_answer_count_mismatch');

  const byQuestion = new Map<string, string>();
  for (const answer of answers) {
    if (byQuestion.has(answer.questionId)) throw new Error('duplicate_learning_answer');
    const question = questions.find(candidate => candidate.id === answer.questionId);
    if (!question) throw new Error('unknown_learning_question');
    if (!question.options.some(candidate => candidate.id === answer.optionId)) {
      throw new Error('unknown_learning_option');
    }
    byQuestion.set(answer.questionId, answer.optionId);
  }

  const selected: Partial<Record<PolicyKey, string>> = {};
  for (const question of questions) {
    const optionId = byQuestion.get(question.id);
    if (!optionId) throw new Error('missing_learning_answer');
    if (question.role === 'POLICY_DECISION') selected[question.policyKey as PolicyKey] = optionId;
  }
  const policy = PolicySelectionsSchema.parse(selected);
  const params = BollingerMrLongV2ParamsSchema.parse({
    ...BOLLINGER_MR_LONG_V2,
    entryStdev: ENTRY_STDEV[policy.entryStdev],
    atrStopMult: ATR_STOP[policy.atrStopMult],
    targetVolBudget: VOL_BUDGET[policy.targetVolBudget],
    maxHoldingDays: HOLDING_DAYS[policy.maxHoldingDays],
    varianceRatioMax: VARIANCE_RATIO[policy.varianceRatioMax],
  });
  const hashPayload = JSON.stringify({
    setupId: BOLLINGER_MR_LONG_V2_CURRICULUM.setupId,
    setupVersion: BOLLINGER_MR_LONG_V2_CURRICULUM.setupVersion,
    questionSetVersion: BOLLINGER_MR_LONG_V2_CURRICULUM.questionSetVersion,
    policyVersion: BOLLINGER_MR_LONG_V2_CURRICULUM.policyVersion,
    params,
  });

  return {
    setupId: BOLLINGER_MR_LONG_V2_CURRICULUM.setupId,
    setupVersion: BOLLINGER_MR_LONG_V2_CURRICULUM.setupVersion,
    questionSetVersion: BOLLINGER_MR_LONG_V2_CURRICULUM.questionSetVersion,
    policyVersion: BOLLINGER_MR_LONG_V2_CURRICULUM.policyVersion,
    params,
    policyHash: `sha256:${createHash('sha256').update(hashPayload).digest('hex')}`,
  };
}
