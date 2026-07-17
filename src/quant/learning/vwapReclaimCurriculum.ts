import { VWAP_RECLAIM_V1, VwapReclaimParamsSchema } from '../strategies/vwapReclaim';
import type { StrategyLearningAnswer, StrategyLearningOption, StrategyLearningQuestion } from './bollingerMrLongV2Curriculum';
import { compileBoundedLearningPolicy } from './compileBoundedLearningPolicy';

const option = (
  id: string,
  en: string,
  ar: string,
  feedbackEn: string,
  feedbackAr: string,
): StrategyLearningOption => ({ id, label: { en, ar }, feedback: { en: feedbackEn, ar: feedbackAr } });

export const VWAP_RECLAIM_CURRICULUM = Object.freeze({
  setupId: 'vwap-reclaim' as const,
  setupVersion: 'v1' as const,
  questionSetVersion: 'vwap-reclaim.questions.v1' as const,
  policyVersion: 'vwap-reclaim.policy.v1' as const,
  complianceTag: 'EDUCATIONAL_ONLY' as const,
  title: {
    en: 'Testing a long-only VWAP reclaim without weakening the gates',
    ar: 'اختبار استرداد VWAP للشراء فقط دون تخفيف الضوابط',
  },
  questions: [
    {
      id: 'know-confirmation', role: 'KNOWLEDGE_CHECK', area: 'ENTRY',
      prompt: {
        en: 'What confirms a VWAP reclaim after the touch bar?',
        ar: 'ما الذي يؤكد استرداد VWAP بعد شمعة اللمس؟',
      },
      options: [
        option('close-above', 'The next close is above VWAP and the touch high', 'إغلاق الشمعة التالية أعلى من VWAP وقمة شمعة اللمس', 'Correct: both levels must be cleared on the current decision bar.', 'صحيح: يجب تجاوز المستويين في شمعة القرار الحالية.'),
        option('low-below', 'Any low below VWAP', 'أي قاع أدنى من VWAP', 'A probe alone is not a confirmed reclaim.', 'الهبوط وحده لا يؤكد الاسترداد.'),
        option('forecast', 'A forecast of the next close', 'توقع إغلاق الشمعة التالية', 'The rule uses observed bars only.', 'تستخدم القاعدة الشموع المرصودة فقط.'),
      ],
      correctOptionId: 'close-above',
      explanation: {
        en: 'The touch must reclaim VWAP, then the current confirm bar must close above both VWAP and the touch high.',
        ar: 'يجب أن تسترد شمعة اللمس VWAP، ثم تغلق شمعة التأكيد الحالية أعلى من VWAP وقمة شمعة اللمس.',
      },
    },
    {
      id: 'policy-wick', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'wickBodyRatioMin', teamOptionId: 'team-1_5',
      prompt: { en: 'How large must the lower wick be versus the candle body?', ar: 'كم يجب أن يبلغ طول الظل السفلي مقارنة بجسم الشمعة؟' },
      options: [
        option('flex-1_0', 'Flexible: 1.0×', 'مرن: 1.0 مرة', 'Accepts weaker absorption evidence.', 'يقبل دليلاً أضعف على الامتصاص.'),
        option('team-1_5', 'Team rule: 1.5×', 'قاعدة الفريق: 1.5 مرة', 'Uses the frozen wick threshold.', 'يستخدم حد الظل المجمد.'),
        option('strict-2_0', 'Stricter: 2.0×', 'أشد صرامة: 2.0 مرة', 'Requires a longer rejection wick.', 'يتطلب ظلاً أطول لرفض الهبوط.'),
      ],
    },
    {
      id: 'policy-volume', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'volumeRatioMin', teamOptionId: 'team-1_5',
      prompt: { en: 'What volume multiple should the touch bar require?', ar: 'ما مضاعف الحجم المطلوب لشمعة اللمس؟' },
      options: [
        option('flex-1_2', 'Flexible: 1.2×', 'مرن: 1.2 مرة', 'Allows less exceptional touch volume.', 'يسمح بحجم أقل تميزاً عند اللمس.'),
        option('team-1_5', 'Team rule: 1.5×', 'قاعدة الفريق: 1.5 مرة', 'Uses the frozen volume confirmation.', 'يستخدم تأكيد الحجم المجمد.'),
        option('strict-2_0', 'Stricter: 2.0×', 'أشد صرامة: 2.0 مرة', 'Requires stronger participation.', 'يتطلب مشاركة أقوى.'),
      ],
    },
    {
      id: 'policy-target', role: 'POLICY_DECISION', area: 'EXIT', policyKey: 'targetRMultiple', teamOptionId: 'team-2r',
      prompt: { en: 'Where should the profit target sit relative to initial risk?', ar: 'أين ينبغي أن يكون هدف الربح نسبةً إلى المخاطرة الأولية؟' },
      options: [
        option('near-1_5r', 'Nearer: 1.5R', 'أقرب: 1.5R', 'Takes profit at a smaller reward multiple.', 'يجني الربح عند مضاعف عائد أصغر.'),
        option('team-2r', 'Team rule: 2R', 'قاعدة الفريق: 2R', 'Uses the frozen reward multiple.', 'يستخدم مضاعف العائد المجمد.'),
        option('far-2_5r', 'Farther: 2.5R', 'أبعد: 2.5R', 'Requires a larger move before the target signal.', 'يتطلب حركة أكبر قبل إشارة الهدف.'),
      ],
    },
    {
      id: 'policy-start', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'entryStartMinute', teamOptionId: 'team-1000',
      prompt: { en: 'When may the entry window begin?', ar: 'متى يمكن أن تبدأ نافذة الدخول؟' },
      options: [
        option('early-945', 'Earlier: 09:45 ET', 'أبكر: 09:45 بتوقيت نيويورك', 'Allows entries closer to the opening volatility.', 'يسمح بالدخول أقرب إلى تقلب الافتتاح.'),
        option('team-1000', 'Team rule: 10:00 ET', 'قاعدة الفريق: 10:00 بتوقيت نيويورك', 'Uses the frozen start time.', 'يستخدم وقت البدء المجمد.'),
        option('late-1030', 'Later: 10:30 ET', 'لاحقاً: 10:30 بتوقيت نيويورك', 'Waits for more session evidence.', 'ينتظر مزيداً من أدلة الجلسة.'),
      ],
    },
    {
      id: 'policy-end', role: 'POLICY_DECISION', area: 'RISK', policyKey: 'entryEndMinute', teamOptionId: 'team-1500',
      prompt: { en: 'When should new entries stop?', ar: 'متى ينبغي إيقاف المداخل الجديدة؟' },
      options: [
        option('early-1400', 'Earlier: 14:00 ET', 'أبكر: 14:00 بتوقيت نيويورك', 'Leaves more time for same-day exits.', 'يترك وقتاً أطول للخروج في اليوم نفسه.'),
        option('team-1500', 'Team rule: 15:00 ET', 'قاعدة الفريق: 15:00 بتوقيت نيويورك', 'Uses the frozen cutoff.', 'يستخدم وقت الإيقاف المجمد.'),
        option('late-1530', 'Later: 15:30 ET', 'لاحقاً: 15:30 بتوقيت نيويورك', 'Allows less time before the mandatory flat close.', 'يتيح وقتاً أقل قبل الإغلاق الإلزامي للمراكز.'),
      ],
    },
    {
      id: 'know-vetoes', role: 'KNOWLEDGE_CHECK', area: 'RISK',
      prompt: {
        en: 'Can a strong VWAP reclaim override this team’s REJECTED result, Sharia block, or risk/fill envelope?',
        ar: 'هل يمكن لاسترداد قوي لـVWAP تجاوز نتيجة رفض الفريق أو المنع الشرعي أو ضوابط المخاطر والتنفيذ؟',
      },
      options: [
        option('no', 'No. Every external gate remains binding', 'لا. تبقى جميع الضوابط الخارجية ملزمة', 'Correct: this bounded replay is educational evidence only.', 'صحيح: هذه الإعادة المحدودة دليل تعليمي فقط.'),
        option('yes', 'Yes, when volume is high', 'نعم، عندما يكون الحجم مرتفعاً', 'Volume cannot grant a veto bypass.', 'لا يمنح الحجم حق تجاوز المنع.'),
      ],
      correctOptionId: 'no',
      explanation: {
        en: 'The lesson changes only bounded setup parameters; it cannot promote the team or weaken compliance, fills, or risk caps.',
        ar: 'يغير الدرس معلمات محدودة فقط، ولا يمكنه اعتماد الفريق أو تخفيف الضوابط الشرعية أو التنفيذ أو حدود المخاطر.',
      },
    },
  ] satisfies readonly StrategyLearningQuestion[],
});

export function compileVwapReclaimPolicy(input: readonly StrategyLearningAnswer[]) {
  return compileBoundedLearningPolicy({
    answers: input,
    curriculum: VWAP_RECLAIM_CURRICULUM,
    defaultParams: VWAP_RECLAIM_V1,
    choices: {
      wickBodyRatioMin: { 'flex-1_0': 1, 'team-1_5': 1.5, 'strict-2_0': 2 },
      volumeRatioMin: { 'flex-1_2': 1.2, 'team-1_5': 1.5, 'strict-2_0': 2 },
      targetRMultiple: { 'near-1_5r': 1.5, 'team-2r': 2, 'far-2_5r': 2.5 },
      entryStartMinute: { 'early-945': 585, 'team-1000': 600, 'late-1030': 630 },
      entryEndMinute: { 'early-1400': 840, 'team-1500': 900, 'late-1530': 930 },
    },
    parseParams: candidate => VwapReclaimParamsSchema.parse(candidate),
  });
}
