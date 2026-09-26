# Money Work — v0.4.9

Windows MT5 dashboard for AUD/CAD chart analysis, internet reference checks, configurable paper funds, and a manually armed automated MT5 strategy runner. The internet source publishes daily public reference rates, not live execution prices. The chart and strategy signals use broker MT5 data.

## Automated AUD/CAD runner

- Select **Paper** for virtual trades or **MT5 Demo / MT5 Live** for broker execution on the currently connected account. The runner starts **off** and stops after the app restarts. Live mode requires typing `LIVE` into a separate confirmation dialog each time it is armed.
- The app evaluates fresh ticks at most once every two seconds, subject to the broker actually supplying fresh quotes. The rule signal uses EMA(20/50) and RSI(14). It only manages its own AUDCAD positions (magic number `26092707`); if another position already exists on the same pair, it blocks a new entry.
- Three analysts now cooperate on every entry: the technical analyst provides direction from MT5 bars; the internet analyst verifies a recently fetched, valid public daily AUD/CAD reference; and the adaptive/history analyst uses completed broker trades (or completed Paper trades in Paper mode) to apply cooldowns and tighter-entry safeguards. Arming the runner starts the reference checker's immediate request and 15-minute refresh cycle. A compact consensus panel shows each analyst and the combined outcome. The daily reference is a source/data-quality check, never a live quote or directional vote. MT5 independently enforces the reference gate for new orders; missing/stale internet data cannot prevent managing or closing an existing agent position.
- Bridge-side hard limits: maximum 0.01 lot, no more than one agent position, mandatory stop-loss of at least 20 pips and take-profit of at least 30 pips, maximum 5-pip spread, and a new-entry/position-close stop at 1% account-wide daily loss. Two consecutive losing agent trades trigger a one-hour entry cooldown. At least five recent closed trades with win rate below 40% tightens the RSI entry filter. Limits fail closed if the broker's minimum lot exceeds 0.01, quotes are stale, algorithmic trading is disabled, or the broker does not allow both directions. Pausing the runner stops new entries and strategy exits; any already-open broker position remains at MT5 with server-side SL/TP until a stop/target fills or the user closes it. Gaps can still cause losses beyond the planned stop.
- Trade-history adaptation is a small, deterministic guardrail—not an LLM and not model training on every two-second tick. A loss-free or profitable strategy cannot be guaranteed. Gaps, slippage, rejected stops, and execution outages can still cause losses; stop orders are not a guarantee of fill price. Test on MT5 Demo first.
- Add/withdraw buttons adjust **only the local virtual Paper balance** and leave an audit ledger. Real brokerage deposits/withdrawals must be done through the broker; this app has no cash-transfer function.
- The bot needs a trading-enabled MT5 password to send broker orders. The investor password remains read-only. Saved credentials use Electron `safeStorage` backed by Windows DPAPI. Never send credentials in chat.

## Market analysis and internet reference

- The chart, quotes, account details, positions, and deal history come from the connected MT5 terminal.
- The rule analyzer needs at least 50 broker bars. It is technical analysis, not a prediction or guarantee.
- The internet checker requests AUD/CAD from the public Frankfurter API (`https://api.frankfurter.dev/v1/latest?base=AUD&symbols=CAD`) on demand or every 15 minutes. It validates response schema, publication date, and positive rate. Its globe animates while the agent is running and uses the last observed validation speed. This is a daily reference value—not a synchronized live quote, trading signal, web crawler, or self-training AI.

## Windows setup

1. Install the official MetaTrader 5 desktop terminal, then verify the desired demo/live login and server inside MT5.
2. Install Money Work from the Windows installer release.
3. Connect using the login, exact server, and the appropriate MT5 password. Use an investor password for viewing only; use a trading-enabled password only if you intend to arm automated execution.
4. Select the broker's AUDCAD symbol (including suffixes such as `AUDCAD+`). In **Agents**, configure the schedule and choose Paper or MT5 execution. Start on Demo. Live execution remains separately gated and requires typing `LIVE` after every pause/restart.

The browser preview cannot access the local MT5 terminal or execute broker trades; MT5 execution is only available in the installed Windows app. Money Work does not place trades until the runner is explicitly started.

## Development and tests

```powershell
npm ci
npm test
npm run dev
```

`npm test` runs JavaScript analyst-consensus/reference freshness tests and Python unit tests covering volume/risk policy and mocked broker execution, including live confirmation, stops/targets, stale prices, manual-position conflicts, spread limits, daily loss stops, reference-gate behavior, position closure without a reference, and adaptive cooldowns. These tests do not connect to a personal brokerage account.

To build the Windows bridge and installer, GitHub Actions bundles MetaTrader5/NumPy, runs the MT5 connector import smoke test, unit tests, checks the public AUD/CAD endpoint, builds the installer, and verifies the connector is inside it before publishing.
