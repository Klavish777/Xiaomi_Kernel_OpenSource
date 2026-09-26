"""MT5 data bridge and explicitly armed, risk-capped Money Work agent for Windows.

The protocol is newline-delimited JSON over stdin/stdout. Automated execution is limited
by bridge-side account-mode checks, a 0.01-lot cap, required SL/TP, a one-position rule,
a daily loss stop, and a locally confirmed live-account flag.
"""
from __future__ import annotations

import json
import sys
import threading
import time
from datetime import datetime, timedelta

from trading_policy import (
    BOT_MAGIC,
    MAX_DAILY_LOSS_RATIO,
    MAX_SPREAD_PIPS,
    MAX_VOLUME,
    STOP_LOSS_PIPS,
    TAKE_PROFIT_PIPS,
    account_mode_allowed,
    daily_loss_exceeded,
    is_inside_schedule,
    loss_streak_cooldown,
    normalize_volume,
    pip_size,
    reference_is_valid,
)

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
_learning_cache = {"login": None, "loadedAt": 0.0, "trades": []}


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
        "tradeAllowed": bool(getattr(info, "trade_allowed", False)),
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
            "magic": int(getattr(row, "magic", 0)),
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
            "magic": int(getattr(row, "magic", 0)),
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


def _send_market_deal(request: dict) -> dict:
    filling_options = [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN]
    last_result = None
    for filling in dict.fromkeys(filling_options):
        request["type_filling"] = filling
        last_result = mt5.order_send(request)
        if last_result is None:
            raise RuntimeError(f"MT5 rejected the order request: {mt5.last_error()}")
        if int(last_result.retcode) == int(mt5.TRADE_RETCODE_INVALID_FILL):
            continue
        break
    if last_result is None or int(last_result.retcode) not in {
        int(mt5.TRADE_RETCODE_DONE), int(mt5.TRADE_RETCODE_DONE_PARTIAL),
    }:
        code = getattr(last_result, "retcode", "unknown")
        details = getattr(last_result, "comment", "")
        raise RuntimeError(f"MT5 order was not accepted (retcode {code}): {details}")
    return {"retcode": int(last_result.retcode), "order": int(getattr(last_result, "order", 0)),
            "deal": int(getattr(last_result, "deal", 0)), "comment": str(getattr(last_result, "comment", ""))}


def _close_bot_position(position, symbol: str, tick, info) -> dict:
    is_buy = int(position.type) == int(mt5.POSITION_TYPE_BUY)
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "position": int(position.ticket),
        "volume": float(position.volume),
        "type": mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY,
        "price": float(tick.bid if is_buy else tick.ask),
        "deviation": 20,
        "magic": BOT_MAGIC,
        "comment": "MoneyWork agent close",
        "type_time": mt5.ORDER_TIME_GTC,
    }
    return _send_market_deal(request)


