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

  if (startMinute === endMinute) return selectedDays.has(date.getDay());
  if (startMinute < endMinute) {
    return selectedDays.has(date.getDay()) && minuteOfDay >= startMinute && minuteOfDay < endMinute;
  }
  if (minuteOfDay >= startMinute) return selectedDays.has(date.getDay());
  if (minuteOfDay < endMinute) return selectedDays.has((date.getDay() + 6) % 7);
  return false;
}

export function normalizeMarketTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  if (timestamp >= 1e17) return timestamp / 1e6; // nanoseconds since epoch -> milliseconds
  if (timestamp >= 1e14) return timestamp / 1e3; // microseconds since epoch -> milliseconds
  if (timestamp >= 1e11) return timestamp; // milliseconds since epoch
  if (timestamp >= 1e8) return timestamp * 1e3; // seconds since epoch -> milliseconds
  return null;
}

export function marketTimestampMs(quote) {
  return normalizeMarketTimestamp(quote?.timeMsc) ?? normalizeMarketTimestamp(quote?.time);
}

export function mergeMarketTick(previous, incoming, receivedAt = Date.now()) {
  const incomingTime = marketTimestampMs(incoming);
  const previousTime = marketTimestampMs(previous);
  const sameTick = Boolean(previous)
    && incomingTime === previousTime
    && Number(incoming?.bid) === Number(previous?.bid)
    && Number(incoming?.ask) === Number(previous?.ask);
  if (previous && incomingTime && previousTime && incomingTime < previousTime) {
    const incomingAge = receivedAt - incomingTime;
    const previousSkew = previousTime - receivedAt;
    const recoveringClockCorrection = previousSkew > 120000 && incomingAge >= -120000 && incomingAge <= 30000;
    if (!recoveringClockCorrection) return previous;
  }
  if (sameTick) return previous;
  return { ...incoming, receivedAt };
}

export function updateTickCadence(previous, quote) {
  const timestamp = marketTimestampMs(quote);
  if (!timestamp) return previous || { lastTimestamp: null, intervals: [], averageMs: null, sampleCount: 0 };
  const lastTimestamp = Number(previous?.lastTimestamp);
  if (Number.isFinite(lastTimestamp) && timestamp === lastTimestamp) return previous;
  if (!Number.isFinite(lastTimestamp) || lastTimestamp <= 0 || timestamp < lastTimestamp || timestamp - lastTimestamp > 60000) {
    return { lastTimestamp: timestamp, intervals: [], averageMs: null, sampleCount: 0 };
  }
  const intervals = [...(Array.isArray(previous?.intervals) ? previous.intervals : []), timestamp - lastTimestamp].slice(-20);
  return {
    lastTimestamp: timestamp,
    intervals,
    averageMs: Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length),
    sampleCount: intervals.length,
  };
}

export function mergeHistoryBars(existing, incoming, limit = 2000) {
  const cap = Math.max(1, Math.min(2000, Math.floor(Number(limit) || 2000)));
  const byTime = new Map();
  for (const bar of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    const time = Number(bar?.time);
    if (Number.isFinite(time) && time > 0) byTime.set(time, { ...bar, time });
  }
  return [...byTime.values()].sort((left, right) => left.time - right.time).slice(-cap);
}

export function summarizeAccountPerformance(account, positions, deals, now = new Date()) {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
  const openPositions = Array.isArray(positions) ? positions : [];
  const todayDeals = (Array.isArray(deals) ? deals : []).filter((deal) => Number(deal?.time) >= dayStart);
  const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  return {
    balance: finite(account?.balance),
    equity: finite(account?.equity),
    usedMargin: finite(account?.margin),
    currency: String(account?.currency || ''),
    openPositionCount: openPositions.length,
    floatingPnl: openPositions.reduce((sum, row) => sum + finite(row.profit) + finite(row.swap) + finite(row.commission), 0),
    realizedToday: todayDeals.reduce((sum, row) => sum + finite(row.profit) + finite(row.commission) + finite(row.swap), 0),
    syncedAt: Number(account?.syncedAt) || null,
  };
}

export function normalizeBankOfCanadaReference(payload) {
  if (!Array.isArray(payload?.observations)) return { base: 'AUD', date: null, rates: { CAD: null } };
  const observation = payload.observations.find((row) => typeof row?.d === 'string' && Number.isFinite(Number(row?.FXAUDCAD?.v)) && Number(row.FXAUDCAD.v) > 0);
  return observation
    ? { base: 'AUD', date: observation.d, rates: { CAD: Number(observation.FXAUDCAD.v) } }
    : { base: 'AUD', date: null, rates: { CAD: null } };
}

