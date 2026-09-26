"""Pure, testable safety policy for Money Work's optional MT5 trade runner."""
from __future__ import annotations

from datetime import datetime, date
import math

BOT_MAGIC = 26092707
MAX_VOLUME = 0.01
STOP_LOSS_PIPS = 20
TAKE_PROFIT_PIPS = 30
PROFIT_TARGET_PER_LOT = 30.0  # 0.30 account-currency units per 0.01 lot.
MAX_DAILY_LOSS_RATIO = 0.01
MAX_SPREAD_PIPS = 5
LOSS_STREAK_LIMIT = 2
LOSS_COOLDOWN_SECONDS = 60 * 60


def account_mode_allowed(trade_mode: int, live_confirmed: bool) -> bool:
    # MetaTrader5: 0=demo, 1=contest, 2=real.
    return trade_mode == 0 or (trade_mode == 2 and live_confirmed)


def pip_size(digits: int, point: float) -> float:
    if not point or point <= 0:
        raise ValueError("Broker returned an invalid symbol point size.")
    return point * (10 if digits in (3, 5) else 1)


def normalize_volume(info, requested: float = MAX_VOLUME) -> float:
    minimum = float(info.volume_min)
    maximum = float(info.volume_max)
    step = float(info.volume_step)
    if minimum <= 0 or step <= 0 or maximum < minimum:
        raise ValueError("Broker returned invalid volume constraints.")
    # Never round the user's hard cap upward to satisfy a broker minimum.
    if minimum > requested or minimum > MAX_VOLUME:
        raise ValueError(f"Broker minimum volume {minimum:g} exceeds Money Work's 0.01-lot safety cap.")
    volume = min(requested, maximum, MAX_VOLUME)
    steps = int((volume - minimum) / step + 1e-9)
    normalized = minimum + steps * step
    if normalized < minimum or normalized > MAX_VOLUME + 1e-9:
        raise ValueError("Could not size a position within the 0.01-lot safety cap.")
    return round(normalized, 8)


def profit_target_for_volume(volume: float) -> float:
    size = float(volume)
    if not math.isfinite(size) or size <= 0:
        raise ValueError("Position volume must be finite and positive to calculate the cash-profit target.")
    return round(size * PROFIT_TARGET_PER_LOT, 2)


def daily_loss_exceeded(start_balance: float, realized_pnl: float, floating_pnl: float) -> bool:
    balance = float(start_balance)
    if balance <= 0:
        return True
    return float(realized_pnl) + float(floating_pnl) <= -(balance * MAX_DAILY_LOSS_RATIO)


def reference_is_valid(reference: dict | None, now: datetime) -> bool:
    if not isinstance(reference, dict) or reference.get("base") != "AUD":
        return False
    try:
        rate = float(reference.get("rate"))
        source_date_text = str(reference.get("sourceDate", ""))
        source_date = date.fromisoformat(source_date_text)
        if source_date.isoformat() != source_date_text:
            return False
        fetched = datetime.fromisoformat(str(reference.get("fetchedAt", "")).replace("Z", "+00:00"))
        fetched_timestamp = fetched.timestamp()
        age_seconds = now.timestamp() - fetched_timestamp
    except (TypeError, ValueError, OverflowError):
        return False
    source_age_days = (now.date() - source_date).days
    return math.isfinite(rate) and rate > 0 and 0 <= source_age_days <= 7 and 0 <= age_seconds <= 24 * 60 * 60


def loss_streak_cooldown(closed_trades: list[dict], now: datetime) -> datetime | None:
    recent = sorted(closed_trades, key=lambda row: int(row.get("time", 0)), reverse=True)
    streak = 0
    last_loss_time = 0
    for trade in recent:
        pnl = float(trade.get("profit", 0)) + float(trade.get("commission", 0)) + float(trade.get("swap", 0))
        if pnl < 0:
            streak += 1
            if not last_loss_time:
                last_loss_time = int(trade.get("time", 0))
        else:
            break
    if streak < LOSS_STREAK_LIMIT or not last_loss_time:
        return None
    until = datetime.fromtimestamp(last_loss_time + LOSS_COOLDOWN_SECONDS)
    return until if until > now else None


def is_inside_schedule(now: datetime, start: str, end: str, weekdays: list[int]) -> bool:
    if not weekdays or not isinstance(now, datetime):
        return False
    try:
        start_hour, start_minute = (int(part) for part in start.split(":"))
        end_hour, end_minute = (int(part) for part in end.split(":"))
        if not all((0 <= hour < 24 and 0 <= minute < 60) for hour, minute in ((start_hour, start_minute), (end_hour, end_minute))):
            return False
    except (TypeError, ValueError):
        return False
    start_value = start_hour * 60 + start_minute
    end_value = end_hour * 60 + end_minute
    current_value = now.hour * 60 + now.minute
    if start_value == end_value:
        return False
    selected = set(int(day) for day in weekdays if 0 <= int(day) <= 6)
    if start_value < end_value:
        return now.weekday() in {(day - 1) % 7 for day in selected} and start_value <= current_value < end_value
    if current_value >= start_value:
        return now.weekday() in {(day - 1) % 7 for day in selected}
    if current_value < end_value:
        return (now.weekday() - 1) % 7 in {(day - 1) % 7 for day in selected}
    return False
