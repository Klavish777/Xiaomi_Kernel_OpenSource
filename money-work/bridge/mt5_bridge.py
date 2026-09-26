"""Read-only MetaTrader 5 bridge used by Money Work on Windows.

The protocol is newline-delimited JSON over stdin/stdout. This bridge deliberately
has no order_send endpoint: it can read account metadata, symbols, and market ticks only.
"""
from __future__ import annotations

import json
import sys
import threading
import time
from datetime import datetime, timedelta

try:
    import MetaTrader5 as mt5
except Exception as exc:  # bundled by the Windows build workflow
    print(json.dumps({"type": "fatal", "message": f"MetaTrader5 Python module unavailable: {exc}"}), flush=True)
    raise

_out_lock = threading.Lock()
_mt5_lock = threading.RLock()
_state_lock = threading.RLock()
_active_symbols: set[str] = set()
_connected = False
_running = True


def emit(payload: dict) -> None:
    with _out_lock:
        sys.stdout.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")
        sys.stdout.flush()


def response(request_id, ok: bool, **payload) -> None:
    emit({"type": "response", "requestId": request_id, "ok": ok, **payload})


def account_payload() -> dict:
    info = mt5.account_info()
    if info is None:
        raise RuntimeError(f"MT5 account_info failed: {mt5.last_error()}")
    return {
        "login": str(info.login),
        "server": str(info.server),
        "currency": str(info.currency),
        "balance": float(info.balance),
        "equity": float(info.equity),
        "leverage": int(info.leverage),
        "tradeMode": int(info.trade_mode),
        "accountType": "demo" if int(info.trade_mode) == 0 else "contest" if int(info.trade_mode) == 1 else "real",
        "connected": True,
    }


def connect(payload: dict) -> dict:
    global _connected
    login_text = str(payload.get("login", "")).strip()
    password = str(payload.get("password", ""))
    server = str(payload.get("server", "")).strip()
    terminal_path = str(payload.get("terminalPath", "")).strip()
    if not login_text.isdigit() or not password or not server:
        raise ValueError("Enter the MT5 account number, password, and server name.")

    kwargs = {"login": int(login_text), "password": password, "server": server, "timeout": 30000}
    if terminal_path:
        kwargs["path"] = terminal_path
    with _mt5_lock:
        if _connected:
            mt5.shutdown()
            _connected = False
        if not mt5.initialize(**kwargs):
            raise RuntimeError(f"Could not connect to MT5: {mt5.last_error()}. Check the server, account, password, and terminal path.")
        _connected = True
        return account_payload()


def get_symbols(query: str) -> list[str]:
    text = query.strip().upper()
    with _mt5_lock:
        if not _connected:
            raise RuntimeError("Connect an MT5 account first.")
        all_symbols = mt5.symbols_get()
        if all_symbols is None:
            raise RuntimeError(f"Could not read MT5 symbols: {mt5.last_error()}")
        matches = [str(item.name) for item in all_symbols if not text or text in str(item.name).upper()]
        return matches[:500]


def subscribe(symbol: str) -> dict:
    name = symbol.strip()
    if not name:
        raise ValueError("Choose an exact instrument name from MT5.")
    with _mt5_lock:
        if not _connected:
            raise RuntimeError("Connect an MT5 account first.")
        info = mt5.symbol_info(name)
        if info is None:
            raise RuntimeError(f"MT5 symbol not found: {name}. Search the broker's symbol list and use its exact spelling/suffix.")
        if not info.visible and not mt5.symbol_select(name, True):
            raise RuntimeError(f"MT5 could not enable symbol {name}: {mt5.last_error()}")
        tick = mt5.symbol_info_tick(name)
        if tick is None:
            raise RuntimeError(f"No market tick yet for {name}: {mt5.last_error()}")
        with _state_lock:
            _active_symbols.add(name)
        return {"symbol": name, "bid": float(tick.bid), "ask": float(tick.ask), "time": int(tick.time)}


def get_positions() -> list[dict]:
    with _mt5_lock:
        if not _connected:
            raise RuntimeError("Connect an MT5 account first.")
        positions = mt5.positions_get()
        if positions is None:
            raise RuntimeError(f"Could not read open MT5 positions: {mt5.last_error()}")
        return [{
            "ticket": int(row.ticket),
            "symbol": str(row.symbol),
            "type": "BUY" if int(row.type) == mt5.POSITION_TYPE_BUY else "SELL",
            "volume": float(row.volume),
            "openPrice": float(row.price_open),
            "currentPrice": float(row.price_current),
            "profit": float(row.profit),
            "swap": float(row.swap),
            "stopLoss": float(row.sl),
            "takeProfit": float(row.tp),
            "time": int(row.time),
            "comment": str(row.comment),
        } for row in positions]


