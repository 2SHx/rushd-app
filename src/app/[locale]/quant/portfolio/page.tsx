import { redirect } from 'next/navigation';

export default async function PortfolioPage({ params }: { params: { locale: string } }) {
  const locale = params.locale || 'en';
  redirect(`/${locale}/quant`);
}
