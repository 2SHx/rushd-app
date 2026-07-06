// src/app/api/purify/zakat/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/authz';
import { fetchMarketData } from '@/services/marketData';
import { Prisma } from '@prisma/client';

export async function POST(req: Request) {
  try {
    const user = await requireSession();

    // 1. Fetch user's cash balance
    const jar = await prisma.savingsJar.findUnique({
      where: { userId: user.id }
    });

    if (!jar) {
      return NextResponse.json({ error: 'savings_jar_not_found', message: 'Savings jar not initialized.' }, { status: 400 });
    }

    // 2. Fetch user's portfolio holdings to calculate total stock value
    const holdings = await prisma.portfolioItem.findMany({
      where: { userId: user.id }
    });

    let stockValue = new Prisma.Decimal('0.00');

    // Calculate current market value for each compliant asset
    for (const item of holdings) {
      try {
        const marketData = await fetchMarketData(item.symbol, item.market);
        const isCompliant = marketData?.isShariaCompliant ?? true;
        
        // Zakat is calculated on halal stock investments
        if (isCompliant && marketData?.price) {
          const price = new Prisma.Decimal(marketData.price.toString());
          const itemValue = price.mul(item.shares);
          stockValue = stockValue.add(itemValue);
        }
      } catch (err) {
        console.error(`Failed to fetch market data for Zakat calculation of ${item.symbol}:`, err);
      }
    }

    // 3. Compute Zakatable Wealth and Zakat Due (2.5%)
    const zakatableWealth = jar.balance.add(stockValue);
    const zakatDue = zakatableWealth.mul(new Prisma.Decimal('0.025'));

    if (zakatDue.eq(new Prisma.Decimal('0.00'))) {
      return NextResponse.json({ success: true, message: 'No Zakat due.', amountPaid: '0.00', balance: jar.balance.toFixed(2) });
    }

    if (jar.balance.lt(zakatDue)) {
      return NextResponse.json({
        error: 'insufficient_balance',
        message: `Insufficient cash balance to pay due Zakat of ${zakatDue.toFixed(2)} SAR. You need more liquidity in your Savings Jar.`
      }, { status: 400 });
    }

    // 4. Perform atomic update: debit Savings Jar and record audit log transaction
    const result = await prisma.$transaction(async (tx) => {
      const updatedJar = await tx.savingsJar.update({
        where: { userId: user.id },
        data: { balance: { decrement: zakatDue } }
      });

      const auditLog = await tx.transaction.create({
        data: {
          userId: user.id,
          amount: zakatDue.negated(),
          currency: jar.currency,
          type: 'WITHDRAWAL',
          description: `Zakat Purification / دفع الزكاة (2.5% of ${zakatableWealth.toFixed(2)} SAR)`
        }
      });

      return { jar: updatedJar, transaction: auditLog };
    });

    return NextResponse.json({
      success: true,
      amountPaid: zakatDue.toFixed(2),
      balance: result.jar.balance.toFixed(2),
      message: `Zakat of ${zakatDue.toFixed(2)} SAR successfully paid and purified.`
    });
  } catch (error: any) {
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as any).response;
    }
    console.error('Zakat purification error:', error);
    return NextResponse.json({ error: 'server_error', message: 'Zakat purification failed.' }, { status: 500 });
  }
}
