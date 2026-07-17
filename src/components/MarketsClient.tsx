'use client';

import MarketsContainer from './markets/MarketsContainer';
import type { FundamentalsPeriod, EarningsCalendar } from '@/services/marketData';

export interface MarketsClientProps {
  currentData: any;
  locale: string;
  isParent: boolean;
  initialActiveSymbol?: string | null;
  initialJarBalance?: number;
  initialSharesOwned?: number;
  initialMarket?: 'TASI' | 'NASDAQ';
  // M13 workspace data — accepted but not yet consumed by MarketsContainer
  fundamentalsAnnual?: FundamentalsPeriod[];
  fundamentalsQuarterly?: FundamentalsPeriod[];
  earningsCalendar?: EarningsCalendar;
  filings?: unknown;
}

export default function MarketsClient(props: MarketsClientProps) {
  return <MarketsContainer {...props} />;
}
