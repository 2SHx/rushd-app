'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Briefcase, TrendingUp, Users, Shield, Target, Landmark, DollarSign, Award, ChevronLeft, ChevronRight, Check, Send
} from 'lucide-react';

export default function InvestorPage({ params }: { params: { locale: string } }) {
  const locale = params?.locale || 'en';
  const isAr = locale === 'ar';
  
  const [activeSlide, setActiveSlide] = useState(0);
  const [targetUsers, setTargetUsers] = useState(100000);
  
  // Access Form State
  const [investorName, setInvestorName] = useState('');
  const [investorEmail, setInvestorEmail] = useState('');
  const [investorFirm, setInvestorFirm] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const slides = [
    {
      id: 1,
      tag: isAr ? 'الرؤية والفرصة' : 'VISION & OPPORTUNITY',
      title: isAr ? 'الاستثمار الحلال للجيل القادم' : 'Halal Wealth-Tech for the Next Gen',
      desc: isAr 
        ? 'بناء أول منصة موحدة لإدارة الثروات تقدم تصفية معايير هيئة أيقوفي (AAOIFI)، وتداول الأسهم الجزئية، ومكافآت تعليمية لأكثر من ملياري مسلم حول العالم.'
        : 'Building the premier unified Wealth-Tech platform integrating automated AAOIFI compliance, fractional shares, and micro-savings for 2B+ global Muslims.',
      metrics: [
        { label: isAr ? 'عدد المسلمين عالمياً' : 'Global Muslims', value: '2.0B+' },
        { label: isAr ? 'النمو السنوي للثروات الحلال' : 'Halal Asset CAGR', value: '10.2%' }
      ]
    },
    {
      id: 2,
      tag: isAr ? 'المشكلة القائمة' : 'THE FRICTION',
      title: isAr ? 'عقبات وحواجز التداول الحلال' : 'Legacy Hurdles in Halal Wealth',
      desc: isAr 
        ? 'أدوات التصفية الحالية يدوية وباهظة الثمن، وتداول الأسهم التقليدية يتطلب شراء أسهم كاملة مما يمنع صغار المستثمرين، بالإضافة إلى غياب الوعي المالي الشرعي.'
        : 'Legacy compliance screeners are manual & expensive. Traditional brokers require full shares, locked behind high prices, and lack structured Sharia education.',
      metrics: [
        { label: isAr ? 'رسوم التصفية اليدوية' : 'Manual Audit Cost', value: '$10k/yr' },
        { label: isAr ? 'مستبعدون بسبب أسعار الأسهم' : 'Excluded Retail', value: '65%' }
      ]
    },
    {
      id: 3,
      tag: isAr ? 'الحل التقني' : 'THE SOLUTION',
      title: isAr ? 'منصة تداول حلال متكاملة' : 'The Unified Halal Workstation',
      desc: isAr 
        ? 'منصة تداول ذكية تقدم تصفيات فورية للأسهم، تداول كسري للأسهم بالريال أو الدولار، وتطهير آلي للأرباح، بالإضافة إلى أكاديمية تعليمية مع مكافآت XP.'
        : 'An intelligent workstation offering automated Sharia filters, fractional transactions in SAR/USD, auto-purification pools, and micro-learning quests.',
      metrics: [
        { label: isAr ? 'سرعة التصفية' : 'Audit Time', value: '< 1 Sec' },
        { label: isAr ? 'دقة معايير أوفق' : 'Compliance Spec', value: '100%' }
      ]
    },
    {
      id: 4,
      tag: isAr ? 'الحجم والسوق المستهدف' : 'TAM & MARKET SIZE',
      title: isAr ? 'سوق واسع يفتقر للخدمات الحديثة' : 'Reachable Market Bottom-Up',
      desc: isAr 
        ? 'التركيز على شريحة الشباب من جيل الألفية والجيل Z في دول الخليج وجنوب شرق آسيا والشرق الأوسط الذين يبحثون عن حلول رقمية موثوقة شرعياً.'
        : 'Focusing on digital-first Gen Z & Millennials across the GCC, Southeast Asia, and Western Muslim diasporas demanding halal compliance.',
      metrics: [
        { label: isAr ? 'سوق الخليج المباشر' : 'Reachable GCC Users', value: '12M' },
        { label: isAr ? 'إجمالي الأصول المستهدفة' : 'Target TAM Asset', value: '$85B+' }
      ]
    },
    {
      id: 5,
      tag: isAr ? 'الحواجز التنافسية' : 'OUR MOAT',
      title: isAr ? 'تقنيات حصرية وقنوات توزيع مدمجة' : 'Our Technology Flywheel',
      desc: isAr 
        ? 'محرك تصفية آلي فريد، شبكة قنوات توزيع مدمجة تعتمد على دعوة العائلة والحسابات المشتركة، بالإضافة إلى قفل الأصول في محفظة مخصصة وعقود مضاربة.'
        : 'Proprietary compliance engine, organic distribution channels (parent/child invite loops), and sticky capital lockups via sharia Mudarabah vaults.',
      metrics: [
        { label: isAr ? 'تأثير الشبكة' : 'Organic Virality', value: 'K-Factor 1.4' },
        { label: isAr ? 'معدل الاحتفاظ السنوي' : 'Sticky Retention', value: '92%' }
      ]
    },
    {
      id: 6,
      tag: isAr ? 'خطة النمو وجولة التمويل' : 'THE ASK & ALLOCATION',
      title: isAr ? 'جولة التمويل الأولي بقيمة 3 مليون دولار' : 'Raising $3M Seed Round',
      desc: isAr 
        ? 'الاستثمار في توسيع محركات التصفية بالذكاء الاصطناعي، الحصول على التراخيص المالية اللازمة للأسواق الإقليمية، وتسريع نمو قنوات التسويق.'
        : 'Funding to scale our proprietary screening engines, secure necessary GCC/regional regulatory licenses, and accelerate customer acquisition channels.',
      metrics: [
        { label: isAr ? 'مدة الجولة المتوقعة' : 'Expected Runway', value: '18 Months' },
        { label: isAr ? 'هدف صافي الأصول' : 'Target NAV', value: '$120M' }
      ]
    }
  ];

  const handleNext = () => {
    setActiveSlide((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
  };

  const handlePrev = () => {
    setActiveSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  // Projected Annual Revenue:
  // $5/month SaaS + $0.20 * 4 transactions/month = $5.80/month revenue per user = $69.60/year.
  const projectedRevenue = targetUsers * 69.60;
  const projectedNetIncome = projectedRevenue * 0.38; // 38% projected operating margin

  const formatCurrency = (val: number) => {
    return isAr ? `${(val / 1e6).toFixed(2)} مليون ر.س` : `$${(val / 1e6).toFixed(2)}M`;
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!investorName || !investorEmail) return;
    setIsSubmitting(true);
    // Simulate API request to register interest
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setIsSubmitting(false);
    setFormSubmitted(true);
  };

  return (
    <div className="min-h-screen text-white relative bg-[#080B11] p-6 pb-24 md:pb-8 max-w-5xl mx-auto space-y-8">
      
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/5 pb-6 gap-4">
        <div>
          <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-400 mb-1">
            <Briefcase className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider font-mono">{isAr ? 'مركز المستثمرين' : 'Investor Center'}</span>
          </div>
          <h1 className="text-3xl font-extrabold font-sans tracking-tight bg-gradient-to-r from-white via-gray-100 to-gray-400 bg-clip-text text-transparent">
            {isAr ? 'بوابة التمويل والنمو لـ RUSH' : 'RUSHD Growth & Funding Portal'}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {isAr ? 'مراجعة أرقام النمو، خطط التوسع، وملف جولة الاستثمار الأولي.' : 'Review our market wedge, interactive financial model, and seed investment deck.'}
          </p>
        </div>
        <div className="flex space-x-3 rtl:space-x-reverse">
          <a
            href={`/${locale}/markets`}
            className="px-5 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-xs font-bold"
          >
            {isAr ? 'سوق الأسهم' : 'Live Workstation'}
          </a>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-8 items-start">
        
        {/* Left Column: Interactive Pitch Slides */}
        <div className="space-y-6">
          <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] rounded-3xl p-6 shadow-xl relative min-h-[400px] flex flex-col justify-between overflow-hidden">
            
            {/* Background Gradient Glow */}
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            
            {/* Top Row: Navigation Indicators */}
            <div className="flex justify-between items-center z-10 border-b border-white/5 pb-4">
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                {slides[activeSlide].tag}
              </span>
              <span className="text-xs text-gray-500 font-mono font-bold">
                {activeSlide + 1} / {slides.length}
              </span>
            </div>

            {/* Slide Body */}
            <div className="my-8 space-y-4 z-10 text-right rtl:text-right ltr:text-left">
              <h2 className="text-2xl font-bold tracking-tight text-white font-sans">
                {slides[activeSlide].title}
              </h2>
              <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">
                {slides[activeSlide].desc}
              </p>

              {/* Unique Metrics Panel for Slide */}
              <div className="grid grid-cols-2 gap-4 pt-4 max-w-md">
                {slides[activeSlide].metrics.map((m, idx) => (
                  <div key={idx} className="bg-black/30 p-4 rounded-2xl border border-white/[0.03] space-y-1">
                    <span className="text-[10px] text-gray-500 block uppercase font-semibold">{m.label}</span>
                    <span className="text-xl font-mono font-extrabold text-white">{m.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Row: Carousel Navigators */}
            <div className="flex justify-between items-center z-10 pt-4 border-t border-white/5">
              <div className="flex space-x-1.5 rtl:space-x-reverse">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveSlide(idx)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      activeSlide === idx ? 'w-6 bg-emerald-400' : 'w-1.5 bg-white/20 hover:bg-white/40'
                    }`}
                  />
                ))}
              </div>
              <div className="flex space-x-2 rtl:space-x-reverse">
                <button
                  onClick={handlePrev}
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all text-gray-300"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={handleNext}
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all text-gray-300"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

          </div>

          {/* Interactive Financial Calculator */}
          <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] rounded-3xl p-6 shadow-xl space-y-6">
            <div className="flex items-center space-x-2 rtl:space-x-reverse text-indigo-400 border-b border-white/5 pb-3">
              <TrendingUp className="w-5 h-5" />
              <h3 className="font-bold text-sm text-gray-100">{isAr ? 'نموذج محاكاة الإيرادات التفاعلي' : 'Interactive Revenue Projections'}</h3>
            </div>
            
            <p className="text-xs text-gray-400 leading-relaxed">
              {isAr 
                ? 'استخدم شريط التمرير لمشاهدة حجم الإيرادات وصافي الأرباح المتوقعة لـ RUSH بناءً على متوسط اشتراكات 5 ريال/شهرياً وعمولة تداول ضئيلة.'
                : 'Adjust the target active users slider below to forecast our annual gross revenue and net operating margins in real-time.'}
            </p>

            {/* Slider Widget */}
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400 font-medium">{isAr ? 'عدد المستخدمين المستهدف' : 'Target Active Users'}</span>
                <span className="font-mono font-bold text-indigo-400 text-sm">{targetUsers.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min="10000"
                max="1000000"
                step="10000"
                value={targetUsers}
                onChange={(e) => setTargetUsers(Number(e.target.value))}
                className="w-full h-1.5 bg-black/40 rounded-full appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {/* Calculation Outputs */}
            <div className="grid grid-cols-2 gap-4 text-xs pt-2">
              <div className="bg-black/30 p-4 rounded-2xl border border-white/[0.03] space-y-1">
                <span className="text-gray-500 text-[10px] uppercase block">{isAr ? 'الإيرادات السنوية المقدرة' : 'Annual Run-Rate Revenue'}</span>
                <span className="text-xl font-mono font-extrabold text-white">{formatCurrency(projectedRevenue)}</span>
              </div>

              <div className="bg-black/30 p-4 rounded-2xl border border-white/[0.03] space-y-1">
                <span className="text-gray-500 text-[10px] uppercase block">{isAr ? 'صافي الدخل السنوي المقدر (38% هامش)' : 'Estimated Net Income (38% Margin)'}</span>
                <span className="text-xl font-mono font-extrabold text-emerald-400">{formatCurrency(projectedNetIncome)}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Secure Data Room Request Form */}
        <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-400 border-b border-white/5 pb-3">
            <Shield className="w-5 h-5" />
            <h3 className="font-bold text-sm text-gray-100">{isAr ? 'طلب الدخول لغرفة البيانات' : 'Secure Data Room Access'}</h3>
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">
            {isAr 
              ? 'احصل على التقرير المالي الكامل وجدول المساهمين (Cap Table) والدراسة القانونية للشركة بشكل آمن ومحمي بعلامة مائية رقمية.'
              : 'Request authorized access to view our historical financial metrics, cap table, and legal structure documentation.'}
          </p>

          <AnimatePresence mode="wait">
            {!formSubmitted ? (
              <motion.form 
                key="form"
                onSubmit={handleRequestAccess}
                className="space-y-4"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="space-y-1">
                  <label className="block text-[10px] text-gray-400 uppercase font-semibold">{isAr ? 'الاسم بالكامل' : 'Full Name'}</label>
                  <input
                    type="text"
                    required
                    value={investorName}
                    onChange={(e) => setInvestorName(e.target.value)}
                    placeholder={isAr ? 'مثال: محمد أحمد' : 'e.g., Jane Doe'}
                    className="w-full bg-black/40 border border-white/5 focus:border-emerald-500/20 rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] text-gray-400 uppercase font-semibold">{isAr ? 'البريد الإلكتروني للعمل' : 'Work Email'}</label>
                  <input
                    type="email"
                    required
                    value={investorEmail}
                    onChange={(e) => setInvestorEmail(e.target.value)}
                    placeholder={isAr ? 'name@firm.com' : 'name@firm.com'}
                    className="w-full bg-black/40 border border-white/5 focus:border-emerald-500/20 rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] text-gray-400 uppercase font-semibold">{isAr ? 'شركة الاستثمار المغامر' : 'VC Firm / Institution'}</label>
                  <input
                    type="text"
                    required
                    value={investorFirm}
                    onChange={(e) => setInvestorFirm(e.target.value)}
                    placeholder={isAr ? 'مثال: سنابل للاستثمار' : 'e.g., Backed VC'}
                    className="w-full bg-black/40 border border-white/5 focus:border-emerald-500/20 rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 outline-none transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold text-xs text-white transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center space-x-2 rtl:space-x-reverse mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>{isAr ? 'جاري الإرسال...' : 'Sending Request...'}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>{isAr ? 'طلب الدخول الآمن' : 'Request Secure Access'}</span>
                    </>
                  )}
                </button>
              </motion.form>
            ) : (
              <motion.div 
                key="success"
                className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center space-y-3"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                  <Check className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-gray-100">{isAr ? 'تم إرسال الطلب بنجاح' : 'Request Registered'}</h4>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  {isAr 
                    ? `نشكرك على اهتمامك بـ RUSH. لقد تم إنشاء طلب دخول لـ ${investorFirm}. سنقوم بمراجعة بريدك الإلكتروني وإرسال رمز الدخول الآمن واتفاقية عدم الإفصاح (NDA).`
                    : `Thank you for your interest. We registered your access request for ${investorFirm}. Our deal team will review and email you a secure entry link.`}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

    </div>
  );
}
