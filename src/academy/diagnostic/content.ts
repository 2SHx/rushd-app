import type { DiagnosticQuestion } from './schema';

/**
 * Rushd Academy diagnostic questionnaire — content (DR-19).
 *
 * 7 closed, bilingual, self-assessment questions. No question asks about
 * age, income, or any other personal/identifying data — a KIDS-segment
 * child must be able to answer every question in simple language, in
 * either locale.
 */
export const diagnosticQuestions: DiagnosticQuestion[] = [
  {
    id: 'self_knowledge',
    question: {
      en: 'How much do you already know about money and investing?',
      ar: 'كم تعرف حاليًا عن المال والاستثمار؟',
    },
    options: [
      { id: 'none', label: { en: "I don't know much yet", ar: 'لا أعرف الكثير بعد' }, knowledgeWeight: 0, skillWeight: 0 },
      { id: 'basic', label: { en: 'I know a few basics', ar: 'أعرف بعض الأساسيات' }, knowledgeWeight: 1, skillWeight: 1 },
      { id: 'intermediate', label: { en: 'I understand how markets work', ar: 'أفهم كيف تعمل الأسواق' }, knowledgeWeight: 2, skillWeight: 2 },
      { id: 'advanced', label: { en: 'I already study investing in depth', ar: 'أدرس الاستثمار بعمق بالفعل' }, knowledgeWeight: 3, skillWeight: 3 },
    ],
  },
  {
    id: 'saving_experience',
    question: {
      en: 'What best describes your experience with saving or investing?',
      ar: 'ما الذي يصف تجربتك في التوفير أو الاستثمار بشكل أفضل؟',
    },
    options: [
      { id: 'never_saved', label: { en: "I haven't started saving yet", ar: 'لم أبدأ التوفير بعد' }, knowledgeWeight: 0, skillWeight: 0 },
      { id: 'save_sometimes', label: { en: 'I save money sometimes', ar: 'أوفر المال أحيانًا' }, knowledgeWeight: 1, skillWeight: 1 },
      { id: 'invest_already', label: { en: 'I already invest a little', ar: 'أستثمر قليلاً بالفعل' }, knowledgeWeight: 2, skillWeight: 2 },
      { id: 'trade_actively', label: { en: 'I actively manage a portfolio', ar: 'أدير محفظة استثمارية بنشاط' }, knowledgeWeight: 3, skillWeight: 3 },
    ],
  },
  {
    id: 'learning_goal',
    question: {
      en: 'What would you like to learn first?',
      ar: 'ما الذي تود تعلمه أولاً؟',
    },
    options: [
      { id: 'money_basics', label: { en: 'What money and saving mean', ar: 'ما معنى المال والتوفير' }, knowledgeWeight: 0, skillWeight: 0 },
      { id: 'save_for_goal', label: { en: 'How to save for a goal', ar: 'كيف أوفر لهدف معين' }, knowledgeWeight: 1, skillWeight: 1 },
      { id: 'learn_investing', label: { en: 'How investing works', ar: 'كيف يعمل الاستثمار' }, knowledgeWeight: 2, skillWeight: 2 },
      { id: 'build_strategies', label: { en: 'How to build and test strategies', ar: 'كيف أبني واختبر استراتيجيات' }, knowledgeWeight: 3, skillWeight: 3 },
    ],
  },
  {
    id: 'risk_familiarity',
    question: {
      en: 'How familiar are you with the idea of investment risk?',
      ar: 'ما مدى معرفتك بفكرة مخاطر الاستثمار؟',
    },
    options: [
      { id: 'never_heard', label: { en: "I haven't heard of it before", ar: 'لم أسمع بها من قبل' }, knowledgeWeight: 0, skillWeight: 0 },
      { id: 'risk_means_loss', label: { en: 'I know it means you could lose money', ar: 'أعرف أنها تعني احتمال خسارة المال' }, knowledgeWeight: 1, skillWeight: 1 },
      { id: 'diversification', label: { en: 'I understand spreading risk across choices', ar: 'أفهم توزيع المخاطر بين خيارات مختلفة' }, knowledgeWeight: 2, skillWeight: 2 },
      { id: 'volatility_quant', label: { en: 'I understand volatility and risk measurement', ar: 'أفهم التقلب وقياس المخاطر' }, knowledgeWeight: 3, skillWeight: 3 },
    ],
  },
  {
    id: 'practice_preference',
    question: {
      en: 'How do you like to practice new skills?',
      ar: 'كيف تحب أن تتدرب على مهارات جديدة؟',
    },
    options: [
      { id: 'games_stories', label: { en: 'Through games and stories', ar: 'من خلال الألعاب والقصص' }, knowledgeWeight: 0, skillWeight: 0 },
      { id: 'guided_lessons', label: { en: 'Through guided step-by-step lessons', ar: 'من خلال دروس موجهة خطوة بخطوة' }, knowledgeWeight: 1, skillWeight: 1 },
      { id: 'virtual_money', label: { en: 'By practicing with virtual money', ar: 'بالتدرب باستخدام أموال افتراضية' }, knowledgeWeight: 2, skillWeight: 2 },
      { id: 'build_test_strategies', label: { en: 'By building and testing my own strategies', ar: 'ببناء واختبار استراتيجياتي الخاصة' }, knowledgeWeight: 3, skillWeight: 3 },
    ],
  },
  {
    id: 'numbers_comfort',
    question: {
      en: 'How comfortable are you with numbers and percentages?',
      ar: 'ما مدى ارتياحك للتعامل مع الأرقام والنسب المئوية؟',
    },
    options: [
      { id: 'simple_numbers', label: { en: 'I like simple counting and adding', ar: 'أحب العد والجمع البسيط' }, knowledgeWeight: 0, skillWeight: 0 },
      { id: 'moderate', label: { en: 'I am okay with everyday math', ar: 'أنا مرتاح للرياضيات اليومية' }, knowledgeWeight: 1, skillWeight: 1 },
      { id: 'percentages', label: { en: 'I am comfortable with percentages', ar: 'أنا مرتاح للتعامل مع النسب المئوية' }, knowledgeWeight: 2, skillWeight: 2 },
      { id: 'charts_data', label: { en: 'I am comfortable reading charts and data', ar: 'أنا مرتاح لقراءة الرسوم البيانية والبيانات' }, knowledgeWeight: 3, skillWeight: 3 },
    ],
  },
  {
    id: 'time_commitment',
    question: {
      en: 'How much time do you want to spend learning each week?',
      ar: 'كم من الوقت تريد أن تقضيه في التعلم كل أسبوع؟',
    },
    options: [
      { id: 'a_little', label: { en: 'Just a little, for fun', ar: 'قليلاً فقط، للمتعة' }, knowledgeWeight: 0, skillWeight: 0 },
      { id: 'some', label: { en: 'Some time, a few times a week', ar: 'بعض الوقت، عدة مرات في الأسبوع' }, knowledgeWeight: 1, skillWeight: 1 },
      { id: 'a_lot', label: { en: 'A lot, I want to learn quickly', ar: 'الكثير، أريد التعلم بسرعة' }, knowledgeWeight: 2, skillWeight: 2 },
      { id: 'as_much_as_possible', label: { en: 'As much time as I can find', ar: 'أكبر وقت أستطيع تخصيصه' }, knowledgeWeight: 3, skillWeight: 3 },
    ],
  },
];