def evaluate_agent(command: dict) -> dict:
    symbol = str(command.get("symbol", "")).strip()
    if not symbol or not symbol.upper().startswith("AUDCAD"):
        raise ValueError("The automatic MT5 agent is currently restricted to the AUDCAD instrument.")
    signal = str(command.get("signal", "WAIT"))
    if signal not in {"WATCH BUY", "WATCH SELL", "WAIT"}:
        raise ValueError("Invalid automatic-agent signal.")
    with _mt5_lock:
        if not _connected:
            raise RuntimeError("Connect an MT5 account before starting the trade agent.")
        account = mt5.account_info()
        terminal = mt5.terminal_info()
        if account is None or terminal is None:
            raise RuntimeError(f"MT5 account or terminal is unavailable: {mt5.last_error()}")
        trade_mode = int(account.trade_mode)
        live_confirmed = command.get("liveConfirmed") is True
        if not account_mode_allowed(trade_mode, live_confirmed):
            raise PermissionError("Order execution is restricted to a demo account or an explicitly confirmed live account.")
        if not bool(getattr(account, "trade_allowed", False)) or not bool(getattr(terminal, "trade_allowed", False)) or bool(getattr(terminal, "tradeapi_disabled", False)):
            raise PermissionError("MT5 or this account has disabled algorithmic trading. Enable it in MetaTrader and reconnect.")

        now = datetime.now()
        settings = command.get("schedule") if isinstance(command.get("schedule"), dict) else {}
        scheduled = is_inside_schedule(now, str(settings.get("start", "09:00")), str(settings.get("end", "17:00")), settings.get("days", []))
        if settings.get("start") == settings.get("end"):
            scheduled = False

        info = mt5.symbol_info(symbol)
        tick = mt5.symbol_info_tick(symbol)
        if info is None or tick is None or float(tick.bid) <= 0 or float(tick.ask) <= 0:
            raise RuntimeError(f"No valid MT5 market data is available for {symbol}.")
        tick_time = int(getattr(tick, "time", 0))
        if not tick_time or now.timestamp() - tick_time > 30:
            raise RuntimeError("The latest AUDCAD tick is stale; new orders are blocked until fresh market data arrives.")

        all_positions = mt5.positions_get(symbol=symbol)
        if all_positions is None:
            raise RuntimeError(f"Could not read open positions: {mt5.last_error()}")
        bot_positions = [row for row in all_positions if int(getattr(row, "magic", 0)) == BOT_MAGIC]
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        todays_deals = mt5.history_deals_get(today, now)
        if todays_deals is None:
            raise RuntimeError(f"Could not read today's trade history: {mt5.last_error()}")
        account_realized_pnl = sum(float(row.profit) + float(row.commission) + float(row.swap) for row in todays_deals)
        account_floating_pnl = float(getattr(account, "profit", 0))
        start_balance = float(account.balance) - account_realized_pnl
        daily_pnl = account_realized_pnl + account_floating_pnl
        daily_stop = daily_loss_exceeded(start_balance, account_realized_pnl, account_floating_pnl)

        closing_entries = {int(getattr(mt5, "DEAL_ENTRY_OUT", 1)), int(getattr(mt5, "DEAL_ENTRY_OUT_BY", 3))}
        if now.timestamp() - float(_learning_cache.get("loadedAt", 0)) >= 60 or _learning_cache.get("login") != int(account.login):
            month_deals = mt5.history_deals_get(now - timedelta(days=30), now)
            if month_deals is None:
                raise RuntimeError(f"Could not read recent trade history for adaptive safeguards: {mt5.last_error()}")
            _learning_cache["trades"] = [{"time": int(row.time), "profit": float(row.profit), "commission": float(row.commission), "swap": float(row.swap)}
                                          for row in month_deals if int(getattr(row, "magic", 0)) == BOT_MAGIC
                                          and str(getattr(row, "symbol", "")).upper().startswith("AUDCAD")
                                          and int(getattr(row, "entry", -1)) in closing_entries]
            _learning_cache["loadedAt"] = now.timestamp()
            _learning_cache["login"] = int(account.login)
        closed_trades = list(_learning_cache["trades"])
        cooldown_until = loss_streak_cooldown(closed_trades, now)
        recent = sorted(closed_trades, key=lambda row: row["time"], reverse=True)[:20]
        win_rate = (sum(1 for row in recent if row["profit"] + row["commission"] + row["swap"] > 0) / len(recent)) if recent else None
        consecutive_losses = 0
        for row in sorted(closed_trades, key=lambda item: item["time"], reverse=True):
            if row["profit"] + row["commission"] + row["swap"] < 0:
                consecutive_losses += 1
            else:
                break

        if daily_stop:
            closed = []
            for position in bot_positions:
                closed.append(_close_bot_position(position, symbol, tick, info))
            return {"state": "daily_loss_stop", "dailyPnl": daily_pnl,
                    "dailyLossLimit": round(start_balance * MAX_DAILY_LOSS_RATIO, 2), "closed": closed,
                    "closedTrades": len(closed_trades), "winRate": win_rate, "consecutiveLosses": consecutive_losses}

        if bot_positions:
            position = bot_positions[0]
            position_side = "WATCH BUY" if int(position.type) == int(mt5.POSITION_TYPE_BUY) else "WATCH SELL"
            should_close = not scheduled or (signal in {"WATCH BUY", "WATCH SELL"} and signal != position_side)
            if should_close:
                result = _close_bot_position(position, symbol, tick, info)
                return {"state": "position_closed", "position": int(position.ticket), "result": result,
                        "dailyPnl": daily_pnl, "closedTrades": len(closed_trades),
                        "winRate": win_rate, "consecutiveLosses": consecutive_losses}
            return {"state": "position_held", "position": int(position.ticket), "dailyPnl": daily_pnl,
                    "closedTrades": len(closed_trades), "winRate": win_rate, "consecutiveLosses": consecutive_losses}

        if not scheduled:
            return {"state": "outside_schedule", "dailyPnl": daily_pnl, "closedTrades": len(closed_trades), "winRate": win_rate}
        if cooldown_until:
            return {"state": "learning_cooldown", "cooldownUntil": cooldown_until.isoformat(), "dailyPnl": daily_pnl,
                    "closedTrades": len(closed_trades), "winRate": win_rate, "consecutiveLosses": consecutive_losses}
        if signal == "WAIT":
            return {"state": "waiting_signal", "dailyPnl": daily_pnl, "closedTrades": len(closed_trades), "winRate": win_rate}
        if not reference_is_valid(command.get("reference"), now):
            return {"state": "awaiting_internet_check", "dailyPnl": daily_pnl, "closedTrades": len(closed_trades),
                    "winRate": win_rate, "message": "A recent, verified AUD/CAD internet reference is required before a new entry."}
        if any(int(getattr(row, "magic", 0)) != BOT_MAGIC for row in all_positions):
            return {"state": "blocked_manual_position", "dailyPnl": daily_pnl, "closedTrades": len(closed_trades), "winRate": win_rate}

        rsi = float(command.get("rsi", 50))
        effective_signal = signal
        if len(recent) >= 5 and win_rate is not None and win_rate < 0.4:
            if (signal == "WATCH BUY" and rsi >= 60) or (signal == "WATCH SELL" and rsi <= 40):
                effective_signal = "WAIT"
        if effective_signal == "WAIT":
            return {"state": "adaptive_filter", "dailyPnl": daily_pnl, "closedTrades": len(closed_trades),
                    "winRate": win_rate, "consecutiveLosses": consecutive_losses,
                    "learning": "Entry filter tightened after a weak recent win rate."}

        trading_mode = int(getattr(info, "trade_mode", 0))
        if trading_mode != int(getattr(mt5, "SYMBOL_TRADE_MODE_FULL", 4)):
            raise PermissionError("AUDCAD trading is disabled or one-direction-only at this broker; new orders are blocked.")
        volume = normalize_volume(info)
        distance = pip_size(int(info.digits), float(info.point))
        spread_pips = (float(tick.ask) - float(tick.bid)) / distance
        if spread_pips > MAX_SPREAD_PIPS:
            return {"state": "spread_filter", "spreadPips": spread_pips, "dailyPnl": daily_pnl,
                    "closedTrades": len(closed_trades), "winRate": win_rate}
        minimum_stop = max(int(getattr(info, "trade_stops_level", 0)), int(getattr(info, "trade_freeze_level", 0))) * float(info.point)
        stop_distance = max(STOP_LOSS_PIPS * distance, minimum_stop)
        take_distance = max(TAKE_PROFIT_PIPS * distance, minimum_stop)
        is_buy = effective_signal == "WATCH BUY"
        entry = float(tick.ask if is_buy else tick.bid)
        sl = entry - stop_distance if is_buy else entry + stop_distance
        tp = entry + take_distance if is_buy else entry - take_distance
        digits = int(info.digits)
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL,
            "price": round(entry, digits),
            "sl": round(sl, digits),
            "tp": round(tp, digits),
            "deviation": 20,
            "magic": BOT_MAGIC,
            "comment": "MoneyWork EMA RSI agent",
            "type_time": mt5.ORDER_TIME_GTC,
        }
        result = _send_market_deal(request)
        return {"state": "position_opened", "side": "BUY" if is_buy else "SELL", "symbol": symbol,
                "volume": volume, "entry": request["price"], "stopLoss": request["sl"], "takeProfit": request["tp"],
                "result": result, "dailyPnl": daily_pnl, "dailyLossLimit": round(start_balance * MAX_DAILY_LOSS_RATIO, 2),
                "closedTrades": len(closed_trades), "winRate": win_rate, "consecutiveLosses": consecutive_losses,
                "learning": "The two-second market evaluation uses the latest closed-trade record; two consecutive losses trigger a one-hour cooldown."}


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
        elif action == "agent_evaluate":
            response(request_id, True, result=evaluate_agent(command))
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
