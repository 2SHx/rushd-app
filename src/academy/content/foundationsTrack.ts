import type { Track } from '../schema';

/**
 * Rushd Academy — Foundations track (DR-17).
 *
 * Bachelor-intro-level personal-finance curriculum, minimum segment KIDS.
 * Units 1–2 ("What is money?", "Saving & spending wisely") ship genuinely
 * distinct KIDS/TEENS/ADULTS variants of the same concept — never the same
 * copy duplicated across segments. Unit 4 is the Islamic-finance unit: riba
 * mechanics are explained honestly and tagged HARAM (DR-5 — taught openly,
 * never softened, never executable); Mudarabah, AAOIFI screening, and
 * purification/zakat follow. Every unit carries ≥1 practiceLink (DR-14).
 */
export const foundationsTrack: Track = {
  id: 'foundations',
  title: { en: 'Foundations', ar: 'الأساسيات' },
  minimumAgeSegment: 'KIDS',
  units: [
    // ---------------------------------------------------------------
    // U1 — What is money?  (KIDS / TEENS / ADULTS variants)
    // ---------------------------------------------------------------
    {
      id: 'money-basics',
      title: { en: 'What is money?', ar: 'ما هو المال؟' },
      practiceLinks: [{ kind: 'quizTopic', topic: 'Stock Market Basics' }],
      lessons: [
        {
          id: 'money-basics-kids',
          title: { en: 'What is money?', ar: 'ما هو المال؟' },
          summary: {
            en: 'Money is what we use to get things we need and want.',
            ar: 'المال هو الشيء الذي نستخدمه للحصول على ما نحتاجه ونرغب فيه.',
          },
          body: {
            en: "Money is what people use to trade for things they need or want — like a toy, a snack, or a bus ticket. Instead of swapping a toy for a sandwich, we use money because everyone agrees it has value. When your family gives you 'مصروف' (allowance), that money is yours to decide about: you can spend some, save some in a jar, and share some. This is training money — play money in this app — so you can practice good habits before it's real.",
            ar: 'المال هو ما يستخدمه الناس للحصول على الأشياء التي يحتاجونها أو يرغبون بها — مثل لعبة، أو وجبة خفيفة، أو تذكرة الباص. بدل أن نستبدل لعبة بساندويتش، نستخدم المال لأن الجميع متفق على أن له قيمة. عندما تعطيك عائلتك "مصروفاً"، يصبح هذا المال لك لتقرر بشأنه: تصرف جزءاً، وتدخر جزءاً في حصالة، وتشارك جزءاً. هذا مال تدريبي — مال افتراضي داخل هذا التطبيق — لتتعلم عادات جيدة قبل أن يصبح المال حقيقياً.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'KIDS',
          contentVersion: 1,
          checkpoint: {
            id: 'money-basics-kids-cp1',
            question: {
              en: 'What can you do with money you get as allowance?',
              ar: 'ماذا يمكنك أن تفعل بالمال الذي تحصل عليه كمصروف؟',
            },
            options: [
              { en: 'Spend some, save some, and share some', ar: 'تصرف جزءاً، وتدخر جزءاً، وتشارك جزءاً' },
              { en: 'It has no real use', ar: 'ليس له أي استخدام حقيقي' },
              { en: 'Only adults are allowed to decide about it', ar: 'الكبار فقط من يقرر بشأنه' },
              { en: 'It must all be spent the same day', ar: 'يجب صرفه بالكامل في نفس اليوم' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Allowance is yours to manage — good habits start with splitting it between spending, saving, and sharing.',
              ar: 'المصروف مال لك تديره بنفسك — والعادات الجيدة تبدأ بتقسيمه بين الصرف والادخار والمشاركة.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'money-basics-teens',
          title: { en: 'What is money — and why do we need it?', ar: 'ما هو المال، ولماذا نحتاجه؟' },
          summary: {
            en: 'Money lets strangers trade without matching what each side happens to have.',
            ar: 'المال يتيح للناس التبادل دون الحاجة لأن يملك كل طرف بالضبط ما يريده الآخر.',
          },
          body: {
            en: "Before money, people bartered — trading a good directly for another. That only works if both sides want exactly what the other has, which is rare. Money solves this: everyone accepts it, so you can sell your time or skills for money, then use that money for anything else, whenever you want. This introduces opportunity cost — every riyal spent on one thing is a riyal that can't go toward something else (a phone case now vs. saving toward a new phone). Getting comfortable with that trade-off is the core skill of personal finance, and everything you practice in this app uses simulated, play money — never real funds.",
            ar: 'قبل وجود المال، كان الناس يتبادلون السلع مباشرة (المقايضة)، وهذا يصلح فقط إذا أراد كل طرف بالضبط ما يملكه الطرف الآخر، وهو أمر نادر الحدوث. المال يحل هذه المشكلة: يقبله الجميع، فتستطيع بيع وقتك أو مهاراتك مقابل مال، ثم تستخدم هذا المال في أي شيء آخر تريده، متى شئت. هنا يظهر مفهوم "تكلفة الفرصة البديلة" — كل ريال تصرفه على شيء هو ريال لن يذهب لشيء آخر (غطاء جوال الآن مقابل الادخار لشراء جوال جديد). إتقان هذا التوازن هو جوهر مهارة إدارة المال الشخصي، وكل ما تتدربه في هذا التطبيق يستخدم مالاً افتراضياً — وليس مالاً حقيقياً أبداً.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'money-basics-teens-cp1',
            question: {
              en: 'What is "opportunity cost" when spending money?',
              ar: 'ما المقصود بـ"تكلفة الفرصة البديلة" عند صرف المال؟',
            },
            options: [
              { en: 'What you give up by choosing one option over another', ar: 'ما تتنازل عنه عندما تختار خياراً على حساب خيار آخر' },
              { en: 'The tax charged on a purchase', ar: 'الضريبة المفروضة على عملية الشراء' },
              { en: 'The price printed on a receipt', ar: 'السعر المطبوع في الفاتورة' },
              { en: 'A fee banks charge for withdrawals', ar: 'رسوم يفرضها البنك على السحب' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Every choice to spend on one thing means giving up the alternative uses of that same money.',
              ar: 'كل قرار بصرف المال على شيء يعني التنازل عن الاستخدامات البديلة لنفس المبلغ.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'money-basics-adults',
          title: { en: 'Money: medium of exchange, unit of account, store of value', ar: 'المال: وسيط للتبادل، ووحدة للحساب، ومخزن للقيمة' },
          summary: {
            en: 'Formally, money performs three functions — and each has real limits worth understanding.',
            ar: 'رسمياً، يؤدي المال ثلاث وظائف — ولكل منها حدود حقيقية تستحق الفهم.',
          },
          body: {
            en: "Economists describe money by three functions: a medium of exchange (avoids the double-coincidence-of-wants problem barter has), a unit of account (prices let you compare a coffee to a car on one scale), and a store of value (you can hold it and spend it later). That third function is not guaranteed — inflation erodes purchasing power over time, so idle cash quietly loses value even while its number stays the same. This is why people look at saving instruments and investments rather than only cash under the mattress; the how of doing that compliantly is covered later in this track's Islamic-finance unit. Nothing here is investment advice, and every number you see in this app is simulated.",
            ar: 'يصف الاقتصاديون المال عبر ثلاث وظائف: وسيط للتبادل (يتجاوز مشكلة "توافق الرغبات المزدوج" التي تعاني منها المقايضة)، ووحدة للحساب (الأسعار تتيح مقارنة فنجان قهوة بسيارة على مقياس واحد)، ومخزن للقيمة (يمكن الاحتفاظ به وصرفه لاحقاً). لكن هذه الوظيفة الثالثة غير مضمونة — فالتضخم يقلّل القوة الشرائية مع الوقت، فالنقد الخامل يفقد قيمته تدريجياً رغم أن رقمه يبقى كما هو. لهذا السبب يلجأ الناس إلى أدوات ادخار واستثمار بدلاً من الاكتفاء بالنقد الراكد؛ وكيفية القيام بذلك بما يتوافق مع الشريعة سيُشرح لاحقاً في وحدة التمويل الإسلامي من هذا المسار. لا شيء هنا يُعد نصيحة استثمارية، وكل رقم تراه في هذا التطبيق هو رقم افتراضي محاكى.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'money-basics-adults-cp1',
            question: {
              en: "Which of money's three functions is undermined by inflation?",
              ar: 'أي وظيفة من وظائف المال الثلاث يقوّضها التضخم؟',
            },
            options: [
              { en: 'Store of value', ar: 'مخزن القيمة' },
              { en: 'Medium of exchange', ar: 'وسيط التبادل' },
              { en: 'Unit of account', ar: 'وحدة الحساب' },
              { en: 'None — inflation has no effect on money', ar: 'لا شيء — التضخم لا يؤثر على المال' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: "Inflation erodes purchasing power over time, weakening money's ability to store value even though the medium-of-exchange and unit-of-account roles keep working.",
              ar: 'يقلّل التضخم القوة الشرائية مع الوقت، مما يضعف قدرة المال على تخزين القيمة، رغم أن دوره كوسيط للتبادل ووحدة للحساب يبقى قائماً.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },

    // ---------------------------------------------------------------
    // U2 — Saving & spending wisely  (KIDS / TEENS / ADULTS variants)
    // ---------------------------------------------------------------
    {
      id: 'saving-spending',
      title: { en: 'Saving & spending wisely', ar: 'الادخار والإنفاق بحكمة' },
      practiceLinks: [{ kind: 'quizTopic', topic: 'Savings & Jars' }],
      lessons: [
        {
          id: 'saving-spending-kids',
          title: { en: 'Save, spend, share: your three jars', ar: 'ادخر، اصرف، شارك: حصالاتك الثلاث' },
          summary: {
            en: 'Splitting money into three jars makes good habits automatic.',
            ar: 'تقسيم المال على ثلاث حصالات يجعل العادات الجيدة تلقائية.',
          },
          body: {
            en: "A simple way to handle allowance is three jars: SAVE (for something bigger later, like a new game), SPEND (for something small now, like a snack), and SHARE (giving a little to help someone else). Deciding how much goes in each jar before you spend anything makes saving automatic instead of 'whatever is left over' — which is usually nothing. In this app, your jars are play money, so it's a safe place to practice before it matters for real.",
            ar: 'من أسهل الطرق لإدارة المصروف هو تقسيمه على ثلاث حصالات: "ادخار" (لشيء أكبر لاحقاً، مثل لعبة جديدة)، و"صرف" (لشيء صغير الآن، مثل وجبة خفيفة)، و"مشاركة" (إعطاء جزء بسيط لمساعدة شخص آخر). عندما تقرر مقدار كل حصالة قبل أن تصرف أي شيء، يصبح الادخار تلقائياً بدلاً من أن يكون "ما تبقى" — وهو غالباً لا شيء. في هذا التطبيق، حصالاتك مال افتراضي، فهو مكان آمن للتدرب قبل أن يصبح الأمر حقيقياً.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'KIDS',
          contentVersion: 1,
          checkpoint: {
            id: 'saving-spending-kids-cp1',
            question: { en: 'What are the three jars for?', ar: 'لماذا نستخدم الحصالات الثلاث؟' },
            options: [
              { en: 'Save, spend, and share', ar: 'الادخار، والصرف، والمشاركة' },
              { en: 'Save, hide, and forget', ar: 'الادخار، والإخفاء، والنسيان' },
              { en: 'One jar for toys only', ar: 'حصالة واحدة للألعاب فقط' },
              { en: 'They are just for decoration', ar: 'هي للزينة فقط' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Splitting money on purpose — before spending — is what makes saving and sharing actually happen.',
              ar: 'تقسيم المال بشكل مقصود — قبل الصرف — هو ما يجعل الادخار والمشاركة يحدثان فعلاً.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'saving-spending-teens',
          title: { en: 'Budgeting: needs, wants, and goals', ar: 'الميزانية: الاحتياجات، والرغبات، والأهداف' },
          summary: {
            en: 'A simple split of income across needs, wants, and savings keeps spending intentional.',
            ar: 'تقسيم بسيط للدخل بين الاحتياجات والرغبات والادخار يجعل الإنفاق مقصوداً لا عشوائياً.',
          },
          body: {
            en: "A common starting budget splits money roughly: about half toward needs (transport, essentials), about a third toward wants (entertainment, clothes you like but don't strictly need), and the rest toward savings goals (a laptop, a trip). The exact split matters less than having one — it turns 'I'll save whatever is left' into 'saving is planned first.' Setting a specific goal (amount + rough date) makes saving easier because you can track progress instead of just resisting spending in the moment.",
            ar: 'من أشهر طرق الميزانية البسيطة أن تقسّم المال تقريباً: نصفه تقريباً للاحتياجات (المواصلات، الأساسيات)، وثلثه تقريباً للرغبات (الترفيه، ملابس تعجبك لكنها ليست ضرورية)، والباقي لأهداف الادخار (لابتوب، رحلة). النسبة الدقيقة أقل أهمية من وجود خطة أصلاً — فهي تحول "سأدخر ما تبقى" إلى "الادخار مخطط له مسبقاً". وضع هدف محدد (مبلغ + تاريخ تقريبي) يجعل الادخار أسهل لأنك تتابع التقدم بدلاً من مجرد مقاومة الرغبة في الصرف لحظياً.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'saving-spending-teens-cp1',
            question: {
              en: 'Why does setting a specific savings goal (amount + date) help?',
              ar: 'لماذا يساعد تحديد هدف ادخار محدد (مبلغ + تاريخ)؟',
            },
            options: [
              { en: 'It lets you track progress instead of only resisting spending', ar: 'يتيح لك متابعة التقدم بدلاً من مجرد مقاومة الصرف' },
              { en: 'It guarantees the price will never go up', ar: 'يضمن أن السعر لن يرتفع أبداً' },
              { en: 'It removes the need to spend on needs', ar: 'يلغي الحاجة للصرف على الاحتياجات' },
              { en: 'It is required by law', ar: 'هو أمر يفرضه القانون' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'A concrete target turns saving into a trackable plan rather than pure willpower in the moment.',
              ar: 'الهدف المحدد يحول الادخار إلى خطة قابلة للمتابعة بدلاً من الاعتماد فقط على قوة الإرادة اللحظية.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'saving-spending-adults',
          title: { en: 'Emergency funds and avoiding lifestyle inflation', ar: 'صندوق الطوارئ وتجنّب تضخم نمط الحياة' },
          summary: {
            en: 'An emergency fund and disciplined spending growth protect long-term financial goals.',
            ar: 'صندوق الطوارئ والانضباط في نمو الإنفاق يحميان الأهداف المالية طويلة المدى.',
          },
          body: {
            en: 'An emergency fund — commonly a few months of essential expenses held in an easily accessible, low-risk account — exists so a surprise cost (a repair, a medical bill) does not force selling investments at a bad time or taking on debt. Separately, "lifestyle inflation" is the tendency for spending to rise automatically whenever income rises, which quietly cancels out the benefit of a raise. Reviewing spending against goals periodically — rather than assuming more income should mean more spending — is what keeps a budget serving long-term goals instead of drifting. This app simulates all of this with play money; it is education, not personalized financial advice.',
            ar: 'صندوق الطوارئ — وعادة ما يكون بحجم نفقات أساسية لعدة أشهر محفوظة في حساب سهل الوصول ومنخفض المخاطر — يُستخدم حتى لا تضطر لبيع استثمارات في وقت غير مناسب أو الاقتراض عند حدوث تكلفة مفاجئة (إصلاح، فاتورة طبية). وعلى صعيد آخر، "تضخم نمط الحياة" هو ميل الإنفاق للارتفاع تلقائياً كلما ارتفع الدخل، مما يلغي بصمت فائدة أي زيادة في الدخل. مراجعة الإنفاق مقابل الأهداف بشكل دوري — بدلاً من افتراض أن زيادة الدخل تعني بالضرورة زيادة الإنفاق — هو ما يبقي الميزانية في خدمة الأهداف طويلة المدى بدلاً من الانحراف عنها. هذا التطبيق يحاكي كل ذلك بمال افتراضي؛ وهو محتوى تعليمي وليس نصيحة مالية شخصية.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'saving-spending-adults-cp1',
            question: { en: 'What is the main purpose of an emergency fund?', ar: 'ما الغرض الرئيسي من صندوق الطوارئ؟' },
            options: [
              {
                en: 'Cover surprise costs without selling investments at a bad time or taking on debt',
                ar: 'تغطية التكاليف المفاجئة دون بيع استثمارات في وقت غير مناسب أو الاقتراض',
              },
              { en: 'Maximize investment returns', ar: 'تعظيم عوائد الاستثمار' },
              { en: 'Replace the need for a budget', ar: 'الاستغناء عن الحاجة لميزانية' },
              { en: 'Avoid paying zakat', ar: 'تجنّب دفع الزكاة' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'An emergency fund exists to absorb unplanned costs safely, protecting longer-term savings and investment goals.',
              ar: 'صندوق الطوارئ يمتص التكاليف غير المخطط لها بأمان، مما يحمي أهداف الادخار والاستثمار طويلة المدى.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },

    // ---------------------------------------------------------------
    // U3 — What is a company & a share?
    // ---------------------------------------------------------------
    {
      id: 'companies-shares',
      title: { en: 'What is a company & a share?', ar: 'ما هي الشركة، وما هو السهم؟' },
      practiceLinks: [{ kind: 'strategySetup', setupId: 'bollinger-mr-long-v2' }],
      lessons: [
        {
          id: 'company-basics',
          title: { en: 'What is a company?', ar: 'ما هي الشركة؟' },
          summary: {
            en: 'A company organizes people and money to make a product or service.',
            ar: 'الشركة تنظّم الأشخاص والأموال لإنتاج سلعة أو خدمة.',
          },
          body: {
            en: "A company is a structure that combines workers, equipment, and capital to produce and sell something — a phone maker, a grocery chain, an airline. A private company's ownership is held by a small group (founders, employees). A public company has sold pieces of ownership — shares — to the public through a stock exchange like Tadawul (TASI) or NASDAQ, so that anyone can become a part-owner. Going public raises money the company can use to grow, in exchange for sharing ownership and disclosing its financial results regularly.",
            ar: 'الشركة هي كيان يجمع بين العاملين والمعدات ورأس المال لإنتاج وبيع شيء ما — صانع هواتف، سلسلة سوبرماركت، شركة طيران. في الشركة الخاصة تكون الملكية محصورة بمجموعة صغيرة (المؤسسون والموظفون). أما الشركة المساهمة العامة فقد باعت أجزاءً من ملكيتها — أسهماً — للجمهور عبر سوق مالية مثل تداول (تاسي) أو ناسداك، بحيث يستطيع أي شخص أن يصبح شريكاً في الملكية. الطرح العام يجمع أموالاً تستخدمها الشركة للنمو، مقابل مشاركة الملكية والإفصاح عن نتائجها المالية بشكل دوري.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'company-basics-cp1',
            question: {
              en: 'What does a company do when it "goes public"?',
              ar: 'ماذا تفعل الشركة عندما "تطرح أسهمها للاكتتاب العام"؟',
            },
            options: [
              { en: 'Sells shares of ownership to the public via a stock exchange', ar: 'تبيع حصصاً من ملكيتها للجمهور عبر سوق مالية' },
              { en: 'Stops disclosing its financial results', ar: 'تتوقف عن الإفصاح عن نتائجها المالية' },
              { en: 'Becomes owned by the government automatically', ar: 'تصبح مملوكة للحكومة تلقائياً' },
              { en: 'Removes all employees', ar: 'تستغني عن جميع موظفيها' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Going public means offering shares to outside investors through an exchange, in exchange for raising capital and regular disclosure.',
              ar: 'الطرح العام يعني تقديم أسهم للمستثمرين خارج الشركة عبر سوق مالية، مقابل جمع رأس مال والالتزام بالإفصاح الدوري.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'share-ownership',
          title: { en: 'What is a share?', ar: 'ما هو السهم؟' },
          summary: {
            en: 'A share is a small slice of ownership in a company, not a loan to it.',
            ar: 'السهم هو حصة صغيرة من ملكية الشركة، وليس قرضاً لها.',
          },
          body: {
            en: "A share is one unit of ownership in a company. Owning a share gives you a proportional claim on the company's profits and assets — if the company does well, the share can become more valuable and may pay a dividend (a portion of profit distributed to shareholders); if it does poorly, the share can lose value. This is different from lending money, where a fixed return is promised regardless of how the borrower's business performs — a distinction that matters later in this track's Islamic-finance unit. A shareholder's risk is limited to what they invested; they are not personally responsible for the company's debts.",
            ar: 'السهم هو وحدة واحدة من ملكية الشركة. امتلاك سهم يمنحك حصة نسبية من أرباح الشركة وأصولها — فإن أدّت الشركة أداءً جيداً، قد ترتفع قيمة السهم وقد توزّع أرباحاً (جزء من الربح يوزَّع على المساهمين)؛ وإن ساء أداؤها، قد تنخفض قيمة السهم. هذا يختلف عن الإقراض، حيث يُعد المُقرض بعائد ثابت بغض النظر عن أداء نشاط المقترض — وهو فرق سيهمنا لاحقاً في وحدة التمويل الإسلامي من هذا المسار. مخاطرة المساهم تقتصر على المبلغ الذي استثمره، وهو غير مسؤول شخصياً عن ديون الشركة.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'share-ownership-cp1',
            question: { en: 'What does owning a share represent?', ar: 'ماذا يمثل امتلاك السهم؟' },
            options: [
              { en: 'A proportional ownership claim on profits and assets', ar: 'حصة ملكية نسبية من الأرباح والأصول' },
              { en: 'A guaranteed fixed loan repayment', ar: 'سداد قرض ثابت مضمون' },
              { en: 'A government bond', ar: 'سند حكومي' },
              { en: 'A personal debt owed by the shareholder', ar: 'ديناً شخصياً على المساهم' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: "Unlike a loan, a share's value moves with the company's real performance — there is no guaranteed fixed return.",
              ar: 'بخلاف القرض، تتحرك قيمة السهم مع الأداء الفعلي للشركة — فلا يوجد عائد ثابت مضمون.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'reading-a-quote',
          title: { en: 'Reading a stock quote', ar: 'قراءة عرض سعر السهم' },
          summary: {
            en: 'A quote shows a symbol, price, and day change — none of it is a recommendation.',
            ar: 'عرض السعر يُظهر الرمز والسعر وتغيّر اليوم — ولا شيء من ذلك يُعد توصية.',
          },
          body: {
            en: "A basic stock quote shows: the symbol (TASI uses numeric symbols like 2222 for Aramco; NASDAQ uses letters like AAPL), the current price, and the day's change (e.g., '+2.3%' means the price rose 2.3% since the previous close). TASI trades Sunday–Thursday in Saudi riyal, pegged near 3.75 to the US dollar; NASDAQ trades in US dollars on a different weekly schedule. In this app every price and trade is simulated play money for practice — reading a quote is a skill, not a signal to act, and nothing here is investment advice.",
            ar: 'عرض السعر الأساسي للسهم يُظهر: الرمز (تاسي يستخدم رموزاً رقمية مثل 2222 لأرامكو؛ وناسداك يستخدم حروفاً مثل AAPL)، والسعر الحالي، وتغيّر اليوم (مثال: "+2.3%" تعني أن السعر ارتفع 2.3% منذ إغلاق اليوم السابق). يتداول تاسي من الأحد إلى الخميس بالريال السعودي، المربوط بحوالي 3.75 مقابل الدولار الأمريكي؛ بينما يتداول ناسداك بالدولار الأمريكي وفق جدول أسبوعي مختلف. في هذا التطبيق كل سعر وكل صفقة هي محاكاة بمال افتراضي للتدريب — قراءة عرض السعر مهارة، وليست إشارة للتصرف، ولا شيء هنا يُعد نصيحة استثمارية.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'reading-a-quote-cp1',
            question: { en: 'What does a day change of "+2.3%" mean?', ar: 'ماذا يعني تغيّر اليوم "+2.3%"؟' },
            options: [
              { en: "The price rose 2.3% since the previous close", ar: 'ارتفع السعر بنسبة 2.3% منذ إغلاق اليوم السابق' },
              { en: 'The company paid a 2.3% dividend today', ar: 'وزّعت الشركة أرباحاً بنسبة 2.3% اليوم' },
              { en: 'The stock is guaranteed to keep rising', ar: 'مضمون أن يستمر السهم بالارتفاع' },
              { en: 'It is a buy recommendation', ar: 'إشارة توصية بالشراء' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Day change is purely descriptive — the price move since the prior close — and is never a recommendation.',
              ar: 'تغيّر اليوم وصفي بحت — حركة السعر منذ الإغلاق السابق — وليس توصية بأي حال.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },

    // ---------------------------------------------------------------
    // U4 — Islamic finance foundations
    // ---------------------------------------------------------------
    {
      id: 'islamic-finance-foundations',
      title: { en: 'Islamic finance foundations', ar: 'أساسيات التمويل الإسلامي' },
      practiceLinks: [
        { kind: 'quizTopic', topic: 'Sharia Compliance' },
        { kind: 'quizTopic', topic: 'Halal Mutual Funds' },
      ],
      lessons: [
        {
          id: 'riba-and-why-prohibited',
          title: { en: 'Riba (interest) and why it is prohibited', ar: 'الربا (الفائدة) ولماذا هو محرَّم' },
          summary: {
            en: 'Riba is a guaranteed return on money regardless of real risk or outcome — Islamic finance prohibits it.',
            ar: 'الربا هو عائد مضمون على المال بغض النظر عن المخاطرة الحقيقية أو النتيجة — ويحرّمه التمويل الإسلامي.',
          },
          body: {
            en: "Riba is commonly translated as 'interest' or 'usury': a lender charges a fixed, guaranteed extra amount on top of a loan, owed regardless of whether the borrower's venture succeeds, fails, or even causes them hardship. Islamic finance prohibits riba because it separates return from real risk and effort — the lender profits automatically while the borrower carries all the risk, which is considered unjust. This is taught here honestly and completely, including how compound interest mechanically works, because understanding a concept is not the same as endorsing it: riba stays labeled HARAM and is never something this app lets you actually do with your money. The Islamic alternative is risk-sharing partnership, covered in the next lesson.",
            ar: 'الربا يُترجم غالباً بـ"الفائدة": يفرض المُقرض مبلغاً إضافياً ثابتاً ومضموناً فوق القرض، يُستحق بغض النظر عن نجاح مشروع المقترض أو فشله أو حتى تسببه له بضائقة. يحرّم التمويل الإسلامي الربا لأنه يفصل العائد عن المخاطرة والجهد الحقيقيين — فيربح المُقرض تلقائياً بينما يتحمل المقترض كل المخاطرة، وهو أمر يُعد ظلماً. نشرح هذا هنا بصدق وبشكل كامل، بما في ذلك آلية عمل الفائدة المركبة، لأن فهم المفهوم لا يعني تأييده: يبقى الربا مصنّفاً "حرام" ولن يسمح لك هذا التطبيق أبداً بفعله فعلياً بمالك. البديل الإسلامي هو الشراكة القائمة على تقاسم المخاطرة، وسنتناولها في الدرس التالي.',
          },
          complianceTag: 'HARAM',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'riba-and-why-prohibited-cp1',
            question: {
              en: 'Why does Islamic finance prohibit riba (interest)?',
              ar: 'لماذا يحرّم التمويل الإسلامي الربا (الفائدة)؟',
            },
            options: [
              {
                en: "It guarantees the lender a return regardless of the borrower's real risk or outcome",
                ar: 'لأنه يضمن للمُقرض عائداً بغض النظر عن مخاطرة المقترض الحقيقية أو نتيجة مشروعه',
              },
              { en: 'Because lending money is forbidden entirely', ar: 'لأن الإقراض بحد ذاته محرَّم كلياً' },
              { en: 'Because it is illegal in every country', ar: 'لأنه غير قانوني في كل الدول' },
              { en: 'It has no defined reason', ar: 'لا يوجد سبب محدد لذلك' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Riba is prohibited because it detaches a guaranteed return from real shared risk — the core objection is the injustice of that separation, not lending itself (Mudarabah partnerships remain permitted).',
              ar: 'يُحرَّم الربا لأنه يفصل العائد المضمون عن المخاطرة الحقيقية المشتركة — والاعتراض الجوهري هو الظلم الناتج عن هذا الفصل، وليس الإقراض بحد ذاته (فشراكة المضاربة تبقى جائزة).',
            },
            complianceTag: 'HARAM',
          },
        },
        {
          id: 'mudarabah-profit-share',
          title: { en: 'Mudarabah: profit-sharing partnership', ar: 'المضاربة: شراكة تقاسم الأرباح' },
          summary: {
            en: 'Mudarabah splits profits by agreed ratio while the capital provider carries the financial loss.',
            ar: 'المضاربة توزّع الأرباح بنسبة متفق عليها، بينما يتحمل صاحب رأس المال الخسارة المالية.',
          },
          body: {
            en: "Mudarabah is a partnership between two parties: the rabb al-mal (capital provider) who supplies the money, and the mudarib (manager) who supplies the work and expertise. Profits are split by a ratio agreed in advance (e.g., 60/40). If the venture loses money — without negligence or misconduct by the manager — the capital provider bears the financial loss alone, since they alone put up the capital; the manager's loss is their unpaid time and effort. This is the Sharia-compliant structure behind this app's simulated savings sweep: return is tied to real shared outcomes, not a guaranteed number regardless of performance.",
            ar: 'المضاربة هي شراكة بين طرفين: رب المال الذي يقدّم رأس المال، والمضارب الذي يقدّم العمل والخبرة. تُوزَّع الأرباح وفق نسبة متفق عليها مسبقاً (مثلاً 60/40). أما إن خسر المشروع — دون تقصير أو سوء تصرف من المضارب — فإن رب المال وحده يتحمل الخسارة المالية، لأنه وحده من قدّم رأس المال؛ وخسارة المضارب هي وقته وجهده غير المدفوعين. هذا هو الهيكل المتوافق مع الشريعة الذي تقوم عليه آلية الادخار الافتراضية في هذا التطبيق: العائد مرتبط بنتائج حقيقية مشتركة، وليس رقماً مضموناً بمعزل عن الأداء.',
          },
          complianceTag: 'HALAL',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'mudarabah-profit-share-cp1',
            question: {
              en: 'In Mudarabah, who bears the financial loss if the venture loses money (absent negligence)?',
              ar: 'في المضاربة، من يتحمل الخسارة المالية إن خسر المشروع (بدون تقصير)؟',
            },
            options: [
              { en: 'The capital provider (rabb al-mal)', ar: 'صاحب رأس المال (رب المال)' },
              { en: 'The manager (mudarib) alone', ar: 'المضارب وحده' },
              { en: 'Both split it equally by law', ar: 'يتقاسمانها بالتساوي إلزامياً' },
              { en: 'Neither — losses are never possible', ar: 'لا أحد — الخسارة غير ممكنة أصلاً' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: "Since only the capital provider put up money, only they bear the financial loss; the manager's cost is unpaid effort.",
              ar: 'بما أن رب المال وحده قدّم المال، فهو وحده يتحمل الخسارة المالية؛ أما تكلفة المضارب فهي جهده غير المدفوع.',
            },
            complianceTag: 'HALAL',
          },
        },
        {
          id: 'aaoifi-screening-basics',
          title: { en: 'AAOIFI screening basics', ar: 'أساسيات فرز أيوفي (AAOIFI)' },
          summary: {
            en: 'AAOIFI screens companies by sector, then by financial ratio thresholds.',
            ar: 'تفرز معايير أيوفي الشركات حسب القطاع أولاً، ثم حسب نسب مالية محددة.',
          },
          body: {
            en: 'AAOIFI (the Accounting and Auditing Organization for Islamic Financial Institutions) is a widely used two-stage screen for whether a public company\'s shares are Sharia-compliant. Stage one excludes entire sectors by core business (e.g., conventional banking/insurance, alcohol, gambling). Stage two applies financial ratio thresholds to remaining companies: interest-bearing debt must stay under roughly 30% of market capitalization, interest-bearing securities held by the company under roughly 30%, and non-compliant income (like interest received) under roughly 5% of total revenue. A company can pass sector screening but still fail on ratios if it carries too much interest-based debt — which is why screening is done on both dimensions, not just the business description.',
            ar: 'معايير أيوفي (هيئة المحاسبة والمراجعة للمؤسسات المالية الإسلامية) هي معيار فرز شائع من مرحلتين لتحديد مدى توافق أسهم شركة مساهمة عامة مع الشريعة. المرحلة الأولى تستبعد قطاعات كاملة حسب النشاط الأساسي (كالبنوك والتأمين التقليديين، والكحول، والقمار). المرحلة الثانية تطبّق نسباً مالية محددة على الشركات المتبقية: يجب ألا تتجاوز الديون الربوية نحو 30% من القيمة السوقية، وألا تتجاوز الأوراق المالية الربوية التي تملكها الشركة نحو 30%، وألا تتجاوز الإيرادات غير المتوافقة (كالفوائد المقبوضة) نحو 5% من إجمالي الإيرادات. قد تجتاز شركة فرز القطاع لكنها تفشل في نسبة الديون إن كانت تحمل ديوناً ربوية كبيرة — ولهذا يتم الفرز على البُعدين معاً وليس على وصف النشاط فقط.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'aaoifi-screening-basics-cp1',
            question: {
              en: 'Under AAOIFI, roughly what is the maximum allowed interest-bearing debt as a share of market capitalization?',
              ar: 'وفق معايير أيوفي، ما هو الحد الأقصى التقريبي للديون الربوية كنسبة من القيمة السوقية؟',
            },
            options: [
              { en: 'About 30%', ar: 'نحو 30%' },
              { en: 'About 5%', ar: 'نحو 5%' },
              { en: 'About 60%', ar: 'نحو 60%' },
              { en: 'There is no limit', ar: 'لا يوجد حد أقصى' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'AAOIFI caps interest-bearing debt at roughly 30% of market capitalization, alongside a similar cap on interest-bearing securities and a stricter ~5% cap on non-compliant income.',
              ar: 'تحدد معايير أيوفي سقف الديون الربوية بنحو 30% من القيمة السوقية، إلى جانب سقف مماثل للأوراق المالية الربوية، وسقف أكثر صرامة نحو 5% للإيرادات غير المتوافقة.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'purification-zakat-basics',
          title: { en: 'Purification and zakat basics', ar: 'أساسيات التطهير والزكاة' },
          summary: {
            en: 'Purification cleanses small non-compliant income; zakat is a separate, obligatory yearly due.',
            ar: 'التطهير ينقّي الدخل غير المتوافق البسيط؛ والزكاة فريضة سنوية منفصلة.',
          },
          body: {
            en: "Even a Sharia-screened company can generate a small amount of non-compliant income (e.g., incidental interest on its cash holdings, within AAOIFI's ~5% threshold). 'Purification' means calculating that tainted proportion of your investment income and donating it to charity — not keeping it — so the remaining income is considered clean. This is separate from zakat, an obligatory annual due (commonly ~2.5% of qualifying wealth held for a full lunar year) owed regardless of whether any income was tainted. Purification cleans a specific impurity; zakat is a standing worship obligation on wealth itself. In this app both concepts are taught for understanding — actual purification and zakat calculations for real money are outside the scope of this simulation.",
            ar: 'حتى الشركة التي اجتازت الفرز الشرعي قد تحقق قدراً بسيطاً من دخل غير متوافق (كفوائد عرضية على أرصدتها النقدية، ضمن حد أيوفي نحو 5%). "التطهير" يعني حساب تلك النسبة الملوَّثة من دخل استثمارك والتصدق بها — لا الاحتفاظ بها — بحيث يُعد باقي الدخل نظيفاً. هذا يختلف عن الزكاة، وهي فريضة سنوية (عادة نحو 2.5% من المال الزكوي الذي حال عليه الحول) تجب بغض النظر عن وجود دخل ملوَّث من عدمه. فالتطهير ينظّف شائبة محددة، أما الزكاة فهي عبادة قائمة على المال نفسه. في هذا التطبيق يُشرح المفهومان للفهم فقط — أما الحساب الفعلي للتطهير والزكاة على مال حقيقي فهو خارج نطاق هذه المحاكاة.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'purification-zakat-basics-cp1',
            question: {
              en: 'What is the key difference between purification and zakat?',
              ar: 'ما الفرق الأساسي بين التطهير والزكاة؟',
            },
            options: [
              {
                en: 'Purification cleans specific tainted income; zakat is a separate, standing yearly due on wealth',
                ar: 'التطهير ينقّي دخلاً ملوَّثاً محدداً؛ أما الزكاة ففريضة سنوية قائمة على المال نفسه',
              },
              { en: 'They are exactly the same obligation', ar: 'هما نفس الفريضة تماماً' },
              { en: 'Purification replaces zakat entirely', ar: 'التطهير يغني عن الزكاة كلياً' },
              { en: 'Zakat only applies to non-compliant income', ar: 'الزكاة تُفرض فقط على الدخل غير المتوافق' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Purification addresses a specific impurity from non-compliant income; zakat is a separate, obligatory yearly due on qualifying wealth regardless of any taint.',
              ar: 'التطهير يعالج شائبة محددة ناتجة عن دخل غير متوافق؛ أما الزكاة ففريضة سنوية منفصلة تجب على المال الزكوي بغض النظر عن أي شائبة.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },

    // ---------------------------------------------------------------
    // U5 (optional) — Markets around you: TASI & NASDAQ
    // ---------------------------------------------------------------
    {
      id: 'markets-around-you',
      title: { en: 'Markets around you: TASI & NASDAQ', ar: 'الأسواق من حولك: تاسي وناسداك' },
      practiceLinks: [
        { kind: 'quizTopic', topic: 'TASI Markets' },
        { kind: 'quizTopic', topic: 'NASDAQ Markets' },
      ],
      lessons: [
        {
          id: 'tasi-overview',
          title: { en: 'TASI: the Saudi stock market', ar: 'تاسي: سوق الأسهم السعودية' },
          summary: {
            en: 'TASI lists Saudi companies, trades in riyal, Sunday through Thursday.',
            ar: 'تاسي يضم الشركات السعودية، ويتداول بالريال، من الأحد إلى الخميس.',
          },
          body: {
            en: "TASI (Tadawul All Share Index) tracks all companies listed on the Saudi Exchange. Saudi-listed stocks use numeric symbols — Saudi Aramco is 2222, Al Rajhi Bank is 1120 — and trade in Saudi riyal, pegged near 3.75 per US dollar. Because the Saudi weekend is Friday–Saturday, TASI trades Sunday through Thursday, roughly 10:00 to 15:00 Arabia Standard Time — never assume a Monday–Friday week here. The Capital Market Authority (CMA) regulates the market to protect investors.",
            ar: 'مؤشر تاسي (المؤشر العام لسوق الأسهم السعودية) يتتبع جميع الشركات المدرجة في السوق المالية السعودية. الأسهم السعودية تستخدم رموزاً رقمية — أرامكو السعودية رمزها 2222، ومصرف الراجحي رمزه 1120 — وتتداول بالريال السعودي، المربوط بحوالي 3.75 مقابل الدولار الأمريكي. ولأن عطلة نهاية الأسبوع في السعودية هي الجمعة والسبت، يتداول تاسي من الأحد إلى الخميس، تقريباً من الساعة 10:00 حتى 15:00 بتوقيت السعودية — لا تفترض أبداً أن الأسبوع من الاثنين إلى الجمعة هنا. تشرف هيئة السوق المالية (CMA) على تنظيم السوق لحماية المستثمرين.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'tasi-overview-cp1',
            question: { en: 'Which days does TASI trade?', ar: 'في أي أيام يتداول تاسي؟' },
            options: [
              { en: 'Sunday through Thursday', ar: 'من الأحد إلى الخميس' },
              { en: 'Monday through Friday', ar: 'من الاثنين إلى الجمعة' },
              { en: 'Every day of the week', ar: 'كل أيام الأسبوع' },
              { en: 'Only on weekends', ar: 'في عطلة نهاية الأسبوع فقط' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Because the Saudi weekend is Friday–Saturday, TASI\'s trading week runs Sunday through Thursday.',
              ar: 'لأن عطلة نهاية الأسبوع في السعودية هي الجمعة والسبت، فإن أسبوع تداول تاسي يمتد من الأحد إلى الخميس.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'nasdaq-overview',
          title: { en: 'NASDAQ: a global, tech-heavy exchange', ar: 'ناسداك: سوق عالمية بتركيز تقني' },
          summary: {
            en: 'NASDAQ lists many technology companies, trades in US dollars with letter symbols.',
            ar: 'ناسداك يضم العديد من شركات التقنية، ويتداول بالدولار الأمريكي برموز حرفية.',
          },
          body: {
            en: "NASDAQ is a US electronic exchange known for a heavy concentration of technology companies, though it lists many other sectors too. Symbols are alphabetic (e.g., AAPL, MSFT) rather than numeric, and everything trades in US dollars on the US market calendar and hours — a different currency and schedule from TASI. In this app, NASDAQ access is a separate learning track from TASI so you can compare how two very different markets present the same underlying idea: buying a small ownership stake in a real company.",
            ar: 'ناسداك سوق إلكترونية أمريكية معروفة بتركيز كبير على شركات التقنية، رغم أنها تضم أيضاً قطاعات أخرى عديدة. رموزها حرفية (مثل AAPL وMSFT) وليست رقمية، وكل التداول يتم بالدولار الأمريكي وفق تقويم وساعات السوق الأمريكية — بعملة وجدول مختلفين تماماً عن تاسي. في هذا التطبيق، الوصول إلى ناسداك مسار تعليمي منفصل عن تاسي حتى تقارن كيف تقدّم سوقان مختلفتان تماماً نفس الفكرة الأساسية: شراء حصة ملكية صغيرة في شركة حقيقية.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'nasdaq-overview-cp1',
            question: { en: 'How are NASDAQ symbols typically written?', ar: 'كيف تُكتب رموز ناسداك عادةً؟' },
            options: [
              { en: 'Alphabetic letters, e.g. AAPL', ar: 'حروف أبجدية، مثل AAPL' },
              { en: 'Numeric digits, e.g. 2222', ar: 'أرقام، مثل 2222' },
              { en: 'A mix of emojis', ar: 'مزيج من الرموز التعبيرية' },
              { en: 'Roman numerals', ar: 'أرقام رومانية' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'NASDAQ symbols are alphabetic, unlike TASI\'s numeric symbols.',
              ar: 'رموز ناسداك حرفية، بخلاف رموز تاسي الرقمية.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'comparing-markets',
          title: { en: 'Comparing TASI and NASDAQ', ar: 'مقارنة بين تاسي وناسداك' },
          summary: {
            en: 'Currency, symbol format, and trading calendar differ — both are simulated here.',
            ar: 'العملة وصيغة الرموز والتقويم التجاري تختلف — وكلاهما محاكى هنا.',
          },
          body: {
            en: "Comparing the two markets side by side: TASI uses numeric symbols and Saudi riyal on a Sunday–Thursday calendar; NASDAQ uses alphabetic symbols and US dollars on a Monday–Friday calendar. Both list real companies whose share prices move on real business performance, but every trade you place in this app — on either market — is simulated play money, and nothing here is investment advice. Understanding both markets side by side builds the habit of checking a market's specific rules (currency, calendar, symbol format, regulator) before assuming they all work the same way.",
            ar: 'بمقارنة السوقين جنباً إلى جنب: تاسي يستخدم رموزاً رقمية وريالاً سعودياً وفق تقويم من الأحد إلى الخميس؛ بينما يستخدم ناسداك رموزاً حرفية ودولاراً أمريكياً وفق تقويم من الاثنين إلى الجمعة. كلا السوقين يضم شركات حقيقية تتحرك أسعار أسهمها وفق أدائها التجاري الفعلي، لكن كل صفقة تنفذها في هذا التطبيق — في أي من السوقين — هي محاكاة بمال افتراضي، ولا شيء هنا يُعد نصيحة استثمارية. فهم السوقين جنباً إلى جنب يبني عادة التحقق من القواعد الخاصة بكل سوق (العملة، التقويم، صيغة الرموز، الجهة المنظمة) قبل افتراض أن جميع الأسواق تعمل بنفس الطريقة.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'comparing-markets-cp1',
            question: {
              en: 'Which statement correctly compares TASI and NASDAQ?',
              ar: 'أي عبارة تقارن بشكل صحيح بين تاسي وناسداك؟',
            },
            options: [
              {
                en: 'TASI trades Sun–Thu in SAR with numeric symbols; NASDAQ trades Mon–Fri in USD with alphabetic symbols',
                ar: 'تاسي يتداول من الأحد للخميس بالريال برموز رقمية؛ وناسداك يتداول من الاثنين للجمعة بالدولار برموز حرفية',
              },
              { en: 'Both trade the exact same days and currency', ar: 'كلاهما يتداول في نفس الأيام وبنفس العملة' },
              { en: 'NASDAQ uses numeric symbols like TASI', ar: 'ناسداك يستخدم رموزاً رقمية مثل تاسي' },
              { en: 'TASI trades in US dollars', ar: 'تاسي يتداول بالدولار الأمريكي' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'The two markets differ in currency, trading calendar, and symbol format — each detail matters before comparing prices across them.',
              ar: 'يختلف السوقان في العملة والتقويم التجاري وصيغة الرموز — وكل تفصيل منها مهم قبل مقارنة الأسعار بينهما.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },
  ],
};
