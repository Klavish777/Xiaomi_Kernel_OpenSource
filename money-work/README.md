# Money Work

Money Work has a live AUDCAD MT5 chart, a right-side account summary (balance, used margin and floating open-position P/L), an **open positions list with manual close controls**, manual BUY / SELL buttons, and an optional local AI helper. AI-assisted autonomous trading is opt-in, Demo-only, and uses the same protected MT5 bridge; it is off by default. No in-app virtual balance is included. The chart uses the broker's AUDCAD symbol (including its suffix, if present) on a fixed 15-minute timeframe.

## Optional local AI helper

The helper runs through **Ollama on the same computer** using the `qwen2.5:3b` model. Ollama itself is a separate installation and is not bundled with Money Work. Install it from [ollama.com/download/windows](https://ollama.com/download/windows), start Ollama, then use **Проверить снова** in the assistant panel. Money Work can then download the model from the panel and show its progress; the first download requires an internet connection and several gigabytes of free storage. After download, commands run through Ollama's local `127.0.0.1:11434` endpoint. Assistant commands and account details are not sent to a cloud AI service by Money Work. If Ollama or the model is unavailable, the MT5 chart and manual trading functions remain separate.

Natural-language commands can change presentation settings such as compact layout, the account-summary panel, and the open-positions panel. Changes to application code still require a reviewed code patch and a new build; the installed EXE cannot rewrite itself.

## Optional AI-assisted Demo trading

- Autonomous operation is **off by default** and starts only after the user clicks **Start on Demo**. It is restricted to the broker's AUDCAD symbol on M15. The local model may choose BUY, SELL, CLOSE, or WAIT once per new M15 bar; the AI has no access to account credentials.
- The app sends the order through the existing MT5 bridge. The bridge continues to enforce terminal/account Algo Trading permissions, fresh quote, spread cap, one AUDCAD position at a time, volume ≤0.01 lot, SL/TP, daily-loss stop, account cap and broker rules. Model confidence is not a guarantee; losses remain possible. Stop prevents further decisions; a broker request already sent cannot be recalled.
- **Live accounts are never traded autonomously.** On Live, the user operates the existing manual controls and enters `LIVE` before every open or close.
- Market context combines MT5 candles/quote with public Google News RSS headlines for AUDCAD and the Australian/Canadian central banks. Headlines are unverified context, may be delayed or irrelevant, and are not price data. Only a fixed public query is sent online; prompts, account balance and credentials are sent only to the local Ollama process.
- App actions and assistant decisions are kept in a local JSONL journal in the app's user-data directory. While Demo autonomy is armed, one local journal review is run hourly with a maximum five-minute inference timeout; the resulting notes are reused as context. This is **not model-weight training or a guarantee of improved decisions**. A manual “Review journal” control is also available.

## MT5 connection and manual orders

- Connect with the account number, MT5 password and exact server name in Settings. Optional credential remembering uses Windows secure storage. Investor passwords are read-only. Demo and Live MT5 accounts remain supported.
- Buy/Sell is always user-initiated. On Demo, clicking BUY or SELL sends the request directly without an intermediate confirmation window. On a real account, an inline safety prompt requires typing `LIVE` for each order. Orders are limited to **0.01 lot** and AUDCAD.
- The open positions list shows all currently open account positions and their floating result. On Demo, clicking Close sends the full-position close request directly. On a real account, the inline safety prompt requires typing `LIVE` for each close. The bridge rechecks the ticket, symbol, side and volume, and respects terminal/account Algo Trading permissions. The final result can be a loss and depends on broker execution.
- New orders are blocked if MT5/broker permissions disallow trading, the quote is stale, spread exceeds 5 pips, any AUDCAD position is already open, account-wide daily loss reaches 1%, account balance or equity reaches **80,000,000 units of the account's currency**, or the broker's minimum volume exceeds 0.01 lot. No currency conversion is applied.
- Orders include a broker-side stop-loss of at least 20 pips and take-profit of at least 30 pips (or the broker's larger minimum stop distance). While Money Work is running, only its own manually opened positions are monitored for the **0.30 account-currency target per 0.01 lot**. The server-side SL/TP remain on the order if the app closes. Risk checks block new Money Work orders; they do not control unrelated orders placed directly in MT5.
- Money Work does not bypass terminal Algo Trading, external Python API, account or broker restrictions. Losses remain possible due to slippage, gaps, rejection, outages or unavailable liquidity; SL/TP and the cash target do not guarantee fill prices or profit.
- The Paper simulator and virtual balance are removed. MT5 Demo is the broker's Demo account, not a local simulation. Bybit is supported only through its dedicated MT5 CFD account; there is no native Bybit exchange API integration.

## Data refresh

The bridge reads the terminal's latest quote at up to 20 Hz, refreshes account mode every 100 ms, and reloads chart history once per second. These are polling intervals, **not** promises of new data at those rates. Tick arrival depends on the broker, symbol, market hours, terminal, network and computer load; polling cannot create new market data.

## Windows setup and verification

1. Install the official MetaTrader 5 desktop terminal and connect the intended broker account there.
2. Install Money Work, open the gear/settings, and connect with the account number, password and exact MT5 server.
3. Test chart updates, connection behavior, order confirmation, MT5 permissions, maximum volume and all safety checks on your own MT5 Demo terminal before using a Live account.

The browser preview cannot access a local MT5 terminal or place broker orders. MT5 access is available only in the installed Windows app.

## Build and tests

```powershell
npm ci
npm test
npm run dev
```

JavaScript chart tests and Python mocked-MT5 tests do not replace testing on a real terminal. Do not publish a stable installer before the account owner has verified the candidate on MT5 Demo.
