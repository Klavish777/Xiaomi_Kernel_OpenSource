export const MAX_AGENT_EQUITY = 80_000_000;

export function isInsideSchedule(date, start, end, days) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const selectedDays = new Set(Array.isArray(days) ? days.map(Number) : []);
  const minuteOfDay = date.getHours() * 60 + date.getMinutes();
  const parseTime = (value) => {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour < 24 && minute < 60 ? hour * 60 + minute : null;
  };
  const startMinute = parseTime(start);
  const endMinute = parseTime(end);
  if (startMinute === null || endMinute === null || selectedDays.size === 0) return false;

  if (startMinute === endMinute) return false;
  if (startMinute < endMinute) {
    return selectedDays.has(date.getDay()) && minuteOfDay >= startMinute && minuteOfDay < endMinute;
  }
  if (minuteOfDay >= startMinute) return selectedDays.has(date.getDay());
  if (minuteOfDay < endMinute) return selectedDays.has((date.getDay() + 6) % 7);
  return false;
}

export function validateReferencePayload(payload, now = new Date()) {
  const parsedDate = typeof payload?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
    ? new Date(`${payload.date}T00:00:00Z`)
    : null;
  const dateValid = Boolean(parsedDate && !Number.isNaN(parsedDate.getTime())
    && parsedDate.toISOString().slice(0, 10) === payload.date
    && payload.date <= now.toISOString().slice(0, 10));
  const rate = Number(payload?.rates?.CAD);
  const rateValid = Number.isFinite(rate) && rate > 0;
  const schemaValid = Boolean(payload && typeof payload === 'object' && payload.base === 'AUD' && payload.rates && typeof payload.rates === 'object');
  return {
    valid: dateValid && rateValid && schemaValid,
    checks: [
      { name: 'response schema', ok: schemaValid },
      { name: 'publication date', ok: dateValid },
      { name: 'AUD/CAD reference rate', ok: rateValid },
    ],
    date: dateValid ? payload.date : null,
    rate: rateValid ? rate : null,
  };
}

export function advancePaperAgent(state, { signal, price, quoteTime, symbol, settings, allowEntry = true, now = new Date() }) {
  if (state?.goalReached) return state;
  const timestamp = Number(quoteTime);
  const marketPrice = Number(price);
  if (!state?.enabled || !Number.isFinite(timestamp) || !Number.isFinite(marketPrice) || marketPrice <= 0) return state;
  if (timestamp <= Number(state.lastEvaluatedAt || 0)) return state;

  const next = { ...state, lastEvaluatedAt: timestamp };
  const insideSchedule = isInsideSchedule(now, settings.start, settings.end, settings.days);
  const direction = signal === 'WATCH BUY' ? 1 : signal === 'WATCH SELL' ? -1 : 0;
  const trades = Array.isArray(state.trades) ? [...state.trades] : [];
  const position = state.position || null;
  const floatingPnl = position ? (marketPrice - Number(position.openPrice)) * Number(position.units) * Number(position.direction) : 0;
  const currentEquity = Number(state.capital || 0) + Number(state.realizedPnl || 0) + floatingPnl;
  if (currentEquity >= MAX_AGENT_EQUITY) {
    next.enabled = false;
    next.goalReached = true;
    if (position) {
      const pnl = floatingPnl;
      const closed = { ...position, closePrice: marketPrice, closeTime: now.toISOString(), pnl, status: 'closed' };
      next.position = null;
      next.realizedPnl = Number(state.realizedPnl || 0) + pnl;
      next.trades = [closed, ...trades.filter((trade) => trade.id !== position.id)].slice(0, 50);
    }
    next.lastAction = `Equity goal ${MAX_AGENT_EQUITY.toLocaleString()} reached; Paper agent stopped`;
    return next;
  }

  if (position && (!insideSchedule || (direction && direction !== position.direction))) {
    const pnl = (marketPrice - position.openPrice) * position.units * position.direction;
    const closed = {
      ...position,
      closePrice: marketPrice,
      closeTime: now.toISOString(),
      pnl,
      status: 'closed',
    };
    next.position = null;
    next.realizedPnl = Number(state.realizedPnl || 0) + pnl;
    next.trades = [closed, ...trades.filter((trade) => trade.id !== position.id)].slice(0, 50);
    next.lastAction = `${symbol} paper position closed`;
    return next;
  }

  if (!position && insideSchedule && direction && !allowEntry) return next;

  if (!position && insideSchedule && direction && allowEntry) {
    const capital = Math.min(10000000, Math.max(0, Number(settings.capital) || 0));
    const maxAllocation = Math.min(10000000, Math.max(0, Number(settings.maxAllocation) || 0));
    const allocation = Math.min(capital, maxAllocation);
    const units = allocation / marketPrice;
    if (allocation > 0 && Number.isFinite(units)) {
      const opened = {
        id: `${timestamp}-${symbol}`,
        symbol,
        direction,
        side: direction > 0 ? 'BUY' : 'SELL',
        openPrice: marketPrice,
        openTime: now.toISOString(),
        units,
        allocation,
        status: 'open',
      };
      next.position = opened;
      next.trades = [opened, ...trades].slice(0, 50);
      next.lastAction = `${symbol} paper ${opened.side} opened`;
      return next;
    }
  }
  return state;
}

