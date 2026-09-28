# Money Work — v1.0 Release Candidate (1.0.0-rc.1)

Windows desktop workspace for AUD/CAD market analysis and execution through a connected MetaTrader 5 account. This candidate removes the in-app Paper simulator, synthetic trades, virtual balance and its controls. **MT5 Demo and MT5 Live remain available.** Bybit connectivity is through Bybit's dedicated MT5 CFD account and MT5 terminal—not native Bybit exchange API credentials. This is a release candidate only: do not publish stable V1.0 until the installer is tested on the user's own MT5 Demo terminal.

The chart, quotes, account details, positions and deals come from the connected MT5 terminal. Money Work does not insert example balances, trades, positions or prices. Frankfurter and the Bank of Canada supply public **daily reference rates**, not live market prices or a tick feed.

## MT5 synchronization

- The Windows bridge polls selected MT5 symbols every 100 ms and emits updates when MT5 provides them. The app also requests account and positions data every 100 ms, recent deals about once a second, and refreshed chart history once a second. These are request/polling intervals, **not a promise that the broker delivers a new tick at those rates**. The visible cadence is measured from broker quote timestamps.
- New agent evaluations are limited to at most one per two seconds and still require a new tick. Actual quote freshness and delivery depend on the broker, instrument, terminal, network, market hours and system load. Polling cannot create new market data or guarantee zero delay.
- The internet-reference agent checks immediately when started, then every six hours while enabled. The Frankfurter daily AUD/CAD reference is validated and the Bank of Canada daily series is used as fallback. It is a source/data-quality check only—not a live quote, trading signal or execution price. A missing/stale reference blocks new entries but does not prevent managing or closing an existing agent position.

## Automated AUD/CAD runner

- Choose a connected **MT5 Demo** account for testing. **MT5 Live** is also supported, but the runner starts off; starting real-account automation requires a separate confirmation each time, including typing `LIVE`. The app does not bypass MT5 terminal Algo Trading or external Python API restrictions.
- Three analysts cooperate on entries: technical analysis from MT5 bars, a validated public daily AUD/CAD reference check, and the adaptive-history analyst using completed **broker** trades. The adaptive safeguards include a one-hour entry cooldown after two consecutive losing agent trades and a stricter RSI filter after at least five recent closed trades with a win rate below 40%. This is deterministic risk logic, not continuous AI training.
- The runner uses EMA(20/50) and RSI(14), and manages only its own AUDCAD positions (magic number `26092707`). If another position already exists on the same pair, it blocks a new entry. Arming it authorizes only this bounded strategy—not unrestricted access to the whole account or manual/unrelated positions.
- The chart has manual **BUY / SELL** buttons for AUDCAD while the autopilot is off. Each opens a confirmation for one 0.01-lot order with broker-side 20-pip SL and 30-pip TP, subject to fresh-quote, spread, daily-loss, account-cap, terminal-permission and one-position checks. Each Live order additionally requires typing `LIVE`. These positions remain user-managed; the autopilot does not apply its cash-target or signal exits while paused. Trading directly in MT5 remains separate.
- Existing safeguards remain enabled: maximum order volume **0.01 lot**, one agent position at a time, mandatory stop-loss of at least 20 pips, take-profit of at least 30 pips, maximum 5-pip spread, and a 1% account-wide daily-loss stop. The cash-profit close target is **0.30 account-currency units per 0.01 lot**. The agent latches off when the greater of account balance or equity reaches **80,000,000 account-currency units**, with no currency conversion. The threshold is keyed to the login/server account. At the cap, it closes only positions it owns; manual or unrelated positions are not closed.
- Broker-side stop-loss/take-profit, daily-loss protection, schedule limits and signal exits remain active and may close at a loss. Gaps, slippage, rejected stops or execution outages can still cause losses; stop orders do not guarantee a fill price. The target is not guaranteed income or realized profit.
- Pausing the runner stops new entries and strategy exits. An already-open broker position remains at MT5 with its server-side SL/TP until a stop/target fills or the user closes it. Real deposits and withdrawals happen at the broker; Money Work does not transfer funds.

