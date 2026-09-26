# Money Work — 0.1.0

A polished Windows desktop dashboard prototype for trading analysis. The current build is **demo-only**: market prices, account metrics, AI readouts, positions, and trade activity are sample data. No broker connection, credential collection, or real-order execution is implemented.

## Run the dashboard preview

```bash
npm install
npm run dev
```

## Run as an Electron desktop app

```bash
npm install
npm run electron:dev
```

## Build the Windows installer

On Windows:

```powershell
npm ci
npm run dist:win
```

The installer is written to `release/`. GitHub Actions also builds a Windows installer when `money-work/**` changes on the Arena working branch.

## Safety and integration roadmap

1. Read-only instrument/account connection, if supported, with credentials stored securely on the user's device.
2. Historical data, backtesting, and paper trading with explicit sample/test labels.
3. Risk engine with hard exposure/drawdown limits, kill switch, and detailed audit log.
4. Live order execution only after venue/API capabilities and permissions are verified, with a separate explicit opt-in.

The current dashboard uses AUDCAD as an illustrative symbol and Bybit CFD/MT5 wording as a UI placeholder. The exact Bybit MT5 CFD connection method and macOS/Windows bridge must be validated before connecting an account. Never paste API keys, passwords, or seed phrases into chat.
