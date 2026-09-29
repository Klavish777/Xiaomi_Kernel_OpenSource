const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeTechnicalMetrics,
  createMarketAnalyst,
  parseRssFeed,
  signalCooldownRemaining,
  summarizeSignalOutcomes,
} = require('../electron/market-analyst.cjs');

const NOW = 1_700_000_000_000;
const feed = (title, url = 'https://publisher.example/story') => `<?xml version="1.0"?><rss><channel><item><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>${new Date(NOW - 60_000).toUTCString()}</pubDate></item></channel></rss>`;
const risingBars = Array.from({ length: 64 }, (_, index) => {
  const close = 0.88 + index * 0.0002;
  return { time: NOW / 1000 - (63 - index) * 900, open: close - 0.0001, high: close + 0.0002, low: close - 0.0002, close, tickVolume: 100 + index };
});

test('enforces a one-minute minimum interval between analysis runs', () => {
  assert.equal(signalCooldownRemaining(0, NOW), 0);
  assert.equal(signalCooldownRemaining(NOW, NOW + 1), 59_999);
  assert.equal(signalCooldownRemaining(NOW, NOW + 30_000), 30_000);
  assert.equal(signalCooldownRemaining(NOW, NOW + 60_000), 0);
  assert.equal(signalCooldownRemaining(NOW, NOW - 5_000), 60_000);
});

test('parses and bounds source-attributed RSS headlines', () => {
  const [headline] = parseRssFeed(feed('Rates &amp; inflation outlook &#8212; RBA', 'https://rba.gov.au/release'), {
    id: 'rba', name: 'RBA', official: true,
  }, { now: NOW });
  assert.equal(headline.title, 'Rates & inflation outlook — RBA');
  assert.equal(headline.url, 'https://rba.gov.au/release');
  assert.equal(headline.official, true);
  assert.equal(parseRssFeed(feed('Outdated inflation release'), { id: 'rba', name: 'RBA', official: true }, { now: NOW + 4 * 24 * 60 * 60 * 1000 }).length, 0);
  assert.equal(parseRssFeed(feed('Local appointment announcement'), { id: 'rba', name: 'RBA', official: true }, { now: NOW }).length, 0);
});

test('computes grounded AUDCAD M15 technical features and quote freshness', () => {
  const metrics = computeTechnicalMetrics(risingBars, { bid: 0.893, ask: 0.89315, time: NOW / 1000 }, { now: NOW });
  assert.equal(metrics.barsUsed, 64);
  assert.equal(metrics.timeframe, 'M15');
  assert.equal(metrics.technicalBias, 'BULLISH');
  assert.equal(metrics.quoteFresh, true);
  assert.ok(Math.abs(metrics.spreadPips - 1.5) < 1e-9);
  assert.ok(metrics.ema20 > metrics.ema50);
  assert.ok(metrics.rsi14 > 50);
  assert.equal(computeTechnicalMetrics([], null, { now: NOW }).quoteFresh, false);
});

test('reflects only matured four-bar signal outcomes and marks a small sample inconclusive', () => {
  const reports = [
    { signal: 'BUY', technical: { asOf: new Date(risingBars[10].time * 1000).toISOString(), lastClose: risingBars[10].close } },
    { signal: 'SELL', technical: { asOf: new Date(risingBars[20].time * 1000).toISOString(), lastClose: risingBars[20].close } },
    { signal: 'BUY', technical: { asOf: new Date(risingBars.at(-1).time * 1000).toISOString(), lastClose: risingBars.at(-1).close } },
  ];
  const summary = summarizeSignalOutcomes(reports, risingBars);
  assert.equal(summary.evaluated, 2);
  assert.equal(summary.correct, 1);
  assert.equal(summary.wrong, 1);
  assert.equal(summary.directionalAccuracyPercent, 50);
  assert.equal(summary.sampleSizeIsSmall, true);
});

