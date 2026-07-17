import type { Track } from '../schema';

/**
 * Rushd Academy — Advanced Financial Analysis track (DR-17, M12-B2, OQ-9).
 *
 * Public naming is a PLACEHOLDER pending OQ-9 (docs/SYSTEM_DESIGN.md §OQ-9):
 * describes the depth level ("CFA-candidate level") without ever implying
 * CFA Institute affiliation or endorsement. "CFA®" never appears without
 * counsel review. ADULTS only. Fixed-income, portfolio-theory, and
 * derivatives units connect valuation/risk language honestly to the app's
 * own reviewed metrics (drawdown-first framing, deflated Sharpe) and to
 * DR-14 strategy learning (`bollinger-mr-long-v2`, the lab's only reviewed
 * module).
 */

/** OQ-9 no-affiliation disclaimer — kept as one exported constant so the
 * colocated test can assert the exact text lives in the track content. */
export const CFA_NO_AFFILIATION_DISCLAIMER_EN =
  'This track is educational only and is not affiliated with, endorsed by, or sponsored by CFA Institute; "CFA-candidate level" describes depth of content, not a credential.';
export const CFA_NO_AFFILIATION_DISCLAIMER_AR =
  'هذا المسار تعليمي فقط وغير تابع لمعهد CFA أو معتمد أو برعاية منه؛ عبارة "بمستوى مرشح CFA" تصف عمق المحتوى فقط وليست شهادة معتمدة.';

