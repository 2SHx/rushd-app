// src/app/api/trade/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/authz';
import { fetchMarketData } from '@/services/marketData';
import { Prisma } from '@prisma/client';

const tradeSchema = z.object({
  symbol: z.string().min(1),
  market: z.enum(['TASI', 'NASDAQ']),
  action: z.enum(['BUY', 'SELL']),
  shares: z.number().positive(),
});

export async function POST(req: Request) {
  try {
    const user = await requireSession();

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    const parsed = tradeSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { symbol, market, action, shares } = parsed.data;

    // 1. Fetch live market price and Sharia verdict
    const marketData = await fetchMarketData(symbol, market);
    if (!marketData || !marketData.price) {
      return NextResponse.json({ error: 'asset_not_found', message: 'Could not fetch stock data.' }, { status: 404 });
    }

    const price = new Prisma.Decimal(marketData.price.toString());
    const isCompliant = marketData.isShariaCompliant ?? true;

    // 2. Block BUY orders for non-compliant assets (Sharia screener policy)
    if (action === 'BUY' && !isCompliant) {
      return NextResponse.json({
        error: 'non_compliant_asset',
        message: 'Trading is blocked for non-compliant assets (غير متوافق مع الشريعة — تعليمي فقط).'
      }, { status: 403 });
    }

    const tradeShares = new Prisma.Decimal(shares.toString());
    const totalCost = price.mul(tradeShares);

    // 3. Perform atomic trade execution inside a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get user's savings jar
      const jar = await tx.savingsJar.findUnique({
        where: { userId: user.id }
      });

      if (!jar) {
        throw new Error('savings_jar_not_found');
      }

      if (action === 'BUY') {
        if (jar.balance.lt(totalCost)) {
          throw new Error('insufficient_balance');
        }

        // Deduct balance from jar
        const updatedJar = await tx.savingsJar.update({
          where: { userId: user.id },
          data: { balance: { decrement: totalCost } }
        });

        // Upsert portfolio item
        const updatedPortfolio = await tx.portfolioItem.upsert({
          where: {
            userId_symbol: {
              userId: user.id,
              symbol
            }
          },
          create: {
            userId: user.id,
            symbol,
            shares: tradeShares,
            market,
            currency: market === 'TASI' ? 'SAR' : 'USD'
          },
          update: {
            shares: { increment: tradeShares }
          }
        });

        // Log trade transaction
        const auditLog = await tx.transaction.create({
          data: {
            userId: user.id,
            amount: totalCost.negated(),
            currency: jar.currency,
            type: 'TRADE',
            description: `Bought ${shares.toFixed(2)} shares of ${symbol} at ${price.toFixed(2)}`
          }
        });

        return { jar: updatedJar, portfolio: updatedPortfolio, transaction: auditLog };
      } else {
        // action === 'SELL'
        const portfolio = await tx.portfolioItem.findUnique({
          where: {
            userId_symbol: {
              userId: user.id,
              symbol
            }
          }
        });

        if (!portfolio || portfolio.shares.lt(tradeShares)) {
          throw new Error('insufficient_shares');
        }

        // Increment balance to jar
        const updatedJar = await tx.savingsJar.update({
          where: { userId: user.id },
          data: { balance: { increment: totalCost } }
        });

        let updatedPortfolio = null;
        if (portfolio.shares.eq(tradeShares)) {
          // Delete portfolio item if selling all shares
          await tx.portfolioItem.delete({
            where: {
              userId_symbol: {
                userId: user.id,
                symbol
              }
            }
          });
        } else {
          // Decrement shares
          updatedPortfolio = await tx.portfolioItem.update({
            where: {
              userId_symbol: {
                userId: user.id,
                symbol
              }
            },
            data: {
              shares: { decrement: tradeShares }
            }
          });
        }

        // Log trade transaction
        const auditLog = await tx.transaction.create({
          data: {
            userId: user.id,
            amount: totalCost,
            currency: jar.currency,
            type: 'TRADE',
            description: `Sold ${shares.toFixed(2)} shares of ${symbol} at ${price.toFixed(2)}`
          }
        });

        return { jar: updatedJar, portfolio: updatedPortfolio, transaction: auditLog };
      }
    });

    return NextResponse.json({
      success: true,
      balance: result.jar.balance.toFixed(2),
      sharesOwned: result.portfolio ? result.portfolio.shares.toFixed(2) : '0.00',
    });
  } catch (error: any) {
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as any).response;
    }

    if (error.message === 'savings_jar_not_found') {
      return NextResponse.json({ error: 'savings_jar_not_found', message: 'Savings jar not initialized.' }, { status: 400 });
    }
    if (error.message === 'insufficient_balance') {
      return NextResponse.json({ error: 'insufficient_balance', message: 'Insufficient simulated play-money balance.' }, { status: 400 });
    }
    if (error.message === 'insufficient_shares') {
      return NextResponse.json({ error: 'insufficient_shares', message: 'Insufficient shares to execute sell order.' }, { status: 400 });
    }

    console.error('Trade execution error:', error);
    return NextResponse.json({ error: 'server_error', message: 'Simulated trade execution failed.' }, { status: 500 });
  }
}
