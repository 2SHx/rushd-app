import { fetchMarketData } from '@/services/marketData';
import DashboardClient from '@/components/DashboardClient';

export default async function DashboardPage() {
  const tasiData = await fetchMarketData('1120.SR', 'TASI'); 
  const nasdaqData = await fetchMarketData('AAPL', 'NASDAQ');

  return <DashboardClient tasiData={tasiData} nasdaqData={nasdaqData} />;
}
