import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_AGENT_EQUITY, adjustVirtualBalance, advancePaperAgent, buildAnalystConsensus, compareAppVersions, computeRuleSignal, findNewerAppRelease, isInsideSchedule, marketTimestampMs, mergeMarketTick, normalizeMarketTimestamp, normalizeBankOfCanadaReference, summarizePaperHistory, movingAverageValues, sliceChartHistory, mergeHistoryBars, summarizeAccountPerformance, updateTickCadence, validateReferencePayload, validateReferenceRecord } from '../src/agentCore.mjs';

test('schedule follows selected local weekdays and inclusive start/exclusive end', () => {
  const mondayMorning = new Date(2026, 8, 28, 9, 0);
  assert.equal(isInsideSchedule(mondayMorning, '09:00', '17:00', [1, 2, 3, 4, 5]), true);
  assert.equal(isInsideSchedule(new Date(2026, 8, 28, 17, 0), '09:00', '17:00', [1, 2, 3, 4, 5]), false);
  assert.equal(isInsideSchedule(mondayMorning, '09:00', '17:00', [2, 3, 4, 5]), false);
  assert.equal(isInsideSchedule(mondayMorning, '09:00', '09:00', [1]), true);
  assert.equal(isInsideSchedule(mondayMorning, '00:00', '00:00', [1]), true);
  assert.equal(isInsideSchedule(mondayMorning, '00:00', '00:00', [2]), false);
});

test('MT5 quote timestamps normalize seconds, milliseconds, microseconds, and nanoseconds', () => {
  const expected = Date.UTC(2026, 8, 28, 12, 0, 0);
  assert.equal(normalizeMarketTimestamp(expected / 1000), expected);
  assert.equal(normalizeMarketTimestamp(expected), expected);
  assert.equal(normalizeMarketTimestamp(expected * 1000), expected);
  assert.equal(normalizeMarketTimestamp(expected * 1_000_000), expected);
  assert.equal(marketTimestampMs({ time: expected / 1000 }), expected);
  assert.equal(marketTimestampMs({ timeMsc: expected }), expected);
  assert.equal(normalizeMarketTimestamp(0), null);
});

test('tick cadence reports measured broker timestamp intervals rather than poll frequency', () => {
  let cadence = updateTickCadence(null, { timeMsc: 1_790_586_000_000 });
  cadence = updateTickCadence(cadence, { timeMsc: 1_790_586_000_100 });
  cadence = updateTickCadence(cadence, { timeMsc: 1_790_586_000_300 });
  assert.equal(cadence.averageMs, 150);
  assert.equal(cadence.sampleCount, 2);
  const repeated = updateTickCadence(cadence, { timeMsc: 1_790_586_000_300 });
  assert.equal(repeated, cadence);
  const longGap = updateTickCadence(cadence, { timeMsc: 1_790_586_100_000 });
  assert.equal(longGap.sampleCount, 0);
});

test('incremental candle history replaces forming candles, appends new bars, and stays ordered', () => {
  const existing = [
    { time: 20, open: 2, high: 2, low: 2, close: 2 },
    { time: 10, open: 1, high: 1, low: 1, close: 1 },
  ];
  const refreshed = mergeHistoryBars(existing, [
    { time: 20, open: 2, high: 2.5, low: 1.8, close: 2.4 },
    { time: 30, open: 2.4, high: 2.6, low: 2.3, close: 2.5 },
  ]);
  assert.deepEqual(refreshed.map((bar) => bar.time), [10, 20, 30]);
  assert.equal(refreshed[1].close, 2.4);
  assert.equal(mergeHistoryBars(refreshed, [], 2).length, 2);
});

