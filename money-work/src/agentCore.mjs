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

export function advancePaperAgent(state, { signal, price, quoteTime, symbol, settings, now = new Date() }) {
  const timestamp = Number(quoteTime);
  const marketPrice = Number(price);
  if (!state?.enabled || !Number.isFinite(timestamp) || !Number.isFinite(marketPrice) || marketPrice <= 0) return state;
  if (timestamp <= Number(state.lastEvaluatedAt || 0)) return state;

  const next = { ...state, lastEvaluatedAt: timestamp };
  const insideSchedule = isInsideSchedule(now, settings.start, settings.end, settings.days);
  const direction = signal === 'WATCH BUY' ? 1 : signal === 'WATCH SELL' ? -1 : 0;
  const trades = Array.isArray(state.trades) ? [...state.trades] : [];
  const position = state.position || null;

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

  if (!position && insideSchedule && direction) {
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
  if (nextCapital < 0 || nextCapital > 10000000) return { ok: false, code: 'balance_limit' };
  const entry = { id: `${now.getTime()}-${adjustment}`, type: adjustment > 0 ? 'deposit' : 'withdrawal', amount: adjustment * value, balanceAfter: nextCapital, time: now.toISOString() };
  return { ok: true, state: { ...state, capital: nextCapital, cashFlows: [entry, ...(state.cashFlows || [])].slice(0, 50) }, entry };
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