test('runs separate news and bull/bear stages, returns cited advisory signal, and never sends an order', async () => {
  const roles = [];
  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    text: async () => url.includes('rba.gov.au')
      ? feed('Monetary policy decision and inflation outlook', 'https://rba.gov.au/policy')
      : url.includes('bankofcanada.ca')
        ? feed('Bank of Canada interest rate decision', 'https://bankofcanada.ca/rates')
        : feed('AUDCAD forex inflation central bank outlook', 'https://news.example/audcad'),
  });
  const requestJson = async (role) => {
    roles.push(role);
    if (role === 'news_analyst') return { bias: 'BULLISH', score: 35, evidence: ['Official release context'], uncertainty: 'Headlines may be incomplete.' };
    return { signal: 'BUY', confidence: 82, bullCase: 'Trend and macro context align.', bearCase: 'Short horizon remains uncertain.', rationale: 'Only a conditional informational signal.' };
  };
  const run = createMarketAnalyst({ requestJson, fetchImpl, clock: () => NOW });
  const report = await run({ symbol: 'AUDCAD.a', bars: risingBars, quote: { bid: 0.893, ask: 0.89315, time: NOW / 1000 } });
  assert.equal(roles.filter((role) => role === 'news_analyst').length, 1);
  assert.equal(roles.filter((role) => role === 'bull_bear_debate').length, 1);
  assert.equal(report.signal, 'BUY');
  assert.equal(report.tradeSent, false);
  assert.ok(report.sources.some((item) => item.url === 'https://rba.gov.au/policy'));
  assert.ok(report.sourceStatus.every((item) => item.ok));
});

test('caches public RSS for 60 seconds while still producing a fresh signal analysis', async () => {
  let clockValue = NOW;
  let fetchCount = 0;
  let requestCount = 0;
  const run = createMarketAnalyst({
    fetchImpl: async (url) => {
      fetchCount += 1;
      const title = url.includes('rba.gov.au') ? 'Monetary policy decision and inflation outlook'
        : url.includes('bankofcanada.ca') ? 'Bank of Canada interest rate decision' : 'AUDCAD forex inflation central bank outlook';
      return { ok: true, status: 200, text: async () => feed(title, `${url}/story`) };
    },
    clock: () => clockValue,
    requestJson: async (role) => {
      requestCount += 1;
      return role === 'news_analyst'
        ? { bias: 'MIXED', score: 0, evidence: ['Mixed headlines'], uncertainty: 'Uncertain.' }
        : { signal: 'WAIT', confidence: 30, bullCase: 'Possible recovery.', bearCase: 'Possible decline.', rationale: 'No clear edge.' };
    },
  });
  const input = () => ({ symbol: 'AUDCAD', bars: risingBars, quote: { bid: 0.893, ask: 0.89315, time: clockValue / 1000, receivedAt: clockValue } });
  const first = await run(input());
  clockValue += 15_000;
  const second = await run(input());
  assert.equal(first.sourceCache.reused, false);
  assert.equal(second.sourceCache.reused, true);
  assert.equal(second.sourceCache.ageSeconds, 15);
  assert.equal(fetchCount, 3, 'RSS sources are fetched once for both runs');
  assert.equal(requestCount, 4, 'each requested signal receives a fresh pair of model reviews');
  clockValue += 46_000;
  const third = await run(input());
  assert.equal(third.sourceCache.reused, false);
  assert.equal(fetchCount, 6, 'expired RSS cache is refreshed');
});

test('fails closed to WAIT if live online sources are unavailable', async () => {
  const run = createMarketAnalyst({
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => '' }),
    clock: () => NOW,
    requestJson: async (role) => role === 'news_analyst'
      ? { bias: 'UNAVAILABLE', score: 0, evidence: [], uncertainty: 'No fresh sources.' }
      : { signal: 'BUY', confidence: 90, bullCase: 'Possible trend.', bearCase: 'Unknown.', rationale: 'Insufficient evidence.' },
  });
  const report = await run({ symbol: 'AUDCAD', bars: risingBars, quote: { bid: 0.893, ask: 0.89315, time: NOW / 1000 } });
  assert.equal(report.signal, 'WAIT');
  assert.equal(report.tradeSent, false);
  assert.ok(report.riskFlags.some((flag) => flag.includes('Не получены свежие заголовки')));
});