test('account summary separates balance, equity, open floating P&L, and today realized P&L', () => {
  const now = new Date(2026, 8, 28, 12, 0, 0);
  const today = new Date(2026, 8, 28, 9, 0, 0).getTime() / 1000;
  const yesterday = new Date(2026, 8, 27, 23, 0, 0).getTime() / 1000;
  const summary = summarizeAccountPerformance(
    { balance: 1000, equity: 1012, margin: 300, currency: 'EUR', syncedAt: 123 },
    [{ profit: 10, swap: -1, commission: -0.5 }, { profit: 4, swap: 0, commission: 0 }],
    [{ time: today, profit: 3, commission: -0.2, swap: 0 }, { time: yesterday, profit: 100, commission: 0, swap: 0 }],
    now,
  );
  assert.equal(summary.balance, 1000);
  assert.equal(summary.equity, 1012);
  assert.equal(summary.usedMargin, 300);
  assert.equal(summary.currency, 'EUR');
  assert.equal(summary.openPositionCount, 2);
  assert.equal(summary.floatingPnl, 12.5);
  assert.equal(summary.realizedToday, 2.8);
  assert.equal(summary.syncedAt, 123);
});

test('repeated MT5 poller ticks do not refresh receipt age; changed ticks do', () => {
  const first = mergeMarketTick(null, { symbol: 'AUDCAD', bid: 0.9, ask: 0.9001, timeMsc: 1_790_586_000_000 }, 1000);
  const repeated = mergeMarketTick(first, { symbol: 'AUDCAD', bid: 0.9, ask: 0.9001, timeMsc: 1_790_586_000_000 }, 5000);
  assert.equal(repeated.receivedAt, 1000);
  assert.equal(repeated, first);
  const next = mergeMarketTick(repeated, { symbol: 'AUDCAD', bid: 0.90001, ask: 0.90011, timeMsc: 1_790_586_001_000 }, 6000);
  assert.equal(next.receivedAt, 6000);
  const futureClock = mergeMarketTick(null, { symbol: 'AUDCAD', bid: 0.9, ask: 0.9001, timeMsc: 1_800_000_000_000 }, 1_790_000_000_000);
  const correctedClock = mergeMarketTick(futureClock, { symbol: 'AUDCAD', bid: 0.9001, ask: 0.9002, timeMsc: 1_790_000_001_000 }, 1_790_000_001_000);
  assert.equal(correctedClock.bid, 0.9001);
  assert.equal(correctedClock.receivedAt, 1_790_000_001_000);
});

test('overnight schedule attributes after-midnight hours to prior selected day', () => {
  const tuesdayEarly = new Date(2026, 8, 29, 1, 0);
  assert.equal(isInsideSchedule(tuesdayEarly, '22:00', '02:00', [1]), true);
  assert.equal(isInsideSchedule(tuesdayEarly, '22:00', '02:00', [2]), false);
});

test('internet reference validates schema, not-future date and positive rate', () => {
  const now = new Date('2026-09-26T12:00:00Z');
  assert.equal(validateReferencePayload({ base: 'AUD', date: '2026-09-25', rates: { CAD: 0.91 } }, now).valid, true);
  assert.equal(validateReferencePayload({ base: 'USD', date: '2026-09-25', rates: { CAD: 0.91 } }, now).valid, false);
  assert.equal(validateReferencePayload({ base: 'AUD', date: '2026-09-27', rates: { CAD: 0.91 } }, now).valid, false);
  assert.equal(validateReferencePayload({ base: 'AUD', date: '2026-02-30', rates: { CAD: 0.91 } }, now).valid, false);
  assert.equal(validateReferencePayload({ base: 'AUD', date: '2026-09-25', rates: { CAD: -1 } }, now).valid, false);
});

test('Bank of Canada fallback normalizes and validates its daily AUD/CAD observations', () => {
  const normalized = normalizeBankOfCanadaReference({ observations: [
    { d: '2026-09-25', FXAUDCAD: { v: '0.9940' } },
    { d: '2026-09-24', FXAUDCAD: { v: '0.9923' } },
  ] });
  assert.deepEqual(normalized, { base: 'AUD', date: '2026-09-25', rates: { CAD: 0.994 } });
  assert.equal(validateReferencePayload(normalized, new Date('2026-09-28T12:00:00Z')).valid, true);
  assert.deepEqual(normalizeBankOfCanadaReference({ observations: [] }).rates, { CAD: null });
  assert.deepEqual(normalizeBankOfCanadaReference({ observations: [{ d: '2026-09-25', FXAUDCAD: { v: '0' } }] }).rates, { CAD: null });
});

