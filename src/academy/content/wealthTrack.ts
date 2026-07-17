import type { Track } from '../schema';

/**
 * Rushd Academy — Wealth Building & Ethical Investing track (DR-17).
 *
 * Covers smart financial goals, halal asset allocation, AAOIFI stock screening,
 * dividend purification, and portfolio risk management for all age segments:
 * KIDS, TEENS, and ADULTS.
 */
export const wealthTrack: Track = {
  id: 'wealth-building',
  title: { en: 'Wealth & Ethical Investing', ar: 'نمو الثروة والاستثمار الشرعي' },
  minimumAgeSegment: 'KIDS',
  units: [
    {
      id: 'money-goals-saving',
      title: { en: 'Money Goals & Financial Habits', ar: 'الأهداف المالية وعادات النمو' },
      practiceLinks: [{ kind: 'quizTopic', topic: 'Savings & Jars' }],
      lessons: [
        {
          id: 'money-goals-kids',
          title: { en: 'The Money Tree: From Seed to Fruit', ar: 'شجرة المال: كيف تنمو مدخراتك من البذرة إلى الثمرة؟' },
          summary: {
            en: 'Small savings today turn into big trees over time.',
            ar: 'الادخار الصغير اليوم يتحول إلى شجرة كبيرة مع مرور الوقت.',
          },
          body: {
            en: "Think of your money like a small seed. If you spend it all right away on a candy bar, the seed is gone. But if you plant part of it in your savings jar, it starts to grow! When you add a little bit to your jar every week or every month, your money tree gets bigger and stronger. Eventually, it bears fruit—like buying your favorite book, a bike, or helping a friend in need. Good habits start by protecting your seeds today.",
            ar: 'تخيل أن مصروفك يشبه بذرة صغيرة. إذا أنفقته بالكامل فجأة على قطعة حلوى، ستختفي البذرة فوراً. لكن إذا زرعت جزءاً منه في حصالة التوفير، ستبدأ البذرة في النمو! كلما أضفت القليل إلى حصالتك كل أسبوع، تكبر شجرة مالك وتصبح أقوى. وفي النهاية تعطيك ثماراً طيبة — كأن تشتري دراجة، أو كتابك المفضل، أو تساعد شخصاً يحتاج المساعدة. العادات المباشرة تبدأ بحماية بذورك اليوم.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'KIDS',
          contentVersion: 1,
          checkpoint: {
            id: 'money-goals-kids-cp1',
            question: {
              en: 'What happens when you add money regularly to your savings jar?',
              ar: 'ماذا يحدث عندما تضيف المال بانتظام إلى حصالة التوفير؟',
            },
            options: [
              { en: 'Your savings grow bigger like a fruitful tree', ar: 'تنمو مدخراتك وتصبح مثل شجرة مثمرة' },
              { en: 'The money vanishes instantly', ar: 'يختفي المال فوراً' },
              { en: 'It becomes impossible to use', ar: 'يصبح استخدام المال مستحيلاً' },
              { en: 'You must give it back to the store', ar: 'يجب عليك إعادته للمتجر' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Regular savings build compounding momentum, giving you future options for big goals and sharing.',
              ar: 'الادخار المنتظم يبني قوى تراكمية تمنحك خيارات مستقبلية للأهداف الكبيرة والمشاركة.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'money-goals-teens',
          title: { en: 'The 50/30/20 Rule for Teen Budgets', ar: 'قاعدة الـ 50/30/20 لتنظيم مصروف ونفقات الشباب' },
          summary: {
            en: 'Balance needs, wants, and long-term goals using a structured budget ratio.',
            ar: 'توازن الاحتياجات والرغبات والأهداف طويلة المدى باستخدام نسبة ميزانية محددة.',
          },
          body: {
            en: "Managing your allowance or income from part-time work gets much easier with the 50/30/20 rule. Allocate 50% for Needs (school supplies, essential transport), 30% for Wants (hobbies, gaming, dining out), and 20% directly for Savings & Investments (building an emergency cushion or investing for the future). By automating the 20% savings step first (paying yourself first), you never have to guess whether you have money left at the end of the month.",
            ar: 'إدارة مصروفك أو دخلك من العمل الجزئي تزداد سهولة باتباع قاعدة 50/30/20. خصص 50% للاحتياجات الأساسية (أدوات الدراسة، مواصلات أساسية)، و30% للرغبات والترفيه (الهوايات، الألعاب)، و20% مباشرة للادخار والاستثمار (بناء حصالة المستقبل أو استثمار محلي). عندما تدخر نسبة الـ 20% أولاً فور استلام المال، لن تقع في حيرة نهاية الشهر تسأل أين ذهب المصروف.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'money-goals-teens-cp1',
            question: {
              en: 'In the 50/30/20 rule, what percentage is set aside first for savings and investment?',
              ar: 'في قاعدة 50/30/20، ما هي النسبة المخصصة أولاً للادخار والاستثمار؟',
            },
            options: [
              { en: '20%', ar: '20%' },
              { en: '50%', ar: '50%' },
              { en: '30%', ar: '30%' },
              { en: '0%', ar: '0%' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Setting aside 20% for savings before discretionary spending ensures financial growth.',
              ar: 'تخصيص 20% للادخار قبل الإنفاق الاختياري يضمن النمو المالي المستمر.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'money-goals-adults',
          title: { en: 'The Rule of 72 & Halal Wealth Accumulation', ar: 'قاعدة الـ 72 والتراكم الرأسمالي الحلال' },
          summary: {
            en: 'Estimate doubling time of capital through compound returns without non-compliant debt.',
            ar: 'تقدير زمني لمضاعفة رأس المال عبر العوائد المركبة بدون ديون محرمة.',
          },
          body: {
            en: "The Rule of 72 is a quick mathematical formula to estimate how many years it takes for an investment to double in value at a given expected annual return. Divide 72 by the expected return percentage (e.g., 72 / 8% = 9 years). In Sharia-compliant wealth building, compounding occurs through profit-sharing (Mudarabah/Musharakah) and capital appreciation in ethical equities rather than interest-bearing instruments (Riba).",
            ar: 'قاعدة الـ 72 هي صيغة حسابية سريعة لتقدير عدد السنوات اللازمة لتدبيل (مضاعفة) استثمارك بناءً على معدل العائد السنوي المتوقع. اقسم 72 على نسبة العائد (مثلاً 72 ÷ 8% = 9 سنوات). في بناء الثروة الإسلامي، يحدث النماء التراكمي من خلال المشاركة والمضاربة والأرباح التشغيلية للأسهم النقية، وليس عبر الفوائد الربوية المحرمة.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'money-goals-adults-cp1',
            question: {
              en: 'At an 8% expected annual return, roughly how long does it take for capital to double according to the Rule of 72?',
              ar: 'بناءً على عائد سنوي متوقع بنسبة 8%، كم سنة تقريباً يلزَم لمضاعفة رأس المال حسب قاعدة الـ 72؟',
            },
            options: [
              { en: '9 years (72 / 8)', ar: '9 سنوات (72 ÷ 8)' },
              { en: '15 years', ar: '15 سنة' },
              { en: '72 years', ar: '72 سنة' },
              { en: '4 years', ar: '4 سنوات' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: '72 divided by the annual growth rate (8) yields 9 years for investment doubling.',
              ar: 'قسمة 72 على معدل النمو السنوي (8) تعطي 9 سنوات لمضاعفة الاستثمار.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },
    {
      id: 'sharia-screening-ethics',
      title: { en: 'AAOIFI Sharia Screening & Purification', ar: 'معايير أيوفي (AAOIFI) لفحص الأسهم والتطهير' },
      practiceLinks: [{ kind: 'quizTopic', topic: 'Sharia Compliance' }],
      lessons: [
        {
          id: 'sharia-ethics-kids',
          title: { en: 'Good Companies vs. Harmful Companies', ar: 'الشركات النافعة والشركات الضارة' },
          summary: {
            en: 'Investing means supporting businesses that build good things for people.',
            ar: 'الاستثمار يعني دعم الشركات التي تبني أشياء طيبة ومفيدة للناس.',
          },
          body: {
            en: "When we buy a share in a company, we become part of that company's story. Halal investing means choosing companies that make good, honest products—like building solar panels, producing healthy food, or constructing hospitals and schools. We avoid companies that sell harmful things like alcohol, gambling, or tobacco. Being a smart investor means aligning your money with good values!",
            ar: 'عندما نشتري سهماً في شركة، نصبح جزءاً من قصة هذه الشركة. الاستثمار الحلال يعني اختيار الشركات التي تصنع منتجات نافعة وطيبة — مثل طاقة شمسية، أو غذاء صحي، أو بناء مستشفيات ومدارس. ونتجنب الشركات التي تبيع أشياء ضارة كالكحول أو القمار أو التبغ. المستثمر الذكي يعمر الأرض بماله وينفع مجتمعه!',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'KIDS',
          contentVersion: 1,
          checkpoint: {
            id: 'sharia-ethics-kids-cp1',
            question: {
              en: 'What does Halal investing mean for kids?',
              ar: 'ماذا يعني الاستثمار الحلال للأطفال؟',
            },
            options: [
              { en: 'Choosing companies that make good, helpful products for people', ar: 'اختيار الشركات التي تصنع أشياء طيبة ونافعة للناس' },
              { en: 'Investing in any business regardless of harm', ar: 'الاستثمار في أي تجارة حتى لو كانت ضارة' },
              { en: 'Hiding money under the blanket', ar: 'إخفاء المال تحت الوسادة' },
              { en: 'Never using money again', ar: 'عدم استخدام المال أبداً' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Halal investing aligns capital with ethical activities that benefit society.',
              ar: 'الاستثمار الحلال يوجه رأس المال نحو الأنشطة الأخلاقية النافعة للمجتمع.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'sharia-screening-teens',
          title: { en: 'AAOIFI Financial Ratios & Screening Tests', ar: 'معايير أيوفي (AAOIFI) للتمحيص المالي للشركات' },
          summary: {
            en: 'Understand business activity filters and financial debt thresholds.',
            ar: 'فهم معايير الفلترة للنشاط التجاري والنسب المالية للديون الربوية.',
          },
          body: {
            en: "The Accounting and Auditing Organization for Islamic Financial Institutions (AAOIFI) sets standardized Sharia criteria for stock screening. Beyond the core activity test (excluding haram goods), companies undergo quantitative financial screening: 1) Interest-bearing debt must not exceed 33% of market cap or total assets; 2) Interest-earning cash & deposits must not exceed 33%; 3) Impermissible non-operating revenue must remain below 5%.",
            ar: 'تضع هيئة المراجعة والمحاسبة للمؤسسات المالية الإسلامية (أيوفي - AAOIFI) معايير محددة لفحص الأسهم. بعد التأكد من نقاء نشاط الشركة الرئيسي (استبعاد السلع المحرمة)، تخضع الشركة لفحص مالي كمي: 1) ألا تتجاوز الديون الربوية بفائدة 33% من القيمة السوقية أو إجمالي الأصول؛ 2) ألا تتجاوز السيولة النقدية المودعة بفائدة 33%؛ 3) ألا تتجاوز الإيرادات المحرمة العارضة 5% من إجمالي الإيرادات.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'sharia-screening-teens-cp1',
            question: {
              en: 'Under AAOIFI standards, what is the maximum allowed ratio of interest-bearing debt to market capitalization?',
              ar: 'وفق معايير أيوفي (AAOIFI)، ما هي النسبة القصوى المسموح بها للديون الربوية الفائدة مقارنة بالقيمة السوقية؟',
            },
            options: [
              { en: '33%', ar: '33%' },
              { en: '50%', ar: '50%' },
              { en: '75%', ar: '75%' },
              { en: '5%', ar: '5%' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'AAOIFI caps interest-bearing debt at 33% for Sharia compliance verification.',
              ar: 'تحدد أيوفي الحد الأقصى للديون الفائدة بنسبة 33% لقبول مطابقة السهم للشريعة.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'dividend-purification-adults',
          title: { en: 'Dividend Purification & Zakat Calculations', ar: 'تطهير أرباح الأسهم وحساب زكاة عروض التجارة' },
          summary: {
            en: 'Calculate non-compliant revenue fractions for charitable donation and compute Zakat.',
            ar: 'احتساب نسبة الإيراد غير المتوافق للتبرع بها وحساب زكاة الأسهم النامية.',
          },
          body: {
            en: "When a Sharia-compliant company earns a small fraction of incidental non-compliant revenue (e.g., 2% from bank interest on operational accounts), shareholders must 'purify' their dividends. If you receive 1,000 SAR in dividends from a company with a 2% non-compliant revenue ratio, 20 SAR must be donated to charity without intending reward (Tathir). Separately, Zakat on stocks held for capital appreciation is calculated at 2.5% on net zakatable assets.",
            ar: 'عندما تحقق شركة متوافقة نسبة عارضة صغيرة من الدخل غير المتوافق (مثل 2% فوائد نقدية تشغيلية)، يجب على المساهم "تطهير" أرباحه المزعة. فإذا استلمت 1,000 ريال أرباحاً بنسبة غير متوافقة 2%، يجب التبرع بـ 20 ريالاً في وجوه الخير بنية التخلص (تطهير). أما زكاة الأسهم المستثمرة للنمو فتُحسب بنسبة 2.5% على صافي الأصول الزكوية.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'dividend-purification-adults-cp1',
            question: {
              en: 'If a dividend payment of 5,000 SAR has a 1% non-compliant income ratio, how much must be purified/donated?',
              ar: 'إذا كان توزيع الأرباح بقيمة 5,000 ريال يحمل نسبة غير متوافقة 1%، فما المبلغ الواجب تطهيره والتبرع به؟',
            },
            options: [
              { en: '50 SAR (5,000 × 0.01)', ar: '50 ريال (5,000 × 0.01)' },
              { en: '500 SAR', ar: '500 ريال' },
              { en: '0 SAR', ar: '0 ريال' },
              { en: '2.5 SAR', ar: '2.5 ريال' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Multiply dividend amount by non-compliant revenue ratio to yield the exact purification figure.',
              ar: 'ضرب مبلغ التوزيعات في نسبة الإيراد غير المتوافق يعطي مبلغ التطهير الخالي من الشبهات.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },
    {
      id: 'asset-allocation-diversification',
      title: { en: 'Modern Asset Allocation & Sukuk Diversification', ar: 'التوزيع الاستثماري وتنويع الصكوك والأسهم' },
      practiceLinks: [{ kind: 'strategySetup', setupId: 'ts-momentum-halal-basket-v2' }],
      lessons: [
        {
          id: 'asset-allocation-adults',
          title: { en: 'Sukuk, Equities, & Real Estate REITs', ar: 'التنويع بين الصكوك، الأسهم، وصناديق ريت العقارية' },
          summary: {
            en: 'Construct multi-asset halal portfolios balancing yield and capital appreciation.',
            ar: 'بناء محفظة إسلامية متكاملة توازن بين الدخل الجاري والنمو الرأسمالي.',
          },
          body: {
            en: "Portfolio resilience comes from asset allocation rather than stock picking alone. A well-rounded Sharia-compliant portfolio blends three asset classes: 1) Halal Equities for long-term growth; 2) Sovereign/Corporate Sukuk for steady periodic income and capital stability; 3) Real Estate Investment Traded Funds (REITs) for real-asset inflation protection. Rebalancing annually returns weightings to target risk envelopes.",
            ar: 'استقرار المحفظة الاستثمارية يعتمد على التوزيع الاستراتيجي للأصول وليس فقط اختيار الأسهم. المحفظة المتوازنة الشريعة تدمج ثلاثة أصول: 1) أسهم النمو والتوزيعات؛ 2) الصكوك السيادية والاستثمارية لتحقيق دخل دوري ثابت واستقرار رأس المال؛ 3) صناديق الاستثمار العقاري المداولة (REITs) للحماية من التضخم. ويساعد إعادة التوازن السنوي في حماية المحفظة من الانكشاف المفرط للمخاطر.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'ADULTS',
          contentVersion: 1,
          checkpoint: {
            id: 'asset-allocation-adults-cp1',
            question: {
              en: 'What primary role do Sovereign Sukuk play in a multi-asset Sharia portfolio?',
              ar: 'ما هو الدور الرئيسي الذي تلعبه الصكوك السيادية في المحفظة الاستثمارية المتوافقة؟',
            },
            options: [
              { en: 'Steady periodic income and capital stability', ar: 'توفير دخل دوري ثابت واستقرار رأس المال' },
              { en: 'High speculative short-term volatility', ar: 'مضاربة عالية وتقلبات سريعة' },
              { en: 'Replacing equity growth completely', ar: 'إلغاء نمو الأسهم بالكامل' },
              { en: 'Paying non-compliant interest', ar: 'دفع فوائد غير متوافقة' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Sukuk provide asset-backed yield distributions and buffer against equity market pullbacks.',
              ar: 'توفر الصكوك عوائد مدعومة بأصول حقيقية وتعمل كحماة للمحفظة أثناء تقلبات الأسهم.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },
  ],
};
