export function normalizeMarketTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  if (timestamp >= 1e17) return timestamp / 1e6;
  if (timestamp >= 1e14) return timestamp / 1e3;
  if (timestamp >= 1e11) return timestamp;
  if (timestamp >= 1e8) return timestamp * 1e3;
  return null;
}

export function marketTimestampMs(quote) {
  return normalizeMarketTimestamp(quote?.timeMsc) ?? normalizeMarketTimestamp(quote?.time);
}

export function mergeMarketTick(previous, incoming, receivedAt = Date.now()) {
  const incomingTime = marketTimestampMs(incoming);
  const previousTime = marketTimestampMs(previous);
  const sameTick = Boolean(previous) && incomingTime === previousTime
    && Number(incoming?.bid) === Number(previous?.bid)
    && Number(incoming?.ask) === Number(previous?.ask);
  if (previous && incomingTime && previousTime && incomingTime < previousTime) {
    const incomingAge = receivedAt - incomingTime;
    const previousSkew = previousTime - receivedAt;
    const recoveringClockCorrection = previousSkew > 120000 && incomingAge >= -120000 && incomingAge <= 30000;
    if (!recoveringClockCorrection) return previous;
  }
  return sameTick ? previous : { ...incoming, receivedAt };
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

export function mergeTickIntoBars(existing, quote, timeframe = '15M', limit = 2000) {
  if (!Array.isArray(existing) || !existing.length) return existing || [];
  const milliseconds = marketTimestampMs(quote);
  const price = Number(quote?.bid);
  if (!milliseconds || !Number.isFinite(price) || price <= 0) return existing;
  const secondsPerBar = ({ '1M': 60, '5M': 300, '15M': 900, '1H': 3600 })[String(timeframe).toUpperCase()] || 900;
  const bucket = Math.floor(milliseconds / 1000 / secondsPerBar) * secondsPerBar;
  const last = existing.at(-1);
  const lastBucket = Math.floor(Number(last.time) / secondsPerBar) * secondsPerBar;
  if (bucket < lastBucket) return existing;
  if (lastBucket === bucket) {
    return [...existing.slice(0, -1), { ...last, high: Math.max(Number(last.high), price), low: Math.min(Number(last.low), price), close: price }];
  }
  return mergeHistoryBars(existing, [{ time: bucket, open: Number(last.close), high: Math.max(Number(last.close), price), low: Math.min(Number(last.close), price), close: price, tickVolume: 0 }], limit);
}