test('version checker selects only a newer Money Work release tag', () => {
  const releases = [
    { tag_name: 'money-work-v0.4.15' },
    { tag_name: 'money-work-v0.4.17', draft: true },
    { tag_name: 'other-product-v9.0.0' },
    { tag_name: 'money-work-v0.4.16', html_url: 'https://attacker.invalid' },
  ];
  assert.equal(findNewerAppRelease(releases, '0.4.15'), '0.4.16');
  assert.equal(findNewerAppRelease(releases, '0.4.16'), null);
  assert.equal(findNewerAppRelease(releases, '0.4.17'), null);
  assert.equal(compareAppVersions('0.4.16', '0.4.15'), 1);
  assert.equal(compareAppVersions('0.4.16', '0.4.16'), 0);
  assert.equal(compareAppVersions('0.4.15', '0.4.16'), -1);
  assert.equal(compareAppVersions('bad', '0.4.16'), null);
});

test('three-analyst consensus requires directional data, fresh quote, validated reference and learner clearance', () => {
  const now = new Date('2026-09-26T12:00:00Z');
  const quote = { bid: 0.9, ask: 0.90002, timeMsc: now.getTime() };
  const referenceData = { base: 'AUD', rate: 0.91, sourceDate: '2026-09-25', fetchedAt: now.toISOString() };
  const ready = buildAnalystConsensus({ analysis: { signal: 'WATCH BUY', rsi: 55 }, quote, referenceData, brokerStatus: { closedTrades: 2 }, now });
  assert.equal(ready.entryAllowed, true);
  assert.equal(ready.analysts.technical.signal, 'WATCH BUY');
  assert.equal(ready.analysts.market.ready, true);
  assert.equal(ready.analysts.internet.ready, true);
  assert.equal(ready.analysts.learning.state, 'learning');

  const missingReference = buildAnalystConsensus({ analysis: { signal: 'WATCH BUY', rsi: 55 }, quote, brokerStatus: {}, now });
  assert.equal(missingReference.entryAllowed, false);
  assert.equal(missingReference.reason, 'reference_missing');
  const staleQuote = buildAnalystConsensus({ analysis: { signal: 'WATCH BUY', rsi: 55 }, quote: { bid: 0.9, ask: 0.90002, timeMsc: now.getTime() - 31000 }, referenceData, brokerStatus: {}, now });
  assert.equal(staleQuote.entryAllowed, false);
  assert.equal(staleQuote.reason, 'quote_stale');
  assert.equal(staleQuote.analysts.market.ageSeconds, 31);
  const noQuote = buildAnalystConsensus({ analysis: { signal: 'WATCH BUY', rsi: 55 }, referenceData, brokerStatus: {}, now });
  assert.equal(noQuote.reason, 'quote_unavailable');
  const slightlyFutureQuote = buildAnalystConsensus({
    analysis: { signal: 'WATCH BUY', rsi: 55 },
    quote: { bid: 0.9, ask: 0.90002, timeMsc: now.getTime() + 5000, receivedAt: now.getTime() },
    referenceData,
    brokerStatus: {},
    now,
  });
  assert.equal(slightlyFutureQuote.analysts.market.ready, true);
  assert.equal(slightlyFutureQuote.entryAllowed, true);
  const excessiveClockSkew = buildAnalystConsensus({ analysis: { signal: 'WATCH BUY', rsi: 55 }, quote: { bid: 0.9, ask: 0.90002, timeMsc: now.getTime() + 121000, receivedAt: now.getTime() }, referenceData, brokerStatus: {}, now });
  assert.equal(excessiveClockSkew.reason, 'quote_clock_skew');
  const stoppedFutureQuote = buildAnalystConsensus({ analysis: { signal: 'WATCH BUY', rsi: 55 }, quote: { bid: 0.9, ask: 0.90002, timeMsc: now.getTime() + 5000, receivedAt: now.getTime() - 31000 }, referenceData, brokerStatus: {}, now });
  assert.equal(stoppedFutureQuote.reason, 'quote_timestamp_invalid');
  const weakLearning = buildAnalystConsensus({ analysis: { signal: 'WATCH BUY', rsi: 65 }, quote, referenceData, brokerStatus: { closedTrades: 5, winRate: 0.2 }, now });
  assert.equal(weakLearning.entryAllowed, false);
  assert.equal(weakLearning.reason, 'adaptive_filter');
  const pausedAgent = buildAnalystConsensus({ analysis: { signal: 'WATCH BUY', rsi: 55 }, quote, referenceData, brokerStatus: { state: 'analyst_paused' }, now });
  assert.equal(pausedAgent.entryAllowed, false);
  assert.equal(pausedAgent.reason, 'analyst_paused');
  assert.equal(validateReferenceRecord({ ...referenceData, fetchedAt: '2000-01-01T00:00:00Z' }, now).valid, false);
});

