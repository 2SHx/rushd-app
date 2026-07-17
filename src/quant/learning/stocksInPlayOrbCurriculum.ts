import { STOCKS_IN_PLAY_ORB_V1, StocksInPlayOrbParamsSchema } from '../strategies/stocksInPlayOrb';
import type { StrategyLearningAnswer, StrategyLearningOption, StrategyLearningQuestion } from './bollingerMrLongV2Curriculum';
import { compileBoundedLearningPolicy } from './compileBoundedLearningPolicy';

const option = (id: string, en: string, ar: string, feedbackEn: string, feedbackAr: string): StrategyLearningOption => ({ id, label: { en, ar }, feedback: { en: feedbackEn, ar: feedbackAr } });
export const STOCKS_IN_PLAY_ORB_CURRICULUM = Object.freeze({
  setupId: 'stocks-in-play-orb' as const, setupVersion: 'v1' as const,
  questionSetVersion: 'stocks-in-play-orb.questions.v1' as const, policyVersion: 'stocks-in-play-orb.policy.v1' as const,
  complianceTag: 'EDUCATIONAL_ONLY' as const,
  title: { en: 'Trading an opening-range break only in active liquid names', ar: 'تداول اختراق نطاق الافتتاح في الأسهم النشطة والسائلة فقط' },
  questions: [
    {
      id: 'know-screen', role: 'KNOWLEDGE_CHECK', area: 'ENTRY',
      prompt: { en: 'Why does this team rank same-day relative volume before an opening-range entry?', ar: 'لماذا يرتب هذا الفريق الحجم النسبي في اليوم نفسه قبل دخول اختراق نطاق الافتتاح؟' },
      options: [option('active-names', 'To restrict the setup to unusually active liquid names', 'لقصر الاستراتيجية على الأسهم السائلة ذات النشاط غير المعتاد', 'Correct: the setup first proves the name is in play.', 'صحيح: تثبت الاستراتيجية أولاً أن السهم نشط في ذلك اليوم.'), option('predict-close', 'To predict the closing price', 'لتوقع سعر الإغلاق', 'Relative volume is a screen, not a price forecast.', 'الحجم النسبي أداة فرز وليس توقعاً للسعر.'), option('ignore-liquidity', 'To ignore liquidity limits', 'لتجاهل حدود السيولة', 'Liquidity and participation caps remain binding.', 'تبقى حدود السيولة والمشاركة ملزمة.')],
      correctOptionId: 'active-names', explanation: { en: 'The screen combines relative volume, peer rank, price, ADV, ATR, and opening strength before the breakout rule may act.', ar: 'يجمع الفرز بين الحجم النسبي والترتيب بين النظراء والسعر والسيولة والتقلب وقوة الافتتاح قبل السماح بقاعدة الاختراق.' },
    },
    {
      id: 'policy-rv', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'rvThreshold', teamOptionId: 'team-1_0',
      prompt: { en: 'What minimum relative volume should qualify a name?', ar: 'ما الحد الأدنى للحجم النسبي الذي يؤهل السهم؟' },
      options: [option('flex-0_8', 'Flexible: 0.8×', 'مرن: 0.8 مرة', 'Admits less unusual activity.', 'يسمح بنشاط أقل تميزاً.'), option('team-1_0', 'Team rule: 1.0×', 'قاعدة الفريق: 1.0 مرة', 'Uses the frozen activity threshold.', 'يستخدم حد النشاط المجمد.'), option('strict-1_2', 'Stricter: 1.2×', 'أشد صرامة: 1.2 مرة', 'Requires stronger activity versus history.', 'يتطلب نشاطاً أقوى مقارنة بالتاريخ.')],
    },
    {
      id: 'policy-top-n', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'topN', teamOptionId: 'team-20',
      prompt: { en: 'How many top-ranked active names may pass the cross-sectional screen?', ar: 'كم سهماً من الأعلى ترتيباً يمكن أن يجتاز الفرز المقطعي؟' },
      options: [option('focused-10', 'Focused: top 10', 'مركز: أعلى 10', 'Narrows eligibility to fewer leaders.', 'يضيق الأهلية إلى عدد أقل من القادة.'), option('team-20', 'Team rule: top 20', 'قاعدة الفريق: أعلى 20', 'Uses the frozen rank cutoff.', 'يستخدم حد الترتيب المجمد.'), option('broad-30', 'Broader: top 30', 'أوسع: أعلى 30', 'Admits more same-day peers.', 'يسمح بعدد أكبر من النظراء في اليوم نفسه.')],
    },
    {
      id: 'policy-min-price', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'minPrice', teamOptionId: 'team-5',
      prompt: { en: 'What minimum opening-range close should pass the price gate?', ar: 'ما الحد الأدنى لإغلاق نطاق الافتتاح لاجتياز بوابة السعر؟' },
      options: [option('broad-3', 'Broader: $3', 'أوسع: 3 دولارات', 'Admits lower-priced names from the frozen universe.', 'يسمح بأسهم أقل سعراً من الكون المجمد.'), option('team-5', 'Team rule: $5', 'قاعدة الفريق: 5 دولارات', 'Uses the frozen minimum-price gate.', 'يستخدم الحد الأدنى المجمد للسعر.'), option('strict-10', 'Stricter: $10', 'أشد صرامة: 10 دولارات', 'Requires a higher opening-range close.', 'يتطلب إغلاقاً أعلى لنطاق الافتتاح.')],
    },
    {
      id: 'policy-prior-close', role: 'POLICY_DECISION', area: 'RISK', policyKey: 'requireAbovePriorClose', teamOptionId: 'team-required',
      prompt: { en: 'Must the opening-range close exceed the prior daily close?', ar: 'هل يجب أن يتجاوز إغلاق نطاق الافتتاح إغلاق اليوم السابق؟' },
      options: [option('allow-below', 'No: allow below-prior-close setups', 'لا: السماح بإشارات دون إغلاق اليوم السابق', 'Removes one frozen strength confirmation.', 'يزيل أحد تأكيدات القوة المجمدة.'), option('team-required', 'Team rule: yes', 'قاعدة الفريق: نعم', 'Keeps the prior-close strength gate.', 'يبقي بوابة القوة مقارنة بإغلاق اليوم السابق.')],
    },
    {
      id: 'policy-exit', role: 'POLICY_DECISION', area: 'EXIT', policyKey: 'forceExitMinute', teamOptionId: 'team-955',
      prompt: { en: 'When should the intraday book force positions flat?', ar: 'متى ينبغي للسلة اللحظية إغلاق المراكز إلزامياً؟' },
      options: [option('early-930', 'Earlier: 15:30 ET', 'أبكر: 15:30 بتوقيت نيويورك', 'Reduces late-session exposure.', 'يخفض التعرض في أواخر الجلسة.'), option('team-955', 'Team rule: 15:55 ET', 'قاعدة الفريق: 15:55 بتوقيت نيويورك', 'Uses the frozen end-of-day cutoff.', 'يستخدم حد نهاية اليوم المجمد.'), option('late-959', 'Later: 15:59 ET', 'أقرب للإغلاق: 15:59 بتوقيت نيويورك', 'Keeps exposure nearer the closing auction.', 'يبقي التعرض أقرب إلى مزاد الإغلاق.')],
    },
    {
      id: 'know-hard-vetoes', role: 'KNOWLEDGE_CHECK', area: 'RISK',
      prompt: { en: 'Can an active breakout override the REJECTED status, Sharia block, or risk envelope?', ar: 'هل يمكن لاختراق نشط تجاوز حالة الرفض أو المنع الشرعي أو ضوابط المخاطر؟' },
      options: [option('no', 'No. All remain binding', 'لا. تبقى جميعها ملزمة', 'Correct: this lesson is research-only and cannot relax external gates.', 'صحيح: هذا الدرس للبحث فقط ولا يخفف البوابات الخارجية.'), option('yes', 'Yes, when relative volume is high', 'نعم، عندما يكون الحجم النسبي مرتفعاً', 'Activity never grants a veto bypass.', 'لا يمنح النشاط حق تجاوز المنع.')],
      correctOptionId: 'no', explanation: { en: 'The short replay teaches mechanics; it neither promotes the team nor changes compliance, fills, or risk caps.', ar: 'تشرح الإعادة القصيرة الآلية ولا تعتمد الفريق ولا تغير الضوابط الشرعية أو التنفيذ أو حدود المخاطر.' },
    },
  ] satisfies readonly StrategyLearningQuestion[],
});

export function compileStocksInPlayOrbPolicy(input: readonly StrategyLearningAnswer[]) {
  return compileBoundedLearningPolicy({
    answers: input, curriculum: STOCKS_IN_PLAY_ORB_CURRICULUM, defaultParams: STOCKS_IN_PLAY_ORB_V1,
    choices: {
      rvThreshold: { 'flex-0_8': 0.8, 'team-1_0': 1, 'strict-1_2': 1.2 },
      topN: { 'focused-10': 10, 'team-20': 20, 'broad-30': 30 },
      minPrice: { 'broad-3': 3, 'team-5': 5, 'strict-10': 10 },
      requireAbovePriorClose: { 'allow-below': false, 'team-required': true },
      forceExitMinute: { 'early-930': 930, 'team-955': 955, 'late-959': 959 },
    },
    parseParams: candidate => StocksInPlayOrbParamsSchema.parse(candidate),
  });
}
