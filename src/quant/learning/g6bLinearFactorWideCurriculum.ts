import {
  G6B_LINEAR_FACTOR_WIDE_V2,
  G6bLinearFactorWideParamsSchema,
} from '../strategies/g6bLinearFactorWide';
import type { StrategyLearningAnswer, StrategyLearningOption, StrategyLearningQuestion } from './bollingerMrLongV2Curriculum';
import { compileBoundedLearningPolicy } from './compileBoundedLearningPolicy';

const option = (
  id: string,
  en: string,
  ar: string,
  feedbackEn: string,
  feedbackAr: string,
): StrategyLearningOption => ({ id, label: { en, ar }, feedback: { en: feedbackEn, ar: feedbackAr } });

export const G6B_LINEAR_FACTOR_WIDE_CURRICULUM = Object.freeze({
  setupId: 'g6b-linear-factor-wide' as const,
  setupVersion: 'v2' as const,
  questionSetVersion: 'g6b-linear-factor-wide.questions.v1' as const,
  policyVersion: 'g6b-linear-factor-wide.policy.v1' as const,
  complianceTag: 'EDUCATIONAL_ONLY' as const,
  title: {
    en: 'Ranking a wide research universe without mistaking breadth for approval',
    ar: 'ترتيب نطاق بحثي واسع دون الخلط بين الاتساع والاعتماد',
  },
  questions: [
    {
      id: 'know-factor', role: 'KNOWLEDGE_CHECK', area: 'ENTRY',
      prompt: { en: 'What two ranks form this team’s linear score?', ar: 'ما الترتيبان اللذان يشكلان الدرجة الخطية لهذا الفريق؟' },
      options: [
        option('momentum-dollar-volume', '12−1 month momentum and a 21-session dollar-volume proxy', 'زخم 12 ناقص شهر ومؤشر بديل لحجم التداول بالقيمة خلال 21 جلسة', 'Correct: the second input is explicitly a proxy, not true turnover.', 'صحيح: المدخل الثاني مؤشر بديل معلن وليس معدل دوران فعلياً.'),
        option('earnings-news', 'Earnings forecasts and news sentiment', 'توقعات الأرباح ومعنويات الأخبار', 'Those inputs are not in this deterministic setup.', 'هذه المدخلات ليست ضمن الاستراتيجية الحتمية.'),
        option('future-returns', 'Future returns and future liquidity', 'العوائد والسيولة المستقبلية', 'Future observations are prohibited.', 'المشاهدات المستقبلية محظورة.'),
      ],
      correctOptionId: 'momentum-dollar-volume',
      explanation: {
        en: 'At each observed month-end, the setup combines cross-sectional momentum and dollar-volume-proxy ranks, then selects at most 50 names.',
        ar: 'عند كل نهاية شهر مرصودة، تجمع الاستراتيجية ترتيب الزخم مع ترتيب مؤشر حجم التداول بالقيمة، ثم تختار 50 اسماً كحد أقصى.',
      },
    },
    {
      id: 'policy-lookback', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'momentumLookback', teamOptionId: 'team-252',
      prompt: { en: 'How many sessions should the momentum window span?', ar: 'كم جلسة ينبغي أن تشملها نافذة الزخم؟' },
      options: [
        option('short-231', 'Shorter: 231 sessions', 'أقصر: 231 جلسة', 'Uses less price history.', 'يستخدم تاريخاً سعرياً أقصر.'),
        option('team-252', 'Team rule: 252 sessions', 'قاعدة الفريق: 252 جلسة', 'Uses the frozen annual window.', 'يستخدم النافذة السنوية المجمدة.'),
        option('long-273', 'Longer: 273 sessions', 'أطول: 273 جلسة', 'Uses more price history.', 'يستخدم تاريخاً سعرياً أطول.'),
      ],
    },
    {
      id: 'policy-skip', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'skipRecentBars', teamOptionId: 'team-21',
      prompt: { en: 'How many recent sessions should momentum skip?', ar: 'كم جلسة حديثة ينبغي أن يتجاهلها حساب الزخم؟' },
      options: [
        option('near-10', 'Nearer: 10 sessions', 'أقرب: 10 جلسات', 'Includes more recent price action.', 'يشمل حركة سعرية أحدث.'),
        option('team-21', 'Team rule: 21 sessions', 'قاعدة الفريق: 21 جلسة', 'Uses the frozen one-month skip.', 'يستخدم فترة التجاوز المجمدة لشهر واحد.'),
        option('far-42', 'Farther: 42 sessions', 'أبعد: 42 جلسة', 'Excludes two recent trading months.', 'يستبعد شهري تداول حديثين.'),
      ],
    },
    {
      id: 'policy-turnover', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'turnoverProxyLookback', teamOptionId: 'team-21',
      prompt: { en: 'How many sessions should feed the dollar-volume proxy?', ar: 'كم جلسة ينبغي أن تدخل في مؤشر حجم التداول بالقيمة؟' },
      options: [
        option('short-15', 'Shorter: 15 sessions', 'أقصر: 15 جلسة', 'Makes the proxy more responsive.', 'يجعل المؤشر أكثر استجابة.'),
        option('team-21', 'Team rule: 21 sessions', 'قاعدة الفريق: 21 جلسة', 'Uses the frozen proxy window.', 'يستخدم نافذة المؤشر المجمدة.'),
        option('long-30', 'Longer: 30 sessions', 'أطول: 30 جلسة', 'Smooths the proxy over more sessions.', 'ينعّم المؤشر عبر جلسات أكثر.'),
      ],
    },
    {
      id: 'policy-weight', role: 'POLICY_DECISION', area: 'ENTRY', policyKey: 'momentumWeight', teamOptionId: 'team-50',
      prompt: { en: 'How much of the linear score should momentum receive?', ar: 'ما الوزن الذي ينبغي منحه للزخم في الدرجة الخطية؟' },
      options: [
        option('liquidity-40', '40% momentum / 60% proxy', '40٪ زخم / 60٪ مؤشر بديل', 'Tilts the score toward the liquidity proxy.', 'يميل بالدرجة نحو مؤشر السيولة البديل.'),
        option('team-50', 'Team rule: 50% / 50%', 'قاعدة الفريق: 50٪ / 50٪', 'Uses the frozen equal weighting.', 'يستخدم الوزن المتساوي المجمد.'),
        option('momentum-60', '60% momentum / 40% proxy', '60٪ زخم / 40٪ مؤشر بديل', 'Tilts the score toward momentum.', 'يميل بالدرجة نحو الزخم.'),
      ],
    },
    {
      id: 'know-breadth', role: 'KNOWLEDGE_CHECK', area: 'RISK',
      prompt: { en: 'What happens if fewer than 100 names are rankable at a month-end?', ar: 'ماذا يحدث إذا كان عدد الأسماء القابلة للترتيب أقل من 100 عند نهاية الشهر؟' },
      options: [
        option('cash', 'The setup holds cash instead of weakening the breadth floor', 'تحتفظ الاستراتيجية بالنقد بدلاً من تخفيف حد الاتساع', 'Correct: the breadth floor is a hard deterministic rule.', 'صحيح: حد الاتساع قاعدة حتمية صارمة.'),
        option('rank-anyway', 'It ranks whatever is available', 'ترتب كل ما هو متاح', 'That would silently change the reviewed setup.', 'سيغير ذلك الاستراتيجية المراجعة بصمت.'),
      ],
      correctOptionId: 'cash',
      explanation: {
        en: 'The 100-name breadth floor, top decile, 50-position cap, and shared risk envelope remain fixed outside learner control.',
        ar: 'يبقى حد الاتساع البالغ 100 اسم وأعلى عُشر وحد 50 مركزاً وضوابط المخاطر المشتركة ثابتة خارج تحكم المتعلم.',
      },
    },
    {
      id: 'know-vetoes', role: 'KNOWLEDGE_CHECK', area: 'RISK',
      prompt: { en: 'Can a strong short-window rank override the REJECTED verdict, Sharia block, or terminal evidence?', ar: 'هل يمكن لترتيب قوي في نافذة قصيرة تجاوز حكم الرفض أو المنع الشرعي أو الدليل النهائي؟' },
      options: [
        option('no', 'No. This replay cannot promote or retune the team', 'لا. لا يمكن لهذه الإعادة اعتماد الفريق أو إعادة ضبطه', 'Correct: it is educational mechanics only.', 'صحيح: الغرض تعليمي لشرح الآلية فقط.'),
        option('yes', 'Yes, if the short return is positive', 'نعم، إذا كان العائد القصير موجباً', 'A short replay never replaces sealed terminal evidence.', 'لا تحل الإعادة القصيرة محل الدليل النهائي المختوم.'),
      ],
      correctOptionId: 'no',
      explanation: {
        en: 'The team stays REJECTED, research-only, AAOIFI-unscreened, and execution-blocked; DR-14 forbids running the terminal period here.',
        ar: 'يبقى الفريق مرفوضاً ومخصصاً للبحث وغير مفحوص وفق أيوفي ومحظور التنفيذ؛ ويحظر DR-14 تشغيل الفترة النهائية هنا.',
      },
    },
  ] satisfies readonly StrategyLearningQuestion[],
});

export function compileG6bLinearFactorWidePolicy(input: readonly StrategyLearningAnswer[]) {
  return compileBoundedLearningPolicy({
    answers: input,
    curriculum: G6B_LINEAR_FACTOR_WIDE_CURRICULUM,
    defaultParams: G6B_LINEAR_FACTOR_WIDE_V2,
    choices: {
      momentumLookback: { 'short-231': 231, 'team-252': 252, 'long-273': 273 },
      skipRecentBars: { 'near-10': 10, 'team-21': 21, 'far-42': 42 },
      turnoverProxyLookback: { 'short-15': 15, 'team-21': 21, 'long-30': 30 },
      momentumWeight: { 'liquidity-40': 0.4, 'team-50': 0.5, 'momentum-60': 0.6 },
    },
    parseParams: candidate => G6bLinearFactorWideParamsSchema.parse(candidate),
  });
}
