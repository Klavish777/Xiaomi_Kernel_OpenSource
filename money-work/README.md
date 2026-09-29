# Money Work

Money Work has one compact trading screen: a live AUDCAD MT5 chart, a right-side account summary (balance, used margin and floating open-position P/L), an **open positions list with manual close controls**, **manual BUY / SELL buttons**, and an optional local AI helper for visual interface settings. The gear opens the MT5 connection settings. No automatic strategies or in-app virtual balance are included. The chart uses the broker's AUDCAD symbol (including its suffix, if present) on a fixed 15-minute timeframe.

## Optional local AI helper

The helper runs through **Ollama on the same computer** using the `qwen2.5:3b` model. Ollama itself is a separate installation and is not bundled with Money Work. Install it from [ollama.com/download/windows](https://ollama.com/download/windows), start Ollama, then use **Проверить снова** in the assistant panel. Money Work can then download the model from the panel and show its progress; the first download requires an internet connection and several gigabytes of free storage. After download, commands run through Ollama's local `127.0.0.1:11434` endpoint. Assistant commands and account details are not sent to a cloud AI service by Money Work. If Ollama or the model is unavailable, the MT5 chart and manual trading functions remain separate.

For safety, natural-language commands can currently change only presentation settings: compact layout, the account-summary panel, and the open-positions panel. They cannot place or close orders, edit trading risk limits or permissions, alter MT5 settings, or rewrite application code. Changes to the program itself require a reviewed code patch and a new build; an installed EXE cannot safely rewrite its own code on the fly. The existing Demo/Live safeguards and manual trade controls are unchanged.

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