## Bybit MT5 CFD account

Bybit uses a dedicated **MT5 CFD account**, separate from the Unified Trading Account. First create/activate that account with Bybit, then enter its assigned **MT5 account ID**, **MT5 trading password**, and **exact server name** in Money Work. The account form offers `Bybit-Demo` and `Bybit-Live` presets, but the server displayed for your account is authoritative and must match exactly. Do not enter the Bybit website password or UID. Money Work has no native Bybit exchange API integration and does not move funds between Bybit accounts. See [Bybit's MT5 CFD setup instructions](https://www.bybit.com/en/help-center/article/How-to-Get-Started-with-MT5-CFD-Account) and [TradFi MT5 FAQ](https://www.bybit.com/en/help-center/article/FAQ-TradFi-MT5).

## Windows setup

1. Install the official MetaTrader 5 desktop terminal and verify the intended broker Demo account in MT5 itself.
2. Install the Money Work Windows candidate.
3. Connect using the account login, exact server, and appropriate MT5 password. An investor password is read-only; a trading-enabled password is required only if you intend to arm automated execution. Saved credentials use Electron `safeStorage` backed by Windows DPAPI. Never send credentials in chat.
4. Select the broker's AUDCAD symbol, including broker suffixes such as `AUDCAD+`. Configure the schedule and begin on MT5 Demo. Live execution remains separately gated.
5. Before V1.0 publication, verify account/quote/chart synchronization, permissions, order sizing and all safety behavior on your own MT5 Demo terminal. CI and mock tests cannot replace this device-side broker check.

The browser preview cannot access the local MT5 terminal or execute broker trades; MT5 execution is available only in the installed Windows app.

## Analysis and charts

- The rule analyzer needs at least 50 broker bars; it is technical analysis, not a prediction or guarantee.
- The chart can load up to 2,000 MT5 candles per selected timeframe. Drag or wheel to pan; use the controls for zoom, candle/line display, and toggleable SMA/EMA with an editable period.
- The strategy catalog includes 11 common FX approaches. Only EMA/RSI is currently wired into the automatic runner; other entries are research descriptions, not live trading strategies or performance promises.

## MT5 algorithmic trading permission

If the bridge reports algorithmic trading or the external Python API is disabled, Money Work stops that run instead of bypassing the terminal restriction. In the same MT5 terminal, enable the Algo Trading toolbar control, then open **Tools → Options → Expert Advisors**. Enable **Allow algorithmic trading** and uncheck **Disable automated trading via external Python API**. Confirm MT5 is logged into the intended Demo account with the appropriate password, reconnect in Money Work, then explicitly start the agent again.

## Development and tests

```powershell
npm ci
npm test
npm run dev
```

`npm test` runs JavaScript analyst-consensus, quote timestamp/cadence, chart and reference-validation tests, plus Python unit tests for risk policy and mocked broker execution. Coverage includes live confirmation, the 0.01-lot cap, pip and cash-profit targets, the 80-million account-currency stop, stale prices, manual-position conflicts, spread limits, daily loss stops, reference-gate behavior, closure without a reference, and adaptive cooldowns. Tests do not connect to a personal brokerage account.

The Windows workflow bundles the MT5/NumPy connector, smoke-tests it, runs tests, verifies a public AUD/CAD daily reference and builds the installer. On this session branch, a successful RC push also creates or refreshes an **unpublished draft prerelease** so the account owner can download the candidate for MT5 Demo testing; this draft is not a public/stable release. Stable V1.0 publication remains manually gated by both the `publish` and `verified_demo` workflow inputs and must wait for the user's MT5 Demo device verification.

A separate native MT5 Expert Advisor source is in [`mt5/MoneyWorkAdvisor.mq5`](mt5/MoneyWorkAdvisor.mq5) with install, data-source, risk, and Strategy Tester notes in [`mt5/README.md`](mt5/README.md). It is not included in the Windows desktop installer and must be compiled in MetaEditor and verified on Demo. The repository CI does not compile MQL5.