export function validateReferenceRecord(reference, now = new Date()) {
  if (!reference || typeof reference !== 'object') return { valid: false, reason: 'missing' };
  const payload = { base: reference.base, date: reference.sourceDate, rates: { CAD: reference.rate } };
  const daily = validateReferencePayload(payload, now);
  const fetched = Date.parse(reference.fetchedAt);
  const ageMs = now.getTime() - fetched;
  const sourceAgeDays = daily.date ? (Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`) - Date.parse(`${daily.date}T00:00:00Z`)) / 86400000 : Infinity;
  const fresh = Number.isFinite(fetched) && ageMs >= 0 && ageMs <= 24 * 60 * 60 * 1000;
  const recent = sourceAgeDays >= 0 && sourceAgeDays <= 7;
  return { valid: daily.valid && fresh && recent, rate: daily.rate, sourceDate: daily.date, fetchedAt: Number.isFinite(fetched) ? fetched : null, reason: !daily.valid ? 'invalid' : !fresh ? 'stale_fetch' : !recent ? 'stale_source' : 'verified' };
}

export function summarizePaperHistory(trades, now = new Date()) {
  const closed = (Array.isArray(trades) ? trades : []).filter((trade) => trade?.status === 'closed');
  const recent = [...closed].sort((left, right) => Date.parse(right.closeTime) - Date.parse(left.closeTime));
  let consecutiveLosses = 0;
  for (const trade of recent) {
    if (!Number.isFinite(Date.parse(trade.closeTime)) || Number(trade.pnl) >= 0) break;
    consecutiveLosses += 1;
  }
  const lastLossTime = consecutiveLosses >= 2 ? Date.parse(recent[0]?.closeTime) : NaN;
  const cooldownUntil = Number.isFinite(lastLossTime) ? lastLossTime + 60 * 60 * 1000 : null;
  const winRate = closed.length ? closed.filter((trade) => Number(trade.pnl) > 0).length / closed.length : null;
  return {
    state: cooldownUntil !== null && now.getTime() < cooldownUntil && now.getTime() >= lastLossTime ? 'learning_cooldown' : undefined,
    closedTrades: closed.length,
    winRate,
    consecutiveLosses,
    cooldownUntil,
  };
}

export function movingAverageValues(bars, period, type = 'SMA') {
  const size = Math.floor(Number(period));
  if (!Array.isArray(bars) || !Number.isInteger(size) || size < 2 || !['SMA', 'EMA'].includes(type)) return [];
  const output = Array(bars.length).fill(null);
  if (bars.length < size) return output;
  const close = bars.map((bar) => Number(bar.close));
  if (close.some((value) => !Number.isFinite(value))) return output;
  let average = close.slice(0, size).reduce((sum, value) => sum + value, 0) / size;
  output[size - 1] = average;
  const alpha = 2 / (size + 1);
  for (let index = size; index < close.length; index += 1) {
    average = type === 'EMA'
      ? alpha * close[index] + (1 - alpha) * average
      : close.slice(index + 1 - size, index + 1).reduce((sum, value) => sum + value, 0) / size;
    output[index] = average;
  }
  return output;
}

export function sliceChartHistory(bars, olderOffset, visibleCount) {
  if (!Array.isArray(bars)) return [];
  const count = Math.max(1, Math.floor(Number(visibleCount) || 1));
  const offset = Math.max(0, Math.floor(Number(olderOffset) || 0));
  const end = Math.max(0, bars.length - offset);
  return bars.slice(Math.max(0, end - count), end);
}

export function buildAnalystConsensus({ analysis, quote, referenceData, brokerStatus, now = new Date() }) {
  const signal = ['WATCH BUY', 'WATCH SELL', 'WAIT'].includes(analysis?.signal) ? analysis.signal : 'WAIT';
  const rsi = Number(analysis?.rsi);
  const technicalReady = Number.isFinite(rsi) && rsi >= 0 && rsi <= 100 && signal !== 'WAIT';
  const quoteTime = Number(quote?.timeMsc || Number(quote?.time || 0) * 1000);
  const quoteAge = quoteTime ? now.getTime() - quoteTime : Infinity;
  const quoteReady = Number(quote?.bid) > 0 && Number(quote?.ask) >= Number(quote?.bid) && quoteAge >= 0 && quoteAge <= 30000;
  const reference = validateReferenceRecord(referenceData, now);
  const state = brokerStatus?.state;
  const hardBlocked = ['error', 'daily_loss_stop', 'learning_cooldown', 'adaptive_filter', 'analyst_paused'].includes(state);
  const closedTrades = Number(brokerStatus?.closedTrades || 0);
  const winRate = Number(brokerStatus?.winRate);
  const learnerTightened = closedTrades >= 5 && Number.isFinite(winRate) && winRate < 0.4;
  const learnedEntryAllowed = !learnerTightened || (signal === 'WATCH BUY' ? rsi < 60 : signal === 'WATCH SELL' ? rsi > 40 : false);
  const entryAllowed = technicalReady && quoteReady && reference.valid && !hardBlocked && learnedEntryAllowed;
  const reason = hardBlocked ? state : !quoteReady ? 'quote_unavailable' : !reference.valid ? `reference_${reference.reason}` : learnerTightened && !learnedEntryAllowed ? 'adaptive_filter' : !technicalReady ? 'no_directional_signal' : 'consensus_ready';
  return {
    entryAllowed,
    decision: entryAllowed ? signal : 'WAIT',
    reason,
    analysts: {
      technical: { ready: technicalReady, signal, rsi: Number.isFinite(rsi) ? rsi : null },
      internet: { ready: reference.valid, rate: reference.rate, sourceDate: reference.sourceDate, reason: reference.reason },
      learning: { ready: !hardBlocked && learnedEntryAllowed, state: hardBlocked ? state : learnerTightened && !learnedEntryAllowed ? 'adaptive_filter' : closedTrades ? 'learning' : 'warming_up', closedTrades, winRate: Number.isFinite(winRate) ? winRate : null },
    },
  };
}

export function adjustVirtualBalance(state, direction, amount, now = new Date()) {
  const value = Number(amount);
  const adjustment = Number(direction);
  if (![1, -1].includes(adjustment) || !Number.isFinite(value) || value <= 0 || value > 1000000) {
    return { ok: false, code: 'invalid_amount' };
  }
  if (adjustment < 0 && value > Number(state.capital) - Number(state.position?.allocation || 0)) {
    return { ok: false, code: 'reserved_funds' };
  }
  const nextCapital = Number(state.capital) + adjustment * value;
  if (nextCapital < 0 || nextCapital > MAX_AGENT_EQUITY) return { ok: false, code: 'balance_limit' };
  const goalReached = Boolean(state.goalReached) || nextCapital + Number(state.realizedPnl || 0) >= MAX_AGENT_EQUITY;
  const entry = { id: `${now.getTime()}-${adjustment}`, type: adjustment > 0 ? 'deposit' : 'withdrawal', amount: adjustment * value, balanceAfter: nextCapital, time: now.toISOString() };
  return { ok: true, state: { ...state, capital: nextCapital, enabled: goalReached ? false : state.enabled, goalReached, cashFlows: [entry, ...(state.cashFlows || [])].slice(0, 50) }, entry };
}

export function computeRuleSignal(bars) {
  if (!Array.isArray(bars) || bars.length < 50) return 'WAIT';
  const closes = bars.map((bar) => Number(bar.close));
  if (closes.some((close) => !Number.isFinite(close) || close <= 0)) return 'WAIT';
  const ema = (values, period) => {
    const alpha = 2 / (period + 1);
    return values.slice(1).reduce((current, value) => alpha * value + (1 - alpha) * current, values[0]);
  };
  const fast = ema(closes.slice(-40), 20);
  const slow = ema(closes.slice(-50), 50);
  const recent = closes.slice(-15);
  let gains = 0;
  let losses = 0;
  for (let index = 1; index < recent.length; index += 1) {
    const change = recent[index] - recent[index - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const rsi = losses === 0 ? 100 : 100 - (100 / (1 + gains / losses));
  if (fast > slow && rsi < 70) return 'WATCH BUY';
  if (fast < slow && rsi > 30) return 'WATCH SELL';
  return 'WAIT';
}
