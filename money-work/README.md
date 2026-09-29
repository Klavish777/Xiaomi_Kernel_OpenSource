# Money Work

Money Work 1.0.0-rc.7 is the baseline for this development. It has a live AUDCAD MT5 chart, a right-side account summary (balance, used margin and floating open-position P/L), an **open positions list with manual close controls**, and **manual BUY / SELL buttons**. The gear opens the MT5 connection settings. The chart uses the broker's AUDCAD symbol (including its suffix, if present) on a fixed 15-minute timeframe. No in-app virtual balance is included.

## Internet market analyst (development in progress)

The new analyst is a signal/report feature for AUDCAD M15, not an exchange-connected order bot. After connecting MT5 and configuring an OpenAI API key, it can generate at most one automatic report when a new M15 candle starts; a manual “Get signal” button is also available. The app enforces a one-minute minimum interval between all analysis runs, and public RSS feeds are cached for 60 seconds. A 1 ms internet polling cycle is not technically realistic; the model and public websites have much higher response latency, so the guard prevents rapid repeated model/API calls. The key is encrypted through Electron `safeStorage`; never send it through chat. The analyst workflow is a LangGraph state graph with separate source-retrieval, technical, news-analysis, bull/bear synthesis, and deterministic risk-gate stages. It returns only an informational `BUY`, `SELL`, or `WAIT` report; it never places an order.

Public context comes from Google News RSS plus the official [Reserve Bank of Australia media-release feed](https://www.rba.gov.au/rss/rss-cb-media-releases.xml) and [Bank of Canada press-release feed](https://www.bankofcanada.ca/content_type/press-releases/feed/). Current price and M15 candles come from the user's connected MT5 terminal and remain the price source of record; public headlines are context, not verified price data. OpenAI receives derived M15 indicators/quote-quality fields and these public headlines, but not the raw account balance, position list, or MT5 password. Each signal currently uses two OpenAI model requests (news read and bull/bear synthesis); API charges are separate from a ChatGPT subscription.

The analyst fails closed to `WAIT` if the quote is stale, spread exceeds five pips, fewer than 50 M15 bars are available, fresh online headlines cannot be fetched, or the model's confidence is below 65. A signal is not a promise of accuracy or profit, and confidence is not a calibrated probability. Reports are journaled locally; after four M15 bars, the direction is labelled against realized price movement and only a small aggregate reflection is supplied to later analysis. Small samples are explicitly marked inconclusive. Self-evolving prompts and automatic fine-tuning are not enabled; any future policy change must be reviewed and backtested separately.

The multi-agent roles are inspired by [TradingAgents](https://github.com/TauricResearch/TradingAgents) and the reflection/data-synthesis ideas in [TradingGroup](https://arxiv.org/abs/2508.17565) and [EvolveTrade](https://arxiv.org/abs/2609.17632), but this app uses a small, explicit LangGraph workflow rather than importing those research projects as drop-in trading systems. Those papers' backtest results do not establish future profitability.

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