def get_deals(days: int = 30) -> list[dict]:
    lookback = max(1, min(int(days), 365))
    with _mt5_lock:
        if not _connected:
            raise RuntimeError("Connect an MT5 account first.")
        rows = mt5.history_deals_get(datetime.now() - timedelta(days=lookback), datetime.now())
        if rows is None:
            raise RuntimeError(f"Could not read MT5 deal history: {mt5.last_error()}")
        result = [{
            "ticket": int(row.ticket),
            "order": int(row.order),
            "positionId": int(row.position_id),
            "symbol": str(row.symbol),
            "type": "BUY" if int(row.type) == mt5.DEAL_TYPE_BUY else "SELL" if int(row.type) == mt5.DEAL_TYPE_SELL else "OTHER",
            "entry": int(row.entry),
            "volume": float(row.volume),
            "price": float(row.price),
            "profit": float(row.profit),
            "commission": float(row.commission),
            "swap": float(row.swap),
            "time": int(row.time),
            "comment": str(row.comment),
        } for row in rows]
        return result[-1000:]


def get_history(symbol: str, timeframe: str) -> list[dict]:
    frames = {
        "1M": mt5.TIMEFRAME_M1,
        "5M": mt5.TIMEFRAME_M5,
        "15M": mt5.TIMEFRAME_M15,
        "1H": mt5.TIMEFRAME_H1,
    }
    name = symbol.strip()
    frame = frames.get(timeframe.upper())
    if not name or frame is None:
        raise ValueError("Choose a symbol and supported timeframe (1M, 5M, 15M, 1H).")
    with _mt5_lock:
        if not _connected:
            raise RuntimeError("Connect an MT5 account first.")
        rates = mt5.copy_rates_from_pos(name, frame, 0, 64)
        if rates is None:
            raise RuntimeError(f"Could not read MT5 history for {name}: {mt5.last_error()}")
        return [{
            "time": int(row["time"]),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "tickVolume": int(row["tick_volume"]),
        } for row in rates]


def disconnect() -> None:
    global _connected
    with _state_lock:
        _active_symbols.clear()
    with _mt5_lock:
        if _connected:
            mt5.shutdown()
            _connected = False


def quote_poller() -> None:
    while _running:
        with _state_lock:
            symbols = tuple(_active_symbols)
        if symbols and _connected:
            for symbol in symbols:
                try:
                    with _mt5_lock:
                        tick = mt5.symbol_info_tick(symbol)
                    if tick is not None:
                        emit({"type": "tick", "symbol": symbol, "bid": float(tick.bid), "ask": float(tick.ask),
                              "last": float(tick.last), "time": int(tick.time), "timeMsc": int(tick.time_msc)})
                except Exception as exc:
                    emit({"type": "warning", "message": f"Quote read failed for {symbol}: {exc}"})
        time.sleep(1.0)


def handle(command: dict) -> None:
    request_id = command.get("requestId")
    action = command.get("action")
    try:
        if action == "connect":
            response(request_id, True, account=connect(command))
        elif action == "symbols":
            response(request_id, True, symbols=get_symbols(str(command.get("query", ""))))
        elif action == "subscribe":
            response(request_id, True, quote=subscribe(str(command.get("symbol", ""))))
        elif action == "history":
            response(request_id, True, bars=get_history(str(command.get("symbol", "")), str(command.get("timeframe", "15M"))))
        elif action == "positions":
            response(request_id, True, positions=get_positions())
        elif action == "deals":
            response(request_id, True, deals=get_deals(command.get("days", 30)))
        elif action == "disconnect":
            disconnect()
            response(request_id, True, disconnected=True)
        elif action == "status":
            response(request_id, True, connected=_connected)
        else:
            response(request_id, False, message="Unknown bridge command.")
    except Exception as exc:
        response(request_id, False, message=str(exc))


def main() -> None:
    global _running
    poller = threading.Thread(target=quote_poller, daemon=True)
    poller.start()
    try:
        for line in sys.stdin:
            if not line.strip():
                continue
            try:
                handle(json.loads(line))
            except Exception as exc:
                emit({"type": "warning", "message": f"Bad bridge request: {exc}"})
    finally:
        _running = False
        try:
            disconnect()
        except Exception:
            pass


if __name__ == "__main__":
    main()
