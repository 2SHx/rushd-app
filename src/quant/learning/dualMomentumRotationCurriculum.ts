import { DUAL_MOMENTUM_ROTATION_V1, DualMomentumRotationParamsSchema } from '../strategies/dualMomentumRotation';
import type { StrategyLearningAnswer, StrategyLearningOption, StrategyLearningQuestion } from './bollingerMrLongV2Curriculum';
import { compileBoundedLearningPolicy } from './compileBoundedLearningPolicy';

const option = (id: string, en: string, ar: string, feedbackEn: string, feedbackAr: string): StrategyLearningOption => ({ id, label: { en, ar }, feedback: { en: feedbackEn, ar: feedbackAr } });
export const DUAL_MOMENTUM_ROTATION_CURRICULUM = Object.freeze({
  setupId: 'dual-momentum-rotation' as const, setupVersion: 'v1' as const,
  questionSetVersion: 'dual-momentum-rotation.questions.v1' as const, policyVersion: 'dual-momentum-rotation.policy.v1' as const,
  complianceTag: 'EDUCATIONAL_ONLY' as const,
  title: { en: 'Rotating toward the strongest positive trend', ar: 'التناوب نحو أقوى اتجاه إيجابي' },
  questions: [
    {
      id: 'know-relative-absolute', role: 'KNOWLEDGE_CHECK', area: 'ENTRY',
      prompt: { en: 'Which name may this monthly rotation team hold?', ar: 'أي أصل يمكن لفريق التناوب الشهري الاحتفاظ به؟' },
      options: [
        option('winner-positive', 'The relative-momentum winner only when its absolute momentum is positive', 'الفائز بالزخم النسبي فقط عندما يكون زخمه المطلق إيجابياً', 'Correct: relative strength selects; positive absolute momentum admits.', 'صحيح: تختار القوة النسبية، ويسمح الزخم المطلق الإيجابي بالدخول.'),
        option('weakest', 'The weakest name in the sleeve', 'أضعف أصل في السلة', 'The setup follows strength rather than buying the weakest name.', 'تتبع الاستراتيجية القوة بدلاً من شراء الأصل الأضعف.'),
        option('winner-any-sign', 'The winner even when every trend is negative', 'الفائز حتى عندما تكون جميع الاتجاهات سلبية', 'The absolute-momentum gate fails closed when the winner is not positive.', 'تفشل بوابة الزخم المطلق بأمان عندما لا يكون زخم الفائز إيجابياً.'),
      ], correctOptionId: 'winner-positive',
      explanation: { en: 'At an observed month-end, the setup ranks its exact declared sleeve and admits at most one positive-trend winner.', ar: 'عند نهاية شهر مرصودة، ترتب الاستراتيجية سلتها المحددة وتسمح بفائز واحد ذي اتجاه إيجابي كحد أقصى.' },
    },
    {
      id: 'policy-lookback', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'lookbackBars', teamOptionId: 'team-252',
      prompt: { en: 'How much history should define the long relative trend?', ar: 'ما مقدار التاريخ الذي ينبغي أن يحدد الاتجاه النسبي الطويل؟' },
      options: [
        option('fast-189', 'More responsive: 189 sessions', 'أسرع استجابة: 189 جلسة', 'Responds to a shorter trend and may rotate sooner.', 'يستجيب لاتجاه أقصر وقد يتناوب أبكر.'),
        option('team-252', 'Team rule: 252 sessions', 'قاعدة الفريق: 252 جلسة', 'Uses the frozen approximate 12-month horizon.', 'يستخدم الأفق المجمد البالغ نحو 12 شهراً.'),
        option('slow-315', 'More patient: 315 sessions', 'أكثر صبراً: 315 جلسة', 'Requires a longer trend history.', 'يتطلب تاريخاً أطول للاتجاه.'),
      ],
    },
    {
      id: 'policy-skip', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'skipRecentBars', teamOptionId: 'team-21',
      prompt: { en: 'How many recent sessions should relative momentum skip?', ar: 'كم جلسة حديثة ينبغي للزخم النسبي أن يتجاوزها؟' },
      options: [
        option('short-10', 'Skip 10 sessions', 'تجاوز 10 جلسات', 'Lets more recent movement influence the ranking.', 'يسمح للحركة الأحدث بالتأثير في الترتيب.'),
        option('team-21', 'Team rule: skip 21 sessions', 'قاعدة الفريق: تجاوز 21 جلسة', 'Uses the frozen 12-minus-1-month convention.', 'يستخدم قاعدة 12 شهراً ناقص شهر واحد المجمدة.'),
        option('long-42', 'Skip 42 sessions', 'تجاوز 42 جلسة', 'Removes two recent months from relative ranking.', 'يستبعد شهرين حديثين من الترتيب النسبي.'),
      ],
    },
    {
      id: 'policy-threshold', role: 'POLICY_DECISION', area: 'RISK', policyKey: 'absoluteThreshold', teamOptionId: 'team-zero',
      prompt: { en: 'What minimum absolute momentum should admit the relative winner?', ar: 'ما الحد الأدنى للزخم المطلق الذي يسمح بدخول الفائز النسبي؟' },
      options: [
        option('flexible-minus-0_02', 'Flexible: above −2%', 'مرن: أعلى من −2٪', 'May admit a mildly negative absolute trend.', 'قد يسمح باتجاه مطلق سلبي قليلاً.'),
        option('team-zero', 'Team rule: strictly above 0%', 'قاعدة الفريق: أعلى من 0٪ بصرامة', 'Uses the frozen positive-trend gate.', 'يستخدم بوابة الاتجاه الإيجابي المجمدة.'),
        option('strict-plus-0_02', 'Stricter: above +2%', 'أشد صرامة: أعلى من +2٪', 'Requires a stronger positive trend before exposure.', 'يتطلب اتجاهاً إيجابياً أقوى قبل التعرض.'),
      ],
    },
    {
      id: 'know-month-end', role: 'KNOWLEDGE_CHECK', area: 'HOLDING',
      prompt: { en: 'May the setup switch winners in the middle of a month?', ar: 'هل يمكن للاستراتيجية تبديل الفائز في منتصف الشهر؟' },
      options: [option('no', 'No. Decisions occur only at observed month-end', 'لا. تُتخذ القرارات فقط عند نهاية شهر مرصودة', 'Correct: the frozen cadence prevents daily winner-chasing.', 'صحيح: يمنع الإيقاع المجمد مطاردة الفائز يومياً.'), option('yes', 'Yes, after every close', 'نعم، بعد كل إغلاق', 'Daily switching is outside this reviewed setup.', 'التبديل اليومي خارج هذه الاستراتيجية المراجعة.')],
      correctOptionId: 'no', explanation: { en: 'The book rotates only at PIT-safe observed month-end decisions and fills next-open.', ar: 'تتناوب السلة فقط عند قرارات نهاية الشهر الآمنة زمنياً ويكون التنفيذ عند الافتتاح التالي.' },
    },
    {
      id: 'know-rejected', role: 'KNOWLEDGE_CHECK', area: 'RISK',
      prompt: { en: 'Does a favorable short replay change the team’s REJECTED league status?', ar: 'هل تغير إعادة قصيرة مواتية حالة الفريق المرفوضة في الدوري؟' },
      options: [option('no', 'No. It remains research-only', 'لا. يبقى للبحث فقط', 'Correct: a learning fixture is not terminal evidence.', 'صحيح: بيانات التعلم ليست دليلاً نهائياً.'), option('yes', 'Yes. A positive replay approves it', 'نعم. الإعادة الإيجابية تعتمدها', 'Short replay luck never promotes a rejected setup.', 'لا ترفع مصادفة إعادة قصيرة استراتيجية مرفوضة.')],
      correctOptionId: 'no', explanation: { en: 'The lesson teaches mechanics; it never runs or replaces the protected terminal evaluation.', ar: 'يشرح الدرس الآلية ولا يشغل التقييم النهائي المحمي ولا يستبدله.' },
    },
    {
      id: 'know-hard-vetoes', role: 'KNOWLEDGE_CHECK', area: 'RISK',
      prompt: { en: 'Can a strong winner override Sharia screening or the 25% book cap?', ar: 'هل يمكن لفائز قوي تجاوز الفحص الشرعي أو حد السلة البالغ 25٪؟' },
      options: [option('no', 'No. Both remain hard constraints', 'لا. كلاهما يظل قيداً إلزامياً', 'Correct: signal ranking never outranks compliance or risk.', 'صحيح: لا يتقدم ترتيب الإشارة على الضوابط الشرعية أو المخاطر.'), option('yes', 'Yes, when it ranks first', 'نعم، عندما يحتل المركز الأول', 'First rank grants no veto bypass.', 'المركز الأول لا يمنح حق تجاوز المنع.')],
      correctOptionId: 'no', explanation: { en: 'The compiler changes only reviewed momentum parameters; external gates remain authoritative.', ar: 'لا يغير المُصرّف إلا معلمات الزخم المراجعة؛ وتبقى البوابات الخارجية صاحبة السلطة.' },
    },
  ] satisfies readonly StrategyLearningQuestion[],
});

export function compileDualMomentumRotationPolicy(input: readonly StrategyLearningAnswer[]) {
  return compileBoundedLearningPolicy({
    answers: input, curriculum: DUAL_MOMENTUM_ROTATION_CURRICULUM, defaultParams: DUAL_MOMENTUM_ROTATION_V1,
    choices: {
      lookbackBars: { 'fast-189': 189, 'team-252': 252, 'slow-315': 315 },
      skipRecentBars: { 'short-10': 10, 'team-21': 21, 'long-42': 42 },
      absoluteThreshold: { 'flexible-minus-0_02': -0.02, 'team-zero': 0, 'strict-plus-0_02': 0.02 },
    },
    parseParams: candidate => DualMomentumRotationParamsSchema.parse(candidate),
  });
}
