# Money Work — v0.4.7

Windows desktop dashboard for read-only MetaTrader 5 data, AUD/CAD technical analysis, a public daily FX reference checker, and configurable paper-trading simulation. The MT5 connector has **no order-placement command**. The automated strategy is virtual-only: it cannot send an order or use account funds.

## Agents and data sources

- **AUD/CAD chart and rule analyzer:** reads actual bars and quotes from the connected MT5 broker. The indicator uses EMA(20/50) and RSI(14); it is deterministic technical analysis, not a generative AI model, prediction, or guarantee. If no MT5 data is connected, no fictional broker prices are shown.
- **Internet reference checker:** retrieves AUD/CAD from the public Frankfurter API (`https://api.frankfurter.dev/v1/latest?base=AUD&symbols=CAD`) and checks response schema, publication date, and that the reference rate is positive. These are daily public reference rates, not live/interbank execution prices. The animated globe runs while the scheduled checker is enabled; its displayed rotation speed is tied to the most recent validation throughput. The checker runs once on activation and then every 15 minutes. The reference is compared to MT5 mid only as a timestamp-mismatched informational comparison, never as a trade signal. It is not a general-purpose web crawler or self-training AI.
- **Paper strategy agent:** optional user-started simulation based on MT5 quotes and the rule signal. Configure a virtual CAD balance, per-simulation allocation cap, local start/end time, and weekdays. It records virtual positions/P&L locally. Settings and the paper log are saved on this device; the simulator starts paused after app restart. No broker request can place or modify a trade. Spread, fees, slippage, margin and real execution are not simulated; paper outcomes are not a forecast of returns.

## Windows setup

1. Install the official MetaTrader 5 desktop terminal and verify an account there. For a MetaQuotes demo account, use the exact server shown in that terminal.
2. Install Money Work from the Windows installer release.
3. Choose **Add MT5 account** and enter the login, exact server, and password. For read-only access, use the investor password if available. The bridge can read balance/equity, symbols, bars, positions, deal history, and quotes; it cannot place orders.
4. Select the broker's AUDCAD symbol (including a suffix such as `AUDCAD+` where applicable). Start the internet checker or paper simulator from **Agents** as desired.

If **Remember on this PC** is selected, credentials are encrypted with Electron `safeStorage` backed by Windows DPAPI. Otherwise the password is passed only to the local connector for the current session. Do not send account credentials in chat or screenshots.

## Development and tests

```powershell
npm ci
npm test
npm run dev
```

To build the read-only MT5 bridge and launch the desktop app on Windows:

```powershell
py -m pip install MetaTrader5 pyinstaller numpy
pyinstaller --clean --noconfirm --onefile --collect-all MetaTrader5 --collect-all numpy --collect-submodules numpy --hidden-import=numpy._core._multiarray_umath --name mt5-bridge --distpath bridge/dist --workpath bridge/build bridge/mt5_bridge.py
npm run electron:dev
```

For an installer, build the bridge first and run `npm run dist:win`. GitHub Actions additionally runs agent unit tests, checks that the packaged connector returns a successful status response, builds the Windows installer, and verifies that the connector is included before publishing.

## Safety boundary

Money Work remains read-only with respect to MT5. Paper trading only creates virtual records inside the app. The automated simulator is off until explicitly started, follows the configured weekday/time window, and pauses after restart. No real-money autonomous trading, order execution, LLM/AI model integration, or general web crawling is included. The browser preview cannot access the user's local MT5 terminal; the connector runs in the installed Windows desktop app.
