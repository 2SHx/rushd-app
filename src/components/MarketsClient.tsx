'use client';

import MarketsContainer from './markets/MarketsContainer';

export interface MarketsClientProps {
  currentData: any;
  locale: string;
  isParent: boolean;
  initialActiveSymbol?: string | null;
  initialJarBalance?: number;
  initialSharesOwned?: number;
  initialMarket?: 'TASI' | 'NASDAQ';
}

export default function MarketsClient(props: MarketsClientProps) {
  return <MarketsContainer {...props} />;
}
