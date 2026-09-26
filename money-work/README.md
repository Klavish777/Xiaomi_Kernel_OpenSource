# Money Work — v0.4.1

Windows desktop dashboard prototype for a **read-only MetaTrader 5** connection, including demo accounts. When connected, it reads account equity, broker instruments, bars, open positions, deal history and selected quotes (polled once per second). The app has **no order placement or autonomous trading endpoint** in this version.

No fictional market prices, positions or trade history are shown in the functional views. Market analysis is a deterministic EMA/RSI readout derived from the selected MT5 bars—not a predictive AI model. This update fixes packaging of the standalone MT5 bridge executable and makes the Markets, Positions, History, and Strategies views functional; Markets load from the connected broker catalog, while open positions and deal history are read from MT5. The dashboard is simplified, and the technical analyzer sits beside a clearly disabled autonomous-agent panel. It also keeps the Russian/English selector, fullscreen controls (F11 toggles; Esc exits fullscreen), and MT5 demo/live account identification. The browser preview does not have access to a local MT5 terminal—the connector works in the installed Windows desktop app.

## Windows setup

1. Install the official MetaTrader 5 desktop terminal and confirm the demo account works there. For a MetaQuotes-Demo account, use the exact `MetaQuotes-Demo` server name from the terminal.
2. Install Money Work from the Windows installer release.
3. In Money Work, choose **Add MT5 account** and enter the MT5 login, exact server name, and password. For read-only access, use the investor password if one is available. The bridge has no order-placement function. The terminal path is optional if the bridge can auto-detect it.
4. Demo MT5 accounts are supported: enter the demo login, password, and exact demo server shown in the terminal. Money Work reads the account mode from MT5 and labels demo versus live.
5. Search/select the exact broker symbol. Suffixes such as `AUDCAD+` are supported when that is how the instrument appears in MT5 Market Watch.

If **Remember on this PC** is selected, credentials are encrypted with Electron `safeStorage` backed by Windows DPAPI. Otherwise the password is only passed to the local connector for the current session. Do not send credentials in chat.

## Development

```powershell
npm ci
npm run dev
```

To build the read-only MT5 bridge and launch the desktop UI on Windows:

```powershell
py -m pip install MetaTrader5 pyinstaller
pyinstaller --clean --noconfirm --onefile --collect-all MetaTrader5 --name mt5-bridge --distpath bridge/dist --workpath bridge/build bridge/mt5_bridge.py
npm run electron:dev
```

To create a Windows installer, build the bridge first, then run `npm run dist:win`. GitHub Actions builds and publishes the Windows installer for each version on the Arena working branch.

## Safety boundary

The connector supports account metadata, broker symbol search, bars, open-position reads, deal-history reads, and quote polling. It still has no order-send command and cannot execute trades. The strategy page contains a small starter catalog only; continuous internet research, model self-training, and autonomous trading are not included. A future trading mode must be designed and tested separately with paper trading, explicit opt-in, strict risk limits, audit logs, and a kill switch.
