"""Manual-only MT5 bridge for Money Work on Windows.

New market orders are sent only after an explicit user confirmation. Bridge-side checks
enforce account permissions, a 0.01-lot cap, required SL/TP, one-position, spread,
daily-loss and account-value limits. No strategy or autonomous entry logic is exposed.
"""
from __future__ import annotations

import json
import math
import sys
import threading
import time
from datetime import datetime

from trading_policy import (
    MAX_SPREAD_PIPS,
    STOP_LOSS_PIPS,
    TAKE_PROFIT_PIPS,
    account_balance_or_equity_cap_reached,
    account_mode_allowed,
    daily_loss_exceeded,
    normalize_volume,
    pip_size,
    profit_target_for_volume,
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
_quote_observations: dict[str, tuple[tuple, float]] = {}
QUOTE_POLL_INTERVAL_SECONDS = 0.05  # Read the latest terminal tick up to 20 Hz; this does not create broker ticks.
MAX_QUOTE_RECEIPT_AGE_SECONDS = 30.0
_connected = False
_running = True
MANUAL_MAGIC = 26092708


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
    terminal = mt5.terminal_info()
    terminal_trade_allowed = bool(getattr(terminal, "trade_allowed", False)) if terminal is not None else False
    external_api_disabled = bool(getattr(terminal, "tradeapi_disabled", True)) if terminal is not None else True
    account_trade_allowed = bool(getattr(info, "trade_allowed", False))
    return {
        "login": str(info.login),
        "server": str(info.server),
        "currency": str(info.currency),
        "balance": float(info.balance),
        "equity": float(info.equity),
        "margin": float(getattr(info, "margin", 0)),
        "leverage": int(info.leverage),
        "tradeMode": int(info.trade_mode),
        "tradeAllowed": account_trade_allowed,
        "terminalTradeAllowed": terminal_trade_allowed,
        "externalApiTradingDisabled": external_api_disabled,
        "algorithmicTradingAllowed": account_trade_allowed and terminal_trade_allowed and not external_api_disabled,
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
        with _state_lock:
            _active_symbols.clear()
            _quote_observations.clear()
        return account_payload()


def get_account() -> dict:
    with _mt5_lock:
        if not _connected:
            raise RuntimeError("Connect an MT5 account first.")
        return account_payload()


def get_open_positions() -> list[dict]:
    """Return the broker's current open positions for the account dashboard."""
    with _mt5_lock:
        if not _connected:
            raise RuntimeError("Connect an MT5 account first.")
        positions = mt5.positions_get()
        if positions is None:
            raise RuntimeError(f"Could not read open positions: {mt5.last_error()}")
        rows = []
        for position in positions:
            is_buy = int(position.type) == int(mt5.POSITION_TYPE_BUY)
            tick = mt5.symbol_info_tick(str(position.symbol))
            current_price = None
            if tick is not None:
                value = float(getattr(tick, "bid" if is_buy else "ask", 0) or 0)
                current_price = value if value > 0 else None
            rows.append({
                "ticket": int(position.ticket),
                "symbol": str(position.symbol),
                "side": "BUY" if is_buy else "SELL",
                "volume": float(position.volume),
                "openPrice": float(getattr(position, "price_open", 0) or 0),
                "currentPrice": current_price,
                "stopLoss": float(getattr(position, "sl", 0) or 0),
                "takeProfit": float(getattr(position, "tp", 0) or 0),
                "profit": float(getattr(position, "profit", 0) or 0),
                "swap": float(getattr(position, "swap", 0) or 0),
                "commission": float(getattr(position, "commission", 0) or 0),
                "netProfit": sum(float(getattr(position, key, 0) or 0) for key in ("profit", "swap", "commission")),
                "openedAt": int(getattr(position, "time", 0) or 0),
                "magic": int(getattr(position, "magic", 0) or 0),
            })
        return rows


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


def _tick_signature(tick) -> tuple:
    """Identify a distinct terminal quote without comparing broker time to the PC clock."""
    return (
        int(getattr(tick, "time_msc", 0) or 0),
        int(getattr(tick, "time", 0) or 0),
        float(getattr(tick, "bid", 0) or 0),
        float(getattr(tick, "ask", 0) or 0),
        float(getattr(tick, "last", 0) or 0),
        int(getattr(tick, "volume", 0) or 0),
        float(getattr(tick, "volume_real", 0) or 0),
        int(getattr(tick, "flags", 0) or 0),
    )


def _record_quote_observation(symbol: str, tick) -> None:
    signature = _tick_signature(tick)
    with _state_lock:
        previous = _quote_observations.get(symbol)
        if previous is None or previous[0] != signature:
            _quote_observations[symbol] = (signature, time.monotonic())


def _quote_is_recent(symbol: str, tick) -> bool:
    """Check receipt age monotonically; broker/server wall clocks may differ from Windows."""
    signature = _tick_signature(tick)
    now = time.monotonic()
    with _state_lock:
        previous = _quote_observations.get(symbol)
        if previous is None:
            return False
        if previous[0] != signature:
            # The direct MT5 read produced a new quote since the background poll.
            _quote_observations[symbol] = (signature, now)
            return True
        return now - previous[1] <= MAX_QUOTE_RECEIPT_AGE_SECONDS


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
            _active_symbols.clear()
            _active_symbols.add(name)
        _record_quote_observation(name, tick)
        return {"symbol": name, "bid": float(tick.bid), "ask": float(tick.ask), "time": int(tick.time)}


def get_history(symbol: str, count: int = 2000) -> list[dict]:
    name = symbol.strip()
    frame = mt5.TIMEFRAME_M15
    try:
        count = max(2, min(2000, int(count)))
    except (TypeError, ValueError):
        count = 2000
    if not name or frame is None:
        raise ValueError("Choose a symbol with the AUDCAD 15-minute chart available.")
    with _mt5_lock:
        if not _connected:
            raise RuntimeError("Connect an MT5 account first.")
        rates = mt5.copy_rates_from_pos(name, frame, 0, count)
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


def _protected_market_order_request(symbol: str, side: str, volume: float, tick, info, magic: int, comment: str) -> dict:
    is_buy = str(side).upper() == "BUY"
    if not is_buy and str(side).upper() != "SELL":
        raise ValueError("Choose Buy or Sell.")
    distance = pip_size(int(info.digits), float(info.point))
    minimum_stop = max(int(getattr(info, "trade_stops_level", 0)), int(getattr(info, "trade_freeze_level", 0))) * float(info.point)
    stop_distance = max(STOP_LOSS_PIPS * distance, minimum_stop)
    take_distance = max(TAKE_PROFIT_PIPS * distance, minimum_stop)
    entry = float(tick.ask if is_buy else tick.bid)
    digits = int(info.digits)
    return {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": volume,
        "type": mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL,
        "price": round(entry, digits),
        "sl": round(entry - stop_distance if is_buy else entry + stop_distance, digits),
        "tp": round(entry + take_distance if is_buy else entry - take_distance, digits),
        "deviation": 20,
        "magic": magic,
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
    }


def _close_manual_position(position, tick, comment="MoneyWork manual target exit") -> dict:
    is_buy = int(position.type) == int(mt5.POSITION_TYPE_BUY)
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": str(position.symbol),
        "position": int(position.ticket),
        "volume": float(position.volume),
        "type": mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY,
        "price": float(tick.bid if is_buy else tick.ask),
        "deviation": 20,
        "magic": int(getattr(position, "magic", MANUAL_MAGIC) or 0),
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
    }
    return _send_market_deal(request)


def manual_target_poller() -> None:
    """Manage the cash target only for positions created by a confirmed manual order."""
    while _running:
        try:
            with _mt5_lock:
                if _connected:
                    positions = mt5.positions_get()
                    if positions is not None:
                        for position in positions:
                            if int(getattr(position, "magic", 0)) != MANUAL_MAGIC:
                                continue
                            pnl = sum(float(getattr(position, key, 0) or 0) for key in ("profit", "swap", "commission"))
                            target = profit_target_for_volume(float(position.volume))
                            if pnl < target:
                                continue
                            symbol = str(position.symbol)
                            tick = mt5.symbol_info_tick(symbol)
                            if (tick is None or float(getattr(tick, "bid", 0)) <= 0
                                    or float(getattr(tick, "ask", 0)) <= 0 or not _quote_is_recent(symbol, tick)):
                                continue
                            result = _close_manual_position(position, tick)
                            emit({"type": "manual_target_exit", "ticket": int(position.ticket),
                                  "symbol": str(position.symbol), "profit": pnl, "target": target,
                                  "result": result})
        except Exception as exc:
            emit({"type": "warning", "message": f"Manual position target check failed: {exc}"})
        time.sleep(0.25)


def close_open_position(command: dict) -> dict:
    """Close one full broker position after an explicit, per-position confirmation."""
    raw_ticket = command.get("ticket")
    if isinstance(raw_ticket, bool):
        raise ValueError("Choose a valid open position.")
    try:
        ticket = int(raw_ticket)
    except (TypeError, ValueError):
        raise ValueError("Choose a valid open position.") from None
    if ticket <= 0:
        raise ValueError("Choose a valid open position.")
    expected_symbol = str(command.get("symbol", "")).strip()
    expected_side = str(command.get("side", "")).upper()
    try:
        expected_volume = float(command.get("volume", 0))
    except (TypeError, ValueError):
        raise ValueError("Refresh the open positions list and confirm the position again.") from None
    if (not expected_symbol or expected_side not in {"BUY", "SELL"}
            or not math.isfinite(expected_volume) or expected_volume <= 0):
        raise ValueError("Refresh the open positions list and confirm the position again.")
    if command.get("confirmed") is not True:
        raise PermissionError("Confirm the position details before closing it.")

    with _mt5_lock:
        if not _connected:
            raise RuntimeError("Connect an MT5 account before closing a position.")
        account = mt5.account_info()
        terminal = mt5.terminal_info()
        if account is None or terminal is None:
            raise RuntimeError(f"MT5 account or terminal is unavailable: {mt5.last_error()}")
        live_confirmed = command.get("liveConfirmed") is True
        if not account_mode_allowed(int(account.trade_mode), live_confirmed):
            raise PermissionError("Closing a Live position requires explicit per-order LIVE confirmation.")
        if (not bool(getattr(account, "trade_allowed", False))
                or not bool(getattr(terminal, "trade_allowed", False))
                or bool(getattr(terminal, "tradeapi_disabled", False))):
            raise PermissionError("MT5 or this account has disabled algorithmic trading. Enable it in MetaTrader and reconnect.")

        positions = mt5.positions_get(ticket=ticket)
        if positions is None:
            raise RuntimeError(f"Could not read position {ticket}: {mt5.last_error()}")
        if not positions:
            raise RuntimeError(f"Position {ticket} is no longer open. Refresh the open positions list.")
        if len(positions) != 1 or int(getattr(positions[0], "ticket", 0)) != ticket:
            raise RuntimeError(f"MT5 did not return exactly the requested position {ticket}.")
        position = positions[0]
        actual_side = "BUY" if int(position.type) == int(mt5.POSITION_TYPE_BUY) else "SELL"
        if (str(position.symbol) != expected_symbol or actual_side != expected_side
                or abs(float(position.volume) - expected_volume) > 1e-8):
            raise RuntimeError("Position details changed after confirmation. Refresh the open positions list and confirm again.")
        tick = mt5.symbol_info_tick(str(position.symbol))
        if (tick is None or float(getattr(tick, "bid", 0)) <= 0
                or float(getattr(tick, "ask", 0)) <= 0
                or not int(getattr(tick, "time", 0) or 0)):
            raise RuntimeError(f"No valid MT5 closing quote is available for {position.symbol}.")

        result = _close_manual_position(position, tick, "MoneyWork manual close")
        return {
            "state": "position_closed",
            "ticket": ticket,
            "symbol": str(position.symbol),
            "side": "BUY" if int(position.type) == int(mt5.POSITION_TYPE_BUY) else "SELL",
            "volume": float(position.volume),
            "result": result,
        }


def place_manual_order(command: dict) -> dict:
    """Place one explicitly confirmed, protected manual AUD/CAD market order."""
    symbol = str(command.get("symbol", "")).strip()
    side = str(command.get("side", "")).upper()
    if not symbol or not symbol.upper().startswith("AUDCAD"):
        raise ValueError("Manual Buy/Sell buttons are currently limited to the broker's AUDCAD symbol.")
    if side not in {"BUY", "SELL"}:
        raise ValueError("Choose Buy or Sell.")
    if command.get("confirmed") is not True:
        raise PermissionError("Confirm the order details before placing a manual order.")
    with _mt5_lock:
        if not _connected:
            raise RuntimeError("Connect an MT5 account before placing a manual order.")
        account = mt5.account_info()
        terminal = mt5.terminal_info()
        if account is None or terminal is None:
            raise RuntimeError(f"MT5 account or terminal is unavailable: {mt5.last_error()}")
        live_confirmed = command.get("liveConfirmed") is True
        if not account_mode_allowed(int(account.trade_mode), live_confirmed):
            raise PermissionError("Manual execution is limited to MT5 Demo or a Live order explicitly confirmed with LIVE.")
        if not bool(getattr(account, "trade_allowed", False)) or not bool(getattr(terminal, "trade_allowed", False)) or bool(getattr(terminal, "tradeapi_disabled", False)):
            raise PermissionError("MT5 or this account has disabled algorithmic trading. Enable it in MetaTrader and reconnect.")

        now = datetime.now()
        info = mt5.symbol_info(symbol)
        tick = mt5.symbol_info_tick(symbol)
        if info is None or tick is None or float(tick.bid) <= 0 or float(tick.ask) <= 0:
            raise RuntimeError(f"No valid MT5 market data is available for {symbol}.")
        if not int(getattr(tick, "time", 0)):
            raise RuntimeError("The latest AUDCAD quote has no MT5 timestamp; manual orders are blocked.")
        if not _quote_is_recent(symbol, tick):
            raise RuntimeError("The latest AUDCAD quote has not changed in the terminal for over 30 seconds; wait for a fresh quote before ordering.")

        if int(getattr(info, "trade_mode", 0)) != int(getattr(mt5, "SYMBOL_TRADE_MODE_FULL", 4)):
            raise PermissionError("AUDCAD trading is disabled or one-direction-only at this broker.")
        positions = mt5.positions_get(symbol=symbol)
        if positions is None:
            raise RuntimeError(f"Could not read open positions: {mt5.last_error()}")
        if positions:
            raise PermissionError("One AUDCAD position already exists. Close or manage it in MT5 before opening another.")

        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        todays_deals = mt5.history_deals_get(today, now)
        if todays_deals is None:
            raise RuntimeError(f"Could not read today's trade history: {mt5.last_error()}")
        realized_pnl = sum(float(row.profit) + float(row.commission) + float(row.swap) for row in todays_deals)
        floating_pnl = float(getattr(account, "profit", 0))
        start_balance = float(account.balance) - realized_pnl
        if account_balance_or_equity_cap_reached(max(float(account.balance), float(getattr(account, "equity", float(account.balance) + floating_pnl)))):
            raise PermissionError("The 80-million account-currency balance/equity limit has been reached; no new order is allowed.")
        if daily_loss_exceeded(start_balance, realized_pnl, floating_pnl):
            raise PermissionError("The 1% account-wide daily-loss stop is active; no new order is allowed.")

        volume = normalize_volume(info)
        distance = pip_size(int(info.digits), float(info.point))
        spread_pips = (float(tick.ask) - float(tick.bid)) / distance
        if spread_pips > MAX_SPREAD_PIPS:
            raise PermissionError(f"Spread is {spread_pips:.2f} pips; the {MAX_SPREAD_PIPS:g}-pip limit blocks this order.")
        request = _protected_market_order_request(symbol, side, volume, tick, info, MANUAL_MAGIC, f"MoneyWork manual {side}")
        result = _send_market_deal(request)
        return {"state": "manual_order_placed", "side": side, "symbol": symbol, "volume": volume,
                "entry": request["price"], "stopLoss": request["sl"], "takeProfit": request["tp"],
                "accountCurrency": str(getattr(account, "currency", "account currency")),
                "dailyPnl": realized_pnl + floating_pnl, "spreadPips": spread_pips, "result": result}


def disconnect() -> None:
    global _connected
    with _state_lock:
        _active_symbols.clear()
        _quote_observations.clear()
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
                        _record_quote_observation(symbol, tick)
                        emit({"type": "tick", "symbol": symbol, "bid": float(tick.bid), "ask": float(tick.ask),
                              "last": float(tick.last), "time": int(tick.time), "timeMsc": int(tick.time_msc)})
                except Exception as exc:
                    emit({"type": "warning", "message": f"Quote read failed for {symbol}: {exc}"})
        time.sleep(QUOTE_POLL_INTERVAL_SECONDS)


def handle(command: dict) -> None:
    request_id = command.get("requestId")
    action = command.get("action")
    try:
        if action == "connect":
            response(request_id, True, account=connect(command))
        elif action == "account":
            response(request_id, True, account=get_account())
        elif action == "symbols":
            response(request_id, True, symbols=get_symbols(str(command.get("query", ""))))
        elif action == "subscribe":
            response(request_id, True, quote=subscribe(str(command.get("symbol", ""))))
        elif action == "history":
            response(request_id, True, bars=get_history(str(command.get("symbol", "")), command.get("count", 2000)))
        elif action == "manual_order":
            response(request_id, True, result=place_manual_order(command))
        elif action == "positions":
            response(request_id, True, positions=get_open_positions())
        elif action == "close_position":
            response(request_id, True, result=close_open_position(command))
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
    poller = threading.Thread(target=quote_poller, name="mt5-quotes", daemon=True)
    target_poller = threading.Thread(target=manual_target_poller, name="mt5-manual-targets", daemon=True)
    poller.start()
    target_poller.start()
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
