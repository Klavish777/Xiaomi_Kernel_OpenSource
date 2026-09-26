import importlib
import os
import sys
import types
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

BRIDGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'bridge'))
sys.path.insert(0, BRIDGE_DIR)


class FakeMT5(types.ModuleType):
    TRADE_ACTION_DEAL = 1
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1
    POSITION_TYPE_BUY = 0
    ORDER_TIME_GTC = 0
    ORDER_FILLING_IOC = 1
    ORDER_FILLING_FOK = 0
    ORDER_FILLING_RETURN = 2
    TRADE_RETCODE_INVALID_FILL = 10030
    TRADE_RETCODE_DONE = 10009
    TRADE_RETCODE_PLACED = 10008
    TRADE_RETCODE_DONE_PARTIAL = 10010
    SYMBOL_TRADE_MODE_FULL = 4
    DEAL_ENTRY_OUT = 1
    DEAL_ENTRY_OUT_BY = 3

    def __init__(self):
        super().__init__('MetaTrader5')
        self.account = SimpleNamespace(trade_mode=0, trade_allowed=True, balance=10000, login=123)
        self.terminal = SimpleNamespace(trade_allowed=True, tradeapi_disabled=False)
        self.symbol = SimpleNamespace(trade_mode=4, volume_min=0.01, volume_max=100, volume_step=0.01,
                                      digits=5, point=0.00001, trade_stops_level=0, trade_freeze_level=0)
        self.tick = SimpleNamespace(bid=0.90000, ask=0.90002, time=int(datetime.now().timestamp()))
        self.positions = []
        self.deals = []
        self.requests = []

    def account_info(self):
        return self.account

    def terminal_info(self):
        return self.terminal

    def symbol_info(self, _symbol):
        return self.symbol

    def symbol_info_tick(self, _symbol):
        return self.tick

    def positions_get(self, symbol=None):
        return [row for row in self.positions if symbol is None or row.symbol == symbol]

    def history_deals_get(self, _start, _end):
        return self.deals

    def order_send(self, request):
        self.requests.append(dict(request))
        return SimpleNamespace(retcode=self.TRADE_RETCODE_DONE, order=123, deal=456, comment='done')

    def last_error(self):
        return (0, 'ok')


FAKE_MT5 = FakeMT5()
sys.modules['MetaTrader5'] = FAKE_MT5
sys.modules.pop('mt5_bridge', None)
bridge = importlib.import_module('mt5_bridge')


def demo_command(**overrides):
    command = {
        'symbol': 'AUDCAD',
        'signal': 'WATCH BUY',
        'rsi': 55,
        'liveConfirmed': False,
        'schedule': {'start': '00:00', 'end': '23:59', 'days': list(range(7))},
    }
    command.update(overrides)
    return command


