"""Small, testable risk checks shared by Money Work's manual MT5 order path."""
from __future__ import annotations

import math

MAX_VOLUME = 0.01
MAX_ACCOUNT_BALANCE_OR_EQUITY = 80_000_000.0
STOP_LOSS_PIPS = 20
TAKE_PROFIT_PIPS = 30
PROFIT_TARGET_PER_LOT = 30.0  # 0.30 account-currency units per 0.01 lot.
MAX_DAILY_LOSS_RATIO = 0.01
MAX_SPREAD_PIPS = 5


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


def account_balance_or_equity_cap_reached(value: float) -> bool:
    amount = float(value)
    return math.isfinite(amount) and amount >= MAX_ACCOUNT_BALANCE_OR_EQUITY


def daily_loss_exceeded(start_balance: float, realized_pnl: float, floating_pnl: float) -> bool:
    balance = float(start_balance)
    if balance <= 0:
        return True
    return float(realized_pnl) + float(floating_pnl) <= -(balance * MAX_DAILY_LOSS_RATIO)
