import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { marketTimestampMs, mergeHistoryBars, mergeMarketTick, mergeTickIntoBars } from '../src/chartUtils.mjs';

const tick = (timeMsc, bid, ask) => ({ timeMsc, bid, ask });

test('normalizes MT5 timestamps and prefers millisecond tick time', () => {
  assert.equal(marketTimestampMs(tick(1_700_000_000_123, 1.1, 1.2)), 1_700_000_000_123);
  assert.equal(marketTimestampMs({ time: 1_700_000_000 }), 1_700_000_000_000);
  assert.equal(marketTimestampMs({ time: 0 }), null);
});

test('merges new quote events but does not treat a repeated terminal tick as fresh data', () => {
  const previous = mergeMarketTick(null, tick(1_700_000_000_000, 1.1, 1.2), 5000);
  assert.equal(previous.receivedAt, 5000);
  const repeated = mergeMarketTick(previous, tick(1_700_000_000_000, 1.1, 1.2), 6000);
  assert.equal(repeated, previous);
  const newer = mergeMarketTick(previous, tick(1_700_000_000_100, 1.1001, 1.2001), 6100);
  assert.equal(newer.receivedAt, 6100);
  assert.equal(newer.bid, 1.1001);
});

test('ignores out-of-order ticks except a clear terminal clock correction', () => {
  const normal = mergeMarketTick(null, tick(1_700_000_000_200, 1.2, 1.3), 1_700_000_000_000);
  assert.equal(mergeMarketTick(normal, tick(1_700_000_000_100, 1.1, 1.2), 1_700_000_000_100), normal);
  const clockSkewed = mergeMarketTick(null, tick(1_700_000_200_000, 1.2, 1.3), 1_700_000_000_000);
  const corrected = mergeMarketTick(clockSkewed, tick(1_700_000_000_000, 1.1, 1.2), 1_700_000_000_100);
  assert.equal(corrected.bid, 1.1);
});

test('merges broker history bars by timestamp and caps history', () => {
  assert.deepEqual(mergeHistoryBars([{ time: 2, close: 2 }, { time: 1, close: 1 }], [{ time: 2, close: 3 }, { time: 3, close: 4 }]), [
    { time: 1, close: 1 }, { time: 2, close: 3 }, { time: 3, close: 4 },
  ]);
  assert.deepEqual(mergeHistoryBars([{ time: 1 }, { time: 2 }, { time: 3 }], [], 2), [{ time: 2 }, { time: 3 }]);
});

test('new MT5 ticks update the current timeframe candle without adding second-level fake bars', () => {
  const candle = { time: 1_700_000_040, open: 0.9, high: 0.901, low: 0.899, close: 0.9005, tickVolume: 1 };
  const sameMinute = mergeTickIntoBars([candle], tick(1_700_000_050_000, 0.902, 0.9022), '1M');
  assert.equal(sameMinute.length, 1);
  assert.equal(sameMinute[0].time, candle.time);
  assert.equal(sameMinute[0].high, 0.902);
  assert.equal(sameMinute[0].close, 0.902);
  const nextMinute = mergeTickIntoBars([candle], tick(1_700_000_100_000, 0.898, 0.8982), '1M');
  assert.equal(nextMinute.length, 2);
  assert.equal(nextMinute[1].time, 1_700_000_100);
  assert.equal(nextMinute[1].open, candle.close);
});

test('renderer, Electron IPC and Python bridge expose no automatic strategy or paper-balance paths', async () => {
  const paths = [
    '../src/App.jsx', '../electron/main.cjs', '../electron/preload.cjs', '../bridge/mt5_bridge.py', '../bridge/trading_policy.py',
  ];
  const sources = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const source of sources) {
    assert.doesNotMatch(source, /evaluate_agent|agent_evaluate|agent_state|autopilot|strategy runner|virtual balance/i);
  }
  assert.match(sources[0], /placeMt5ManualOrder/);
  assert.match(sources[0], /setInterval\(syncAccount, 100\)/);
  assert.match(sources[1], /mt5:positions/);
  assert.match(sources[1], /mt5:close-position/);
  assert.doesNotMatch(sources[1], /mt5:deals/);
  assert.match(sources[2], /getMt5Positions/);
  assert.match(sources[2], /closeMt5Position/);
  assert.doesNotMatch(sources[2], /getMt5Deals/);
  assert.match(sources[0], /Открытые сделки/);
  assert.match(sources[0], /void sendManualOrder\(side\)/);
  assert.match(sources[0], /void sendPositionClose\(position\)/);
  assert.match(sources[0], /Введите LIVE/);
  assert.doesNotMatch(sources[0], /modal === 'order'|modal === 'close-position'|Подтверждение ордера|Подтверждение закрытия/);
  assert.match(sources[3], /"manual_order"/);
  assert.match(sources[3], /QUOTE_POLL_INTERVAL_SECONDS = 0\.05/);
  assert.match(sources[3], /MAX_SPREAD_PIPS/);
});
