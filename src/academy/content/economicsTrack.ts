import type { Track } from '../schema';

/**
 * Rushd Academy — Economics track (DR-17, M12-B2).
 *
 * Audience: TEENS and up. Covers how prices form, inflation and the SAR
 * peg, the Saudi/Gulf macro picture (oil, Vision 2030), central-bank
 * interest-rate policy, and trade/globalization. Per DR-5, interest-rate
 * mechanics are taught openly (never softened, never hidden) and tagged
 * HARAM, immediately paired with the Islamic-finance alternative framing
 * tagged HALAL.
 */
export const ECONOMICS_TRACK: Track = {
  id: 'economics',
  title: { en: 'Economics', ar: 'الاقتصاد' },
  minimumAgeSegment: 'TEENS',
  units: [
    {
      id: 'supply-demand',
      title: { en: 'Supply, Demand & How Prices Form', ar: 'العرض والطلب وكيف تتشكل الأسعار' },
      practiceLinks: [{ kind: 'quizTopic', topic: 'TASI Markets' }],
      lessons: [
        {
          id: 'econ-u1-demand',
          title: { en: 'What Is Demand?', ar: 'ما هو الطلب؟' },
          summary: {
            en: 'How much buyers want at each price, and why demand curves slope down.',
            ar: 'كم يرغب المشترون بشرائه عند كل سعر، ولماذا ينحدر منحنى الطلب نحو الأسفل.',
          },
          body: {
            en: 'Demand is how much of a good or service people are willing and able to buy at a given price, over a given time. As price falls, buyers usually want more — this is the law of demand. A shift in income, taste, or the price of a substitute (like moving from dates imported abroad to local dates) can shift the whole demand curve, not just move along it.',
            ar: 'الطلب هو الكمية التي يرغب الناس ويقدرون على شرائها من سلعة أو خدمة عند سعر معين، خلال فترة زمنية معينة. عندما ينخفض السعر، يرغب المشترون عادة في شراء كمية أكبر — وهذا ما يسمى قانون الطلب. أي تغيّر في الدخل أو الذوق أو سعر سلعة بديلة (كالتحول من التمر المستورد إلى التمر المحلي) يمكن أن يحرّك منحنى الطلب بأكمله، لا مجرد نقطة عليه.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u1-demand-cp',
            question: {
              en: 'According to the law of demand, when the price of a good falls, quantity demanded usually:',
              ar: 'بحسب قانون الطلب، عندما ينخفض سعر سلعة ما، فإن الكمية المطلوبة عادة:',
            },
            options: [
              { en: 'Rises', ar: 'ترتفع' },
              { en: 'Falls', ar: 'تنخفض' },
              { en: 'Stays exactly the same', ar: 'تبقى كما هي تماماً' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Lower prices make a good more attractive relative to alternatives, so buyers typically want more of it.',
              ar: 'انخفاض السعر يجعل السلعة أكثر جاذبية مقارنة بالبدائل، لذلك يرغب المشترون عادة في كمية أكبر منها.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'econ-u1-supply',
          title: { en: 'What Is Supply and Market Equilibrium?', ar: 'ما هو العرض وما هو توازن السوق؟' },
          summary: {
            en: 'How much sellers offer at each price, and where supply meets demand.',
            ar: 'كم يعرض البائعون عند كل سعر، وأين يلتقي العرض بالطلب.',
          },
          body: {
            en: 'Supply is how much of a good producers are willing to sell at a given price. Supply curves usually slope up: higher prices make production more worthwhile. Equilibrium is the single price where the quantity buyers want equals the quantity sellers offer — no shortage, no surplus. Real markets rarely sit still at equilibrium; they move toward it as new information (a harvest, a factory outage, a subsidy) shifts one curve or the other.',
            ar: 'العرض هو الكمية التي يرغب المنتجون في بيعها عند سعر معين. عادة ما ينحدر منحنى العرض إلى الأعلى: فارتفاع السعر يجعل الإنتاج أكثر جدوى. التوازن هو السعر الوحيد الذي تتساوى عنده الكمية التي يرغب المشترون بشرائها مع الكمية التي يعرضها البائعون — لا نقص ولا فائض. نادراً ما تستقر الأسواق الحقيقية عند نقطة التوازن؛ فهي تتحرك نحوها كلما ظهرت معلومة جديدة (موسم حصاد، توقف مصنع، دعم حكومي) تحرّك أحد المنحنيين.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u1-supply-cp',
            question: {
              en: 'Market equilibrium is the price at which:',
              ar: 'توازن السوق هو السعر الذي عنده:',
            },
            options: [
              { en: 'Quantity supplied equals quantity demanded', ar: 'تتساوى الكمية المعروضة مع الكمية المطلوبة' },
              { en: 'The government sets a fixed cap', ar: 'تحدد الحكومة سقفاً ثابتاً' },
              { en: 'Sellers always make maximum profit', ar: 'يحقق البائعون دائماً أقصى ربح' },
              { en: 'Demand disappears', ar: 'يختفي الطلب' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Equilibrium is defined purely by supply meeting demand — no shortage, no surplus at that price.',
              ar: 'التوازن يُعرَّف فقط بتلاقي العرض مع الطلب — لا نقص ولا فائض عند ذلك السعر.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'econ-u1-shifts',
          title: { en: 'Shifts in Supply & Demand: Oil Price Shocks', ar: 'تحركات العرض والطلب: صدمات أسعار النفط' },
          summary: {
            en: 'Why a supply shock (like an oil disruption) moves prices without demand changing at all.',
            ar: 'لماذا تحرّك صدمة العرض (كاضطراب في إمدادات النفط) الأسعار دون أي تغيّر في الطلب.',
          },
          body: {
            en: 'A supply shock happens when producers can suddenly supply more or less at every price — an oil-field outage, an OPEC+ production cut, or a new pipeline. If supply drops while demand is unchanged, the whole supply curve shifts left and the equilibrium price rises. This is exactly why Gulf economies watch OPEC+ decisions so closely: the shift is on the supply side, not because people suddenly want more energy.',
            ar: 'تحدث صدمة العرض عندما يصبح بمقدور المنتجين تقديم كمية أكبر أو أقل فجأة عند كل سعر — كتوقف حقل نفطي، أو خفض إنتاج من أوبك+، أو خط أنابيب جديد. فإذا انخفض العرض بينما بقي الطلب دون تغيير، ينزاح منحنى العرض بأكمله إلى اليسار ويرتفع سعر التوازن. لهذا السبب تراقب اقتصادات الخليج قرارات أوبك+ عن كثب: فالتحرك يأتي من جانب العرض، لا لأن الناس فجأة أرادوا طاقة أكثر.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u1-shifts-cp',
            question: {
              en: 'An OPEC+ production cut, with demand unchanged, is best described as a shift in:',
              ar: 'خفض إنتاج من أوبك+، مع بقاء الطلب دون تغيير، يوصف بأنه تحرك في:',
            },
            options: [
              { en: 'Demand only', ar: 'الطلب فقط' },
              { en: 'Supply, which raises the equilibrium price', ar: 'العرض، مما يرفع سعر التوازن' },
              { en: 'Neither curve', ar: 'لا هذا ولا ذاك' },
            ],
            correctOptionIndex: 1,
            explanation: {
              en: 'Producers offering less at every price is a leftward supply shift; with demand steady, equilibrium price rises.',
              ar: 'عرض المنتجين كمية أقل عند كل سعر هو انزياح في العرض نحو اليسار؛ ومع ثبات الطلب يرتفع سعر التوازن.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },
    {
      id: 'inflation-purchasing-power',
      title: { en: 'Inflation & Purchasing Power', ar: 'التضخم والقوة الشرائية' },
      practiceLinks: [{ kind: 'quizTopic', topic: 'Savings & Jars' }],
      lessons: [
        {
          id: 'econ-u2-inflation-basics',
          title: { en: 'What Is Inflation?', ar: 'ما هو التضخم؟' },
          summary: {
            en: 'A sustained rise in the general price level, and why 1-2% inflation feels different from 10%.',
            ar: 'ارتفاع مستمر في المستوى العام للأسعار، ولماذا يختلف شعورنا بتضخم 1-2% عن تضخم 10%.',
          },
          body: {
            en: 'Inflation is a sustained rise in the average price level across an economy, usually measured by a Consumer Price Index (CPI) basket of everyday goods. Mild inflation (a couple of percent a year) is normal in a growing economy; high inflation erodes what your money can buy far faster than most people notice month to month. Inflation is not the same as one product getting pricier — it is a broad, economy-wide drift.',
            ar: 'التضخم هو ارتفاع مستمر في متوسط مستوى الأسعار في الاقتصاد، يُقاس عادة بمؤشر أسعار المستهلك (CPI) لسلة من السلع اليومية. التضخم المعتدل (بضع نقاط مئوية سنوياً) أمر طبيعي في اقتصاد ينمو؛ أما التضخم المرتفع فيقلّص ما يمكن أن يشتريه مالك أسرع بكثير مما يلاحظه معظم الناس شهرياً. التضخم ليس مجرد ارتفاع سعر سلعة واحدة — بل انزلاق واسع يشمل الاقتصاد كله.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u2-inflation-basics-cp',
            question: {
              en: 'Inflation is best described as:',
              ar: 'أفضل وصف للتضخم هو:',
            },
            options: [
              { en: 'A sustained rise in the general price level', ar: 'ارتفاع مستمر في المستوى العام للأسعار' },
              { en: 'One store raising one price', ar: 'قيام متجر واحد برفع سعر منتج واحد' },
              { en: 'A stock market crash', ar: 'انهيار في سوق الأسهم' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'A single price change is not inflation; inflation is a broad, economy-wide, sustained rise in prices.',
              ar: 'تغيّر سعر واحد ليس تضخماً؛ التضخم هو ارتفاع واسع ومستمر يشمل الاقتصاد كله.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'econ-u2-purchasing-power',
          title: { en: 'Purchasing Power and the SAR Peg', ar: 'القوة الشرائية وربط الريال بالدولار' },
          summary: {
            en: 'Why the Saudi Riyal has been pegged to the US Dollar at 3.75, and what that means for prices.',
            ar: 'لماذا ثُبِّت الريال السعودي مقابل الدولار الأمريكي عند 3.75، وماذا يعني ذلك بالنسبة للأسعار.',
          },
          body: {
            en: 'Purchasing power is what a unit of money can actually buy — inflation erodes it even if the number in your account stays the same. The Saudi Riyal has been pegged at 3.75 SAR per US Dollar since 1986, which anchors imported-goods prices and gives businesses currency stability, but it also means Saudi inflation tracks US monetary policy more closely than an economy with a floating currency would. This link is a real design choice with real trade-offs, not a footnote.',
            ar: 'القوة الشرائية هي ما يمكن لوحدة النقد أن تشتريه فعلياً — والتضخم يقلّصها حتى لو بقي الرقم في حسابك دون تغيير. تم تثبيت الريال السعودي عند 3.75 ريال لكل دولار أمريكي منذ عام 1986، وهو ما يثبّت أسعار السلع المستوردة ويمنح الشركات استقراراً في العملة، لكنه يعني أيضاً أن التضخم في السعودية يتبع السياسة النقدية الأمريكية بشكل أوثق مما لو كانت العملة عائمة. هذا الربط خيار تصميمي حقيقي له مقايضات حقيقية، وليس مجرد تفصيل هامشي.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u2-purchasing-power-cp',
            question: {
              en: 'The Saudi Riyal is pegged to the US Dollar at approximately:',
              ar: 'الريال السعودي مربوط بالدولار الأمريكي عند نحو:',
            },
            options: [
              { en: '3.75 SAR per USD', ar: '3.75 ريال لكل دولار' },
              { en: '1.00 SAR per USD', ar: '1.00 ريال لكل دولار' },
              { en: '10.00 SAR per USD', ar: '10.00 ريال لكل دولار' },
              { en: 'It floats freely with no peg', ar: 'يتحرك بحرية دون أي ربط' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'The Saudi Riyal has been pegged at 3.75 SAR per USD since 1986.',
              ar: 'الريال السعودي مثبّت عند 3.75 ريال لكل دولار منذ عام 1986.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'econ-u2-inflation-saving',
          title: { en: 'Protecting Savings from Inflation', ar: 'حماية المدخرات من التضخم' },
          summary: {
            en: 'Why cash sitting idle loses real value, and how this connects to the family savings jars.',
            ar: 'لماذا تفقد النقود الخاملة قيمتها الحقيقية، وكيف يرتبط ذلك بحصالات الادخار العائلية.',
          },
          body: {
            en: 'If prices rise 3% a year and your savings earn 0%, your money buys 3% less each year — this is the "silent tax" of inflation. This is one reason families set savings goals with jars: a target amount today needs a plan, because the same nominal amount will not stretch as far tomorrow. Later in this track (and in the Foundations Islamic-finance units) you will meet Sharia-compliant ways to grow savings without using interest.',
            ar: 'إذا ارتفعت الأسعار بنسبة 3% سنوياً بينما لم تحقق مدخراتك أي عائد، فإن قوتها الشرائية تنخفض 3% كل سنة — وهذا ما يُعرف بـ"الضريبة الصامتة" للتضخم. لهذا السبب تضع الأسر أهدافاً للادخار عبر الحصالات: فالمبلغ المستهدف اليوم يحتاج إلى خطة، لأن المبلغ الاسمي نفسه لن يكفي بالقدر ذاته غداً. لاحقاً في هذا المسار (وفي وحدات التمويل الإسلامي في مسار الأساسيات) ستتعرف على طرق متوافقة مع الشريعة لتنمية المدخرات دون استخدام الفائدة.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u2-inflation-saving-cp',
            question: {
              en: 'If prices rise 3% a year and idle savings earn nothing, the real purchasing power of those savings:',
              ar: 'إذا ارتفعت الأسعار 3% سنوياً بينما لا تحقق المدخرات الخاملة أي عائد، فإن القوة الشرائية الحقيقية لتلك المدخرات:',
            },
            options: [
              { en: 'Falls over time', ar: 'تنخفض مع الوقت' },
              { en: 'Rises automatically', ar: 'ترتفع تلقائياً' },
              { en: 'Stays exactly the same', ar: 'تبقى كما هي تماماً' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Idle cash earning 0% against 3% inflation loses about 3% of its buying power each year.',
              ar: 'النقد الخامل الذي لا يحقق عائداً في مواجهة تضخم 3% يفقد نحو 3% من قوته الشرائية كل سنة.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },
    {
      id: 'gdp-oil-saudi-economy',
      title: { en: 'GDP, Oil & the Saudi Economy', ar: 'الناتج المحلي والنفط والاقتصاد السعودي' },
      practiceLinks: [{ kind: 'quizTopic', topic: 'TASI Markets' }],
      lessons: [
        {
          id: 'econ-u3-gdp',
          title: { en: 'What Is GDP?', ar: 'ما هو الناتج المحلي الإجمالي؟' },
          summary: {
            en: 'How economists measure the size of a whole economy in one number.',
            ar: 'كيف يقيس الاقتصاديون حجم اقتصاد كامل برقم واحد.',
          },
          body: {
            en: 'Gross Domestic Product (GDP) is the total value of all final goods and services produced within a country in a given period. Growth in real GDP (adjusted for inflation) is the standard shorthand for "the economy is expanding," but GDP does not directly measure well-being, inequality, or environmental cost — it is one useful number among several a policymaker should look at, not the whole story.',
            ar: 'الناتج المحلي الإجمالي (GDP) هو القيمة الإجمالية لجميع السلع والخدمات النهائية المُنتَجة داخل بلد ما خلال فترة معينة. يُستخدم نمو الناتج المحلي الحقيقي (بعد تعديله بالتضخم) عادة كاختصار لعبارة "الاقتصاد يتوسع"، لكن الناتج المحلي لا يقيس مباشرة الرفاه أو التفاوت أو الكلفة البيئية — فهو رقم مفيد واحد من ضمن عدة أرقام يجب أن ينظر إليها صانع القرار، لا القصة كاملة.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u3-gdp-cp',
            question: {
              en: 'GDP measures:',
              ar: 'يقيس الناتج المحلي الإجمالي:',
            },
            options: [
              { en: 'The total value of final goods and services produced in a country', ar: 'القيمة الإجمالية للسلع والخدمات النهائية المنتجة في بلد ما' },
              { en: 'The stock market index level', ar: 'مستوى مؤشر سوق الأسهم' },
              { en: 'The exchange rate', ar: 'سعر الصرف' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'GDP is a production measure — the value of everything final produced within a country in a period.',
              ar: 'الناتج المحلي هو مقياس إنتاج — قيمة كل ما أُنتج نهائياً داخل بلد خلال فترة.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'econ-u3-oil',
          title: { en: 'Oil, Revenue, and the Saudi Economy', ar: 'النفط والإيرادات والاقتصاد السعودي' },
          summary: {
            en: 'Why oil revenue has historically driven Saudi government spending and TASI sentiment.',
            ar: 'لماذا كانت إيرادات النفط تاريخياً محركاً للإنفاق الحكومي السعودي ولمعنويات سوق تاسي.',
          },
          body: {
            en: 'For decades, oil exports have been the largest single source of Saudi government revenue, which historically linked government budgets — and by extension listed-sector spending — closely to the oil price cycle. When oil prices fall, government spending plans and investor sentiment on TASI often react, because so much of the non-oil economy has ultimately depended on oil-funded public spending. Understanding this link is essential to reading Saudi macro news honestly.',
            ar: 'لعقود، كانت صادرات النفط أكبر مصدر منفرد لإيرادات الحكومة السعودية، وهو ما ربط تاريخياً ميزانيات الحكومة — وبالتالي إنفاق القطاعات المدرجة — ارتباطاً وثيقاً بدورة أسعار النفط. فعندما تنخفض أسعار النفط، غالباً ما تتأثر خطط الإنفاق الحكومي ومعنويات المستثمرين في سوق تاسي، لأن جزءاً كبيراً من الاقتصاد غير النفطي اعتمد في النهاية على الإنفاق العام الممول من النفط. فهم هذا الرابط ضروري لقراءة الأخبار الاقتصادية السعودية بصدق.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u3-oil-cp',
            question: {
              en: 'Historically, a large drop in oil prices has tended to affect the Saudi economy because:',
              ar: 'تاريخياً، اتجه انخفاض كبير في أسعار النفط للتأثير على الاقتصاد السعودي لأن:',
            },
            options: [
              { en: 'Oil revenue has been a major source of government spending', ar: 'إيرادات النفط كانت مصدراً رئيسياً للإنفاق الحكومي' },
              { en: 'Oil prices have no connection to government budgets', ar: 'أسعار النفط لا علاقة لها بالميزانيات الحكومية' },
              { en: 'TASI only lists oil companies', ar: 'سوق تاسي لا يضم سوى شركات نفطية' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Oil revenue has historically funded a large share of government spending, linking the oil cycle to the broader economy.',
              ar: 'إيرادات النفط مولت تاريخياً جزءاً كبيراً من الإنفاق الحكومي، ما ربط دورة النفط بالاقتصاد الأوسع.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'econ-u3-vision2030',
          title: { en: 'Vision 2030 and Economic Diversification', ar: 'رؤية 2030 والتنويع الاقتصادي' },
          summary: {
            en: 'Why Saudi Arabia is investing to reduce dependence on oil revenue.',
            ar: 'لماذا تستثمر المملكة العربية السعودية لتقليل الاعتماد على إيرادات النفط.',
          },
          body: {
            en: 'Vision 2030 is Saudi Arabia\'s long-term plan to diversify the economy away from oil dependence, growing sectors like tourism, entertainment, technology, and manufacturing, and deepening capital markets like TASI. Diversification is a multi-decade project, not a single policy switch — it shows up gradually in GDP composition, non-oil revenue share, and the sector mix of newly listed companies, which is exactly the kind of macro context worth checking before reading any single TASI move as "the whole economy."',
            ar: 'رؤية 2030 هي خطة المملكة العربية السعودية طويلة المدى لتنويع الاقتصاد بعيداً عن الاعتماد على النفط، عبر تنمية قطاعات مثل السياحة والترفيه والتقنية والصناعة، وتعميق أسواق رأس المال مثل سوق تاسي. التنويع مشروع يمتد لعقود، وليس تحولاً في سياسة واحدة — يظهر تدريجياً في تركيبة الناتج المحلي، وحصة الإيرادات غير النفطية، ومزيج القطاعات للشركات المدرجة حديثاً، وهذا بالضبط السياق الاقتصادي الذي يستحق التحقق منه قبل تفسير أي تحرك واحد في سوق تاسي على أنه "الاقتصاد بأكمله".',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u3-vision2030-cp',
            question: {
              en: 'Vision 2030\'s core economic goal is best described as:',
              ar: 'أفضل وصف للهدف الاقتصادي الجوهري لرؤية 2030 هو:',
            },
            options: [
              { en: 'Diversifying the economy away from oil dependence', ar: 'تنويع الاقتصاد بعيداً عن الاعتماد على النفط' },
              { en: 'Ending all oil exports immediately', ar: 'إنهاء جميع صادرات النفط فوراً' },
              { en: 'Fixing the exchange rate for the first time', ar: 'تثبيت سعر الصرف لأول مرة' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Vision 2030 is a multi-decade diversification plan, not an immediate end to oil exports or a first-time currency peg.',
              ar: 'رؤية 2030 خطة تنويع تمتد لعقود، وليست إنهاءً فورياً لصادرات النفط أو تثبيتاً أول مرة لسعر الصرف.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },
    {
      id: 'central-banks-interest-policy',
      title: { en: 'Central Banks & Interest-Rate Policy', ar: 'البنوك المركزية وسياسة أسعار الفائدة' },
      practiceLinks: [
        { kind: 'quizTopic', topic: 'Compound Interest' },
        { kind: 'quizTopic', topic: 'Sharia Compliance' },
      ],
      lessons: [
        {
          id: 'econ-u4-central-banks',
          title: { en: 'What Central Banks Do', ar: 'ماذا تفعل البنوك المركزية؟' },
          summary: {
            en: 'The Saudi Central Bank (SAMA), the US Federal Reserve, and why the peg links their decisions.',
            ar: 'البنك المركزي السعودي (ساما)، ومجلس الاحتياطي الفيدرالي الأمريكي، ولماذا يربط ربط الريال بالدولار قراراتهما.',
          },
          body: {
            en: 'A central bank (SAMA in Saudi Arabia, the Federal Reserve in the US) manages a currency, oversees banks, and sets short-term interest-rate policy to influence borrowing, spending, and inflation. Because the Saudi Riyal is pegged to the US Dollar, SAMA closely tracks the Federal Reserve\'s rate moves to defend the peg — this is a structural, openly documented feature of the Saudi monetary system, not a coincidence.',
            ar: 'يدير البنك المركزي (ساما في السعودية، ومجلس الاحتياطي الفيدرالي في الولايات المتحدة) العملة، ويشرف على البنوك، ويحدد سياسة أسعار الفائدة قصيرة المدى للتأثير على الاقتراض والإنفاق والتضخم. ولأن الريال السعودي مربوط بالدولار الأمريكي، يتابع ساما عن كثب تحركات أسعار الفائدة لمجلس الاحتياطي الفيدرالي للحفاظ على الربط — وهذه سمة هيكلية موثقة علناً في النظام النقدي السعودي، لا مجرد صدفة.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u4-central-banks-cp',
            question: {
              en: 'Why does SAMA closely track US Federal Reserve rate decisions?',
              ar: 'لماذا يتابع ساما بشكل وثيق قرارات أسعار الفائدة لمجلس الاحتياطي الفيدرالي الأمريكي؟',
            },
            options: [
              { en: 'To help defend the SAR-USD peg', ar: 'للمساعدة في الحفاظ على ربط الريال بالدولار' },
              { en: 'Because Saudi Arabia uses the US Dollar as its only currency', ar: 'لأن السعودية تستخدم الدولار الأمريكي كعملتها الوحيدة' },
              { en: 'It is unrelated to the peg', ar: 'الأمر لا علاقة له بالربط' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'The fixed SAR-USD peg means SAMA policy tracks the Fed closely to keep the exchange rate stable.',
              ar: 'الربط الثابت بين الريال والدولار يعني أن سياسة ساما تتبع الاحتياطي الفيدرالي عن كثب للحفاظ على استقرار سعر الصرف.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'econ-u4-interest-rates',
          title: { en: 'How Interest-Rate Policy Works', ar: 'كيف تعمل سياسة أسعار الفائدة؟' },
          summary: {
            en: 'The mechanics of raising and cutting rates — taught openly because DR-5 requires it, always labeled.',
            ar: 'آلية رفع وخفض أسعار الفائدة — تُدرَّس علناً لأن مبدأ DR-5 يقتضي ذلك، مع وضع علامة دائمة على عدم التوافق الشرعي.',
          },
          body: {
            en: 'Conventional interest-rate policy works by making borrowing more or less expensive: a central bank raises its policy rate to cool an overheated, inflating economy (borrowing costs more, spending slows), and cuts it to stimulate a weak one. This is riba-based finance mechanics, and this lesson exists ONLY to explain how it works so you can recognize it in the news and in products — it is not a recommendation to use interest-bearing accounts or loans. Rushd\'s own savings and simulated-trading features never use interest.',
            ar: 'تعمل سياسة أسعار الفائدة التقليدية عبر جعل الاقتراض أكثر أو أقل تكلفة: يرفع البنك المركزي سعر الفائدة الرسمي لتهدئة اقتصاد متضخم ومحموم (فيصبح الاقتراض أعلى تكلفة ويتباطأ الإنفاق)، ويخفضه لتحفيز اقتصاد ضعيف. هذه آلية تمويل قائمة على الربا، وهذا الدرس موجود فقط لشرح كيفية عملها حتى تتمكن من التعرف عليها في الأخبار وفي المنتجات المالية — وهو ليس توصية باستخدام حسابات أو قروض قائمة على الفائدة. ميزات الادخار والتداول التجريبي في رُشد لا تستخدم الفائدة أبداً.',
          },
          complianceTag: 'HARAM',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u4-interest-rates-cp',
            question: {
              en: 'When a central bank raises its policy interest rate, borrowing typically becomes:',
              ar: 'عندما يرفع البنك المركزي سعر الفائدة الرسمي، يصبح الاقتراض عادة:',
            },
            options: [
              { en: 'More expensive, which tends to slow spending', ar: 'أكثر تكلفة، وهو ما يميل إلى إبطاء الإنفاق' },
              { en: 'Free of charge', ar: 'مجانياً تماماً' },
              { en: 'Unaffected', ar: 'دون أي تأثير' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Raising the policy rate raises the cost of borrowing throughout the economy, which is the mechanism used to cool inflation.',
              ar: 'رفع سعر الفائدة الرسمي يرفع تكلفة الاقتراض في الاقتصاد ككل، وهذه هي الآلية المستخدمة لتهدئة التضخم.',
            },
            complianceTag: 'HARAM',
          },
        },
        {
          id: 'econ-u4-islamic-alternative',
          title: { en: 'The Islamic Finance Alternative: Mudarabah & Murabaha', ar: 'البديل التمويلي الإسلامي: المضاربة والمرابحة' },
          summary: {
            en: 'How profit-sharing and cost-plus-sale structures achieve similar goals without interest.',
            ar: 'كيف تحقق هياكل المشاركة في الربح والبيع بالتكلفة زائد هامش أهدافاً مشابهة دون فائدة.',
          },
          body: {
            en: 'Islamic finance replaces interest with risk-sharing and asset-backed structures: in a Mudarabah, one party provides capital and another provides effort, and both share agreed profit ratios (and the capital provider bears loss, since profit without risk is the concern with riba); in a Murabaha, a financier buys an asset and resells it to the customer at a transparent, disclosed markup, paid over time. Both are real, widely used AAOIFI-standard structures — not marketing labels on the same interest mechanics.',
            ar: 'يستبدل التمويل الإسلامي الفائدة بهياكل قائمة على تقاسم المخاطر والأصول: ففي المضاربة، يقدم طرف رأس المال ويقدم الآخر الجهد، ويتقاسمان نسب ربح متفق عليها (ويتحمل مقدّم رأس المال الخسارة، لأن الربح دون مخاطرة هو جوهر إشكالية الربا)؛ وفي المرابحة، يشتري الممول أصلاً ثم يعيد بيعه للعميل بهامش ربح واضح ومُعلَن، يُسدَّد على دفعات. كلاهما هيكلان حقيقيان معتمدان على معايير هيئة المحاسبة والمراجعة للمؤسسات المالية الإسلامية (AAOIFI) وليسا مجرد تسميات تسويقية لآلية الفائدة ذاتها.',
          },
          complianceTag: 'HALAL',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u4-islamic-alternative-cp',
            question: {
              en: 'In a Mudarabah contract, who bears a financial loss if the venture loses money (absent misconduct)?',
              ar: 'في عقد المضاربة، من يتحمل الخسارة المالية إذا خسر المشروع (في حال عدم وجود تقصير)؟',
            },
            options: [
              { en: 'The capital provider (rabb al-mal)', ar: 'مقدّم رأس المال (رب المال)' },
              { en: 'The party providing effort/management only', ar: 'الطرف الذي يقدم الجهد/الإدارة فقط' },
              { en: 'Neither party — losses are impossible', ar: 'لا هذا ولا ذاك — الخسارة مستحيلة' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'The capital provider bears financial loss (absent misconduct by the manager), which is exactly the risk-sharing that distinguishes Mudarabah from interest-based lending.',
              ar: 'يتحمل مقدّم رأس المال الخسارة المالية (في حال عدم وجود تقصير من المدير)، وهذا بالضبط ما يميّز المضاربة عن الإقراض القائم على الفائدة من حيث تقاسم المخاطر.',
            },
            complianceTag: 'HALAL',
          },
        },
      ],
    },
    {
      id: 'trade-globalization',
      title: { en: 'Trade & Globalization', ar: 'التجارة والعولمة' },
      practiceLinks: [{ kind: 'quizTopic', topic: 'NASDAQ Markets' }],
      lessons: [
        {
          id: 'econ-u5-trade',
          title: { en: 'Why Countries Trade: Comparative Advantage', ar: 'لماذا تتاجر الدول: الميزة النسبية' },
          summary: {
            en: 'Why it can pay for a country to specialize and trade, even if it is worse at everything.',
            ar: 'لماذا قد يكون من المفيد لدولة أن تتخصص وتتاجر، حتى لو كانت أقل كفاءة في كل شيء.',
          },
          body: {
            en: 'Comparative advantage means a country should specialize in producing what it gives up the least to make, relative to its other options, and trade for the rest — even if another country could produce everything more efficiently in absolute terms. This is why small, specialized economies can still benefit enormously from trade, and why Gulf states import many manufactured goods while exporting energy and, increasingly, services and tourism.',
            ar: 'تعني الميزة النسبية أن على الدولة أن تتخصص في إنتاج ما تتنازل عنه أقل تكلفة، مقارنة بخياراتها الأخرى، وأن تتاجر للحصول على الباقي — حتى لو كانت دولة أخرى قادرة على إنتاج كل شيء بكفاءة مطلقة أعلى. لهذا يمكن للاقتصادات الصغيرة والمتخصصة أن تستفيد استفادة هائلة من التجارة، ولهذا تستورد دول الخليج الكثير من السلع المصنّعة بينما تصدّر الطاقة، وبشكل متزايد الخدمات والسياحة.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u5-trade-cp',
            question: {
              en: 'Comparative advantage explains why trade can benefit a country even when:',
              ar: 'الميزة النسبية تفسر لماذا يمكن للتجارة أن تفيد دولة حتى عندما:',
            },
            options: [
              { en: 'Another country can produce everything more efficiently in absolute terms', ar: 'تكون دولة أخرى قادرة على إنتاج كل شيء بكفاءة مطلقة أعلى' },
              { en: 'The country has no natural resources at all', ar: 'لا تملك الدولة أي موارد طبيعية على الإطلاق' },
              { en: 'Trade is banned', ar: 'تكون التجارة محظورة' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Comparative (not absolute) advantage is what makes specialization and trade mutually beneficial.',
              ar: 'الميزة النسبية (وليست المطلقة) هي ما يجعل التخصص والتجارة مفيدين للطرفين.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'econ-u5-exchange-rates',
          title: { en: 'Exchange Rates and the Dollar-Peg System', ar: 'أسعار الصرف ونظام الربط بالدولار' },
          summary: {
            en: 'How fixed vs. floating exchange rates affect the cost of imports and exports.',
            ar: 'كيف تؤثر أسعار الصرف الثابتة مقابل العائمة على تكلفة الواردات والصادرات.',
          },
          body: {
            en: 'An exchange rate is the price of one currency in terms of another. Fixed regimes (like the SAR-USD peg) trade away independent monetary policy for currency stability and predictable import/export pricing; floating regimes let the currency absorb economic shocks but add exchange-rate uncertainty for importers and exporters. Neither is universally "better" — they are different trade-offs for different economic structures.',
            ar: 'سعر الصرف هو سعر عملة معبراً عنه بعملة أخرى. تتنازل الأنظمة الثابتة (كربط الريال بالدولار) عن استقلالية السياسة النقدية مقابل استقرار العملة وقدرة على التنبؤ بأسعار الواردات والصادرات؛ بينما تتيح الأنظمة العائمة للعملة امتصاص الصدمات الاقتصادية لكنها تضيف عدم يقين في سعر الصرف للمستوردين والمصدّرين. لا يوجد نظام "أفضل" على الإطلاق — بل هي مقايضات مختلفة لهياكل اقتصادية مختلفة.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u5-exchange-rates-cp',
            question: {
              en: 'A fixed exchange-rate regime like the SAR-USD peg mainly trades away:',
              ar: 'نظام سعر الصرف الثابت مثل ربط الريال بالدولار يتنازل بشكل أساسي عن:',
            },
            options: [
              { en: 'Independent monetary policy, in exchange for currency stability', ar: 'استقلالية السياسة النقدية، مقابل استقرار العملة' },
              { en: 'All foreign trade', ar: 'كل التجارة الخارجية' },
              { en: 'The ability to have a central bank', ar: 'القدرة على وجود بنك مركزي' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'A currency peg anchors exchange-rate stability at the cost of following the anchor currency\'s monetary policy closely.',
              ar: 'ربط العملة يثبّت استقرار سعر الصرف مقابل اتباع السياسة النقدية لعملة الربط عن كثب.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
        {
          id: 'econ-u5-globalization',
          title: { en: 'Globalization and Gulf Economic Diversification', ar: 'العولمة والتنويع الاقتصادي الخليجي' },
          summary: {
            en: 'How global capital flows and trade agreements connect to the Vision 2030 diversification push.',
            ar: 'كيف ترتبط تدفقات رأس المال العالمية واتفاقيات التجارة بدفع التنويع الاقتصادي في رؤية 2030.',
          },
          body: {
            en: 'Globalization is the growing economic interdependence of countries through trade, capital flows, and shared standards. For Gulf economies, deeper integration into global capital markets (foreign listings on TASI, sovereign wealth fund investment abroad, tourism visas) is a deliberate diversification tool, not a side effect — it is one of the mechanisms Vision 2030 leans on to reduce oil-revenue dependence over time.',
            ar: 'العولمة هي الترابط الاقتصادي المتنامي بين الدول عبر التجارة وتدفقات رأس المال والمعايير المشتركة. بالنسبة لاقتصادات الخليج، فإن الاندماج الأعمق في أسواق رأس المال العالمية (الإدراجات الأجنبية في تاسي، استثمارات صناديق الثروة السيادية في الخارج، تأشيرات السياحة) أداة تنويع متعمدة، لا أثراً جانبياً — وهي إحدى الآليات التي تعتمد عليها رؤية 2030 لتقليل الاعتماد على إيرادات النفط بمرور الوقت.',
          },
          complianceTag: 'EDUCATIONAL_ONLY',
          ageSegment: 'TEENS',
          contentVersion: 1,
          checkpoint: {
            id: 'econ-u5-globalization-cp',
            question: {
              en: 'Deeper integration into global capital markets is, for Gulf economies:',
              ar: 'الاندماج الأعمق في أسواق رأس المال العالمية يُعد، بالنسبة لاقتصادات الخليج:',
            },
            options: [
              { en: 'A deliberate diversification tool tied to Vision 2030', ar: 'أداة تنويع متعمدة مرتبطة برؤية 2030' },
              { en: 'Legally impossible', ar: 'أمراً مستحيلاً قانونياً' },
              { en: 'Unrelated to oil-revenue dependence', ar: 'غير مرتبط بالاعتماد على إيرادات النفط' },
            ],
            correctOptionIndex: 0,
            explanation: {
              en: 'Global capital-market integration is a deliberate Vision 2030 mechanism for reducing oil-revenue dependence.',
              ar: 'الاندماج في أسواق رأس المال العالمية آلية متعمدة ضمن رؤية 2030 لتقليل الاعتماد على إيرادات النفط.',
            },
            complianceTag: 'EDUCATIONAL_ONLY',
          },
        },
      ],
    },
  ],
};
