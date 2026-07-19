---
name: investing-for-programmers
description: Quantitative financial analysis, financial data collection (yfinance, EODHD, Alpha Vantage, OpenBB), portfolio optimization (Markowitz efficient frontier, Sharpe ratio, VaR, Monte Carlo), technical indicators (SMA, EMA, HMA, WMA, Bollinger, MACD, Ichimoku Cloud), risk management, algorithmic backtesting, startup dilution/valuation, and AI agentic research patterns based on 'Investing for Programmers' by Stefan Papp. Use when building financial analysis pipelines, quant signals, risk models, portfolio trackers, or financial research agents.
---

# Investing for Programmers (Quant & Financial Engineering Skill)

This skill provides a structured reference for quantitative finance, financial data collection, portfolio optimization, technical indicators, backtesting, startup dilution, and AI agent architectures derived from *Investing for Programmers* by Stefan Papp.

Full reference guide: [docs/references/INVESTING_FOR_PROGRAMMERS.md](file:///Users/mac/Downloads/RUSHD/docs/references/INVESTING_FOR_PROGRAMMERS.md)

---

## 1. Core Financial Ratios & Formulas

### Financial Ratios
- **P/E (Price-to-Earnings)**: $P/E = \frac{\text{Share Price}}{\text{EPS}}$
- **PEG Ratio**: $\text{PEG} = \frac{P/E}{\text{Annual EPS Growth Rate}}$ (Target $< 1.0$ for growth at reasonable price)
- **Current Ratio**: $\frac{\text{Current Assets}}{\text{Current Liabilities}}$
- **Quick Ratio**: $\frac{\text{Cash} + \text{Marketable Securities} + \text{Receivables}}{\text{Current Liabilities}}$
- **Debt-to-Equity**: $\frac{\text{Total Liabilities}}{\text{Shareholders' Equity}}$
- **ROA / ROE**: $\text{ROA} = \frac{\text{Net Income}}{\text{Total Assets}} \times 100\%$, $\text{ROE} = \frac{\text{Net Income}}{\text{Equity}} \times 100\%$

### Portfolio & Risk Mathematics
- **Log Return**: $R_{\text{log}, t} = \ln(P_t / P_{t-1})$
- **Portfolio Volatility**: $\sigma_p = \sqrt{w^T \Sigma w \times 252}$
- **Sharpe Ratio**: $SR = \frac{R_p - R_f}{\sigma_p}$
- **Value at Risk (VaR)**: Percentile of simulated portfolio price losses via Monte Carlo.
- **Startup Dilution**: $S_{\text{new}} = S_{\text{existing}} \times \left(\frac{\text{Equity Given \%}}{100 - \text{Equity Given \%}}\right)$

---

## 2. Technical Indicators Checklist

- **Moving Averages**:
  - `SMA`: Best for long-term trend analysis.
  - `EMA`: Weights recent prices exponentially; good for momentum signals.
  - `WMA`: Linearly weighted moving average.
  - `HMA (Hull)`: Reduces lag while maintaining smoothness: $HMA_k = WMA_{\sqrt{k}}(2 \cdot WMA_{k/2}(P) - WMA_k(P))$.
- **Bollinger Bands**: Middle ($SMA_{20}$), Upper ($SMA_{20} + 2\sigma$), Lower ($SMA_{20} - 2\sigma$).
- **MACD**: $MACD = EMA_{12} - EMA_{26}$, $\text{Signal} = EMA_9(MACD)$, $\text{Hist} = MACD - \text{Signal}$.
- **Ichimoku Cloud**: Tenkan-sen (9d), Kijun-sen (26d), Senkou Span A & B (26d forward), Chikou Span (26d backward).

---

## 3. Financial Data Pipeline Guidelines

1. **Multi-Broker Aggregation**: Normalize tickers (e.g. `BRK.B` vs `BRK-B`) via an `asset_lookup` schema before combining data from Alpaca, Interactive Brokers, or local SQLite feeds.
2. **Currency Standardization**: Convert multi-currency positions into USD/base currency using explicit exchange rate feeds (`CurrencyConverter`).
3. **Data Science & Backtesting Rigor**:
   - Use point-in-time closed bars (avoid look-ahead bias and repainting).
   - Account for transaction fees, slippage, and spread.

---

## 4. Agentic Design Patterns for Finance

1. **Reflection**: Agent self-reviews outputs against risk caps and historical performance.
2. **Tool Use**: Autonomous selection of stock screeners, technical analysis tools, and vector DBs.
3. **Planning**: Decomposing complex investment research into DAG execution graphs (e.g. using LangGraph StateGraph).
4. **Multi-Agent Collaboration**: Bull vs Bear analyst debate moderated by a Portfolio Manager.

---

## 5. Summary Reference File
For detailed explanations, code implementations, mathematical derivations, and multi-agent DAGs, read [docs/references/INVESTING_FOR_PROGRAMMERS.md](file:///Users/mac/Downloads/RUSHD/docs/references/INVESTING_FOR_PROGRAMMERS.md).
