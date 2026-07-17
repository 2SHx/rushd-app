'use client';

import { ArrowUpRight, FlaskConical, HelpCircle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { PracticeLink } from '@/academy/registry';
import { practiceLinkHref } from './academyAccess';

const TOPIC_AR_MAP: Record<string, string> = {
  'Stock Market Basics': 'أساسيات سوق الأسهم',
  'Savings & Jars': 'الادخار وتقسيم الحصالة',
  'Compound Interest': 'مفهوم العائد التراكمي',
  'Sharia Compliance': 'معايير الفحص الشرعي',
  'Risk Management': 'إدارة المخاطر وتنويع المحفظة',
  'Value Investing': 'استثمار القيمة والتحليل المالي',
  'Wealth Goals & 50/30/20': 'الأهداف المالية وقاعدة 50/30/20',
  'Halal Mutual Funds': 'الصناديق الاستثمارية الشريعة',
  'Sukuk & Asset Allocation': 'الصناديق وصكوك التوزيع الرأسمالي',
  'TASI Markets': 'تحليل أسواق تداول السعودية TASI',
  'NASDAQ Markets': 'تحليل أسواق ناسداك العالمية NASDAQ',
};

export default function PracticeLinks({ locale, links }: { locale: string; links: PracticeLink[] }) {
  const t = useTranslations('Academy');
  const isAr = locale === 'ar';

  if (!links || links.length === 0) return null;

  return (
    <aside
      className="mt-8 rounded-3xl border border-accent/25 bg-accent/[0.06] p-6 shadow-sm text-start"
      aria-label={t('practiceTitle')}
    >
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">
        {t('practiceEyebrow')}
      </p>
      <h3 className="mt-2 text-xl font-extrabold text-foreground">{t('practiceTitle')}</h3>
      <p className="mt-1 text-xs leading-relaxed text-foreground/70">{t('practiceBody')}</p>

      <div className="mt-5 flex flex-wrap gap-3">
        {links.map((link) => {
          const href = practiceLinkHref(link);
          const isStrategy = link.kind === 'strategySetup';

          let label = '';
          if (isStrategy) {
            label = isAr
              ? `🎯 معمل استراتيجية المحفظة (${link.setupId})`
              : `🎯 Strategy Lab (${link.setupId})`;
          } else {
            const topicName = (isAr && TOPIC_AR_MAP[link.topic]) ? TOPIC_AR_MAP[link.topic] : link.topic;
            label = isAr
              ? `📝 اختبار تطبيقي: ${topicName}`
              : `📝 Applied Quiz: ${topicName}`;
          }

          return (
            <Link
              key={href}
              href={`/${locale}${href}`}
              className="group inline-flex items-center gap-2.5 rounded-2xl border-2 border-accent bg-surface-card px-5 py-3.5 text-xs sm:text-sm font-extrabold text-accent shadow-sm transition-all duration-200 hover:bg-accent hover:text-white hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {isStrategy ? (
                <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <HelpCircle className="size-4 shrink-0" aria-hidden="true" />
              )}
              <span>{label}</span>
              <ArrowUpRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:-scale-x-100" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
