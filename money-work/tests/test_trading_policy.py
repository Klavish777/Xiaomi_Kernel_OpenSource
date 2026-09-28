import os
import sys
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'bridge')))

from trading_policy import (
    MAX_ACCOUNT_BALANCE_OR_EQUITY,
    MAX_DAILY_LOSS_RATIO,
    MAX_VOLUME,
    account_balance_or_equity_cap_reached,
    account_mode_allowed,
    daily_loss_exceeded,
    normalize_volume,
    pip_size,
    profit_target_for_volume,
)


class ManualTradingPolicyTests(unittest.TestCase):
    def test_demo_and_live_confirmation(self):
        self.assertTrue(account_mode_allowed(0, False))
        self.assertFalse(account_mode_allowed(1, True))
        self.assertFalse(account_mode_allowed(2, False))
        self.assertTrue(account_mode_allowed(2, True))

    def test_volume_cap_never_rounds_up_and_never_exceeds_point_zero_one(self):
        info = SimpleNamespace(volume_min=0.01, volume_max=100, volume_step=0.01)
        self.assertEqual(normalize_volume(info), MAX_VOLUME)
        with self.assertRaises(ValueError):
            normalize_volume(SimpleNamespace(volume_min=0.02, volume_max=100, volume_step=0.01))
        with self.assertRaises(ValueError):
            normalize_volume(SimpleNamespace(volume_min=0.1, volume_max=100, volume_step=0.1))

    def test_pip_size_for_three_five_and_four_digit_pairs(self):
        self.assertAlmostEqual(pip_size(5, 0.00001), 0.0001)
        self.assertAlmostEqual(pip_size(3, 0.001), 0.01)
        self.assertAlmostEqual(pip_size(4, 0.0001), 0.0001)

    def test_account_balance_and_equity_limit_is_account_currency_only(self):
        self.assertEqual(MAX_ACCOUNT_BALANCE_OR_EQUITY, 80_000_000)
        self.assertFalse(account_balance_or_equity_cap_reached(79_999_999.99))
        self.assertTrue(account_balance_or_equity_cap_reached(80_000_000))
        self.assertFalse(account_balance_or_equity_cap_reached(float('inf')))

    def test_daily_loss_stop_is_one_percent(self):
        self.assertFalse(daily_loss_exceeded(10000, -99, 0))
        self.assertTrue(daily_loss_exceeded(10000, -90, -10))
        self.assertTrue(daily_loss_exceeded(0, 0, 0))
        self.assertEqual(MAX_DAILY_LOSS_RATIO, 0.01)

    def test_manual_position_cash_target_scales_from_point_three_per_point_zero_one_lot(self):
        self.assertEqual(profit_target_for_volume(0.01), 0.30)
        self.assertEqual(profit_target_for_volume(0.02), 0.60)
        with self.assertRaises(ValueError):
            profit_target_for_volume(0)


if __name__ == '__main__':
    unittest.main()