test('paper history applies the same two-loss cooldown and recent-win-rate safeguard', () => {
  const now = new Date('2026-09-26T12:00:00Z');
  const losses = [
    { status: 'closed', pnl: -1, closeTime: '2026-09-26T11:59:00Z' },
    { status: 'closed', pnl: -2, closeTime: '2026-09-26T11:58:00Z' },
    { status: 'closed', pnl: 3, closeTime: '2026-09-26T11:00:00Z' },
  ];
  const stats = summarizePaperHistory(losses, now);
  assert.equal(stats.closedTrades, 3);
  assert.equal(stats.consecutiveLosses, 2);
  assert.equal(stats.state, 'learning_cooldown');
  const consensus = buildAnalystConsensus({
    analysis: { signal: 'WATCH BUY', rsi: 55 },
    quote: { bid: 0.9, ask: 0.9001, timeMsc: now.getTime() },
    referenceData: { base: 'AUD', rate: 0.91, sourceDate: '2026-09-25', fetchedAt: now.toISOString() },
    brokerStatus: stats,
    now,
  });
  assert.equal(consensus.entryAllowed, false);
  assert.equal(consensus.reason, 'learning_cooldown');
  assert.equal(summarizePaperHistory([{ ...losses[0], closeTime: '2026-09-26T10:30:00Z' }], now).state, undefined);
});

test('paper agent latches off at 80 million equity and closes its open virtual position', () => {
  const now = new Date('2026-09-26T12:00:00Z');
  const settings = { capital: MAX_AGENT_EQUITY, maxAllocation: 1000, start: '00:00', end: '23:59', days: [0, 1, 2, 3, 4, 5, 6] };
  const openPositionState = {
    enabled: true,
    capital: MAX_AGENT_EQUITY - 1,
    realizedPnl: 0,
    trades: [{ id: 'goal-position', symbol: 'AUDCAD', direction: 1, side: 'BUY', openPrice: 1, units: 2, status: 'open' }],
    position: { id: 'goal-position', symbol: 'AUDCAD', direction: 1, side: 'BUY', openPrice: 1, units: 2, status: 'open' },
  };
  const stopped = advancePaperAgent(openPositionState, { signal: 'WATCH BUY', price: 1.5, quoteTime: 5000, symbol: 'AUDCAD', settings, now });
  assert.equal(stopped.enabled, false);
  assert.equal(stopped.goalReached, true);
  assert.equal(stopped.position, null);
  assert.equal(stopped.trades[0].status, 'closed');
  const deposit = adjustVirtualBalance({ capital: MAX_AGENT_EQUITY - 10, realizedPnl: 0, cashFlows: [] }, 1, 10, now);
  assert.equal(deposit.ok, true);
  assert.equal(deposit.state.goalReached, true);
});

