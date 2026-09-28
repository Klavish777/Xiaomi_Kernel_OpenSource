# Money Work MT5 Expert Advisor

`MoneyWorkAdvisor.mq5` is a native MT5 Expert Advisor (continuous automation; not a one-shot MQL script). It is a separate, Demo-first EA and does not read the app's local-storage files or pixels. It obtains real OHLC/tick data and closed-deal history directly from the connected MT5 terminal, and fetches the same daily AUD/CAD reference source used by the app.

## Strategy correspondence

- Loads up to `InpHistoryBars` bars from the broker for the selected `InpTimeframe` (2,000 by default, matching the app chart's cap). The entry signal matches the app's technical rule on closed candles: EMA(20) over the latest 40 closes versus EMA(50) over the latest 50 closes, plus the app's 14-change RSI rule. Signals are evaluated once per newly closed candle, so the forming candle cannot repaint an entry.
- Requires a valid, recent Frankfurter AUD/CAD daily reference as in the app. Add `https://api.frankfurter.dev` to MT5's **Tools → Options → Expert Advisors → Allow WebRequest for listed URL**. If the reference is missing, invalid, or stale, the EA blocks new entries; it does not substitute fabricated data.
- Learns only from this EA's own AUD/CAD closed trades during the last 30 days. Two consecutive losses pause new entries for one hour; after at least five trades, a win rate below 40% tightens the RSI filter.
- Uses the app's default local weekday/session schedule (Mon–Fri, 09:00–17:00 local PC time), with time/day inputs available to match the user's configured schedule.

## Hard-coded protections

- Volume can never exceed **0.01 lot**; if the broker's minimum/step is incompatible, the EA fails closed.
- Broker-side **20-pip SL** and **30-pip TP** are attached, adjusted outward if the broker requires a larger stop distance. A position is also closed when net floating profit reaches **0.30 account-currency units per 0.01 lot**. Existing stop exits can close at a loss.
- Account-wide daily loss stop is **1%** of the estimated day-start balance. It blocks new entries and closes only this EA's positions; it never closes manual/unrelated trades.
- At the greater of balance/equity reaching **80,000,000 account-currency units**, the EA closes only its own positions and persists a stop latch for that MT5 login and magic number. No currency conversion is performed.
- One position per symbol. A manual/unrelated open AUD/CAD position blocks new entries. The EA only manages positions bearing its own magic number (`26092709` by default).
- Live entries are blocked by default. On a real account, the operator must explicitly enable `InpAllowLiveTrading` and set `InpLiveConfirmation` to exactly `LIVE`. Demo is recommended first. MT5 terminal Algo Trading / account / EA permissions are checked and never bypassed.

These controls reduce some risks but cannot guarantee profit or prevent loss, gaps, slippage, broker rejection, or terminal/network failure.

## Install and test

1. In MT5, open **File → Open Data Folder → MQL5 → Experts** and copy `MoneyWorkAdvisor.mq5` there.
2. Open it in MetaEditor and compile. Attach it to the broker's AUDCAD chart (suffixes such as `AUDCAD.a` are accepted); default signal timeframe is M5.
3. Add the Frankfurter host to MT5's WebRequest allowlist. Check the chart status text for history, reference, and terminal-permission blockers.
4. Leave `InpArmTrading=false` while compiling and reviewing. In Strategy Tester, enable `InpArmTrading` and the separate `InpTesterAllowReferenceBypass` input for that test only: MT5 does not permit `WebRequest` inside the tester. This bypass is honored only when MT5 itself reports Strategy Tester mode and is ignored on Demo/Live. Then test on MT5 Demo; to run on Demo, explicitly set `InpArmTrading=true` and enable Algo Trading in MT5.
5. Keep `InpAllowLiveTrading=false`. Do not enable Live until the Demo test and the user's separate confirmation.

The app itself caps chart storage at 2,000 bars. MT5 history depends on what the broker has delivered and the terminal has loaded; no EA can promise access to every bar ever traded. Although the EA loads the configured history window, its live technical signal deliberately matches the app and is computed from the most recent closed bars, not a claim that every bar predicts the next move. MQL5 compilation and a broker-connected Demo run must be done in MetaEditor/MT5 on Windows; they cannot be certified by the repository's Linux test runner.
