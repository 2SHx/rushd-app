import {
  STOP_HUNT_REVERSAL_V1,
  StopHuntReversalParamsSchema,
} from '../strategies/stopHuntReversalLong';
import type { StrategyLearningAnswer, StrategyLearningOption, StrategyLearningQuestion } from './bollingerMrLongV2Curriculum';
import { compileBoundedLearningPolicy } from './compileBoundedLearningPolicy';

const option = (
  id: string,
  en: string,
  ar: string,
  feedbackEn: string,
  feedbackAr: string,
): StrategyLearningOption => ({ id, label: { en, ar }, feedback: { en: feedbackEn, ar: feedbackAr } });

export const STOP_HUNT_REVERSAL_CURRICULUM = Object.freeze({
  setupId: 'stop-hunt-reversal-long' as const,
  setupVersion: 'v1' as const,
  questionSetVersion: 'stop-hunt-reversal-long.questions.v1' as const,
  policyVersion: 'stop-hunt-reversal-long.policy.v1' as const,
  complianceTag: 'EDUCATIONAL_ONLY' as const,
  title: {
    en: 'Testing a prior-day-low sweep and hard reclaim',
    ar: 'اختبار اصطياد السيولة أسفل قاع اليوم السابق ثم الاسترداد القوي',
  },
  questions: [
    {
      id: 'know-pattern', role: 'KNOWLEDGE_CHECK', area: 'ENTRY',
      prompt: { en: 'What makes the break below the prior-day low a valid hard reclaim?', ar: 'ما الذي يجعل الكسر أسفل قاع اليوم السابق استرداداً قوياً صالحاً؟' },
      options: [
        option('close-back-above', 'The current bar closes back above the prior-day low within the window', 'تغلق الشمعة الحالية مجدداً أعلى قاع اليوم السابق ضمن المهلة', 'Correct: the observed close must invalidate the breakdown.', 'صحيح: يجب أن يبطل الإغلاق المرصود سيناريو الكسر.'),
        option('touch-only', 'Any touch of the prior-day low', 'أي ملامسة لقاع اليوم السابق', 'A touch is not a sweep and reclaim.', 'الملامسة ليست اصطياداً ثم استرداداً.'),
        option('future-high', 'A later high confirms it retroactively', 'تؤكده قمة لاحقة بأثر رجعي', 'Future bars cannot enter the decision.', 'لا يمكن إدخال شموع مستقبلية في القرار.'),
      ],
      correctOptionId: 'close-back-above',
      explanation: {
        en: 'The setup requires a real break of the level and the first close back above it within the fixed reclaim window.',
        ar: 'تتطلب الاستراتيجية كسراً فعلياً للمستوى ثم أول إغلاق يعود فوقه ضمن مهلة الاسترداد المحددة.',
      },
    },
    {
      id: 'policy-depth', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'sweepDepthPct', teamOptionId: 'team-0_2',
      prompt: { en: 'How far below the prior-day low must the sweep print?', ar: 'إلى أي مدى يجب أن يهبط الاصطياد أسفل قاع اليوم السابق؟' },
      options: [
        option('flex-0_1', 'Flexible: 0.1%', 'مرن: 0.1٪', 'Accepts a shallower break.', 'يقبل كسراً أقل عمقاً.'),
        option('team-0_2', 'Team rule: 0.2%', 'قاعدة الفريق: 0.2٪', 'Uses the frozen sweep depth.', 'يستخدم عمق الاصطياد المجمد.'),
        option('strict-0_3', 'Stricter: 0.3%', 'أشد صرامة: 0.3٪', 'Requires a deeper liquidity sweep.', 'يتطلب اصطياد سيولة أعمق.'),
      ],
    },
    {
      id: 'policy-window', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'reclaimWindowMinutes', teamOptionId: 'team-15',
      prompt: { en: 'How quickly must price reclaim the level after the break?', ar: 'ما السرعة المطلوبة لاسترداد المستوى بعد الكسر؟' },
      options: [
        option('fast-10', 'Faster: 10 minutes', 'أسرع: 10 دقائق', 'Requires a quicker failure of the breakdown.', 'يتطلب فشلاً أسرع للكسر.'),
        option('team-15', 'Team rule: 15 minutes', 'قاعدة الفريق: 15 دقيقة', 'Uses the frozen reclaim window.', 'يستخدم مهلة الاسترداد المجمدة.'),
        option('slow-20', 'Slower: 20 minutes', 'أبطأ: 20 دقيقة', 'Allows a longer sweep episode.', 'يسمح بفترة اصطياد أطول.'),
      ],
    },
    {
      id: 'policy-target', role: 'POLICY_DECISION', area: 'EXIT', policyKey: 'targetRMultiple', teamOptionId: 'team-2r',
      prompt: { en: 'What reward multiple should feed the target rule?', ar: 'ما مضاعف العائد الذي ينبغي إدخاله في قاعدة الهدف؟' },
      options: [
        option('near-1_5r', 'Nearer: 1.5R', 'أقرب: 1.5R', 'Uses a smaller reward multiple.', 'يستخدم مضاعف عائد أصغر.'),
        option('team-2r', 'Team rule: 2R', 'قاعدة الفريق: 2R', 'Uses the frozen 2R-or-VWAP rule.', 'يستخدم قاعدة 2R أو VWAP المجمدة.'),
        option('far-2_5r', 'Farther: 2.5R', 'أبعد: 2.5R', 'Requires a larger favorable move.', 'يتطلب حركة مواتية أكبر.'),
      ],
    },
    {
      id: 'policy-start', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'entryStartMinute', teamOptionId: 'team-935',
      prompt: { en: 'When may hard-reclaim entries begin?', ar: 'متى يمكن أن تبدأ مداخل الاسترداد القوي؟' },
      options: [
        option('early-930', 'Earlier: 09:30 ET', 'أبكر: 09:30 بتوقيت نيويورك', 'Includes the opening auction transition.', 'يشمل فترة الانتقال من مزاد الافتتاح.'),
        option('team-935', 'Team rule: 09:35 ET', 'قاعدة الفريق: 09:35 بتوقيت نيويورك', 'Uses the frozen opening buffer.', 'يستخدم هامش الافتتاح المجمد.'),
        option('late-945', 'Later: 09:45 ET', 'لاحقاً: 09:45 بتوقيت نيويورك', 'Waits longer after the open.', 'ينتظر فترة أطول بعد الافتتاح.'),
      ],
    },
    {
      id: 'policy-end', role: 'POLICY_DECISION', area: 'RISK', policyKey: 'entryEndMinute', teamOptionId: 'team-1500',
      prompt: { en: 'When should new reclaim entries stop?', ar: 'متى ينبغي إيقاف مداخل الاسترداد الجديدة؟' },
      options: [
        option('early-1400', 'Earlier: 14:00 ET', 'أبكر: 14:00 بتوقيت نيويورك', 'Leaves more time before the flat close.', 'يترك وقتاً أطول قبل الإغلاق الإلزامي.'),
        option('team-1500', 'Team rule: 15:00 ET', 'قاعدة الفريق: 15:00 بتوقيت نيويورك', 'Uses the frozen cutoff.', 'يستخدم وقت الإيقاف المجمد.'),
        option('late-1530', 'Later: 15:30 ET', 'لاحقاً: 15:30 بتوقيت نيويورك', 'Allows less time to resolve the trade.', 'يتيح وقتاً أقل لحسم الصفقة.'),
      ],
    },
    {
      id: 'know-vetoes', role: 'KNOWLEDGE_CHECK', area: 'RISK',
      prompt: { en: 'Can a clean reclaim override the REJECTED verdict, Sharia block, or shared risk/fill rules?', ar: 'هل يمكن لاسترداد واضح تجاوز حكم الرفض أو المنع الشرعي أو قواعد المخاطر والتنفيذ المشتركة؟' },
      options: [
        option('no', 'No. All hard gates remain binding', 'لا. تبقى جميع الضوابط الصارمة ملزمة', 'Correct: the lesson is research-only.', 'صحيح: الدرس مخصص للبحث فقط.'),
        option('yes', 'Yes, when the sweep is deep', 'نعم، عندما يكون الاصطياد عميقاً', 'Pattern strength never grants a veto bypass.', 'لا تمنح قوة النمط حق تجاوز المنع.'),
      ],
      correctOptionId: 'no',
      explanation: {
        en: 'The short replay teaches mechanics and cannot promote the rejected team or relax any external constraint.',
        ar: 'تشرح الإعادة القصيرة الآلية ولا يمكنها اعتماد الفريق المرفوض أو تخفيف أي قيد خارجي.',
      },
    },
  ] satisfies readonly StrategyLearningQuestion[],
});

export function compileStopHuntReversalPolicy(input: readonly StrategyLearningAnswer[]) {
  return compileBoundedLearningPolicy({
    answers: input,
    curriculum: STOP_HUNT_REVERSAL_CURRICULUM,
    defaultParams: STOP_HUNT_REVERSAL_V1,
    choices: {
      sweepDepthPct: { 'flex-0_1': 0.001, 'team-0_2': 0.002, 'strict-0_3': 0.003 },
      reclaimWindowMinutes: { 'fast-10': 10, 'team-15': 15, 'slow-20': 20 },
      targetRMultiple: { 'near-1_5r': 1.5, 'team-2r': 2, 'far-2_5r': 2.5 },
      entryStartMinute: { 'early-930': 570, 'team-935': 575, 'late-945': 585 },
      entryEndMinute: { 'early-1400': 840, 'team-1500': 900, 'late-1530': 930 },
    },
    parseParams: candidate => StopHuntReversalParamsSchema.parse(candidate),
  });
}
