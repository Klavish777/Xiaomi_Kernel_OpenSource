import os
import sys
import unittest
from datetime import datetime
from types import SimpleNamespace

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'bridge')))

from trading_policy import (
    MAX_DAILY_LOSS_RATIO,
    MAX_VOLUME,
    account_mode_allowed,
    daily_loss_exceeded,
    is_inside_schedule,
    loss_streak_cooldown,
    normalize_volume,
    pip_size,
    profit_target_for_volume,
    reference_is_valid,
)


class TradingPolicyTests(unittest.TestCase):
    def test_demo_and_explicit_live_authorization(self):
        self.assertTrue(account_mode_allowed(0, False))
        self.assertFalse(account_mode_allowed(1, True))
        self.assertFalse(account_mode_allowed(2, False))
        self.assertTrue(account_mode_allowed(2, True))

    def test_volume_is_capped_and_never_rounded_up(self):
        info = SimpleNamespace(volume_min=0.01, volume_max=100, volume_step=0.01)
        self.assertEqual(normalize_volume(info), MAX_VOLUME)
        with self.assertRaises(ValueError):
            normalize_volume(SimpleNamespace(volume_min=0.1, volume_max=100, volume_step=0.1))

    def test_pip_size_for_three_five_and_four_digit_pairs(self):
        self.assertAlmostEqual(pip_size(5, 0.00001), 0.0001)
        self.assertAlmostEqual(pip_size(3, 0.001), 0.01)
        self.assertAlmostEqual(pip_size(4, 0.0001), 0.0001)

    def test_daily_loss_stop_at_one_percent(self):
        self.assertFalse(daily_loss_exceeded(10000, -99, 0))
        self.assertTrue(daily_loss_exceeded(10000, -90, -10))
        self.assertTrue(daily_loss_exceeded(0, 0, 0))
        self.assertEqual(MAX_DAILY_LOSS_RATIO, 0.01)

    def test_cash_profit_target_scales_with_lot_volume(self):
        self.assertEqual(profit_target_for_volume(0.01), 0.30)
        self.assertEqual(profit_target_for_volume(0.02), 0.60)
        with self.assertRaises(ValueError):
            profit_target_for_volume(0)

    def test_reference_gate_requires_valid_recent_daily_reference(self):
        now = datetime(2026, 9, 26, 12, 0)
        reference = {'base': 'AUD', 'rate': 0.91, 'sourceDate': '2026-09-25', 'fetchedAt': now.isoformat()}
        self.assertTrue(reference_is_valid(reference, now))
        self.assertFalse(reference_is_valid(None, now))
        self.assertFalse(reference_is_valid({**reference, 'rate': -1}, now))
        self.assertFalse(reference_is_valid({**reference, 'sourceDate': '2026-09-18'}, now))
        self.assertFalse(reference_is_valid({**reference, 'fetchedAt': '2000-01-01T00:00:00'}, now))

    def test_weekday_schedule_and_overnight_window(self):
        monday = datetime(2026, 9, 28, 9, 0)
        tuesday = datetime(2026, 9, 29, 1, 0)
        self.assertTrue(is_inside_schedule(monday, '09:00', '17:00', [1, 2, 3, 4, 5]))
        self.assertFalse(is_inside_schedule(datetime(2026, 9, 28, 17, 0), '09:00', '17:00', [1]))
        self.assertTrue(is_inside_schedule(tuesday, '22:00', '02:00', [1]))
        self.assertFalse(is_inside_schedule(monday, '09:00', '09:00', [1]))

    def test_two_losses_cause_one_hour_cooldown_but_win_resets_streak(self):
        now = datetime(2026, 9, 28, 12, 0)
        rows = [
            {'time': int(now.timestamp()) - 60, 'profit': -2, 'commission': 0, 'swap': 0},
            {'time': int(now.timestamp()) - 120, 'profit': -1, 'commission': 0, 'swap': 0},
        ]
        self.assertEqual(loss_streak_cooldown(rows, now), datetime(2026, 9, 28, 12, 59))
        self.assertIsNone(loss_streak_cooldown([rows[0], {'time': rows[1]['time'], 'profit': 1, 'commission': 0, 'swap': 0}], now))


if __name__ == '__main__':
    unittest.main()