function parseAppVersion(version) {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(version || '').trim());
  if (!match) return null;
  return { parts: match.slice(1, 4).map(Number), prerelease: match[4] || '' };
}

export function compareAppVersions(left, right) {
  const a = parseAppVersion(left);
  const b = parseAppVersion(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index] !== b.parts[index]) return a.parts[index] > b.parts[index] ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

export function findNewerAppRelease(releases, currentVersion) {
  if (!Array.isArray(releases)) return null;
  const candidates = releases.flatMap((release) => {
    if (release?.draft || typeof release?.tag_name !== 'string') return [];
    const match = /^money-work-v((?:\d+)\.(?:\d+)\.(?:\d+)(?:-[0-9A-Za-z.-]+)?)$/.exec(release.tag_name);
    return match && parseAppVersion(match[1]) ? [{ version: match[1] }] : [];
  });
  candidates.sort((a, b) => compareAppVersions(b.version, a.version));
  return candidates[0] && compareAppVersions(candidates[0].version, currentVersion) > 0 ? candidates[0].version : null;
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
  const quoteTime = marketTimestampMs(quote);
  const quoteAge = quoteTime === null ? Infinity : now.getTime() - quoteTime;
  const receivedAt = Number(quote?.receivedAt);
  const receiptAge = Number.isFinite(receivedAt) ? now.getTime() - receivedAt : Infinity;
  const quotePricesValid = Number(quote?.bid) > 0 && Number(quote?.ask) >= Number(quote?.bid);
  const futureClockSkew = quoteAge < -120000;
  const sourceFresh = quoteAge >= 0 && quoteAge <= 30000;
  const receivedFreshWithSmallSkew = quoteAge < 0 && !futureClockSkew && receiptAge >= 0 && receiptAge <= 30000;
  const quoteReady = quotePricesValid && quoteTime !== null && !futureClockSkew && (sourceFresh || receivedFreshWithSmallSkew);
  const quoteReason = !quotePricesValid || quoteTime === null
    ? 'quote_unavailable'
    : futureClockSkew
      ? 'quote_clock_skew'
      : quoteAge < 0 && !receivedFreshWithSmallSkew
        ? 'quote_timestamp_invalid'
        : quoteAge > 30000
          ? 'quote_stale'
          : 'quote_unavailable';
  const reference = validateReferenceRecord(referenceData, now);
  const state = brokerStatus?.state;
  const hardBlocked = ['error', 'daily_loss_stop', 'learning_cooldown', 'adaptive_filter', 'analyst_paused'].includes(state);
  const closedTrades = Number(brokerStatus?.closedTrades || 0);
  const winRate = Number(brokerStatus?.winRate);
  const learnerTightened = closedTrades >= 5 && Number.isFinite(winRate) && winRate < 0.4;
  const learnedEntryAllowed = !learnerTightened || (signal === 'WATCH BUY' ? rsi < 60 : signal === 'WATCH SELL' ? rsi > 40 : false);
  const entryAllowed = technicalReady && quoteReady && reference.valid && !hardBlocked && learnedEntryAllowed;
  const reason = hardBlocked ? state : !quoteReady ? quoteReason : !reference.valid ? `reference_${reference.reason}` : learnerTightened && !learnedEntryAllowed ? 'adaptive_filter' : !technicalReady ? 'no_directional_signal' : 'consensus_ready';
  return {
    entryAllowed,
    decision: entryAllowed ? signal : 'WAIT',
    reason,
    analysts: {
      market: { ready: quoteReady, ageSeconds: Number.isFinite(quoteAge) && quoteAge >= 0 ? Math.floor(quoteAge / 1000) : Number.isFinite(receiptAge) && receiptAge >= 0 ? Math.floor(receiptAge / 1000) : null, clockSkewSeconds: Number.isFinite(quoteAge) && quoteAge < 0 ? Math.ceil(-quoteAge / 1000) : 0, reason: quoteReady ? 'verified' : quoteReason },
      technical: { ready: technicalReady, signal, rsi: Number.isFinite(rsi) ? rsi : null },
      internet: { ready: reference.valid, rate: reference.rate, sourceDate: reference.sourceDate, reason: reference.reason },
      learning: { ready: !hardBlocked && learnedEntryAllowed, state: hardBlocked ? state : learnerTightened && !learnedEntryAllowed ? 'adaptive_filter' : closedTrades ? 'learning' : 'warming_up', closedTrades, winRate: Number.isFinite(winRate) ? winRate : null },
    },
  };
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