export const ADVANCED_ANALYSIS_TRACK: Track = {
  id: 'advanced-analysis',
  title: {
    en: 'Advanced Financial Analysis (CFA-candidate level)',
    ar: 'التحليل المالي المتقدم (بمستوى مرشح CFA)',
  },
  minimumAgeSegment: 'ADULTS',
  units: [
    {
      id: 'fs-deep-dive',
      title: { en: 'Financial Statements Deep-Dive', ar: 'التعمق في القوائم المالية' },
      practiceLinks: [{ kind: 'quizTopic', topic: 'Value Investing' }],
      lessons: [
        {
          id: 'adv-u1-intro',
          title: { en: 'About This Track', ar: 'عن هذا المسار' },
          summary: {
            en: 'What CFA-candidate level means here, and what it does not mean.',
            ar: 'ماذا يعني مستوى مرشح CFA هنا، وماذا لا يعنيه.',
          },
          body: {
            en: `${CFA_NO_AFFILIATION_DISCLAIMER_EN} This track goes deeper than Foundations and Economics: financial statements, valuation models, fixed income, portfolio theory, and derivatives awareness, all still framed by Rushd's own Sharia stance (DR-5) — every non-compliant mechanic is taught openly and labeled, never hidden and never executed by the app.`,
            ar: `${CFA_NO_AFFILIATION_DISCLAIMER_AR} يذهب هذا المسار إلى ما هو أعمق من مساري الأساسيات والاقتصاد: القوائم المالية، ونماذج التقييم، والدخل الثابت، ونظرية المحفظة، والتوعية بالمشتقات المالية، كل ذلك ضمن موقف رُشد الشرعي الخاص (DR-5) — كل آلية غير متوافقة تُدرَّس علناً وتحمل علامة واضحة، ولا تُخفى أبداً ولا يُنفذها التطبيق أبداً.`,
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u1-intro-cp',
            question: {
              en: '"CFA-candidate level" in this track\'s title means:',
              ar: 'عبارة "بمستوى مرشح CFA" في عنوان هذا المسار تعني:',
            },
            options: [
              { en: 'A depth-of-content description, with no CFA Institute affiliation or endorsement', ar: 'وصف لعمق المحتوى، دون أي تبعية أو اعتماد من معهد CFA' },
              { en: 'Official certification from CFA Institute', ar: 'شهادة رسمية من معهد CFA' },
              { en: 'A guarantee of passing the CFA exams', ar: 'ضمان لاجتياز اختبارات CFA' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'The phrase describes content depth only; Rushd is not affiliated with, endorsed by, or sponsored by CFA Institute.',
              ar: 'العبارة تصف عمق المحتوى فقط؛ رُشد غير تابعة لمعهد CFA ولا معتمدة منه ولا برعايته.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'adv-u1-income-statement',
          title: { en: 'The Income Statement: Revenue to Net Income', ar: 'قائمة الدخل: من الإيرادات إلى صافي الدخل' },
          summary: {
            en: 'Reading the income statement top to bottom, and where earnings quality can hide.',
            ar: 'قراءة قائمة الدخل من الأعلى إلى الأسفل، وأين يمكن أن تختبئ جودة الأرباح.',
          },
          body: {
            en: 'The income statement walks from revenue down through cost of goods sold (gross profit), operating expenses (operating income/EBIT), interest and tax, to net income. Margins at each stage (gross, operating, net) tell you where profitability is built or eroded; one-off items and non-recurring gains can flatter net income in a single period without reflecting the durable earnings power analysts actually care about.',
            ar: 'تنتقل قائمة الدخل من الإيرادات مروراً بتكلفة البضاعة المباعة (مجمل الربح)، والمصروفات التشغيلية (الدخل التشغيلي)، والفائدة والضريبة، وصولاً إلى صافي الدخل. تخبرك الهوامش في كل مرحلة (الإجمالي، التشغيلي، الصافي) أين تُبنى الربحية أو أين تتآكل؛ والبنود الاستثنائية والأرباح غير المتكررة قد تُجمّل صافي الدخل في فترة واحدة دون أن تعكس قوة الأرباح المستدامة التي يهتم بها المحللون فعلياً.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u1-income-statement-cp',
            question: {
              en: 'A one-off, non-recurring gain in a single quarter is a concern for analysts mainly because it:',
              ar: 'الربح الاستثنائي وغير المتكرر في ربع واحد يثير قلق المحللين بشكل أساسي لأنه:',
            },
            options: [
              { en: 'May flatter net income without reflecting durable earnings power', ar: 'قد يُجمّل صافي الدخل دون أن يعكس قوة أرباح مستدامة' },
              { en: 'Is always illegal', ar: 'غير قانوني دائماً' },
              { en: 'Always increases the tax rate', ar: 'يرفع معدل الضريبة دائماً' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'One-off items can distort a single period\'s net income relative to a company\'s repeatable, durable earnings.',
              ar: 'يمكن للبنود الاستثنائية أن تشوّه صافي دخل فترة واحدة مقارنة بأرباح الشركة المتكررة والمستدامة.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'adv-u1-balance-sheet',
          title: { en: 'The Balance Sheet: Assets, Liabilities, Equity', ar: 'الميزانية العمومية: الأصول والخصوم وحقوق الملكية' },
          summary: {
            en: 'The accounting identity behind every balance sheet, and what leverage ratios reveal.',
            ar: 'المعادلة المحاسبية وراء كل ميزانية عمومية، وما تكشفه نسب الرافعة المالية.',
          },
          body: {
            en: 'The balance sheet is built on Assets = Liabilities + Equity at a single point in time. Analysts read it for liquidity (current ratio: current assets ÷ current liabilities) and leverage (debt-to-equity), because two companies with identical income statements can carry very different risk if one is funded mostly by debt and the other mostly by equity — leverage amplifies both gains and losses.',
            ar: 'تُبنى الميزانية العمومية على المعادلة: الأصول = الخصوم + حقوق الملكية في لحظة زمنية واحدة. يقرأها المحللون لتقييم السيولة (نسبة التداول: الأصول المتداولة ÷ الخصوم المتداولة) والرافعة المالية (نسبة الدين إلى حقوق الملكية)، لأن شركتين لهما قائمتا دخل متطابقتين قد تحملان مخاطر مختلفة تماماً إذا كانت إحداهما ممولة أساساً بالدين والأخرى بحقوق الملكية — فالرافعة المالية تضخّم الأرباح والخسائر معاً.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u1-balance-sheet-cp',
            question: {
              en: 'The balance sheet identity is:',
              ar: 'معادلة الميزانية العمومية هي:',
            },
            options: [
              { en: 'Assets = Liabilities + Equity', ar: 'الأصول = الخصوم + حقوق الملكية' },
              { en: 'Revenue = Expenses + Net Income', ar: 'الإيرادات = المصروفات + صافي الدخل' },
              { en: 'Assets = Revenue − Expenses', ar: 'الأصول = الإيرادات - المصروفات' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Assets = Liabilities + Equity is the fundamental accounting identity a balance sheet must always satisfy.',
              ar: 'الأصول = الخصوم + حقوق الملكية هي المعادلة المحاسبية الأساسية التي يجب أن تتحقق دائماً في الميزانية العمومية.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'adv-u1-cash-flow',
          title: { en: 'The Cash Flow Statement: Where the Cash Really Goes', ar: 'قائمة التدفقات النقدية: أين يذهب النقد فعلاً' },
          summary: {
            en: 'Why a profitable company can still run out of cash, and how the three sections separate.',
            ar: 'لماذا قد تنفد السيولة لدى شركة رابحة، وكيف تنفصل الأقسام الثلاثة.',
          },
          body: {
            en: 'The cash flow statement splits movements into operating, investing, and financing activities, reconciling net income (an accrual figure) back to actual cash. A company can report a profit yet burn cash if receivables balloon or inventory piles up; this is exactly why "profitable" and "solvent" are different claims, and why analysts check operating cash flow against reported net income before trusting either number alone.',
            ar: 'تُقسّم قائمة التدفقات النقدية الحركات إلى أنشطة تشغيلية واستثمارية وتمويلية، وتُسوّي صافي الدخل (وهو رقم استحقاقي) مقابل النقد الفعلي. يمكن لشركة أن تُعلن ربحاً وتظل تستنزف النقد إذا تضخمت الذمم المدينة أو تراكم المخزون؛ ولهذا بالضبط يختلف الادعاء بـ"الربحية" عن الادعاء بـ"الملاءة المالية"، ولهذا يتحقق المحللون من التدفق النقدي التشغيلي مقارنة بصافي الدخل المُعلن قبل الوثوق بأي رقم بمفرده.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u1-cash-flow-cp',
            question: {
              en: 'A company can report accounting profit while running low on cash mainly because:',
              ar: 'يمكن للشركة أن تُعلن ربحاً محاسبياً بينما تعاني من نقص في السيولة بشكل أساسي لأن:',
            },
            options: [
              { en: 'Net income is accrual-based and can diverge from actual cash movements', ar: 'صافي الدخل قائم على الاستحقاق ويمكن أن يتباعد عن الحركة الفعلية للنقد' },
              { en: 'Cash flow statements are optional', ar: 'قائمة التدفقات النقدية اختيارية' },
              { en: 'Profit and cash are always identical', ar: 'الربح والنقد متطابقان دائماً' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Accrual net income can diverge sharply from cash, e.g. when receivables or inventory tie up cash without showing up as an expense yet.',
              ar: 'يمكن لصافي الدخل الاستحقاقي أن يتباعد بشدة عن النقد، كأن تحتجز الذمم المدينة أو المخزون النقد دون أن تظهر كمصروف بعد.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },
    {
      id: 'valuation',
      title: { en: 'Valuation: DCF, Multiples & EPS Growth', ar: 'التقييم: التدفقات النقدية المخصومة والمضاعفات ونمو ربحية السهم' },
      practiceLinks: [{ kind: 'quizTopic', topic: 'Value Investing' }],
      lessons: [
        {
          id: 'adv-u2-dcf',
          title: { en: 'Discounted Cash Flow (DCF): Modeling Intrinsic Value', ar: 'التدفقات النقدية المخصومة: نمذجة القيمة الجوهرية' },
          summary: {
            en: 'How a DCF discounts projected future cash flows to today, and why every output is assumption-dependent.',
            ar: 'كيف يخصم نموذج DCF التدفقات النقدية المستقبلية المتوقعة إلى قيمتها الحالية، ولماذا كل ناتج يعتمد على الافتراضات.',
          },
          body: {
            en: 'A DCF projects a company\'s future free cash flows, discounts them to present value using a required rate of return (often a weighted-average cost of capital), and sums them (plus a terminal value) to estimate intrinsic value per share. Small changes in the growth-rate or discount-rate assumption can swing the output by a large margin — a DCF is a model output, not advice, and is only as good as the assumptions a learner can see and question.',
            ar: 'يُسقط نموذج DCF التدفقات النقدية الحرة المستقبلية للشركة، ويخصمها إلى قيمتها الحالية باستخدام معدل عائد مطلوب (غالباً متوسط تكلفة رأس المال المرجح)، ويجمعها (مضافاً إليها قيمة نهائية) لتقدير القيمة الجوهرية للسهم. يمكن لتغيّرات صغيرة في افتراض معدل النمو أو معدل الخصم أن تُحدث فارقاً كبيراً في الناتج — فنموذج DCF هو ناتج نموذج وليس نصيحة استثمارية، وجودته تعتمد كلياً على الافتراضات التي يمكن للمتعلم رؤيتها والتشكيك فيها.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u2-dcf-cp',
            question: {
              en: 'A DCF valuation output is best understood as:',
              ar: 'يُفهم ناتج تقييم DCF على أنه:',
            },
            options: [
              { en: 'A model output highly sensitive to its growth and discount-rate assumptions — not advice', ar: 'ناتج نموذج حساس للغاية لافتراضات النمو ومعدل الخصم - وليس نصيحة استثمارية' },
              { en: 'A guaranteed future stock price', ar: 'سعر سهم مستقبلي مضمون' },
              { en: 'A regulatory requirement for all listed firms', ar: 'متطلب تنظيمي لجميع الشركات المدرجة' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'DCF outputs swing widely with small assumption changes, which is why they are treated as model outputs, never as guarantees or advice.',
              ar: 'تتغير نواتج DCF بشكل كبير مع تغيرات صغيرة في الافتراضات، ولهذا تُعامل كنواتج نموذج، لا كضمانات أو نصائح استثمارية.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'adv-u2-multiples',
          title: { en: 'Valuation Multiples: P/E, P/B, EV/EBITDA', ar: 'مضاعفات التقييم: السعر إلى الربحية، السعر إلى القيمة الدفترية، القيمة المشروع إلى EBITDA' },
          summary: {
            en: 'Comparing companies quickly with ratios, and why multiples only mean something next to peers.',
            ar: 'مقارنة الشركات بسرعة باستخدام النسب، ولماذا لا تعني المضاعفات شيئاً إلا بجانب نظرائها.',
          },
          body: {
            en: 'Multiples compare a price (or enterprise value) to a fundamental — P/E to earnings, P/B to book equity, EV/EBITDA to operating cash generation before capital structure. A multiple is meaningless alone: "P/E of 20" only becomes informative next to a sector average, a historical range, or a growth-adjusted peer. Multiples are a relative, educational lens — they compress a valuation model\'s assumptions into one number, they do not eliminate the need for assumptions.',
            ar: 'تقارن المضاعفات السعر (أو قيمة المشروع) بمؤشر أساسي — السعر إلى الربحية (P/E) مقارنة بالأرباح، والسعر إلى القيمة الدفترية (P/B) مقارنة بحقوق الملكية الدفترية، والقيمة المشروع إلى EBITDA (EV/EBITDA) مقارنة بتوليد النقد التشغيلي قبل هيكل رأس المال. لا معنى للمضاعف بمفرده: فـ"مضاعف ربحية 20" لا يصبح ذا دلالة إلا بجانب متوسط القطاع، أو نطاق تاريخي، أو نظير مُعدَّل بحسب النمو. المضاعفات عدسة نسبية وتعليمية — تختصر افتراضات نموذج التقييم في رقم واحد، ولا تُلغي الحاجة إلى تلك الافتراضات.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u2-multiples-cp',
            question: {
              en: 'A P/E of 20 is best interpreted:',
              ar: 'أفضل تفسير لمضاعف ربحية (P/E) قدره 20 هو:',
            },
            options: [
              { en: 'Relative to a sector average, historical range, or growth-adjusted peer', ar: 'نسبياً مقارنة بمتوسط القطاع، أو نطاق تاريخي، أو نظير مُعدَّل بحسب النمو' },
              { en: 'As an absolute, universal signal on its own', ar: 'كإشارة مطلقة وعالمية بمفردها' },
              { en: 'As a guarantee of future returns', ar: 'كضمان للعوائد المستقبلية' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Multiples only carry meaning in a relative, comparative context — never in isolation.',
              ar: 'لا تحمل المضاعفات معنى إلا في سياق نسبي ومقارن — لا بمعزل عن غيرها أبداً.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'adv-u2-eps-growth',
          title: { en: 'EPS Growth and Earnings Quality', ar: 'نمو ربحية السهم وجودة الأرباح' },
          summary: {
            en: 'Why EPS can grow from buybacks alone, and how to check whether growth is "real."',
            ar: 'لماذا يمكن أن تنمو ربحية السهم من عمليات إعادة الشراء وحدها، وكيف تتحقق مما إذا كان النمو "حقيقياً".',
          },
          body: {
            en: 'Earnings per share (EPS) growth can come from genuinely higher net income OR simply from a shrinking share count via buybacks — the same net income divided by fewer shares raises EPS with zero operating improvement. Earnings quality checks (comparing EPS growth to revenue growth, and net income to operating cash flow) separate durable improvement from financial engineering; this is analysis, not investment advice, and past growth never guarantees future growth.',
            ar: 'يمكن أن ينبع نمو ربحية السهم (EPS) من ارتفاع حقيقي في صافي الدخل، أو ببساطة من انكماش عدد الأسهم عبر عمليات إعادة الشراء — إذ يرفع نفس صافي الدخل مقسوماً على أسهم أقل ربحية السهم دون أي تحسن تشغيلي فعلي. تفصل فحوصات جودة الأرباح (مقارنة نمو ربحية السهم بنمو الإيرادات، وصافي الدخل بالتدفق النقدي التشغيلي) بين التحسن المستدام والهندسة المالية؛ وهذا تحليل، لا نصيحة استثمارية، والنمو الماضي لا يضمن أبداً نمواً مستقبلياً.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u2-eps-growth-cp',
            question: {
              en: 'EPS growth driven mainly by share buybacks, with flat net income, indicates:',
              ar: 'نمو ربحية السهم المدفوع أساساً بعمليات إعادة الشراء، مع ثبات صافي الدخل، يشير إلى:',
            },
            options: [
              { en: 'A shrinking share count rather than genuine operating improvement', ar: 'انكماش في عدد الأسهم أكثر من تحسن تشغيلي حقيقي' },
              { en: 'Guaranteed future revenue growth', ar: 'نمو مضمون في الإيرادات المستقبلية' },
              { en: 'An accounting error', ar: 'خطأ محاسبي' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'The same net income divided by fewer shares raises EPS without any real operating improvement, which is why earnings quality checks matter.',
              ar: 'نفس صافي الدخل مقسوماً على أسهم أقل يرفع ربحية السهم دون أي تحسن تشغيلي حقيقي، ولهذا تُهم فحوصات جودة الأرباح.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },
    {
      id: 'fixed-income-sukuk',
      title: { en: 'Fixed Income & Sukuk', ar: 'الدخل الثابت والصكوك' },
      practiceLinks: [{ kind: 'quizTopic', topic: 'Sharia Compliance' }],
      lessons: [
        {
          id: 'adv-u3-bond-mechanics',
          title: { en: 'Conventional Bond Mechanics (Coupons & Yield)', ar: 'آلية السندات التقليدية (الكوبونات والعائد)' },
          summary: {
            en: 'How a conventional bond pays fixed interest coupons — taught openly, tagged HARAM, never traded by the app.',
            ar: 'كيف تدفع السندات التقليدية كوبونات فائدة ثابتة — تُدرَّس علناً، وتحمل علامة "حرام"، ولا يتداولها التطبيق أبداً.',
          },
          body: {
            en: 'A conventional bond is a loan: the issuer promises fixed periodic interest (coupon) payments and repayment of principal (face value) at maturity. Yield to maturity is the internal rate of return an investor earns holding the bond to maturity, given its price, coupon, and time to maturity. This coupon-interest structure is riba, which is why conventional bonds are HARAM in this curriculum — this lesson exists solely so you can recognize the mechanics in the news and in products, not to recommend buying them.',
            ar: 'السند التقليدي هو قرض: يَعِد المُصدِر بدفعات فائدة دورية ثابتة (كوبون) وسداد أصل المبلغ (القيمة الاسمية) عند تاريخ الاستحقاق. العائد حتى الاستحقاق هو معدل العائد الداخلي الذي يحققه المستثمر إذا احتفظ بالسند حتى استحقاقه، بناءً على سعره وكوبونه ومدته المتبقية. هذا الهيكل القائم على فائدة الكوبون هو ربا، ولهذا تحمل السندات التقليدية علامة "حرام" في هذا المنهج — وهذا الدرس موجود فقط لتتمكن من التعرف على هذه الآلية في الأخبار والمنتجات، لا للتوصية بشرائها.',
          },
          complianceTag: 'HARAM',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u3-bond-mechanics-cp',
            question: {
              en: 'A conventional bond\'s coupon payment structure is classified in this curriculum as:',
              ar: 'يُصنَّف هيكل دفع كوبون السند التقليدي في هذا المنهج على أنه:',
            },
            options: [
              { en: 'HARAM (interest-based, riba)', ar: 'حرام (قائم على الفائدة، ربا)' },
              { en: 'HALAL with no conditions', ar: 'حلال دون أي شروط' },
              { en: 'Not a financial instrument', ar: 'ليس أداة مالية' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Fixed periodic interest payments are riba, which is why conventional bonds are tagged HARAM even though the mechanics are still taught.',
              ar: 'الدفعات الدورية الثابتة للفائدة هي ربا، ولهذا تحمل السندات التقليدية علامة "حرام" رغم أن آليتها لا تزال تُدرَّس.',
            },
            complianceTag: 'HARAM',
          },
        },
        {
          id: 'adv-u3-bond-pricing',
          title: { en: 'Bond Pricing and Interest-Rate Risk', ar: 'تسعير السندات ومخاطر أسعار الفائدة' },
          summary: {
            en: 'Why bond prices fall when rates rise, and what duration measures.',
            ar: 'لماذا تنخفض أسعار السندات عندما ترتفع أسعار الفائدة، وماذا تقيس المدة (Duration).',
          },
          body: {
            en: 'Bond prices and interest rates move inversely: when market rates rise, existing bonds with lower fixed coupons become less attractive, so their prices fall to bring their yield in line with the new market rate. Duration approximates a bond\'s price sensitivity to rate changes — a longer-duration bond swings more for the same rate move. This is standard interest-rate-risk mechanics, taught openly and tagged HARAM/EDUCATIONAL_ONLY because the underlying instrument is interest-based.',
            ar: 'تتحرك أسعار السندات وأسعار الفائدة في اتجاهين متعاكسين: فعندما ترتفع أسعار الفائدة في السوق، تصبح السندات القائمة ذات الكوبونات الثابتة المنخفضة أقل جاذبية، فتنخفض أسعارها ليتماشى عائدها مع سعر السوق الجديد. تقيس "المدة" (Duration) تقريبياً حساسية سعر السند لتغيرات أسعار الفائدة — فالسند ذو المدة الأطول يتحرك أكثر عند نفس تغيّر السعر. هذه آلية قياسية لمخاطر أسعار الفائدة، تُدرَّس علناً وتحمل علامة "حرام/تعليمي فقط" لأن الأداة الأساسية قائمة على الفائدة.',
          },
          complianceTag: 'HARAM',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u3-bond-pricing-cp',
            question: {
              en: 'When market interest rates rise, prices of existing fixed-coupon bonds typically:',
              ar: 'عندما ترتفع أسعار الفائدة في السوق، تتجه أسعار السندات القائمة ذات الكوبون الثابت إلى:',
            },
            options: [
              { en: 'Fall', ar: 'الانخفاض' },
              { en: 'Rise', ar: 'الارتفاع' },
              { en: 'Stay exactly the same', ar: 'البقاء كما هي تماماً' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Bond prices and rates move inversely: existing lower-coupon bonds must reprice lower to match new, higher market yields.',
              ar: 'تتحرك أسعار السندات وأسعار الفائدة في اتجاهين متعاكسين: يجب أن يُعاد تسعير السندات ذات الكوبون الأقل نزولاً لتتماشى مع عوائد السوق الجديدة الأعلى.',
            },
            complianceTag: 'HARAM',
          },
        },
        {
          id: 'adv-u3-sukuk',
          title: { en: 'Sukuk: The Sharia-Compliant Alternative', ar: 'الصكوك: البديل المتوافق مع الشريعة' },
          summary: {
            en: 'How sukuk achieve fixed-income-like returns through asset ownership instead of a debt-interest promise.',
            ar: 'كيف تحقق الصكوك عوائد شبيهة بالدخل الثابت عبر ملكية الأصول بدلاً من وعد دين بفائدة.',
          },
          body: {
            en: 'Sukuk are certificates representing an undivided ownership share in a tangible asset, project, or business venture, structured (per AAOIFI standards) so returns come from that asset\'s actual profit or rental income, not from a promised interest rate on a debt. This asset-backing is the key sharia distinction from conventional bonds: sukuk holders share real economic risk in the underlying asset rather than merely lending money for a fixed return.',
            ar: 'الصكوك شهادات تمثل حصة ملكية غير مجزّأة في أصل ملموس أو مشروع أو نشاط تجاري، وتُهيكل (وفق معايير AAOIFI) بحيث تأتي العوائد من ربح ذلك الأصل الفعلي أو دخله الإيجاري، لا من سعر فائدة موعود على دين. هذا الارتباط بالأصل هو الفارق الشرعي الجوهري عن السندات التقليدية: فحملة الصكوك يتقاسمون مخاطر اقتصادية حقيقية في الأصل الأساسي بدلاً من مجرد إقراض المال مقابل عائد ثابت.',
          },
          complianceTag: 'HALAL',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u3-sukuk-cp',
            question: {
              en: 'What primarily distinguishes sukuk from conventional bonds, in Sharia terms?',
              ar: 'ما الذي يميز الصكوك أساساً عن السندات التقليدية من الناحية الشرعية؟',
            },
            options: [
              { en: 'Sukuk represent ownership in a real asset, with returns from its actual profit or rent', ar: 'تمثل الصكوك ملكية في أصل حقيقي، وتأتي عوائدها من ربحه أو إيجاره الفعلي' },
              { en: 'Sukuk pay a higher fixed interest rate', ar: 'تدفع الصكوك سعر فائدة ثابت أعلى' },
              { en: 'There is no meaningful difference', ar: 'لا يوجد فرق جوهري' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Sukuk are asset-backed ownership certificates whose returns come from real profit/rent, not a promised interest rate on debt.',
              ar: 'الصكوك شهادات ملكية مدعومة بأصول، وتأتي عوائدها من ربح أو إيجار حقيقي، لا من سعر فائدة موعود على دين.',
            },
            complianceTag: 'HALAL',
          },
        },
      ],
    },
    {
      id: 'portfolio-theory-risk',
      title: { en: 'Portfolio Theory & Risk', ar: 'نظرية المحفظة والمخاطر' },
      practiceLinks: [
        { kind: 'quizTopic', topic: 'Risk Management' },
        { kind: 'strategySetup', setupId: 'bollinger-mr-long-v2' },
      ],
      lessons: [
        {
          id: 'adv-u4-diversification',
          title: { en: 'Diversification and Correlation', ar: 'التنويع والارتباط' },
          summary: {
            en: 'Why combining imperfectly correlated assets reduces portfolio risk without needing to predict returns.',
            ar: 'لماذا يقلل الجمع بين أصول غير مرتبطة ارتباطاً تاماً من مخاطر المحفظة دون الحاجة إلى التنبؤ بالعوائد.',
          },
          body: {
            en: 'Diversification reduces portfolio-level risk by combining assets whose returns are not perfectly correlated — when one position falls, another may hold steady or rise, smoothing the combined path. This benefit comes purely from correlation structure, not from any skill at picking winners; it is one of the few genuinely "free" risk reductions in finance, and it is the foundation this unit builds on before discussing any specific risk metric.',
            ar: 'يقلل التنويع من مخاطر المحفظة على مستوى الإجمالي بالجمع بين أصول لا ترتبط عوائدها ارتباطاً تاماً — فعندما ينخفض مركز ما، قد يبقى آخر مستقراً أو يرتفع، مما يُلطّف المسار المُجمّع. تأتي هذه الفائدة فقط من بنية الارتباط، لا من أي مهارة في اختيار الفائزين؛ وهي واحدة من قلة نادرة من تخفيضات المخاطر "المجانية" الحقيقية في التمويل، وهي الأساس الذي تُبنى عليه هذه الوحدة قبل مناقشة أي مقياس مخاطر محدد.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u4-diversification-cp',
            question: {
              en: 'Diversification reduces portfolio risk primarily because of:',
              ar: 'يقلل التنويع من مخاطر المحفظة بشكل أساسي بسبب:',
            },
            options: [
              { en: 'Imperfect correlation between combined assets', ar: 'الارتباط غير التام بين الأصول المُجمّعة' },
              { en: 'Superior stock-picking skill', ar: 'مهارة متفوقة في اختيار الأسهم' },
              { en: 'Higher trading fees', ar: 'رسوم تداول أعلى' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'The risk-reduction benefit of diversification comes from correlation structure, not from predictive skill.',
              ar: 'فائدة تقليل المخاطر من التنويع تأتي من بنية الارتباط، لا من مهارة تنبؤية.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'adv-u4-drawdown-first',
          title: { en: 'Why Rushd Teaches Drawdown Before CAGR', ar: 'لماذا تُدرّس رُشد التراجع قبل معدل النمو السنوي المركب' },
          summary: {
            en: 'Loss-avoidance framing: understanding maximum drawdown before chasing headline returns.',
            ar: 'إطار تجنّب الخسارة: فهم أقصى تراجع قبل ملاحقة العوائد البارزة.',
          },
          body: {
            en: 'Maximum drawdown is the largest peak-to-trough decline a strategy or portfolio experienced — it answers "how bad could it get," which matters more to most learners than a headline compound annual growth rate (CAGR), because a large drawdown can force an investor out of a position at the worst time regardless of an attractive long-run average. Rushd\'s own strategy-lab reports (Monte Carlo drawdown distributions) lead with this loss-avoidance metric before showing any return figure, and this lesson follows the same order deliberately.',
            ar: 'أقصى تراجع هو أكبر انخفاض من قمة إلى قاع مرّت به استراتيجية أو محفظة — يجيب عن سؤال "كم يمكن أن يسوء الأمر"، وهو أمر يهم معظم المتعلمين أكثر من معدل النمو السنوي المركب (CAGR) البارز، لأن تراجعاً كبيراً قد يُجبر المستثمر على الخروج من مركزه في أسوأ توقيت بغض النظر عن متوسط جذاب على المدى الطويل. تصدّر تقارير مختبر الاستراتيجيات في رُشد (توزيعات التراجع بمحاكاة مونت كارلو) هذا المقياس القائم على تجنّب الخسارة قبل عرض أي رقم عائد، ويتبع هذا الدرس نفس الترتيب عن قصد.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u4-drawdown-first-cp',
            question: {
              en: 'Maximum drawdown measures:',
              ar: 'يقيس أقصى تراجع:',
            },
            options: [
              { en: 'The largest peak-to-trough decline experienced', ar: 'أكبر انخفاض من قمة إلى قاع تمت مواجهته' },
              { en: 'The average annual return', ar: 'متوسط العائد السنوي' },
              { en: 'The number of trades executed', ar: 'عدد الصفقات المنفذة' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Drawdown is a loss-avoidance metric — the worst peak-to-trough decline — distinct from any average-return figure like CAGR.',
              ar: 'التراجع مقياس لتجنّب الخسارة — أسوأ انخفاض من قمة إلى قاع — ويختلف عن أي رقم متوسط عائد مثل CAGR.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'adv-u4-sharpe-factor',
          title: { en: 'Sharpe Ratio, Deflated Sharpe, and Factor Investing', ar: 'نسبة شارب، وشارب المُخفَّض، والاستثمار العاملي' },
          summary: {
            en: 'Why a raw Sharpe ratio overstates skill, and how deflation and factor exposure correct the picture.',
            ar: 'لماذا تبالغ نسبة شارب الخام في تقدير المهارة، وكيف يصحح التخفيض والتعرض للعوامل الصورة.',
          },
          body: {
            en: 'The Sharpe ratio divides excess return by volatility, but a raw Sharpe ratio computed after testing many strategy variants overstates true skill — some variants look good purely by chance. A deflated Sharpe ratio corrects for this by accounting for the number of trials, track-record length, and return skew/kurtosis, giving a more honest read on whether an edge is real. Rushd\'s own strategy lab reports deflated Sharpe alongside raw metrics for exactly this reason, and factor investing (tilting toward value, momentum, or low-volatility exposures) is a related, testable way to seek a persistent edge rather than relying on one lucky backtest.',
            ar: 'تقسم نسبة شارب العائد الزائد على التقلب، لكن نسبة شارب الخام المحسوبة بعد اختبار العديد من متغيرات الاستراتيجية تبالغ في تقدير المهارة الحقيقية — فبعض المتغيرات تبدو جيدة بمحض الصدفة فقط. تصحح نسبة شارب المُخفَّضة هذا الأمر بأخذ عدد المحاولات وطول سجل الأداء والانحراف/التفلطح في الحسبان، لتعطي قراءة أكثر صدقاً حول ما إذا كانت الميزة حقيقية. يُبلغ مختبر الاستراتيجيات في رُشد عن شارب المُخفَّضة جنباً إلى جنب مع المقاييس الخام لهذا السبب بالضبط، ويُعد الاستثمار العاملي (الانحياز نحو القيمة أو الزخم أو انخفاض التقلب) طريقة ذات صلة وقابلة للاختبار للبحث عن ميزة مستدامة بدلاً من الاعتماد على اختبار خلفي محظوظ واحد.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u4-sharpe-factor-cp',
            question: {
              en: 'A deflated Sharpe ratio adjusts a raw Sharpe ratio mainly to account for:',
              ar: 'تعدّل نسبة شارب المُخفَّضة نسبة شارب الخام بشكل أساسي لمراعاة:',
            },
            options: [
              { en: 'The number of trials tested and track-record length (multiple-testing bias)', ar: 'عدد المحاولات المُختبرة وطول سجل الأداء (تحيز الاختبارات المتعددة)' },
              { en: 'The company\'s tax rate', ar: 'معدل ضريبة الشركة' },
              { en: 'The currency the strategy is denominated in', ar: 'العملة التي تُقاس بها الاستراتيجية' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Deflated Sharpe corrects for multiple-testing bias — the more variants tried, the more likely one looks good by chance alone.',
              ar: 'تصحح نسبة شارب المُخفَّضة تحيز الاختبارات المتعددة — فكلما زاد عدد المتغيرات المُختبرة، زاد احتمال أن يبدو أحدها جيداً بمحض الصدفة فقط.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },
    {
      id: 'derivatives-awareness',
      title: { en: 'Derivatives Awareness', ar: 'التوعية بالمشتقات المالية' },
      practiceLinks: [{ kind: 'quizTopic', topic: 'Risk Management' }],
      lessons: [
        {
          id: 'adv-u5-options',
          title: { en: 'Options Mechanics: Calls, Puts, and Why They Raise Sharia Concerns', ar: 'آلية الخيارات: خيارات الشراء والبيع ولماذا تثير مخاوف شرعية' },
          summary: {
            en: 'How call/put options work, and the gharar (excessive uncertainty) concern with conventional options.',
            ar: 'كيف تعمل خيارات الشراء والبيع، وإشكالية الغرر (عدم اليقين المفرط) في الخيارات التقليدية.',
          },
          body: {
            en: 'A call option gives the right (not obligation) to buy an underlying asset at a set strike price by a set date; a put option gives the right to sell. Conventional options are widely viewed as raising gharar (excessive uncertainty/speculation) concerns because the buyer pays a premium for a contingent right disconnected from any real asset exchange at inception, and much of their use is pure speculation rather than risk transfer tied to real ownership. This mechanics lesson is taught for recognition only — it is not encouragement to trade options.',
            ar: 'يمنح خيار الشراء الحق (لا الالتزام) في شراء أصل أساسي بسعر تنفيذ محدد بحلول تاريخ محدد؛ ويمنح خيار البيع الحق في البيع. يُنظر إلى الخيارات التقليدية على نطاق واسع على أنها تثير مخاوف الغرر (عدم اليقين المفرط/المضاربة) لأن المشتري يدفع علاوة مقابل حق مشروط منفصل عن أي تبادل حقيقي للأصل عند نشوء العقد، ويُستخدم كثير منها للمضاربة البحتة بدلاً من نقل مخاطر مرتبط بملكية حقيقية. يُدرَّس هذا الدرس للتعرف فقط — وليس تشجيعاً على تداول الخيارات.',
          },
          complianceTag: 'HARAM',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u5-options-cp',
            question: {
              en: 'A key Sharia concern with conventional options is:',
              ar: 'من أبرز المخاوف الشرعية بشأن الخيارات التقليدية:',
            },
            options: [
              { en: 'Gharar (excessive uncertainty) from a contingent right disconnected from a real asset exchange', ar: 'الغرر (عدم اليقين المفرط) الناتج عن حق مشروط منفصل عن تبادل حقيقي للأصل' },
              { en: 'Options always guarantee a profit', ar: 'الخيارات تضمن الربح دائماً' },
              { en: 'Options require no premium payment', ar: 'الخيارات لا تتطلب دفع أي علاوة' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Conventional options are widely viewed as raising gharar concerns due to the contingent, uncertain right at the core of the contract.',
              ar: 'يُنظر إلى الخيارات التقليدية على نطاق واسع على أنها تثير مخاوف الغرر بسبب الحق المشروط وغير المؤكد في جوهر العقد.',
            },
            complianceTag: 'HARAM',
          },
        },
        {
          id: 'adv-u5-futures',
          title: { en: 'Futures Contracts: Leverage, Margin, and Gharar', ar: 'عقود المستقبليات: الرافعة المالية والهامش والغرر' },
          summary: {
            en: 'How futures use margin and leverage to amplify both gains and losses.',
            ar: 'كيف تستخدم المستقبليات الهامش والرافعة المالية لتضخيم الأرباح والخسائر معاً.',
          },
          body: {
            en: 'A futures contract obligates both parties to transact an underlying asset at a set price on a set future date, typically traded on margin — a small deposit controlling a much larger notional position. This leverage amplifies both gains and losses, and the standardized, cash-settled nature of many futures contracts (with no intent to deliver the actual underlying) compounds the gharar concern shared with options. Understanding leverage mechanics matters for reading financial news correctly, independent of whether the instrument is compliant.',
            ar: 'يُلزم عقد المستقبليات الطرفين بتبادل أصل أساسي بسعر محدد في تاريخ مستقبلي محدد، ويُتداول عادة بالهامش — وديعة صغيرة تتحكم بمركز اسمي أكبر بكثير. تُضخّم هذه الرافعة المالية الأرباح والخسائر معاً، كما أن الطابع الموحّد والمُسوَّى نقدياً لكثير من عقود المستقبليات (دون نية تسليم الأصل الأساسي فعلياً) يُضاعف إشكالية الغرر المشتركة مع الخيارات. فهم آلية الرافعة المالية مهم لقراءة الأخبار المالية بشكل صحيح، بصرف النظر عن مدى توافق الأداة شرعياً.',
          },
          complianceTag: 'HARAM',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u5-futures-cp',
            question: {
              en: 'Trading futures on margin means:',
              ar: 'يعني تداول المستقبليات بالهامش:',
            },
            options: [
              { en: 'A small deposit controls a much larger notional position, amplifying gains and losses', ar: 'وديعة صغيرة تتحكم بمركز اسمي أكبر بكثير، مما يضخّم الأرباح والخسائر' },
              { en: 'The full contract value must be paid upfront in cash', ar: 'يجب دفع كامل قيمة العقد نقداً مقدماً' },
              { en: 'There is no leverage involved', ar: 'لا توجد رافعة مالية متضمنة' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Margin trading is the definition of leverage: a small deposit controls a much larger position, amplifying both gains and losses.',
              ar: 'التداول بالهامش هو تعريف الرافعة المالية: وديعة صغيرة تتحكم بمركز أكبر بكثير، مما يضخّم الأرباح والخسائر معاً.',
            },
            complianceTag: 'HARAM',
          },
        },
        {
          id: 'adv-u5-arbun-salam',
          title: { en: 'Arbun and Salam: Sharia-Compliant Relatives', ar: 'العربون والسلم: الأقارب المتوافقان شرعياً' },
          summary: {
            en: 'How arbun (down-payment sale) and salam (forward sale) achieve option/futures-like economic functions compliantly.',
            ar: 'كيف يحقق العربون (بيع بعربون) والسلم (بيع آجل) وظائف اقتصادية شبيهة بالخيارات والمستقبليات بشكل متوافق شرعياً.',
          },
          body: {
            en: 'Arbun is a sale where the buyer pays a non-refundable down payment for the right to complete (or forfeit) the purchase of a specific real asset later — many scholars accept it as a compliant analogue to an option because it is tied to an actual asset and a genuine sale structure, not a bare contingent right. Salam is a forward sale where the buyer pays the full price now for a specified, described asset (often agricultural or commodity) to be delivered at a future date — historically used to give producers upfront capital, and accepted precisely because both price and asset description are fixed at inception, removing the gharar present in undefined futures speculation.',
            ar: 'العربون هو بيع يدفع فيه المشتري عربوناً غير قابل للاسترداد مقابل الحق في إتمام (أو التخلي عن) شراء أصل حقيقي محدد لاحقاً — ويقبله كثير من العلماء كنظير متوافق شرعياً للخيار لأنه مرتبط بأصل فعلي وهيكل بيع حقيقي، لا مجرد حق مشروط مجرد. السلم هو بيع آجل يدفع فيه المشتري كامل الثمن الآن مقابل أصل محدد الوصف (غالباً زراعي أو سلعي) يُسلَّم في تاريخ مستقبلي — استُخدم تاريخياً لمنح المنتجين رأس مال مقدماً، ويُقبل تحديداً لأن السعر ووصف الأصل ثابتان عند نشوء العقد، مما يزيل الغرر الموجود في مضاربة المستقبليات غير المحددة.',
          },
          complianceTag: 'HALAL',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'adv-u5-arbun-salam-cp',
            question: {
              en: 'Salam contracts are accepted as Sharia-compliant partly because:',
              ar: 'تُقبل عقود السلم كمتوافقة شرعياً جزئياً لأن:',
            },
            options: [
              { en: 'Both price and asset description are fixed at inception, removing undefined-speculation gharar', ar: 'يُثبَّت السعر ووصف الأصل عند نشوء العقد، مما يزيل غرر المضاربة غير المحددة' },
              { en: 'No payment is ever made', ar: 'لا يُدفع أي مبلغ على الإطلاق' },
              { en: 'They are identical to conventional futures', ar: 'مطابقة تماماً للمستقبليات التقليدية' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Fixing price and asset description at inception is exactly what removes the gharar that makes undefined conventional futures speculation a concern.',
              ar: 'تثبيت السعر ووصف الأصل عند نشوء العقد هو بالضبط ما يزيل الغرر الذي يجعل مضاربة المستقبليات التقليدية غير المحددة موضع قلق.',
            },
            complianceTag: 'HALAL',
          },
        },
      ],
    },
  ],
};
