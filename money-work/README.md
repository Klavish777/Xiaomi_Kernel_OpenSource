# Money Work — v0.2.0

Windows desktop dashboard prototype for a **read-only Bybit MT5 CFD** connection. It can read MT5 account equity and poll a selected quote once per second when connected. The app has **no order placement or autonomous trading endpoint** in this version.

The dashboard still contains clearly labelled illustrative P&L, positions, AI analysis, and demo history; only account equity and the selected MT5 quote become live. The browser preview does not have access to a local MT5 terminal—the connector works in the installed Windows desktop app.

## Windows setup

1. Install the official MetaTrader 5 terminal and confirm the Bybit MT5 CFD account works there.
2. Install Money Work from the Windows installer release.
3. In Money Work, choose **Add MT5 account** and enter the account number, the exact server shown by MT5, and the MT5 investor/read-only password if your broker provides one. The bridge has no order-placement function. The terminal path is optional if the bridge can auto-detect it.
4. Search/select the exact broker symbol. Suffixes such as `AUDCAD+` are supported when that is how the instrument appears in MT5 Market Watch.

If **Remember on this PC** is selected, credentials are encrypted with Electron `safeStorage` backed by Windows DPAPI. Otherwise the password is only passed to the local connector for the current session. Do not send credentials in chat.

## Development

```powershell
npm ci
npm run dev
```

To build the read-only MT5 bridge and launch the desktop UI on Windows:

```powershell
py -m pip install MetaTrader5 pyinstaller
pyinstaller --clean --noconfirm --collect-all MetaTrader5 --name mt5-bridge --distpath bridge/dist --workpath bridge/build bridge/mt5_bridge.py
npm run electron:dev
```

To create a Windows installer, build the bridge first, then run `npm run dist:win`. GitHub Actions builds and publishes the Windows installer for each version on the Arena working branch.

## Safety boundary

The connector only supports account metadata, symbol search, and quote polling. It has no order-send command and cannot execute trades. A future trading mode must be designed and tested separately with paper trading, explicit opt-in, strict risk limits, audit logs, and a kill switch.
