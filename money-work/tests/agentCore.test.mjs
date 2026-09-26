import test from 'node:test';
import assert from 'node:assert/strict';
import { advancePaperAgent, computeRuleSignal, isInsideSchedule, validateReferencePayload } from '../src/agentCore.mjs';

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

test('rule analyzer refuses inadequate or invalid data', () => {
  assert.equal(computeRuleSignal([]), 'WAIT');
  const bars = Array.from({ length: 60 }, (_, index) => ({ close: 1 + index / 1000 + (index % 4 === 3 ? -0.004 : 0) }));
  assert.equal(computeRuleSignal(bars), 'WATCH BUY');
  assert.equal(computeRuleSignal([...bars.slice(0, -1), { close: Number.NaN }]), 'WAIT');
});