class BridgeAgentTests(unittest.TestCase):
    def setUp(self):
        FAKE_MT5.account = SimpleNamespace(trade_mode=0, trade_allowed=True, balance=10000, login=123)
        FAKE_MT5.terminal = SimpleNamespace(trade_allowed=True, tradeapi_disabled=False)
        FAKE_MT5.symbol = SimpleNamespace(trade_mode=4, volume_min=0.01, volume_max=100, volume_step=0.01,
                                          digits=5, point=0.00001, trade_stops_level=0, trade_freeze_level=0)
        FAKE_MT5.tick = SimpleNamespace(bid=0.90000, ask=0.90002, time=int(datetime.now().timestamp()))
        FAKE_MT5.positions = []
        FAKE_MT5.deals = []
        FAKE_MT5.requests = []
        bridge._connected = True
        bridge._learning_cache.update({'login': None, 'loadedAt': 0.0, 'trades': []})

    def test_demo_order_contains_hard_volume_cap_and_stop_loss_take_profit(self):
        result = bridge.evaluate_agent(demo_command())
        request = FAKE_MT5.requests[0]
        self.assertEqual(result['state'], 'position_opened')
        self.assertEqual(request['volume'], 0.01)
        self.assertEqual(request['magic'], bridge.BOT_MAGIC)
        self.assertLess(request['sl'], request['price'])
        self.assertGreater(request['tp'], request['price'])
        self.assertAlmostEqual(request['price'] - request['sl'], 0.002)
        self.assertAlmostEqual(request['tp'] - request['price'], 0.003)

    def test_real_account_requires_explicit_confirmation(self):
        FAKE_MT5.account.trade_mode = 2
        with self.assertRaises(PermissionError):
            bridge.evaluate_agent(demo_command())
        self.assertEqual(FAKE_MT5.requests, [])

    def test_real_account_can_only_order_after_explicit_confirmation(self):
        FAKE_MT5.account.trade_mode = 2
        result = bridge.evaluate_agent(demo_command(liveConfirmed=True))
        self.assertEqual(result['state'], 'position_opened')
        self.assertEqual(len(FAKE_MT5.requests), 1)

    def test_disabled_terminal_algo_trading_blocks_orders(self):
        FAKE_MT5.terminal.trade_allowed = False
        with self.assertRaises(PermissionError):
            bridge.evaluate_agent(demo_command())
        self.assertEqual(FAKE_MT5.requests, [])

    def test_stale_quote_and_non_audcad_symbol_are_blocked(self):
        FAKE_MT5.tick.time = int(datetime.now().timestamp()) - 120
        with self.assertRaises(RuntimeError):
            bridge.evaluate_agent(demo_command())
        FAKE_MT5.tick.time = int(datetime.now().timestamp())
        with self.assertRaises(ValueError):
            bridge.evaluate_agent(demo_command(symbol='EURUSD'))
        self.assertEqual(FAKE_MT5.requests, [])

    def test_large_spread_blocks_entry(self):
        FAKE_MT5.tick.ask = 0.901
        result = bridge.evaluate_agent(demo_command())
        self.assertEqual(result['state'], 'spread_filter')
        self.assertEqual(FAKE_MT5.requests, [])

    def test_broker_minimum_lot_above_cap_fails_closed(self):
        FAKE_MT5.symbol.volume_min = 0.1
        with self.assertRaises(ValueError):
            bridge.evaluate_agent(demo_command())
        self.assertEqual(FAKE_MT5.requests, [])

    def test_manual_position_blocks_bot_entry(self):
        FAKE_MT5.positions = [SimpleNamespace(symbol='AUDCAD', magic=123, type=0, ticket=7, volume=0.01)]
        result = bridge.evaluate_agent(demo_command())
        self.assertEqual(result['state'], 'blocked_manual_position')
        self.assertEqual(FAKE_MT5.requests, [])

    def test_account_wide_one_percent_loss_stops_new_orders(self):
        FAKE_MT5.account.balance = 9900
        FAKE_MT5.deals = [SimpleNamespace(magic=99, symbol='EURUSD', profit=-100, commission=0, swap=0, entry=1, time=int(datetime.now().timestamp()))]
        result = bridge.evaluate_agent(demo_command())
        self.assertEqual(result['state'], 'daily_loss_stop')
        self.assertEqual(result['dailyLossLimit'], 100)
        self.assertEqual(FAKE_MT5.requests, [])

    def test_two_consecutive_bot_losses_pause_entries_for_one_hour(self):
        now = int(datetime.now().timestamp())
        FAKE_MT5.deals = [
            SimpleNamespace(magic=bridge.BOT_MAGIC, symbol='AUDCAD', profit=-1, commission=0, swap=0, entry=1, time=now - 60),
            SimpleNamespace(magic=bridge.BOT_MAGIC, symbol='AUDCAD', profit=-1, commission=0, swap=0, entry=1, time=now - 120),
        ]
        result = bridge.evaluate_agent(demo_command())
        self.assertEqual(result['state'], 'learning_cooldown')
        self.assertEqual(result['consecutiveLosses'], 2)
        self.assertEqual(FAKE_MT5.requests, [])

    def test_low_recent_win_rate_tightens_entry_filter(self):
        now = int(datetime.now().timestamp())
        FAKE_MT5.deals = [SimpleNamespace(magic=bridge.BOT_MAGIC, symbol='AUDCAD', profit=-1, commission=0, swap=0,
                                           entry=1, time=now - 4000 - index * 60) for index in range(5)]
        result = bridge.evaluate_agent(demo_command(rsi=65))
        self.assertEqual(result['state'], 'adaptive_filter')
        self.assertEqual(result['winRate'], 0)
        self.assertEqual(FAKE_MT5.requests, [])


if __name__ == '__main__':
    unittest.main()
