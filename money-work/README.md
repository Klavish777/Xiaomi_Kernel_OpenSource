# Money Work

Money Work has one compact trading screen: a live AUDCAD MT5 chart, an **open positions list with manual close controls**, and **manual BUY / SELL buttons**. The gear opens the MT5 connection settings. No analysis tools, strategies, agents, or in-app virtual balance are included. The chart uses the broker's AUDCAD symbol (including its suffix, if present) on a fixed 15-minute timeframe.

## MT5 connection and manual orders

- Connect with the account number, MT5 password and exact server name in Settings. Optional credential remembering uses Windows secure storage. Investor passwords are read-only. Demo and Live MT5 accounts remain supported.
- Every Buy/Sell is user-initiated and requires a confirmation. Orders are limited to **0.01 lot** and AUDCAD. For a real account, type `LIVE` for each order.
- The open positions list shows all currently open account positions and their floating result. Closing a position requires a separate confirmation; on Live, type `LIVE` for each close. The bridge rechecks the ticket, symbol, side and volume before sending a full-position market close and respects terminal/account Algo Trading permissions. The final result can be a loss and depends on broker execution.
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
