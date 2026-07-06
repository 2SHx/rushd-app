// src/app/[locale]/page.tsx
import Link from 'next/link';
import { Shield, BookOpen, TrendingUp, Users, ArrowRight } from 'lucide-react';

export default function Home({ params }: { params: { locale: string } }) {
  const locale = params.locale === 'en' ? 'en' : 'ar';
  const isAr = locale === 'ar';

  const content = {
    title: isAr ? 'رشد المالية' : 'Rushd Financial',
    subtitle: isAr 
      ? 'منصة تدريب محاكاة الاستثمار المالي المتوافقة مع الشريعة الإسلامية للعائلات والشباب' 
      : 'Sharia-compliant financial investment simulator and neobanking for families',
    heroButtonRegister: isAr ? 'ابدأ الآن كولي أمر' : 'Start Now as Parent',
    heroButtonLogin: isAr ? 'تسجيل الدخول' : 'Log In',
    feature1Title: isAr ? 'محاكاة تاسي وناسداك' : 'TASI & NASDAQ Simulator',
    feature1Desc: isAr 
      ? 'تداول الأسهم الافتراضية بأسعار السوق الحقيقية بالريال السعودي والدولار الأمريكي.' 
      : 'Practice trading real stocks with simulated funds in SAR and USD.',
    feature2Title: isAr ? 'متوافق مع الشريعة' : 'Sharia Screener',
    feature2Desc: isAr 
      ? 'الفرز التلقائي للأسهم وفقًا لمعايير AAOIFI مع قيود صارمة على تداول الأصول غير المتوافقة.' 
      : 'Automatic stock screening following AAOIFI standards with trading blocks on non-compliant assets.',
    feature3Title: isAr ? 'حسابات عائلية مخصصة' : 'Family Supervision',
    feature3Desc: isAr 
      ? 'رقابة كاملة لأولياء الأمور لإنشاء حسابات للأطفال، وتحديد المهام والمكافآت والاطلاع على الأنشطة.' 
      : 'Full parent supervision controls to create child logins, track scores, and allocate sweeps.',
    feature4Title: isAr ? 'تعلّم واكسب XP' : 'Gamified Learning',
    feature4Desc: isAr 
      ? 'اجتز الاختبارات التعليمية حول التمويل الشخصي والاستثمار، واكتسب نقاط الخبرة XP لترقية مستواك.' 
      : 'Pass educational quizzes in personal finance and investing, earn XP, and level up.',
    disclaimer: isAr 
      ? 'أموال افتراضية للتعلّم فقط — ليست أموالاً حقيقية. ليست نصيحة استثمارية.' 
      : 'Virtual money for learning only — not real money. Not investment advice.'
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#0B0F19] text-white selection:bg-emerald-500/30 selection:text-emerald-300 relative overflow-hidden">
      {/* Dynamic BG effects */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full -translate-y-1/2" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neonBlue/5 blur-[120px] rounded-full translate-y-1/2" />

      {/* Navigation */}
      <header className="max-w-6xl mx-auto w-full px-6 py-6 flex justify-between items-center z-10">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent">
          {content.title}
        </h1>
        <div className="flex items-center space-x-4 rtl:space-x-reverse">
          <Link href={isAr ? '/en' : '/ar'} className="text-sm text-gray-400 hover:text-white transition-colors">
            {isAr ? 'English' : 'العربية'}
          </Link>
          <Link href={`/${locale}/login`} className="text-sm font-semibold hover:text-emerald-400 transition-colors">
            {content.heroButtonLogin}
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto py-12 z-10">
        <div className="space-y-6">
          <h2 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight">
            {isAr ? (
              <>
                مستقبل الاستثمار يبدأ مع{' '}
                <span className="bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent">
                  رشد المالية
                </span>
              </>
            ) : (
              <>
                Grow Your Financial Wisdom with{' '}
                <span className="bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent">
                  Rushd
                </span>
              </>
            )}
          </h2>
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            {content.subtitle}
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mt-10 w-full sm:w-auto">
          <Link href={`/${locale}/register`} className="w-full sm:w-auto">
            <button className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/35 transition-all flex items-center justify-center space-x-2 rtl:space-x-reverse">
              <span>{content.heroButtonRegister}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
          <Link href={`/${locale}/login`} className="w-full sm:w-auto">
            <button className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 font-bold transition-all">
              {content.heroButtonLogin}
            </button>
          </Link>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl mt-24">
          <div className="glass-panel p-6 text-start space-y-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg">{content.feature1Title}</h3>
            <p className="text-sm text-gray-400">{content.feature1Desc}</p>
          </div>

          <div className="glass-panel p-6 text-start space-y-3">
            <div className="w-10 h-10 rounded-lg bg-neonBlue/10 flex items-center justify-center text-neonBlue">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg">{content.feature2Title}</h3>
            <p className="text-sm text-gray-400">{content.feature2Desc}</p>
          </div>

          <div className="glass-panel p-6 text-start space-y-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg">{content.feature3Title}</h3>
            <p className="text-sm text-gray-400">{content.feature3Desc}</p>
          </div>

          <div className="glass-panel p-6 text-start space-y-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg">{content.feature4Title}</h3>
            <p className="text-sm text-gray-400">{content.feature4Desc}</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6 text-center text-xs text-gray-500 z-10 space-y-2">
        <p className="max-w-xl mx-auto">{content.disclaimer}</p>
        <p>&copy; 2026 Rushd Financial. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
