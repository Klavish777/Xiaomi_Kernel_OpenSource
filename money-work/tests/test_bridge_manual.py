import importlib
import os
import sys
import time
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
    TIMEFRAME_M15 = 15

    def __init__(self):
        super().__init__('MetaTrader5')
        self.account = None
        self.terminal = None
        self.symbol = None
        self.tick = None
        self.positions = []
        self.deals = []
        self.requests = []
        self.rate_requests = []

    def account_info(self): return self.account
    def terminal_info(self): return self.terminal
    def symbol_info(self, _symbol): return self.symbol
    def symbol_info_tick(self, _symbol): return self.tick
    def positions_get(self, symbol=None): return [row for row in self.positions if symbol is None or row.symbol == symbol]
    def history_deals_get(self, _start, _end): return self.deals
    def copy_rates_from_pos(self, symbol, timeframe, start, count):
        self.rate_requests.append((symbol, timeframe, start, count))
        return [{'time': 1000, 'open': 0.9, 'high': 0.91, 'low': 0.89, 'close': 0.905, 'tick_volume': 12}]
    def order_send(self, request):
        self.requests.append(dict(request))
        return SimpleNamespace(retcode=self.TRADE_RETCODE_DONE, order=123, deal=456, comment='done')
    def last_error(self): return (0, 'ok')


FAKE_MT5 = FakeMT5()
sys.modules['MetaTrader5'] = FAKE_MT5
sys.modules.pop('mt5_bridge', None)
bridge = importlib.import_module('mt5_bridge')


def reset_mocks():
    now = int(datetime.now().timestamp())
    FAKE_MT5.account = SimpleNamespace(trade_mode=0, trade_allowed=True, balance=10000, equity=10000,
                                       profit=0, margin=350, login=123, server='Demo-Server', currency='CAD', leverage=100)
    FAKE_MT5.terminal = SimpleNamespace(trade_allowed=True, tradeapi_disabled=False)
    FAKE_MT5.symbol = SimpleNamespace(trade_mode=4, volume_min=0.01, volume_max=100, volume_step=0.01,
                                      digits=5, point=0.00001, trade_stops_level=0, trade_freeze_level=0)
    FAKE_MT5.tick = SimpleNamespace(bid=0.90000, ask=0.90002, last=0.90001, time=now, time_msc=now * 1000)
    FAKE_MT5.positions = []
    FAKE_MT5.deals = []
    FAKE_MT5.requests = []
    bridge._connected = True
    bridge._quote_observations.clear()
    bridge._record_quote_observation('AUDCAD', FAKE_MT5.tick)


def manual(side='BUY', **overrides):
    payload = {'symbol': 'AUDCAD', 'side': side, 'confirmed': True, 'liveConfirmed': False}
    payload.update(overrides)
    return payload


