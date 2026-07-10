import { NextResponse } from 'next/server';

export const revalidate = 300; // 5-minute ISR cache

export async function GET() {
  try {
    const res = await fetch(
      'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
          Accept: 'application/json',
          Referer: 'https://edition.cnn.com/',
        },
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.warn('[fear-greed] Upstream failed, returning 503:', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
