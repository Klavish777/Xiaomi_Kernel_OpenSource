import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustVirtualBalance, advancePaperAgent, buildAnalystConsensus, computeRuleSignal, isInsideSchedule, summarizePaperHistory, validateReferencePayload, validateReferenceRecord } from '../src/agentCore.mjs';

test('schedule follows selected local weekdays and inclusive start/exclusive end', () => {
  const mondayMorning = new Date(2026, 8, 28, 9, 0);
  assert.equal(isInsideSchedule(mondayMorning, '09:00', '17:00', [1, 2, 3, 4, 5]), true);
  assert.equal(isInsideSchedule(new Date(2026, 8, 28, 17, 0), '09:00', '17:00', [1, 2, 3, 4, 5]), false);
  assert.equal(isInsideSchedule(mondayMorning, '09:00', '17:00', [2, 3, 4, 5]), false);
  assert.equal(isInsideSchedule(mondayMorning, '09:00', '09:00', [1]), false);
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

test('three-analyst consensus requires directional data, fresh quote, validated reference and learner clearance', () => {
  const now = new Date('2026-09-26T12:00:00Z');
  const quote = { bid: 0.9, ask: 0.90002, timeMsc: now.getTime() };
  const referenceData = { base: 'AUD', rate: 0.91, sourceDate: '2026-09-25', fetchedAt: now.toISOString() };
  const ready = buildAnalystConsensus({ analysis: { signal: 'WATCH BUY', rsi: 55 }, quote, referenceData, brokerStatus: { closedTrades: 2 }, now });
  assert.equal(ready.entryAllowed, true);
  assert.equal(ready.analysts.technical.signal, 'WATCH BUY');
  assert.equal(ready.analysts.internet.ready, true);
  assert.equal(ready.analysts.learning.state, 'learning');

  const missingReference = buildAnalystConsensus({ analysis: { signal: 'WATCH BUY', rsi: 55 }, quote, brokerStatus: {}, now });
  assert.equal(missingReference.entryAllowed, false);
  assert.equal(missingReference.reason, 'reference_missing');
  const weakLearning = buildAnalystConsensus({ analysis: { signal: 'WATCH BUY', rsi: 65 }, quote, referenceData, brokerStatus: { closedTrades: 5, winRate: 0.2 }, now });
  assert.equal(weakLearning.entryAllowed, false);
  assert.equal(weakLearning.reason, 'adaptive_filter');
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

test('rule analyzer refuses inadequate or invalid data', () => {
  assert.equal(computeRuleSignal([]), 'WAIT');
  const bars = Array.from({ length: 60 }, (_, index) => ({ close: 1 + index / 1000 + (index % 4 === 3 ? -0.004 : 0) }));
  assert.equal(computeRuleSignal(bars), 'WATCH BUY');
  assert.equal(computeRuleSignal([...bars.slice(0, -1), { close: Number.NaN }]), 'WAIT');
});