test('paper learner can block new entries without interfering with position closure', () => {
  const settings = { capital: 1000, maxAllocation: 500, start: '00:00', end: '23:59', days: [0, 1, 2, 3, 4, 5, 6] };
  const now = new Date(2026, 8, 26, 12, 0);
  const initial = { enabled: true, trades: [], realizedPnl: 0 };
  const blocked = advancePaperAgent(initial, { signal: 'WATCH BUY', price: 0.9, quoteTime: 1000, symbol: 'AUDCAD', settings, allowEntry: false, now });
  assert.equal(blocked.position ?? null, null);
  const open = advancePaperAgent(initial, { signal: 'WATCH BUY', price: 0.9, quoteTime: 2000, symbol: 'AUDCAD', settings, now });
  const closed = advancePaperAgent(open, { signal: 'WATCH SELL', price: 0.91, quoteTime: 3000, symbol: 'AUDCAD', settings, allowEntry: false, now });
  assert.equal(closed.position, null);
  assert.equal(closed.trades[0].status, 'closed');
});

test('paper agent opens within configured hours, closes on opposite signal and records virtual P&L', () => {
  const settings = { capital: 10000, maxAllocation: 1000, start: '00:00', end: '23:59', days: [0, 1, 2, 3, 4, 5, 6] };
  const now = new Date(2026, 8, 26, 12, 0);
  const initial = { enabled: true, trades: [], realizedPnl: 0 };
  const opened = advancePaperAgent(initial, { signal: 'WATCH BUY', price: 0.9, quoteTime: 1000, symbol: 'AUDCAD', settings, now });
  assert.equal(opened.position.side, 'BUY');
  assert.equal(opened.position.allocation, 1000);
  const ignoredDuplicate = advancePaperAgent(opened, { signal: 'WATCH BUY', price: 0.91, quoteTime: 1000, symbol: 'AUDCAD', settings, now });
  assert.equal(ignoredDuplicate, opened);
  const closed = advancePaperAgent(opened, { signal: 'WATCH SELL', price: 0.91, quoteTime: 2000, symbol: 'AUDCAD', settings, now });
  assert.equal(closed.position, null);
  assert.ok(Math.abs(closed.realizedPnl - (1000 / 0.9) * 0.01) < 1e-8);
  assert.equal(closed.trades[0].status, 'closed');
});

test('virtual deposits and withdrawals create an auditable local balance ledger', () => {
  const now = new Date('2026-09-26T12:00:00Z');
  const initial = { capital: 1000, cashFlows: [], position: { allocation: 200 } };
  const deposited = adjustVirtualBalance(initial, 1, 250, now);
  assert.equal(deposited.ok, true);
  assert.equal(deposited.state.capital, 1250);
  const withdrawn = adjustVirtualBalance(deposited.state, -1, 300, now);
  assert.equal(withdrawn.ok, true);
  assert.equal(withdrawn.state.capital, 950);
  assert.equal(withdrawn.state.cashFlows.length, 2);
  assert.equal(adjustVirtualBalance(initial, -1, 900, now).code, 'reserved_funds');
  assert.equal(adjustVirtualBalance(initial, 1, 0, now).code, 'invalid_amount');
});

test('chart editors calculate SMA/EMA and pan through the loaded candle history', () => {
  const bars = [1, 2, 3, 4, 5, 6].map((close, time) => ({ close, time }));
  assert.deepEqual(movingAverageValues(bars.slice(0, 4), 2, 'SMA'), [null, 1.5, 2.5, 3.5]);
  const ema = movingAverageValues(bars.slice(0, 4), 2, 'EMA');
  assert.equal(ema[1], 1.5);
  assert.ok(Math.abs(ema[3] - 3.5) < 1e-8);
  assert.deepEqual(sliceChartHistory(bars, 2, 3).map((bar) => bar.close), [2, 3, 4]);
  assert.deepEqual(sliceChartHistory(bars, 0, 2).map((bar) => bar.close), [5, 6]);
});

test('rule analyzer refuses inadequate or invalid data', () => {
  assert.equal(computeRuleSignal([]), 'WAIT');
  const bars = Array.from({ length: 60 }, (_, index) => ({ close: 1 + index / 1000 + (index % 4 === 3 ? -0.004 : 0) }));
  assert.equal(computeRuleSignal(bars), 'WATCH BUY');
  assert.equal(computeRuleSignal([...bars.slice(0, -1), { close: Number.NaN }]), 'WAIT');
});
