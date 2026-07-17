import { TOM_OVERLAY_V1, TomOverlayParamsSchema } from '../strategies/tomOverlay';
import type { StrategyLearningAnswer, StrategyLearningOption, StrategyLearningQuestion } from './bollingerMrLongV2Curriculum';
import { compileBoundedLearningPolicy } from './compileBoundedLearningPolicy';

const option = (id: string, en: string, ar: string, feedbackEn: string, feedbackAr: string): StrategyLearningOption => ({
  id, label: { en, ar }, feedback: { en: feedbackEn, ar: feedbackAr },
});
export const TOM_OVERLAY_CURRICULUM = Object.freeze({
  setupId: 'tom-overlay' as const, setupVersion: 'v1' as const,
  questionSetVersion: 'tom-overlay.questions.v1' as const, policyVersion: 'tom-overlay.policy.v1' as const,
  complianceTag: 'EDUCATIONAL_ONLY' as const,
  title: { en: 'Testing calendar seasonality without forecasting prices', ar: 'اختبار الموسمية التقويمية دون توقع الأسعار' },
  questions: [
    {
      id: 'know-calendar-only', role: 'KNOWLEDGE_CHECK', area: 'ENTRY',
      prompt: { en: 'What determines whether a session belongs to this turn-of-month window?', ar: 'ما الذي يحدد انتماء الجلسة إلى نافذة مطلع ونهاية الشهر؟' },
      options: [
        option('observed-session-order', 'Its order among observed sessions around a month boundary', 'ترتيبها بين الجلسات المرصودة حول حد الشهر', 'Correct: eligibility uses timestamps, never future prices.', 'صحيح: تعتمد الأهلية على الطوابع الزمنية لا على الأسعار المستقبلية.'),
        option('future-return', 'Its return over the following week', 'عائدها خلال الأسبوع التالي', 'Future returns cannot define an entry without look-ahead.', 'لا يمكن للعوائد المستقبلية تحديد الدخول دون انحياز استشرافي.'),
        option('ai-forecast', 'An AI forecast', 'توقع بالذكاء الاصطناعي', 'The rule is deterministic and contains no generated forecast.', 'القاعدة حتمية ولا تتضمن توقعاً مولداً.'),
      ], correctOptionId: 'observed-session-order',
      explanation: { en: 'The setup infers month boundaries only from the chronological SPUS session calendar available at each decision.', ar: 'تستنتج الاستراتيجية حدود الأشهر من تقويم جلسات SPUS المتاح زمنياً عند كل قرار.' },
    },
    {
      id: 'policy-last-sessions', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'lastSessions', teamOptionId: 'team-4',
      prompt: { en: 'How many observed sessions before month-end should enter the calendar window?', ar: 'كم جلسة مرصودة قبل نهاية الشهر ينبغي أن تدخل النافذة التقويمية؟' },
      options: [
        option('narrow-3', 'Narrower: 3 sessions', 'أضيق: 3 جلسات', 'Starts the window one session later.', 'يبدأ النافذة بعد جلسة إضافية.'),
        option('team-4', 'Team rule: 4 sessions', 'قاعدة الفريق: 4 جلسات', 'Uses the frozen pre-month-end window.', 'يستخدم نافذة ما قبل نهاية الشهر المجمدة.'),
        option('wide-5', 'Wider: 5 sessions', 'أوسع: 5 جلسات', 'Starts exposure one observed session earlier.', 'يبدأ التعرض قبل جلسة مرصودة إضافية.'),
      ],
    },
    {
      id: 'policy-first-sessions', role: 'POLICY_DECISION', area: 'EXIT', policyKey: 'firstSessions', teamOptionId: 'team-3',
      prompt: { en: 'How many observed sessions after month-start should remain in the window?', ar: 'كم جلسة مرصودة بعد بداية الشهر ينبغي أن تبقى ضمن النافذة؟' },
      options: [
        option('short-2', 'Shorter: 2 sessions', 'أقصر: جلستان', 'Ends exposure sooner after the new month begins.', 'ينهي التعرض أبكر بعد بداية الشهر الجديد.'),
        option('team-3', 'Team rule: 3 sessions', 'قاعدة الفريق: 3 جلسات', 'Uses the frozen post-month-start window.', 'يستخدم نافذة ما بعد بداية الشهر المجمدة.'),
        option('long-4', 'Longer: 4 sessions', 'أطول: 4 جلسات', 'Keeps exposure for one additional observed session.', 'يبقي التعرض لجلسة مرصودة إضافية.'),
      ],
    },
    {
      id: 'know-incomplete-boundary', role: 'KNOWLEDGE_CHECK', area: 'RISK',
      prompt: { en: 'What happens when the next month lacks enough observed sessions to prove an exit?', ar: 'ماذا يحدث عندما لا يحتوي الشهر التالي على جلسات مرصودة كافية لإثبات الخروج؟' },
      options: [
        option('fail-closed', 'The boundary is excluded', 'يُستبعد الحد الزمني', 'Correct: incomplete calendar evidence never creates exposure.', 'صحيح: لا تنشئ الأدلة التقويمية الناقصة أي تعرض.'),
        option('assume-exit', 'The system assumes a future exit', 'يفترض النظام خروجاً مستقبلياً', 'Assuming an unseen exit would violate point-in-time discipline.', 'افتراض خروج غير مرصود يخالف الانضباط الزمني.'),
      ], correctOptionId: 'fail-closed',
      explanation: { en: 'The setup requires an executable observed exit session and fails closed at truncated boundaries.', ar: 'تتطلب الاستراتيجية جلسة خروج مرصودة قابلة للتنفيذ وتفشل بأمان عند الحدود المبتورة.' },
    },
    {
      id: 'know-price-independence', role: 'KNOWLEDGE_CHECK', area: 'ENTRY',
      prompt: { en: 'May a price rise or fall change which dates qualify?', ar: 'هل يمكن لارتفاع السعر أو هبوطه تغيير التواريخ المؤهلة؟' },
      options: [
        option('no', 'No. Prices do not determine calendar membership', 'لا. الأسعار لا تحدد العضوية التقويمية', 'Correct: this isolates the calendar hypothesis from price selection.', 'صحيح: يفصل ذلك الفرضية التقويمية عن انتقاء الأسعار.'),
        option('yes', 'Yes. Rising prices add sessions', 'نعم. تضيف الأسعار الصاعدة جلسات', 'Adding sessions after seeing prices would contaminate the rule.', 'إضافة جلسات بعد رؤية الأسعار تلوث القاعدة.'),
      ], correctOptionId: 'no',
      explanation: { en: 'Only observed session order determines eligibility; prices affect fills and outcomes, not membership.', ar: 'يحدد ترتيب الجلسات المرصودة الأهلية وحده؛ وتؤثر الأسعار في التنفيذ والنتائج لا في العضوية.' },
    },
    {
      id: 'know-rejected', role: 'KNOWLEDGE_CHECK', area: 'RISK',
      prompt: { en: 'Does learning this setup mean its rejected research result is investable evidence?', ar: 'هل يعني تعلم هذه الاستراتيجية أن نتيجتها البحثية المرفوضة دليل صالح للاستثمار؟' },
      options: [
        option('no-research-only', 'No. It remains rejected and research-only', 'لا. تبقى مرفوضة وللبحث فقط', 'Correct: the lesson teaches mechanics without promoting the result.', 'صحيح: يشرح الدرس الآلية دون الترويج للنتيجة.'),
        option('yes-approved', 'Yes. Completion approves it', 'نعم. إكمال الدرس يعتمدها', 'Learner completion never changes a research gate.', 'لا يغير إكمال المتعلم أي بوابة بحثية.'),
      ], correctOptionId: 'no-research-only',
      explanation: { en: 'The terminal league status stays REJECTED regardless of lesson completion or short replay outcome.', ar: 'تبقى حالة الفريق في الدوري مرفوضة بصرف النظر عن إكمال الدرس أو نتيجة الإعادة القصيرة.' },
    },
    {
      id: 'know-hard-vetoes', role: 'KNOWLEDGE_CHECK', area: 'RISK',
      prompt: { en: 'Can calendar eligibility override Sharia screening or the risk envelope?', ar: 'هل يمكن للأهلية التقويمية تجاوز الفحص الشرعي أو ضوابط المخاطر؟' },
      options: [
        option('no-hard-vetoes', 'No. Both remain hard constraints', 'لا. كلاهما يظل قيداً إلزامياً', 'Correct: timing never outranks compliance or deterministic risk controls.', 'صحيح: لا يتقدم التوقيت على الضوابط الشرعية أو ضوابط المخاطر الحتمية.'),
        option('yes-seasonal', 'Yes, during a seasonal window', 'نعم، أثناء النافذة الموسمية', 'A calendar window cannot bypass a hard veto.', 'لا تستطيع النافذة التقويمية تجاوز منع إلزامي.'),
      ], correctOptionId: 'no-hard-vetoes',
      explanation: { en: 'The policy compiler only changes the bounded session counts; every external gate remains unchanged.', ar: 'لا يغير مُصرّف السياسة إلا أعداد الجلسات المحدودة؛ وتبقى جميع البوابات الخارجية دون تغيير.' },
    },
  ] satisfies readonly StrategyLearningQuestion[],
});

export function compileTomOverlayPolicy(input: readonly StrategyLearningAnswer[]) {
  return compileBoundedLearningPolicy({
    answers: input, curriculum: TOM_OVERLAY_CURRICULUM, defaultParams: TOM_OVERLAY_V1,
    choices: {
      lastSessions: { 'narrow-3': 3, 'team-4': 4, 'wide-5': 5 },
      firstSessions: { 'short-2': 2, 'team-3': 3, 'long-4': 4 },
    },
    parseParams: candidate => TomOverlayParamsSchema.parse(candidate),
  });
}