class ManualBridgeTests(unittest.TestCase):
    def setUp(self):
        reset_mocks()

    def test_chart_history_is_read_from_mt5_on_the_fixed_fifteen_minute_timeframe(self):
        bars = bridge.get_history('AUDCAD+', 2)
        self.assertEqual(FAKE_MT5.rate_requests[-1], ('AUDCAD+', FAKE_MT5.TIMEFRAME_M15, 0, 2))
        self.assertEqual(bars[0]['close'], 0.905)
        self.assertEqual(bars[0]['tickVolume'], 12)

    def test_manual_order_sends_market_order_with_risk_protection_and_manual_magic(self):
        result = bridge.place_manual_order(manual())
        self.assertEqual(result['state'], 'manual_order_placed')
        self.assertEqual(result['volume'], 0.01)
        request = FAKE_MT5.requests[0]
        self.assertEqual(request['volume'], 0.01)
        self.assertLess(request['sl'], request['price'])
        self.assertGreater(request['tp'], request['price'])
        self.assertEqual(request['magic'], bridge.MANUAL_MAGIC)

    def test_manual_order_requires_confirmation_correct_symbol_and_side(self):
        with self.assertRaises(PermissionError):
            bridge.place_manual_order(manual(confirmed=False))
        with self.assertRaises(ValueError):
            bridge.place_manual_order(manual(symbol='EURUSD'))
        with self.assertRaises(ValueError):
            bridge.place_manual_order(manual(side='HOLD'))
        self.assertEqual(FAKE_MT5.requests, [])

    def test_live_account_requires_per_order_live_confirmation(self):
        FAKE_MT5.account.trade_mode = 2
        with self.assertRaises(PermissionError):
            bridge.place_manual_order(manual())
        self.assertEqual(bridge.place_manual_order(manual(liveConfirmed=True))['state'], 'manual_order_placed')

    def test_manual_orders_obey_existing_position_volume_account_cap_and_daily_loss_checks(self):
        FAKE_MT5.positions = [SimpleNamespace(symbol='AUDCAD', magic=99)]
        with self.assertRaises(PermissionError):
            bridge.place_manual_order(manual())
        FAKE_MT5.positions = []
        FAKE_MT5.symbol.volume_min = 0.02
        with self.assertRaises(ValueError):
            bridge.place_manual_order(manual())
        FAKE_MT5.symbol.volume_min = 0.01
        FAKE_MT5.account.balance = 80_000_000
        with self.assertRaises(PermissionError):
            bridge.place_manual_order(manual())
        FAKE_MT5.account.balance = 9900
        FAKE_MT5.deals = [SimpleNamespace(profit=-100, commission=0, swap=0)]
        with self.assertRaises(PermissionError):
            bridge.place_manual_order(manual())
        self.assertEqual(FAKE_MT5.requests, [])

    def test_terminal_permission_stale_quote_and_spread_checks_fail_closed(self):
        FAKE_MT5.terminal.tradeapi_disabled = True
        with self.assertRaises(PermissionError):
            bridge.place_manual_order(manual())
        FAKE_MT5.terminal.tradeapi_disabled = False
        signature = bridge._tick_signature(FAKE_MT5.tick)
        bridge._quote_observations['AUDCAD'] = (signature, time.monotonic() - 61)
        with self.assertRaisesRegex(RuntimeError, 'over 30 seconds'):
            bridge.place_manual_order(manual())
        FAKE_MT5.tick.ask = 0.90060
        with self.assertRaises(PermissionError):
            bridge.place_manual_order(manual())
        self.assertEqual(FAKE_MT5.requests, [])

    def test_future_broker_tick_clock_does_not_block_manual_order(self):
        future_timestamp = int(datetime.now().timestamp()) + 300
        FAKE_MT5.tick.time = future_timestamp
        FAKE_MT5.tick.time_msc = future_timestamp * 1000
        bridge._record_quote_observation('AUDCAD', FAKE_MT5.tick)

        result = bridge.place_manual_order(manual('SELL'))

        self.assertEqual(result['result']['retcode'], FAKE_MT5.TRADE_RETCODE_DONE)
        self.assertEqual(len(FAKE_MT5.requests), 1)
        self.assertEqual(FAKE_MT5.requests[0]['type'], FAKE_MT5.ORDER_TYPE_SELL)

    def test_manual_cash_target_monitor_only_closes_manual_positions(self):
        position = SimpleNamespace(type=FAKE_MT5.POSITION_TYPE_BUY, symbol='AUDCAD', ticket=88, volume=0.01)
        result = bridge._close_manual_position(position, FAKE_MT5.tick)
        self.assertEqual(result['retcode'], FAKE_MT5.TRADE_RETCODE_DONE)
        request = FAKE_MT5.requests[0]
        self.assertEqual(request['position'], 88)
        self.assertEqual(request['type'], FAKE_MT5.ORDER_TYPE_SELL)
        self.assertEqual(request['magic'], bridge.MANUAL_MAGIC)
        self.assertIn('manual target exit', request['comment'])

    def test_cash_target_poller_closes_only_qualifying_money_work_manual_positions(self):
        FAKE_MT5.positions = [
            SimpleNamespace(magic=bridge.MANUAL_MAGIC, profit=0.31, swap=0, commission=0, volume=0.01,
                            type=FAKE_MT5.POSITION_TYPE_BUY, symbol='AUDCAD', ticket=90),
            SimpleNamespace(magic=99, profit=50, swap=0, commission=0, volume=0.01,
                            type=FAKE_MT5.POSITION_TYPE_BUY, symbol='AUDCAD', ticket=91),
        ]
        bridge._running = True
        with patch.object(bridge.time, 'sleep', side_effect=lambda _seconds: setattr(bridge, '_running', False)):
            bridge.manual_target_poller()
        bridge._running = True
        self.assertEqual(len(FAKE_MT5.requests), 1)
        self.assertEqual(FAKE_MT5.requests[0]['position'], 90)

    def test_bridge_exposes_no_strategy_evaluation_or_arm_actions(self):
        source = open(os.path.join(BRIDGE_DIR, 'mt5_bridge.py'), encoding='utf-8').read()
        self.assertNotIn('evaluate_agent', source)
        self.assertNotIn('agent_evaluate', source)
        self.assertNotIn('agent_state', source)
        with patch.object(bridge, 'response') as response:
            bridge.handle({'requestId': 1, 'action': 'agent_evaluate'})
            bridge.handle({'requestId': 2, 'action': 'positions'})
            bridge.handle({'requestId': 3, 'action': 'deals'})
            self.assertEqual(response.call_count, 3)
            self.assertEqual(response.call_args_list[0].args, (1, False))
            self.assertEqual(response.call_args_list[1].args, (2, False))
            self.assertEqual(response.call_args_list[2].args, (3, False))
            self.assertTrue(all(call.kwargs['message'] == 'Unknown bridge command.' for call in response.call_args_list))


if __name__ == '__main__':
    unittest.main()
