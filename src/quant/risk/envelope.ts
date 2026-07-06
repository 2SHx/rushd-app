// Deterministic Risk Manager envelope (QUANT_DESIGN.md §2.5, skill risk-management).
// The PM (LLM) proposes {action, qty}; this pure module clamps it to the smaller of a
// fixed fraction of equity, a volatility-target size, a liquidity (ADV) cap, and cash
// affordability, then enforces exposure/position-count/drawdown/kill-switch limits.
// No wall-clock, no DB, no randomness — identical live vs backtest. All money math is
// Prisma.Decimal, never float.
import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export type ProposedDecision = {
  action: 'BUY' | 'SELL' | 'HOLD';
  qty: Decimal;
};

export interface PortfolioState {
  equity: Decimal;
  cash: Decimal;
  positions: { symbol: string; qty: Decimal; price: Decimal }[];
  peakEquity: Decimal;
}

export interface MarketState {
  symbol: string;
  price: Decimal;
  atr: Decimal;
  adv: Decimal;
  stopPrice: Decimal;
}

export interface RiskLimits {
  maxNameWeight: number; // fraction of equity, e.g. 0.1
  maxGrossExposure: number; // fraction of equity, e.g. 1.0
  maxOpenPositions: number;
  maxRiskPct: number; // max loss-to-stop as fraction of equity, e.g. 0.02
  volTargetPct: number; // target daily vol as fraction, size ~ volTargetPct*equity/atr
  liquidityAdvFraction: number; // fraction of ADV a single order may consume
  drawdownHaltPct: number; // peak-to-trough fraction that halts new BUYs
}

export interface EnvelopeResult {
  action: 'BUY' | 'SELL' | 'HOLD';
  qty: Decimal;
  adjustments: string[];
  blocked: boolean;
}

function hold(adjustments: string[], blocked: boolean): EnvelopeResult {
  return { action: 'HOLD', qty: new D(0), adjustments, blocked };
}

function ownedQty(pf: PortfolioState, symbol: string): Decimal {
  const pos = pf.positions.find((p) => p.symbol === symbol);
  return pos ? pos.qty : new D(0);
}

function currentDrawdownPct(pf: PortfolioState): Decimal {
  if (pf.peakEquity.lte(0)) return new D(0);
  return new D(1).minus(pf.equity.div(pf.peakEquity));
}

export function applyEnvelope(
  proposal: ProposedDecision,
  pf: PortfolioState,
  mkt: MarketState,
  limits: RiskLimits,
  killSwitch: boolean
): EnvelopeResult {
  if (killSwitch) {
    return hold(['kill_switch'], true);
  }

  if (proposal.action === 'HOLD') {
    return { action: 'HOLD', qty: new D(0), adjustments: [], blocked: false };
  }

  const drawdown = currentDrawdownPct(pf);
  const drawdownHalted = drawdown.gte(new D(limits.drawdownHaltPct));

  if (proposal.action === 'SELL') {
    const adjustments: string[] = [];
    let qty = proposal.qty;
    if (qty.lt(0)) {
      qty = new D(0);
      adjustments.push('sell_qty_negative_clamped_to_zero');
    }
    const owned = ownedQty(pf, mkt.symbol);
    if (qty.gt(owned)) {
      qty = owned;
      adjustments.push('sell_qty_clamped_to_owned');
    }
    if (qty.lte(0)) {
      return hold(adjustments.length ? adjustments : ['sell_qty_zero_no_position'], false);
    }
    return { action: 'SELL', qty, adjustments, blocked: false };
  }

  // BUY
  const adjustments: string[] = [];

  if (drawdownHalted) {
    return hold(['drawdown_breaker_blocks_new_buys'], true);
  }

  if (pf.positions.length >= limits.maxOpenPositions && !pf.positions.some((p) => p.symbol === mkt.symbol)) {
    return hold(['max_open_positions_reached'], true);
  }

  const grossExposure = pf.positions.reduce(
    (sum, p) => sum.plus(p.qty.mul(p.price).abs()),
    new D(0)
  );
  const maxGrossValue = pf.equity.mul(limits.maxGrossExposure);
  const grossRoom = maxGrossValue.minus(grossExposure);
  if (grossRoom.lte(0)) {
    return hold(['max_gross_exposure_reached'], true);
  }

  let qty = proposal.qty;
  if (qty.lt(0)) {
    qty = new D(0);
    adjustments.push('buy_qty_negative_clamped_to_zero');
  }

  // 1. fixed fraction of equity (single-name weight cap)
  const existingValue = ownedQty(pf, mkt.symbol).mul(mkt.price);
  const nameCapValue = pf.equity.mul(limits.maxNameWeight);
  const nameRoomValue = nameCapValue.minus(existingValue);
  const nameCapQty = nameRoomValue.gt(0) ? nameRoomValue.div(mkt.price) : new D(0);
  if (qty.gt(nameCapQty)) {
    qty = nameCapQty;
    adjustments.push('clamped_by_max_name_weight');
  }

  // 2. gross exposure room
  const grossCapQty = grossRoom.div(mkt.price);
  if (qty.gt(grossCapQty)) {
    qty = grossCapQty;
    adjustments.push('clamped_by_max_gross_exposure');
  }

  // 3. volatility-target size: size ~ (volTargetPct * equity) / atr
  if (mkt.atr.gt(0)) {
    const volTargetQty = pf.equity.mul(limits.volTargetPct).div(mkt.atr);
    if (qty.gt(volTargetQty)) {
      qty = volTargetQty;
      adjustments.push('clamped_by_vol_target');
    }
  }

  // 4. per-trade risk budget: risk-budget / (entry - stop)
  const stopDistance = mkt.price.minus(mkt.stopPrice).abs();
  if (stopDistance.gt(0)) {
    const riskBudget = pf.equity.mul(limits.maxRiskPct);
    const riskCapQty = riskBudget.div(stopDistance);
    if (qty.gt(riskCapQty)) {
      qty = riskCapQty;
      adjustments.push('clamped_by_max_risk_pct');
    }
  }

  // 5. liquidity cap: fraction of ADV
  const liquidityCapQty = mkt.adv.mul(limits.liquidityAdvFraction);
  if (qty.gt(liquidityCapQty)) {
    qty = liquidityCapQty;
    adjustments.push('clamped_by_liquidity_adv');
  }

  // 6. cash affordability
  if (mkt.price.gt(0)) {
    const affordableQty = pf.cash.div(mkt.price);
    if (qty.gt(affordableQty)) {
      qty = affordableQty;
      adjustments.push('clamped_by_available_cash');
    }
  }

  if (qty.lte(0)) {
    adjustments.push('clamped_to_zero_converted_to_hold');
    return hold(adjustments, false);
  }

  return { action: 'BUY', qty, adjustments, blocked: false };
}
