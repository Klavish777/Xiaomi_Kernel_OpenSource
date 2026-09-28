import { useEffect, useMemo, useRef, useState } from 'react';
import packageJson from '../package.json';
import {
  Activity, ArrowUpRight, Bell, ChevronDown, CircleHelp,
  Clock3, Command, LayoutDashboard, LockKeyhole,
  MoreHorizontal, Plus, Search, ShieldCheck,
  Brain, Sparkles, TrendingUp, Wallet, X, Zap, Maximize2, Languages, RefreshCw,
  Globe, Bot, Play, Pause, CircleCheck, Settings2,
} from 'lucide-react';
import { buildAnalystConsensus, findNewerAppRelease, marketTimestampMs, mergeMarketTick, movingAverageValues, normalizeBankOfCanadaReference, sliceChartHistory, summarizeAccountPerformance, mergeHistoryBars, updateTickCadence, validateReferencePayload } from './agentCore.mjs';
import realisticEarth from './assets/realistic-earth.png';
import cartoonBrain from './assets/cartoon-brain.png';
import cartoonMiner from './assets/cartoon-miner.png';

const navItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Markets', icon: TrendingUp },
  { label: 'Strategies', icon: Sparkles },
  { label: 'Agents', icon: Bot },
  { label: 'Positions', icon: Wallet },
  { label: 'History', icon: Clock3 },
];

const copy = {
  en: {
    Overview: 'Overview', Markets: 'Markets', Strategies: 'Strategies', Agents: 'Agents', Positions: 'Positions', History: 'History',
    'Risk controls': 'Risk controls', Reports: 'Reports', Workspace: 'Workspace', 'My workspace': 'My workspace',
    'Here’s your trading overview for today.': 'Here’s your trading overview for today.',
    'Add MT5 account': 'Add MT5 account', 'MT5 READ-ONLY': 'MT5 READ-ONLY', 'NO MT5 ACCOUNT': 'NOT CONNECTED',
    'Demo win rate': 'Demo win rate', 'Demo max drawdown': 'Demo max drawdown',
    'AI market read': 'AI market read', 'Favorite instruments': 'Favorite instruments',
    'Demo positions': 'Demo positions', 'Strategy runner': 'Strategy runner',
    'Pause demo': 'Pause demo', 'Connect read-only': 'Connect read-only',
    'MT5 demo account': 'MT5 demo account', 'MT5 live account': 'MT5 live account', 'Language': 'Language',
    'Fullscreen': 'Fullscreen', 'Windowed': 'Windowed', 'DEMO ACCOUNT': 'DEMO ACCOUNT', 'LIVE ACCOUNT': 'LIVE ACCOUNT',
  },
  ru: {
    Overview: 'Обзор', Markets: 'Рынки', Strategies: 'Стратегии', Agents: 'Агенты', Positions: 'Позиции', History: 'История',
    'Risk controls': 'Контроль риска', Reports: 'Отчёты', Workspace: 'Рабочая область', 'My workspace': 'Моя рабочая область',
    'Here’s your trading overview for today.': 'Сводка вашей торговли за сегодня.',
    'Add MT5 account': 'Добавить счёт MT5', 'MT5 READ-ONLY': 'MT5 · ТОЛЬКО ЧТЕНИЕ', 'NO MT5 ACCOUNT': 'НЕ ПОДКЛЮЧЕНО',
    'Demo win rate': 'Доля прибыльных демо-сделок', 'Demo max drawdown': 'Максимальная демо-просадка',
    'AI market read': 'Анализ рынка ИИ', 'Favorite instruments': 'Избранные инструменты',
    'Demo positions': 'Демо-позиции', 'Strategy runner': 'Запуск стратегии',
    'Pause demo': 'Приостановить демо', 'Connect read-only': 'Подключить для чтения',
    'MT5 demo account': 'Демо-счёт MT5', 'MT5 live account': 'Реальный счёт MT5', 'Language': 'Язык',
    'Fullscreen': 'Полный экран', 'Windowed': 'Оконный режим', 'DEMO ACCOUNT': 'ДЕМО-СЧЁТ', 'LIVE ACCOUNT': 'РЕАЛЬНЫЙ СЧЁТ',
  },
};

const strategyCatalog = [
  { id: 'ema-cross', group: 'trend', name: 'EMA + RSI', ru: 'Пересечение EMA(20/50) с фильтром RSI(14); текущая стратегия агента.', en: 'EMA(20/50) crossover with RSI(14) filter; the agent’s current strategy.', method: 'EMA' },
  { id: 'rsi-reversion', group: 'range', name: 'RSI mean reversion', ru: 'Ищет возврат после экстремальных значений RSI; полезна только при боковом рынке.', en: 'Looks for reversals after RSI extremes; intended for range-bound conditions.', method: 'RSI' },
  { id: 'bollinger', group: 'range', name: 'Bollinger Bands', ru: 'Возврат внутрь полос после выхода за границу, с подтверждением волатильности.', en: 'Mean reversion inside the bands after an outer-band move, volatility-confirmed.', method: 'Bands' },
  { id: 'macd', group: 'trend', name: 'MACD momentum', ru: 'Пересечение линии MACD и сигнальной линии для оценки импульса тренда.', en: 'MACD and signal-line crossovers to assess trend momentum.', method: 'MACD' },
  { id: 'donchian', group: 'breakout', name: 'Donchian breakout', ru: 'Пробой максимума/минимума заданного окна; фильтр ложных пробоев обязателен.', en: 'Break of a lookback high/low; false-breakout filtering is essential.', method: 'Donchian' },
  { id: 'atr-breakout', group: 'breakout', name: 'ATR channel breakout', ru: 'Выход из диапазона, масштабированного ATR; стоп учитывает волатильность.', en: 'Range break scaled by ATR, with volatility-aware risk sizing.', method: 'ATR' },
  { id: 'adx-trend', group: 'trend', name: 'ADX trend filter', ru: 'ADX оценивает силу тренда, а EMA или DI задают направление.', en: 'ADX measures trend strength while EMA or DI supplies direction.', method: 'ADX' },
  { id: 'sr-breakout', group: 'breakout', name: 'Support / resistance', ru: 'Пробой или отбой от уровней, рассчитанных по истории; подтверждение закрытием бара.', en: 'Break or rejection at historical levels, confirmed by a bar close.', method: 'Levels' },
  { id: 'session-range', group: 'session', name: 'Session range', ru: 'Диапазон выбранной сессии с проверкой спреда и времени публикации новостей.', en: 'Session-range setups filtered by spread and scheduled news risk.', method: 'Session' },
  { id: 'price-action', group: 'price', name: 'Price action', ru: 'Пин-бары и поглощение у уровней; свечной паттерн сам по себе не подтверждает сделку.', en: 'Pin bars and engulfing patterns near levels; a candle pattern alone is not confirmation.', method: 'Candles' },
  { id: 'carry', group: 'macro', name: 'Carry / swap context', ru: 'Сравнивает ставки переноса брокера; долгосрочный контекст, не внутридневный сигнал.', en: 'Uses broker swap/rollover data as longer-term context, not an intraday signal.', method: 'Swap' },
];

const AGENT_SCHEDULE_STORAGE_KEY = 'money-work-mt5-agent-schedule-v1';
const REFERENCE_STORAGE_KEY = 'money-work-audcad-reference-v1';
const BROKER_GOAL_STORAGE_KEY = 'money-work-agent-equity-goals-v1';
const TECHNICAL_AGENT_STORAGE_KEY = 'money-work-technical-agent-enabled-v1';

function readBrokerGoalMap() {
  try {
    const value = JSON.parse(localStorage.getItem(BROKER_GOAL_STORAGE_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function brokerGoalIdentity(account) {
  return account ? `${String(account.login || '')}@${String(account.server || '').trim().toLowerCase()}` : '';
}

function readAgentSchedule() {
  const defaults = { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] };
  try {
    const savedValue = localStorage.getItem(AGENT_SCHEDULE_STORAGE_KEY)
      || localStorage.getItem('money-work-paper-agent-v2')
      || localStorage.getItem('money-work-paper-agent-v1')
      || '{}';
    const saved = JSON.parse(savedValue);
    return {
      start: /^\d{2}:\d{2}$/.test(saved.start || '') ? saved.start : defaults.start,
      end: /^\d{2}:\d{2}$/.test(saved.end || '') ? saved.end : defaults.end,
      days: Array.isArray(saved.days) ? saved.days.map(Number).filter((day) => day >= 0 && day <= 6) : defaults.days,
    };
  } catch { return defaults; }
}

function readReference() {
  try {
    const saved = JSON.parse(localStorage.getItem(REFERENCE_STORAGE_KEY) || 'null');
    return saved && Number.isFinite(Number(saved.rate)) ? saved : null;
  } catch { return null; }
}

function PricePlot({ bars, symbol, style, period, averageType, showAverage }) {
  const width = 1000;
  const height = 280;
  const pad = { top: 12, right: 70, bottom: 24, left: 10 };
  if (!bars.length) return null;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const averages = movingAverageValues(bars, period, averageType);
  const values = bars.flatMap((bar) => [Number(bar.high), Number(bar.low)]).concat(showAverage ? averages.filter(Number.isFinite) : []);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) { max += 0.0001; min -= 0.0001; }
  const y = (value) => pad.top + ((max - value) / (max - min)) * plotHeight;
  const step = plotWidth / bars.length;
  const x = (index) => pad.left + step * (index + 0.5);
  const linePath = bars.map((bar, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(bar.close)}`).join(' ');
  const averagePath = averages.map((value, index) => Number.isFinite(value) ? `${index && Number.isFinite(averages[index - 1]) ? 'L' : 'M'} ${x(index)} ${y(value)}` : '').filter(Boolean).join(' ');
  const priceFormat = (value) => Number(value).toFixed(5);
  return <svg className="price-plot-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${symbol} historical price chart`}>
    {[0, 1, 2, 3].map((tick) => { const value = max - ((max - min) * tick / 3); const yPos = pad.top + plotHeight * tick / 3; return <g key={tick}><line x1={pad.left} x2={width - pad.right + 8} y1={yPos} y2={yPos} stroke="#252a36" strokeDasharray="3 5" /><text x={width - pad.right + 13} y={yPos + 3} fill="#8792a4" fontSize="10">{priceFormat(value)}</text></g>; })}
    {style === 'line' ? <path d={linePath} fill="none" stroke="#78a6ff" strokeWidth="2" /> : bars.map((bar, index) => {
      const rising = Number(bar.close) >= Number(bar.open);
      const candleX = x(index);
      const bodyTop = y(Math.max(bar.open, bar.close));
      const bodyBottom = y(Math.min(bar.open, bar.close));
      const candleWidth = Math.max(2, Math.min(10, step * 0.66));
      return <g key={`${bar.time}-${index}`} className={rising ? 'candle-up' : 'candle-down'}><title>{new Date(Number(bar.time) * 1000).toLocaleString()} · O {priceFormat(bar.open)} H {priceFormat(bar.high)} L {priceFormat(bar.low)} C {priceFormat(bar.close)}</title><line x1={candleX} x2={candleX} y1={y(bar.high)} y2={y(bar.low)} stroke="currentColor" strokeWidth="1.2" /><rect x={candleX - candleWidth / 2} y={bodyTop} width={candleWidth} height={Math.max(1.5, bodyBottom - bodyTop)} rx="0.7" fill="currentColor" /></g>;
    })}
    {showAverage && averagePath && <path d={averagePath} fill="none" stroke="#e3b765" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />}
    {[0, 1, 2, 3, 4].map((tick) => { const index = Math.min(bars.length - 1, Math.round(tick * (bars.length - 1) / 4)); return <text key={tick} x={x(index)} y={height - 5} textAnchor="middle" fill="#808b9d" fontSize="9">{new Date(Number(bars[index].time) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>; })}
  </svg>;
}

function AnimatedBrain({ small = false }) {
  return <span className={`brain-art ${small ? 'small' : ''}`} aria-hidden="true"><Brain size={small ? 15 : 22} strokeWidth={1.6} /><i /><b /></span>;
}

function MinerIcon({ small = false }) {
  return <span className={`miner-art ${small ? 'small' : ''}`} aria-hidden="true"><i className="miner-helmet" /><i className="miner-face" /><i className="miner-body" /><b className="miner-pickaxe">⛏</b><b className="miner-spark">✦</b></span>;
}

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem('money-work-language') || 'ru');
  const [recentServers, setRecentServers] = useState(() => {
    try {
      const values = JSON.parse(localStorage.getItem('money-work-mt5-servers') || '[]');
      return Array.isArray(values) ? values.filter((value) => typeof value === 'string').slice(0, 20) : [];
    } catch { return []; }
  });
  const [fullScreen, setFullScreen] = useState(true);
  const t = (key) => copy[language]?.[key] || copy.en[key] || key;
  const l = (ru, en) => language === 'ru' ? ru : en;
  const [timeframe, setTimeframe] = useState('15M');
  const [chartStyle, setChartStyle] = useState('candles');
  const [showMovingAverage, setShowMovingAverage] = useState(true);
  const [movingAveragePeriod, setMovingAveragePeriod] = useState(20);
  const [movingAverageType, setMovingAverageType] = useState('SMA');
  const [visibleBarCount, setVisibleBarCount] = useState(80);
  const [olderBarsOffset, setOlderBarsOffset] = useState(0);
  const chartDrag = useRef(null);
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [selectedStrategy, setSelectedStrategy] = useState('ema-cross');
  const [activeNav, setActiveNav] = useState('Overview');
  const [selectedSymbol, setSelectedSymbol] = useState('AUDCAD');
  const [modal, setModal] = useState('');
  const [mt5Account, setMt5Account] = useState(null);
  const [brokerGoalMap, setBrokerGoalMap] = useState(readBrokerGoalMap);
  const brokerGoalKey = brokerGoalIdentity(mt5Account);
  const brokerGoalReached = Boolean(brokerGoalKey && brokerGoalMap[brokerGoalKey]);
  const [savedAccount, setSavedAccount] = useState(null);
  const [quotes, setQuotes] = useState({});
  const [quoteCadenceBySymbol, setQuoteCadenceBySymbol] = useState({});
  const [historyBySymbol, setHistoryBySymbol] = useState({});
  const [mt5Error, setMt5Error] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [rememberAccount, setRememberAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({ login: '', password: '', server: 'MetaQuotes-Demo', terminalPath: '' });
  const [symbolQuery, setSymbolQuery] = useState('AUDCAD');
  const [symbolResults, setSymbolResults] = useState([]);
  const [marketQuery, setMarketQuery] = useState('');
  const [marketLoading, setMarketLoading] = useState(false);
  const [positions, setPositions] = useState([]);
  const [deals, setDeals] = useState([]);
  const [accountDataLoading, setAccountDataLoading] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [agentSchedule, setAgentSchedule] = useState(readAgentSchedule);
  const [liveTradeConfirmed, setLiveTradeConfirmed] = useState(false);
  const [liveConfirmText, setLiveConfirmText] = useState('');
  const [brokerAgentStatus, setBrokerAgentStatus] = useState(null);
  const [manualOrderSide, setManualOrderSide] = useState('');
  const [manualConfirmText, setManualConfirmText] = useState('');
  const [manualOrderBusy, setManualOrderBusy] = useState(false);
  const [manualOrderError, setManualOrderError] = useState('');
  const [manualOrderMessage, setManualOrderMessage] = useState('');
  const [referenceData, setReferenceData] = useState(readReference);
  const [technicalAgentEnabled, setTechnicalAgentEnabled] = useState(() => localStorage.getItem(TECHNICAL_AGENT_STORAGE_KEY) !== 'false');
  const [researchRunning, setResearchRunning] = useState(false);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchStatus, setResearchStatus] = useState('');
  const [availableUpdate, setAvailableUpdate] = useState(null);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateCheckStatus, setUpdateCheckStatus] = useState('idle');
  const researchBusy = useRef(false);
  const lastSeenQuotes = useRef({});
  const tickCadenceSamples = useRef({});
  const updateCheckBusy = useRef(false);
  const lastAgentQuoteTime = useRef(0);
  const brokerEvaluateBusy = useRef(false);
  const liveQuote = quotes[selectedSymbol];
  const chartHistory = useMemo(() => {
    const bars = (historyBySymbol[selectedSymbol]?.[timeframe] || []).map((bar) => ({
      ...bar,
      open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close),
    }));
    if (liveQuote && bars.length) {
      const last = bars.length - 1;
      const mid = (Number(liveQuote.bid) + Number(liveQuote.ask)) / 2;
      bars[last] = { ...bars[last], close: mid, high: Math.max(bars[last].high, mid), low: Math.min(bars[last].low, mid) };
    }
    return bars;
  }, [timeframe, selectedSymbol, historyBySymbol, liveQuote]);
  const visibleChartBars = useMemo(() => sliceChartHistory(chartHistory, olderBarsOffset, visibleBarCount), [chartHistory, olderBarsOffset, visibleBarCount]);
  const referenceGapBps = referenceData && liveQuote && /^AUDCAD/i.test(selectedSymbol)
    ? (((Number(liveQuote.bid) + Number(liveQuote.ask)) / 2 / Number(referenceData.rate)) - 1) * 10000
    : null;
  const todayLabel = new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase();
  const accountSummary = useMemo(() => summarizeAccountPerformance(mt5Account, positions, deals), [mt5Account, positions, deals]);
  const accountIdentity = mt5Account ? `${mt5Account.login}@${mt5Account.server}` : '';

  function acceptQuote(symbol, incoming) {
    const previous = lastSeenQuotes.current[symbol];
    const merged = mergeMarketTick(previous, incoming);
    if (merged === previous) return previous;
    const cadence = updateTickCadence(tickCadenceSamples.current[symbol], merged);
    tickCadenceSamples.current[symbol] = cadence;
    if (cadence.sampleCount > 0) {
      setQuoteCadenceBySymbol((current) => ({
        ...current,
        [symbol]: { averageMs: cadence.averageMs, sampleCount: cadence.sampleCount },
      }));
    }
    lastSeenQuotes.current[symbol] = merged;
    setQuotes((current) => ({ ...current, [symbol]: merged }));
    return merged;
  }

  useEffect(() => {
    localStorage.setItem('money-work-language', language);
  }, [language]);

  useEffect(() => {
    if (!window.moneyWork?.onFullscreenChange) return undefined;
    return window.moneyWork.onFullscreenChange(setFullScreen);
  }, []);

  useEffect(() => {
    if (!window.moneyWork) return undefined;
    window.moneyWork.getSavedMt5Account().then((saved) => {
      if (saved) {
        setSavedAccount(saved);
        setAccountForm((form) => ({ ...form, login: saved.login || '', server: saved.server || '', terminalPath: saved.terminalPath || '' }));
      }
    }).catch((error) => setMt5Error(error.message));
    return window.moneyWork.onMt5Event((event) => {
      if (event.type === 'tick') acceptQuote(event.symbol, event);
      if (event.type === 'error' || event.type === 'warning' || event.type === 'fatal') setMt5Error(event.message || 'MT5 connector error');
    });
  }, []);

  useEffect(() => {
    if (!window.moneyWork || !accountIdentity) {
      setPositions([]);
      setDeals([]);
      return undefined;
    }
    let active = true;
    let busy = false;
    let lastDealsSync = 0;
    const refreshAccountData = async () => {
      if (busy) return;
      busy = true;
      try {
        const [account, nextPositions] = await Promise.all([
          window.moneyWork.getMt5Account(),
          window.moneyWork.getMt5Positions(),
        ]);
        let nextDeals;
        if (Date.now() - lastDealsSync >= 1000) {
          lastDealsSync = Date.now();
          try { nextDeals = await window.moneyWork.getMt5Deals(30); }
          catch (error) { if (active) setMt5Error((current) => current || error.message); }
        }
        if (active) {
          setMt5Account({ ...account, syncedAt: Date.now() });
          setPositions(nextPositions);
          if (nextDeals) setDeals(nextDeals);
        }
      } catch (error) {
        if (active) setMt5Error((current) => current || error.message);
      } finally {
        busy = false;
      }
    };
    refreshAccountData();
    const timer = setInterval(refreshAccountData, 100);
    return () => { active = false; clearInterval(timer); };
  }, [accountIdentity]);

  useEffect(() => {
    if (!window.moneyWork || !mt5Account || !selectedSymbol) return undefined;
    let active = true;
    let busy = false;
    const refreshHistory = async (initial = false) => {
      if (busy) return;
      busy = true;
      try {
        const bars = await window.moneyWork.getMt5History(selectedSymbol, timeframe, initial ? 2000 : 3);
        if (active) setHistoryBySymbol((current) => ({
          ...current,
          [selectedSymbol]: {
            ...current[selectedSymbol],
            [timeframe]: mergeHistoryBars(current[selectedSymbol]?.[timeframe], bars, 2000),
          },
        }));
      } catch (error) {
        if (active) setMt5Error((current) => current || error.message);
      } finally {
        busy = false;
      }
    };
    refreshHistory(true);
    const timer = setInterval(() => refreshHistory(false), 1000);
    return () => { active = false; clearInterval(timer); };
  }, [accountIdentity, selectedSymbol, timeframe]);

  useEffect(() => {
    if (!mt5Account || mt5Account.algorithmicTradingAllowed !== false) return;
    const message = mt5Account.externalApiTradingDisabled
      ? l('Автоторговля заблокирована настройкой MT5 «Disable automated trading via external Python API». Money Work не может и не будет обходить её: включите разрешение в терминале и переподключите счёт.', 'MT5 blocks automated orders through “Disable automated trading via external Python API.” Money Work cannot and will not bypass this terminal safeguard; enable the permission in MT5 and reconnect.')
      : mt5Account.terminalTradeAllowed === false
        ? l('В MT5 выключена кнопка Algo Trading или запрещена алгоритмическая торговля в настройках терминала. Включите её в самом MT5 и переподключите счёт.', 'MT5 Algo Trading is off or algorithmic trading is disallowed in terminal settings. Enable it in MT5 itself and reconnect.')
        : l('У этого счёта отключено разрешение на торговлю. Проверьте права аккаунта у брокера.', 'Trading is disabled for this account. Check account permissions with the broker.');
    setMt5Error((current) => current || message);
  }, [mt5Account?.algorithmicTradingAllowed, mt5Account?.externalApiTradingDisabled, mt5Account?.terminalTradeAllowed]);

  async function subscribeInstrument(symbol, force = false) {
    if (!window.moneyWork || (!mt5Account && !force)) return;
    setMt5Error('');
    try {
      const query = symbol.replace(/[^A-Z].*$/i, '');
      const names = await window.moneyWork.searchMt5Symbols(query);
      const exact = names.find((name) => name.toUpperCase() === symbol.toUpperCase());
      const match = exact || names.find((name) => name.toUpperCase().startsWith(query.toUpperCase()));
      if (!match) throw new Error(`MT5 did not return a symbol matching ${query}. Check the broker's Market Watch.`);
      setSelectedSymbol(match);
      setOlderBarsOffset(0);
      const quote = await window.moneyWork.subscribeMt5Symbol(match);
      acceptQuote(match, quote);
    } catch (error) {
      setMt5Error(error.message);
    }
  }

  async function searchInstruments(event) {
    event?.preventDefault();
    if (!window.moneyWork || !mt5Account) {
      setMt5Error('Connect an MT5 account before searching its broker market catalog.');
      return;
    }
    setMt5Error('');
    setMarketLoading(true);
    try {
      const names = await window.moneyWork.searchMt5Symbols(symbolQuery);
      setSymbolResults(names);
      if (!names.length) setMt5Error(`No MT5 symbols matched “${symbolQuery || 'all markets'}”.`);
    } catch (error) {
      setMt5Error(error.message);
    } finally {
      setMarketLoading(false);
    }
  }

  async function loadBrokerMarkets(event) {
    event?.preventDefault();
    if (!window.moneyWork || !mt5Account) {
      setMt5Error('Connect an MT5 account to load the broker market list.');
      return;
    }
    setMarketLoading(true);
    setMt5Error('');
    try {
      const names = await window.moneyWork.searchMt5Symbols(marketQuery.trim());
      setSymbolResults(names);
      if (!names.length) setMt5Error(marketQuery.trim() ? `No broker symbols matched “${marketQuery}”.` : 'The broker returned no symbols.');
    } catch (error) {
      setMt5Error(error.message);
    } finally {
      setMarketLoading(false);
    }
  }

  const liveBars = historyBySymbol[selectedSymbol]?.[timeframe] || [];
  const analysis = useMemo(() => {
    if (liveBars.length < 50) return null;
    const closes = liveBars.map((bar) => Number(bar.close));
    if (liveQuote && closes.length) closes[closes.length - 1] = (Number(liveQuote.bid) + Number(liveQuote.ask)) / 2;
    const ema = (values, period) => {
      const alpha = 2 / (period + 1);
      return values.slice(1).reduce((value, price) => alpha * price + (1 - alpha) * value, values[0]);
    };
    const recent = closes.slice(-15);
    let gains = 0;
    let losses = 0;
    for (let i = 1; i < recent.length; i += 1) {
      const delta = recent[i] - recent[i - 1];
      if (delta > 0) gains += delta; else losses -= delta;
    }
    const rsi = losses === 0 ? 100 : 100 - (100 / (1 + gains / losses));
    const fast = ema(closes.slice(-40), 20);
    const slow = ema(closes.slice(-50), 50);
    const trend = fast > slow ? 'Bullish' : fast < slow ? 'Bearish' : 'Flat';
    const signal = trend === 'Bullish' && rsi < 70 ? 'WATCH BUY' : trend === 'Bearish' && rsi > 30 ? 'WATCH SELL' : 'WAIT';
    return { rsi, trend, signal, price: closes.at(-1), source: 'MT5 historical bars' };
  }, [liveBars, liveQuote]);
  const analystConsensus = useMemo(() => buildAnalystConsensus({
      analysis: technicalAgentEnabled ? analysis : null,
      quote: liveQuote,
      referenceData: researchRunning ? referenceData : null,
      brokerStatus: brokerAgentStatus,
    }), [analysis, liveQuote, referenceData, brokerAgentStatus, technicalAgentEnabled, researchRunning]);
  const manualOrderDisabled = !window.moneyWork?.placeMt5ManualOrder
    || !mt5Account
    || !['demo', 'real'].includes(mt5Account.accountType)
    || !/^AUDCAD[A-Z0-9.+_-]*$/i.test(selectedSymbol)
    || agentEnabled
    || mt5Account.algorithmicTradingAllowed === false
    || !liveQuote
    || !analystConsensus.analysts.market.ready;

  async function fetchDailyReference(url, normalize = (payload) => payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return normalize(await response.json());
    } finally {
      clearTimeout(timeout);
    }
  }

  async function runInternetResearch() {
    if (researchBusy.current) return;
    researchBusy.current = true;
    setResearchLoading(true);
    setResearchStatus('');
    try {
      let validated;
      let source;
      let primaryFailure;
      try {
        const payload = await fetchDailyReference('https://api.frankfurter.dev/v1/latest?base=AUD&symbols=CAD');
        validated = validateReferencePayload(payload);
        if (!validated.valid) throw new Error('Frankfurter response failed schema/date/rate checks.');
        source = 'Frankfurter API / central-bank daily reference';
      } catch (error) {
        primaryFailure = error;
        try {
          const bankPayload = window.moneyWork?.getBankOfCanadaReference
            ? await window.moneyWork.getBankOfCanadaReference()
            : await fetchDailyReference('https://www.bankofcanada.ca/valet/observations/FXAUDCAD/json?recent=1');
          const payload = normalizeBankOfCanadaReference(bankPayload);
          validated = validateReferencePayload(payload);
          if (!validated.valid) throw new Error('Bank of Canada response failed schema/date/rate checks.');
          source = 'Bank of Canada Valet · AUD/CAD daily average';
        } catch (fallbackError) {
          throw new Error(`Frankfurter unavailable (${primaryFailure.message}); Bank of Canada fallback unavailable (${fallbackError.message}).`);
        }
      }
      const result = { base: 'AUD', rate: validated.rate, sourceDate: validated.date, fetchedAt: new Date().toISOString(), source, checks: validated.checks };
      setReferenceData(result);
      localStorage.setItem(REFERENCE_STORAGE_KEY, JSON.stringify(result));
      setResearchStatus('validated');
    } catch (error) {
      setResearchStatus(error.message || 'Internet reference check failed.');
    } finally {
      researchBusy.current = false;
      setResearchLoading(false);
    }
  }

  async function checkForAppUpdate(showCurrent = false) {
    if (updateCheckBusy.current) return;
    updateCheckBusy.current = true;
    setUpdateCheckStatus('checking');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let response;
      try {
        response = await fetch('https://api.github.com/repos/Klavish777/Xiaomi_Kernel_OpenSource/releases?per_page=50', {
          headers: { Accept: 'application/vnd.github+json' },
          cache: 'no-store',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
      const newerVersion = findNewerAppRelease(await response.json(), packageJson.version);
      setAvailableUpdate(newerVersion ? { version: newerVersion } : null);
      setUpdateCheckStatus(newerVersion ? 'available' : 'current');
      setUpdateMessage(newerVersion
        ? l(`Доступно обновление Money Work v${newerVersion}.`, `Money Work v${newerVersion} is available.`)
        : (showCurrent ? l(`Установлена последняя версия v${packageJson.version}.`, `You have the latest version, v${packageJson.version}.`) : ''));
    } catch (error) {
      setUpdateCheckStatus('failed');
      setUpdateMessage(showCurrent ? l(`Не удалось проверить обновления: ${error.message}`, `Update check failed: ${error.message}`) : '');
    } finally {
      updateCheckBusy.current = false;
    }
  }

  async function openAppRelease(version) {
    if (!version) return;
    if (window.moneyWork?.openAppRelease) {
      await window.moneyWork.openAppRelease(version);
      return;
    }
    window.open(`https://github.com/Klavish777/Xiaomi_Kernel_OpenSource/releases/tag/money-work-v${encodeURIComponent(version)}`, '_blank', 'noopener,noreferrer');
  }

  useEffect(() => {
    if (!researchRunning) return undefined;
    runInternetResearch();
    const timer = setInterval(runInternetResearch, 6 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [researchRunning]);

  useEffect(() => {
    checkForAppUpdate(false);
    const timer = setInterval(() => checkForAppUpdate(false), 6 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(TECHNICAL_AGENT_STORAGE_KEY, String(technicalAgentEnabled)); } catch { /* persistent browser storage may be unavailable */ }
  }, [technicalAgentEnabled]);

  useEffect(() => {
    try {
      localStorage.removeItem('money-work-paper-agent-v1');
      localStorage.removeItem('money-work-paper-agent-v2');
    } catch { /* persistent browser storage may be unavailable */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(AGENT_SCHEDULE_STORAGE_KEY, JSON.stringify(agentSchedule)); } catch { /* persistent browser storage may be unavailable */ }
  }, [agentSchedule]);

  useEffect(() => {
    if (!mt5Account || !window.moneyWork?.setMt5AgentArmed) return;
    window.moneyWork.setMt5AgentArmed(agentEnabled).catch((error) => {
      setMt5Error(error.message || String(error));
      if (agentEnabled) setAgentEnabled(false);
    });
  }, [agentEnabled, accountIdentity]);

  useEffect(() => {
    if (!agentEnabled || !mt5Account || !window.moneyWork || !liveQuote || !analysis || brokerGoalReached) return;
    if (mt5Account.accountType === 'real' && !liveTradeConfirmed) return;
    const quoteTime = marketTimestampMs(liveQuote);
    if (!quoteTime || quoteTime - lastAgentQuoteTime.current < 2000 || brokerEvaluateBusy.current) return;
    lastAgentQuoteTime.current = quoteTime;
    brokerEvaluateBusy.current = true;
    window.moneyWork.evaluateMt5Agent({
      symbol: selectedSymbol,
      signal: analysis.signal,
      rsi: analysis.rsi,
      entryAllowed: analystConsensus.entryAllowed,
      liveConfirmed: liveTradeConfirmed,
      schedule: agentSchedule,
      reference: researchRunning ? referenceData : null,
    }).then((result) => {
      const consensus = buildAnalystConsensus({
        analysis: technicalAgentEnabled ? analysis : null,
        quote: liveQuote,
        referenceData: researchRunning ? referenceData : null,
        brokerStatus: result,
      });
      setBrokerAgentStatus({ ...result, consensus });
      if (['position_opened', 'position_closed', 'profit_target_closed', 'daily_loss_stop', 'capital_goal_reached'].includes(result.state)) {
        refreshPositionsNow();
        refreshDealsNow();
      }
      if (result.state === 'capital_goal_reached' && brokerGoalKey) {
        setBrokerGoalMap((current) => {
          const next = { ...current, [brokerGoalKey]: true };
          try { localStorage.setItem(BROKER_GOAL_STORAGE_KEY, JSON.stringify(next)); } catch { /* persistent browser storage may be unavailable */ }
          return next;
        });
      }
      if (['daily_loss_stop', 'capital_goal_reached'].includes(result.state)) {
        setAgentEnabled(false);
        setLiveTradeConfirmed(false);
      }
    }).catch((error) => {
      const rawMessage = String(error?.message || error || 'MT5 agent request failed.');
      const algoTradingDisabled = /(?:algorithmic|algo) trading.*disabled|disabled.*(?:algorithmic|algo) trading|tradeapi_disabled/i.test(rawMessage);
      const message = algoTradingDisabled
        ? l(
          'MT5 запретил внешнюю автоторговлю. В том же терминале включите кнопку Algo Trading; откройте Сервис → Настройки → Советники, включите «Разрешить алгоритмическую торговлю» и снимите флажок «Отключить автоторговлю через внешний Python API». Убедитесь, что введён торговый, а не investor-пароль. Затем переподключите счёт в Money Work и запустите агента снова.',
          'MT5 has blocked algorithmic trading. In the same terminal, enable the Algo Trading toolbar button; open Tools → Options → Expert Advisors, enable “Allow algorithmic trading” and uncheck “Disable automated trading via external Python API”. Confirm you entered a trading-enabled password, not an investor/read-only password. Then reconnect the account in Money Work and start the agent again.',
        )
        : rawMessage;
      setBrokerAgentStatus({ state: algoTradingDisabled ? 'terminal_trading_disabled' : 'error', message });
      setMt5Error(message);
      setAgentEnabled(false);
      setLiveTradeConfirmed(false);
    }).finally(() => { brokerEvaluateBusy.current = false; });
  }, [agentEnabled, agentSchedule, liveQuote, analysis, selectedSymbol, liveTradeConfirmed, mt5Account, brokerGoalKey, brokerGoalReached, referenceData, analystConsensus, researchRunning, technicalAgentEnabled]);

  async function refreshPositionsNow() {
    if (!window.moneyWork || !mt5Account) return;
    setAccountDataLoading(true);
    try {
      const [account, nextPositions, nextDeals] = await Promise.all([
        window.moneyWork.getMt5Account(),
        window.moneyWork.getMt5Positions(),
        window.moneyWork.getMt5Deals(30),
      ]);
      setMt5Account({ ...account, syncedAt: Date.now() });
      setPositions(nextPositions);
      setDeals(nextDeals);
    } catch (error) { setMt5Error(error.message); }
    finally { setAccountDataLoading(false); }
  }

  async function refreshDealsNow() {
    if (!window.moneyWork || !mt5Account) return;
    setAccountDataLoading(true);
    try { setDeals(await window.moneyWork.getMt5Deals(30)); }
    catch (error) { setMt5Error(error.message); }
    finally { setAccountDataLoading(false); }
  }

  function rememberServer(server) {
    const normalized = String(server || '').trim();
    if (!normalized) return;
    setRecentServers((current) => {
      const next = [normalized, ...current.filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 20);
      localStorage.setItem('money-work-mt5-servers', JSON.stringify(next));
      return next;
    });
  }

  async function connectAccount(event) {
    event?.preventDefault();
    if (!window.moneyWork) {
      setMt5Error('Account connection is available in the installed Windows app, not in the browser preview.');
      return;
    }
    setConnecting(true);
    setMt5Error('');
    rememberServer(accountForm.server);
    try {
      const account = await window.moneyWork.connectMt5({ ...accountForm, remember: rememberAccount });
      setMt5Account(account);
      setAgentEnabled(false);
      setLiveTradeConfirmed(false);
      setBrokerAgentStatus(null);
      rememberServer(account.server);
      if (rememberAccount) setSavedAccount({ login: account.login, server: account.server, terminalPath: accountForm.terminalPath });
      setModal('');
      const names = await window.moneyWork.searchMt5Symbols('');
      setSymbolResults(names);
      const preferred = names.find((name) => name.toUpperCase().startsWith('AUDCAD')) || names[0];
      if (preferred) await subscribeInstrument(preferred, true);
      else setMt5Error('The broker returned no available symbols. Check the MT5 Market Watch.');
    } catch (error) {
      setMt5Error(error.message);
    } finally {
      setConnecting(false);
    }
  }

  async function connectSavedAccount() {
    if (!window.moneyWork) return;
    setConnecting(true);
    setMt5Error('');
    try {
      const account = await window.moneyWork.connectSavedMt5();
      setMt5Account(account);
      setAgentEnabled(false);
      setLiveTradeConfirmed(false);
      setBrokerAgentStatus(null);
      rememberServer(account.server);
      setModal('');
      const names = await window.moneyWork.searchMt5Symbols('');
      setSymbolResults(names);
      const preferred = names.find((name) => name.toUpperCase().startsWith('AUDCAD')) || names[0];
      if (preferred) await subscribeInstrument(preferred, true);
      else setMt5Error('The broker returned no available symbols. Check the MT5 Market Watch.');
    } catch (error) {
      setMt5Error(error.message);
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectAccount() {
    try {
      if (window.moneyWork) await window.moneyWork.disconnectMt5();
      setMt5Account(null);
      setQuotes({});
      setAgentEnabled(false);
      setQuoteCadenceBySymbol({});
      lastSeenQuotes.current = {};
      tickCadenceSamples.current = {};
      setSelectedSymbol('AUDCAD');
      setLiveTradeConfirmed(false);
      setModal('');
    } catch (error) {
      setMt5Error(error.message);
    }
  }

  function requestManualOrder(side) {
    if (agentEnabled) {
      setMt5Error(l('Сначала остановите автопилот, чтобы торговать вручную.', 'Pause the autopilot before placing a manual trade.'));
      return;
    }
    if (!mt5Account || !['demo', 'real'].includes(mt5Account.accountType)) {
      setMt5Error(l('Сначала подключите MT5 Demo или Live.', 'Connect an MT5 Demo or Live account first.'));
      setModal('connect');
      return;
    }
    if (!/^AUDCAD[A-Z0-9.+_-]*$/i.test(selectedSymbol)) {
      setMt5Error(l('Кнопки Buy/Sell сейчас доступны только для символа AUDCAD вашего брокера.', 'Manual Buy/Sell is currently limited to your broker’s AUDCAD symbol.'));
      return;
    }
    if (!window.moneyWork?.placeMt5ManualOrder) {
      setMt5Error(l('Ручные ордера доступны только в установленном приложении Windows.', 'Manual orders are available only in the installed Windows app.'));
      return;
    }
    if (!liveQuote || !analystConsensus.analysts.market.ready) {
      setMt5Error(l('Нет свежей котировки MT5; ордер не отправлен.', 'No fresh MT5 quote; no order was sent.'));
      return;
    }
    setManualOrderSide(side);
    setManualConfirmText('');
    setManualOrderError('');
    setManualOrderMessage('');
    setModal('manual-order-confirmation');
  }

  async function confirmManualOrder() {
    if (!manualOrderSide || !mt5Account || manualOrderBusy) return;
    const liveConfirmed = mt5Account.accountType === 'real' && manualConfirmText.trim() === 'LIVE';
    if (mt5Account.accountType === 'real' && !liveConfirmed) return;
    setManualOrderBusy(true);
    setManualOrderError('');
    try {
      const result = await window.moneyWork.placeMt5ManualOrder({
        symbol: selectedSymbol,
        side: manualOrderSide,
        confirmed: true,
        liveConfirmed,
      });
      const currency = result.accountCurrency || mt5Account.currency || '';
      setManualOrderMessage(`${result.side} ${result.symbol} · ${Number(result.volume).toFixed(2)} lot · ${Number(result.entry).toFixed(5)} · SL ${Number(result.stopLoss).toFixed(5)} · TP ${Number(result.takeProfit).toFixed(5)} ${currency}`);
      setModal('');
      refreshPositionsNow();
      refreshDealsNow();
    } catch (error) {
      setManualOrderError(error.message || String(error));
    } finally {
      setManualOrderBusy(false);
    }
  }

  async function startOrPauseAgent() {
    if (agentEnabled) {
      setAgentEnabled(false);
      if (mt5Account?.accountType === 'real') setLiveTradeConfirmed(false);
      return;
    }
    if (!mt5Account || !['demo', 'real'].includes(mt5Account.accountType)) {
      setMt5Error(l('Сначала подключите торговый счёт MT5. Для безопасной проверки используйте брокерский MT5 Demo.', 'Connect an MT5 trading account first. Use your broker MT5 Demo account for testing.'));
      setModal('connect');
      return;
    }
    if (brokerGoalReached) {
      setMt5Error(l('Агент этого MT5-счёта остановлен после достижения предела баланса/эквити; повторный запуск заблокирован.', 'This MT5 account agent is latched off after reaching its balance/equity cap; restart is blocked.'));
      return;
    }
    if (mt5Account.accountType === 'real' && !liveTradeConfirmed) {
      setLiveConfirmText('');
      setModal('live-trading-confirmation');
      return;
    }
    setMt5Error('');
    setResearchRunning(true);
    setAgentEnabled(true);
  }

  function confirmLiveAgent() {
    if (liveConfirmText.trim() !== 'LIVE') return;
    setLiveTradeConfirmed(true);
    setResearchRunning(true);
    setAgentEnabled(true);
    setModal('');
  }

  function shiftChart(offsetDelta) {
    setOlderBarsOffset((current) => Math.max(0, Math.min(Math.max(0, chartHistory.length - visibleBarCount), current + offsetDelta)));
  }

  function handleChartPointerDown(event) {
    chartDrag.current = { x: event.clientX, offset: olderBarsOffset };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleChartPointerMove(event) {
    if (!chartDrag.current) return;
    const delta = Math.round(((chartDrag.current.x - event.clientX) / Math.max(1, event.currentTarget.clientWidth)) * visibleBarCount);
    setOlderBarsOffset(Math.max(0, Math.min(Math.max(0, chartHistory.length - visibleBarCount), chartDrag.current.offset + delta)));
  }

  function endChartPointer(event) {
    chartDrag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleChartWheel(event) {
    event.preventDefault();
    const direction = Math.sign(event.deltaX || event.deltaY);
    shiftChart(direction * Math.max(3, Math.round(visibleBarCount * 0.12)));
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark"><span>M</span><i /></div>
          <div className="brand-name">money<span>work</span><small>TRADING STUDIO</small></div>
          <button className="icon-button sidebar-collapse" aria-label="Toggle sidebar"><Command size={16} /></button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">MW</div>
          <div className="workspace-copy"><strong>{t('My workspace')}</strong><span>{l('Счёт MT5', 'MT5 account')}</span></div>
          <ChevronDown size={15} className="muted-icon" />
        </div>

        <div className="nav-caption">{t('Workspace').toUpperCase()}</div>
        <nav className="main-nav">
          {navItems.map(({ label, icon: Icon, count }) => (
            <button key={label} onClick={() => setActiveNav(label)} className={`nav-item ${activeNav === label ? 'active' : ''}`}>
              <Icon size={17} strokeWidth={1.8} /><span>{t(label)}</span>{label === 'Positions' && mt5Account && positions.length > 0 && <b>{positions.length}</b>}
            </button>
          ))}
        </nav>

        <div className="nav-caption tools-caption">TOOLS</div>
        <nav className="main-nav">
          <button onClick={() => setActiveNav('Risk controls')} className={`nav-item ${activeNav === 'Risk controls' ? 'active' : ''}`}><ShieldCheck size={17} /><span>{t('Risk controls')}</span><span className="nav-dot" /></button>
          <button onClick={() => setActiveNav('Reports')} className={`nav-item ${activeNav === 'Reports' ? 'active' : ''}`}><Activity size={17} /><span>{t('Reports')}</span></button>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><CircleHelp size={16} /></div>
            <div><strong>Need a hand?</strong><span>Visit the quick guide</span></div>
            <ArrowUpRight size={14} className="help-arrow" />
          </div>
          <button className="profile-row" onClick={() => setModal('connect')}>
            <div className="profile-avatar">MT</div>
            <div className="profile-copy"><strong>{mt5Account?.login || l('Счёт MT5', 'MT5 account')}</strong><span>{mt5Account?.server || l('Не подключён', 'Not connected')}</span></div>
            <MoreHorizontal size={18} className="muted-icon" />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>{t('Workspace')}</span><span className="crumb-slash">/</span><strong>{t(activeNav)}</strong></div>
          <div className="topbar-actions">
            <div className={`environment-pill ${mt5Account ? 'connected' : ''}`}><span className="pulse-dot" /> {mt5Account ? (mt5Account.accountType === 'demo' ? t('DEMO ACCOUNT') : t('LIVE ACCOUNT')) : t('NO MT5 ACCOUNT')}</div>
            <button className="connect-button" onClick={() => { setMt5Error(''); setModal('connect'); }}>
              {mt5Account ? <><Activity size={15} /> {mt5Account.server}</> : <><Plus size={15} /> {t('Add MT5 account')}</>}
            </button>
            <button className="top-icon" aria-label="Search"><Search size={17} /></button>
            <button className={`top-icon notification-button ${availableUpdate ? 'update-available' : ''}`} onClick={() => availableUpdate ? openAppRelease(availableUpdate.version) : checkForAppUpdate(true)} title={availableUpdate ? l(`Скачать обновление v${availableUpdate.version}`, `Download update v${availableUpdate.version}`) : l('Проверить обновления', 'Check for updates')} aria-label={availableUpdate ? l(`Доступно обновление v${availableUpdate.version}`, `Update v${availableUpdate.version} available`) : l('Проверить обновления', 'Check for updates')} disabled={updateCheckStatus === 'checking'}><Bell size={17} />{availableUpdate && <i />}</button>
            <label className="language-control" title={t('Language')}><Languages size={14} /><select aria-label={t('Language')} value={language} onChange={(event) => setLanguage(event.target.value)}><option value="ru">RU</option><option value="en">EN</option></select></label><button className="top-icon fullscreen-button" onClick={async () => { if (window.moneyWork) setFullScreen(await window.moneyWork.toggleFullscreen()); }} title={fullScreen ? t('Windowed') : t('Fullscreen')} aria-label={fullScreen ? t('Windowed') : t('Fullscreen')}><Maximize2 size={16} /></button><div className="top-divider" />
            <div className="top-user-avatar">MT</div>
          </div>
        </header>

        <div className={`page-content workspace-content ${activeNav === 'Overview' ? 'overview-fit' : activeNav === 'Agents' ? 'agents-fit' : ''}`}>
          {mt5Account && <section className="live-account-strip" aria-label={l('Сводка подключённого счёта MT5', 'Connected MT5 account summary')}>
            <div className="live-account-metric"><span>{l('Баланс MT5', 'MT5 balance')}</span><strong>{accountSummary.balance.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {accountSummary.currency}</strong></div>
            <div className="live-account-metric"><span>{l('Средства / equity', 'Equity')}</span><strong>{accountSummary.equity.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {accountSummary.currency}</strong></div>
            <div className="live-account-metric"><span>{l('Открытые сделки', 'Open trades')}</span><strong>{accountSummary.openPositionCount}</strong><small>{l('Занятая маржа', 'Margin used')}: {accountSummary.usedMargin.toFixed(2)} {accountSummary.currency}</small><small className={accountSummary.floatingPnl >= 0 ? 'positive-text' : 'negative-text'}>{l('Плавающий P&L', 'Floating P&L')}: {accountSummary.floatingPnl >= 0 ? '+' : ''}{accountSummary.floatingPnl.toFixed(2)} {accountSummary.currency}</small></div>
            <div className="live-account-metric"><span>{l('Закрытый результат сегодня', 'Realized P&L today')}</span><strong className={accountSummary.realizedToday >= 0 ? 'positive-text' : 'negative-text'}>{accountSummary.realizedToday >= 0 ? '+' : ''}{accountSummary.realizedToday.toFixed(2)} {accountSummary.currency}</strong><small>{accountSummary.syncedAt ? `${l('Синхр.', 'Synced')} ${new Date(accountSummary.syncedAt).toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'en-GB')}` : l('Синхронизация…', 'Syncing…')}</small></div>
          </section>}
          {availableUpdate && dismissedUpdateVersion !== availableUpdate.version && <div className="app-update-banner" role="status"><Bell size={15} /><span>{l(`Доступно обновление Money Work v${availableUpdate.version}.`, `Money Work v${availableUpdate.version} is available.`)}</span><button className="app-update-download" onClick={() => openAppRelease(availableUpdate.version)}>{l('Скачать', 'Download')} <ArrowUpRight size={13} /></button><button className="app-update-dismiss" aria-label={l('Скрыть уведомление', 'Dismiss update notice')} onClick={() => setDismissedUpdateVersion(availableUpdate.version)}><X size={14} /></button></div>}
          {!availableUpdate && updateMessage && <div className="update-check-message" role="status">{updateMessage}<button onClick={() => setUpdateMessage('')} aria-label={l('Закрыть', 'Dismiss')}><X size={13} /></button></div>}
          {mt5Error && <div className="connector-banner"><ShieldCheck size={15} /> {mt5Error}<button onClick={() => setMt5Error('')}>Dismiss</button></div>}

          {activeNav === 'Overview' && <>
            <div className="page-heading compact-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> {todayLabel}</div><h1>{l('Торговый обзор', 'Trading overview')}</h1><p>{l('Только данные подключённого счёта MT5 и выбранного рынка.', 'Live data from the connected MT5 account and selected market only.')}</p></div>
              {!mt5Account && <button className="connect-button" onClick={() => setModal('connect')}><Plus size={15} /> {l('Подключить MT5', 'Connect MT5')}</button>}
            </div>
            <section className="agent-command-center panel" aria-label={l('Панель трёх агентов и баланса', 'Three-agent and balance dashboard')}>
              <article className={`overview-agent-tile technical-agent-tile ${technicalAgentEnabled ? 'agent-is-on' : ''}`}>
                <div className="overview-agent-heading"><div><span className="section-kicker">{l('АГЕНТ АНАЛИЗА', 'ANALYSIS AGENT')}</span><strong>{l('Технический мозг', 'Technical brain')}</strong></div><button className="agent-settings-button" type="button" onClick={() => setActiveNav('Agents')} title={l('Настройки агента', 'Agent settings')} aria-label={l('Настройки агента анализа', 'Analysis agent settings')}><Settings2 size={16} /></button></div>
                <button className={`mascot-toggle brain-toggle ${technicalAgentEnabled ? 'is-on' : ''}`} type="button" aria-pressed={technicalAgentEnabled} aria-label={technicalAgentEnabled ? l('Выключить агента анализа', 'Turn off analysis agent') : l('Включить агента анализа', 'Turn on analysis agent')} onClick={() => setTechnicalAgentEnabled((enabled) => !enabled)} title={technicalAgentEnabled ? l('Отключить агента анализа', 'Pause analysis agent') : l('Включить агента анализа', 'Enable analysis agent')}><img src={cartoonBrain} alt="" /></button>
                <div className="overview-agent-footer"><span className={`agent-state-label ${technicalAgentEnabled ? 'state-on' : ''}`}><i />{technicalAgentEnabled ? l('АНАЛИЗ АКТИВЕН', 'ANALYSIS ON') : l('ПАУЗА', 'PAUSED')}</span><small>{technicalAgentEnabled ? (analysis?.signal || l('Ожидает данных', 'Waiting for data')) : l('Новые входы заблокированы', 'New entries blocked')}</small></div>
              </article>

              <article className={`overview-agent-tile balance-earth-tile ${researchRunning ? 'agent-is-on' : ''}`}>
                <div className="overview-agent-heading"><div><span className="section-kicker">{l('ИНТЕРНЕТ-АГЕНТ', 'INTERNET AGENT')}</span><strong>{l('Дневной ориентир · AUD/CAD', 'Daily reference · AUD/CAD')}</strong></div><div className="center-agent-controls"><span className={`agent-state-label ${researchRunning ? 'state-on' : ''}`}><i />{researchRunning ? (researchLoading ? l('ПРОВЕРЯЕТ', 'CHECKING') : l('АКТИВЕН', 'ACTIVE')) : l('ПАУЗА', 'PAUSED')}</span><button className="agent-settings-button" type="button" onClick={() => setActiveNav('Agents')} title={l('Настройки агента', 'Agent settings')} aria-label={l('Настройки интернет-агента', 'Internet agent settings')}><Settings2 size={16} /></button></div></div>
                <button className={`earth-balance-button ${researchRunning ? 'is-on' : ''}`} type="button" aria-pressed={researchRunning} aria-label={researchRunning ? l('Выключить интернет-агента', 'Turn off internet agent') : l('Включить интернет-агента', 'Turn on internet agent')} onClick={() => setResearchRunning((running) => !running)} title={researchRunning ? l('Приостановить интернет-агента', 'Pause internet agent') : l('Включить интернет-агента', 'Enable internet agent')}>
                  <img className="realistic-earth-image" src={realisticEarth} alt="" />
                  <span className="earth-balance-copy"><small>{l('БАЛАНС СЧЁТА MT5', 'MT5 ACCOUNT BALANCE')}</small><strong>{mt5Account ? `${mt5Account.currency} ${Number(mt5Account.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</strong><small>{referenceData ? `${l('AUD/CAD', 'AUD/CAD')} · ${Number(referenceData.rate).toFixed(5)}` : l('Подключите MT5 Demo или Live', 'Connect MT5 Demo or Live')}</small></span>
                </button>
                <div className="overview-agent-footer center-agent-footer"><span>{researchRunning ? l('Ориентир обновляется раз в 6 часов; анализ — на каждом новом тике MT5', 'Reference refreshes every 6h; analysis recalculates on each new MT5 tick') : l('Нажмите Землю для запуска проверки', 'Tap Earth to start reference checks')}</span><small>{mt5Account ? `${mt5Account.login} · ${mt5Account.currency}` : l('Счёт не подключён', 'No account connected')}</small></div>
              </article>

              <article className={`overview-agent-tile miner-agent-tile ${agentEnabled ? 'agent-is-on' : ''}`}>
                <div className="overview-agent-heading"><div><span className="section-kicker">{l('АГЕНТ ИСПОЛНЕНИЯ', 'EXECUTION AGENT')}</span><strong>{l('Автопилот MT5', 'MT5 autopilot')}</strong></div><button className="agent-settings-button" type="button" onClick={() => setActiveNav('Agents')} title={l('Настройки агента', 'Agent settings')} aria-label={l('Настройки торгового агента', 'Trading agent settings')}><Settings2 size={16} /></button></div>
                <button className={`mascot-toggle miner-toggle ${agentEnabled ? 'is-on' : ''}`} type="button" aria-pressed={agentEnabled} aria-label={agentEnabled ? l('Выключить торгового агента', 'Turn off trading agent') : l('Включить торгового агента', 'Turn on trading agent')} onClick={startOrPauseAgent} title={agentEnabled ? l('Остановить торгового агента', 'Pause trading agent') : l('Включить торгового агента', 'Enable trading agent')}><img src={cartoonMiner} alt="" /></button>
                <div className="overview-agent-footer"><span className={`agent-state-label ${agentEnabled ? 'state-on' : ''}`}><i />{agentEnabled ? l('АГЕНТ АКТИВЕН', 'AGENT ON') : brokerGoalReached ? l('ЦЕЛЬ ДОСТИГНУТА', 'GOAL REACHED') : l('ПАУЗА', 'PAUSED')}</span><small>{agentEnabled ? l('Работает в пределах лимитов', 'Running within risk limits') : l('Нажмите значок для запуска', 'Tap the mascot to start')}</small></div>
              </article>
            </section>
            <article className="panel chart-panel dashboard-chart">
              <div className="panel-heading chart-heading"><div className="instrument-title"><div className="pair-icon">{selectedSymbol.slice(0, 2)}</div><div><div className="pair-name">{selectedSymbol}</div><span>{liveQuote ? `${l('Живой поток MT5', 'Live MT5 feed')}${quoteCadenceBySymbol[selectedSymbol] ? ` · ~${quoteCadenceBySymbol[selectedSymbol].averageMs} ms ${l('между тиками', 'between ticks')} · ${quoteCadenceBySymbol[selectedSymbol].sampleCount} ${l('интервалов', 'interval samples')}` : ` · ${l('измерение частоты тиков…', 'measuring tick cadence…')}`}` : l('Ожидание котировок MT5', 'Waiting for MT5 quotes')}</span></div></div><div className="chart-control-bar"><div className="manual-trade-actions"><button className="manual-buy-button" type="button" disabled={manualOrderDisabled} onClick={() => requestManualOrder('BUY')} title={l('Открыть BUY 0,01 лота; требуется подтверждение', 'Open BUY 0.01 lot; confirmation required')}>BUY <small>0.01</small></button><button className="manual-sell-button" type="button" disabled={manualOrderDisabled} onClick={() => requestManualOrder('SELL')} title={l('Открыть SELL 0,01 лота; требуется подтверждение', 'Open SELL 0.01 lot; confirmation required')}>SELL <small>0.01</small></button></div><div className="timeframe-switcher">{['1M', '5M', '15M', '1H'].map((frame) => <button key={frame} onClick={() => { setTimeframe(frame); setOlderBarsOffset(0); }} className={timeframe === frame ? 'selected' : ''}>{frame}</button>)}</div><div className="chart-edit-tools"><button title={l('Показать более ранние свечи', 'Show older candles')} onClick={() => shiftChart(Math.max(5, Math.round(visibleBarCount * 0.65)))}>←</button><button title={l('Показать более новые свечи', 'Show newer candles')} onClick={() => shiftChart(-Math.max(5, Math.round(visibleBarCount * 0.65)))}>→</button><button title={l('Увеличить масштаб', 'Zoom in')} onClick={() => setVisibleBarCount((count) => Math.max(20, count - 10))}>−</button><button title={l('Уменьшить масштаб', 'Zoom out')} onClick={() => setVisibleBarCount((count) => Math.min(240, count + 10))}>＋</button><select aria-label={l('Стиль графика', 'Chart style')} value={chartStyle} onChange={(event) => setChartStyle(event.target.value)}><option value="candles">{l('Свечи', 'Candles')}</option><option value="line">{l('Линия', 'Line')}</option></select><label className="ma-editor"><input type="checkbox" checked={showMovingAverage} onChange={(event) => setShowMovingAverage(event.target.checked)} /><select aria-label={l('Тип средней скользящей', 'Moving average type')} value={movingAverageType} onChange={(event) => setMovingAverageType(event.target.value)}><option>SMA</option><option>EMA</option></select><input aria-label={l('Период средней скользящей', 'Moving average period')} type="number" min="2" max="200" value={movingAveragePeriod} onChange={(event) => setMovingAveragePeriod(Math.max(2, Math.min(200, Number(event.target.value) || 2)))} /></label></div></div></div>
              <div className="price-row"><strong>{liveQuote ? Number(liveQuote.bid).toFixed(5) : '—'}</strong><span className="price-change">{liveQuote ? 'LIVE' : l('НЕТ ДАННЫХ', 'NO DATA')}</span>{liveQuote && <span className="price-meta">Bid {Number(liveQuote.bid).toFixed(5)} · Ask {Number(liveQuote.ask).toFixed(5)}</span>}</div>
              {visibleChartBars.length ? <div className="chart-wrap chart-pan-area" onPointerDown={handleChartPointerDown} onPointerMove={handleChartPointerMove} onPointerUp={endChartPointer} onPointerCancel={endChartPointer} onWheel={handleChartWheel} title={l('Перетаскивайте график, прокручивайте для перемещения по истории', 'Drag the chart or scroll to pan through history')}><PricePlot bars={visibleChartBars} symbol={selectedSymbol} style={chartStyle} period={movingAveragePeriod} averageType={movingAverageType} showAverage={showMovingAverage} /></div> : <div className="empty-chart"><Activity size={22} /><strong>{l('График пока пуст', 'No chart data yet')}</strong><span>{mt5Account ? l('Выберите доступный символ на вкладке «Рынки».', 'Choose a broker symbol on the Markets tab.') : l('Подключите демо- или live-счёт MT5, чтобы загрузить рынки.', 'Connect an MT5 demo or live account to load markets.')}</span></div>}
              <div className="chart-foot"><span><i className="legend-dot blue-dot" />{liveQuote ? l('Котировка обновляется через MT5', 'Quote received from MT5') : l('Демо-данные не подставляются', 'No sample prices are shown')}</span><span>{liveQuote ? new Date((liveQuote.time || Date.now() / 1000) * 1000).toLocaleTimeString() : '—'}</span></div>
              {manualOrderMessage && <div className="manual-order-status" role="status">{manualOrderMessage}</div>}
            </article>
          </>}

          {activeNav === 'Markets' && <section className="page-section">
            <div className="section-page-heading"><div><span className="section-kicker">MT5 MARKET WATCH</span><h1>{l('Рынки', 'Markets')}</h1><p>{l('Каталог именно того брокера, к которому подключён MT5.', 'The instrument catalog from your connected MT5 broker.')}</p></div><button className="secondary-action" onClick={loadBrokerMarkets} disabled={!mt5Account || marketLoading}><RefreshCw size={14} /> {marketLoading ? l('Загрузка…', 'Loading…') : l('Загрузить все рынки', 'Load all markets')}</button></div>
            <form className="market-search" onSubmit={loadBrokerMarkets}><Search size={16} /><input value={marketQuery} onChange={(event) => setMarketQuery(event.target.value)} placeholder={l('Поиск символа, например AUDCAD', 'Search symbol, e.g. AUDCAD')} /><button className="modal-primary" disabled={!mt5Account || marketLoading}>{l('Найти', 'Search')}</button></form>
            {!mt5Account ? <div className="empty-state"><TrendingUp size={28} /><h2>{l('Подключите MT5, чтобы увидеть доступные рынки', 'Connect MT5 to see available markets')}</h2><p>{l('Сейчас реальные котировки и брокерский список не загружаются. Подключается demo или live счёт.', 'Broker instruments and live quotes are not loaded. Either a demo or live account can be connected.')}</p><button className="connect-button" onClick={() => setModal('connect')}><Plus size={15} /> {l('Подключить счёт', 'Connect account')}</button></div> : <div className="market-list">{symbolResults.length ? symbolResults.map((symbol) => { const q = quotes[symbol]; return <button className={`market-row ${symbol === selectedSymbol ? 'selected' : ''}`} key={symbol} onClick={async () => { await subscribeInstrument(symbol); setActiveNav('Overview'); }}><span className="market-symbol">{symbol}</span><span>{q ? `${Number(q.bid).toFixed(5)} / ${Number(q.ask).toFixed(5)}` : l('Нажмите для загрузки котировки', 'Select to load quote')}</span><span className={q ? 'live-tag' : 'market-dash'}>{q ? 'LIVE' : '—'}</span></button>; }) : <div className="empty-inline">{l('Нажмите «Загрузить все рынки» или выполните поиск.', 'Click “Load all markets” or search for a symbol.')}</div>}</div>}
          </section>}

          {activeNav === 'Agents' && <section className="page-section agents-page">
            <div className="section-page-heading"><div><span className="section-kicker">{l('ПАНЕЛЬ УПРАВЛЕНИЯ MT5', 'MT5 CONTROL DESK')}</span><h1>{l('Автоматическая торговля AUD/CAD', 'AUD/CAD MT5 auto trader')}</h1><p>{l('Подключите брокерский MT5 Demo для проверки или MT5 Live. Новые сигналы и ордера ограничены риск-контролями.', 'Connect a broker MT5 Demo account for testing or MT5 Live. Signals and orders remain risk-controlled; profitability is not guaranteed.')}</p></div></div>
            <div className="agent-control-grid">
              <article className="panel agent-control-card internet-control-card">
                <div className="agent-control-heading"><div><span className="section-kicker"><Globe size={14} /> {l('АГЕНТ СБОРА ДАННЫХ', 'INTERNET DATA AGENT')}</span><h2>{l('Публичный ориентир AUD/CAD', 'Public AUD/CAD reference')}</h2></div><span className={`status-badge ${researchRunning ? '' : 'muted'}`}>{researchLoading ? l('СКАНИРОВАНИЕ', 'SCANNING') : researchRunning ? l('РАБОТАЕТ', 'RUNNING') : l('ПАУЗА', 'PAUSED')}</span></div>
                <div className="research-feature"><div className={`globe-orb large-globe ${researchRunning ? 'spinning' : ''}`} style={{ '--globe-speed': researchRunning ? '8s' : '24s' }} aria-label={l('Глобус вращается во время работы агента', 'Globe rotates while the agent is running')}><span /><i /><b /></div><div className="research-value"><strong>{referenceData ? Number(referenceData.rate).toFixed(5) : '—'}</strong><small>AUD / CAD · {referenceData ? referenceData.sourceDate : l('ожидает первую проверку', 'awaiting first scan')}</small><small>{l('Локальный анализ реагирует на новые тики; источник публикует дневной курс.', 'Local analysis reacts to new ticks; the reference source publishes a daily rate.')}</small></div></div>
                <div className="research-results-list">{['response schema', 'publication date', 'AUD/CAD reference rate'].map((check, index) => { const result = referenceData?.checks?.find((item) => item.name === check); return <span key={check}><CircleCheck size={14} className={result?.ok ? 'check-ok' : 'check-pending'} />{l(['Формат ответа API', 'Дата публикации', 'Курс больше нуля'][index], check)}<b>{result ? (result.ok ? l('ПРОЙДЕНО', 'PASS') : l('ОШИБКА', 'FAIL')) : l('ОЖИДАЕТ', 'PENDING')}</b></span>; })}</div>
                {referenceData && <p className="research-footnote">{l('Источник', 'Source')}: {referenceData.source || 'Frankfurter API'} · {l('время запроса', 'fetched')}: {new Date(referenceData.fetchedAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-GB')} · {l('публичный дневной справочный курс, не live-котировка.', 'public daily reference rate, not a live quote.')}</p>}
                {referenceGapBps !== null && <div className="reference-comparison"><span>{l('Разница с mid MT5', 'Difference vs MT5 mid')}</span><strong className="neutral-text">{referenceGapBps >= 0 ? '+' : ''}{referenceGapBps.toFixed(1)} bps</strong><small>{l('Только сопоставление разных временных источников, не торговый сигнал.', 'Comparison across differently timed sources only, not a trading signal.')}</small></div>}
                {researchStatus && researchStatus !== 'validated' && <div className="connection-error">{researchStatus}</div>}
                <div className="agent-actions"><button className="modal-primary" onClick={runInternetResearch} disabled={researchLoading}><RefreshCw size={14} /> {researchLoading ? l('Сканирование…', 'Scanning…') : l('Проверить сейчас', 'Check now')}</button><button className="secondary-action" onClick={() => setResearchRunning((running) => !running)}>{researchRunning ? <Pause size={14} /> : <Play size={14} />}{researchRunning ? l('Остановить цикл', 'Pause schedule') : l('Запуск · раз в 6 ч', 'Start · every 6h')}</button></div>
                <p className="muted-copy">{l('Три проверки применяются к каждому ответу. Публичный источник обновляет дневной курс, поэтому опрос каждые 0,01 секунды не создаёт новых данных; технический анализ пересчитывается на каждом новом тике MT5.', 'Three checks validate each response. The public source publishes a daily rate, so polling it every 0.01 seconds would not create new data; technical analysis recalculates on each new MT5 tick.')}</p>
              </article>
              <article className="panel agent-control-card mt5-agent-control-card compact-agent-card">
                <div className="agent-control-heading"><div><span className="section-kicker"><MinerIcon small /> {l('БРОКЕРСКИЙ АГЕНТ · AUDCAD', 'BROKER AGENT · AUDCAD')}</span><h2>{!mt5Account ? l('Счёт MT5 не подключён', 'MT5 account not connected') : mt5Account.accountType === 'real' ? l('Исполнение MT5 Live', 'MT5 Live execution') : l('Исполнение MT5 Demo', 'MT5 Demo execution')}</h2></div><span className={`status-badge ${agentEnabled ? (mt5Account?.accountType === 'real' ? 'live-risk-badge' : '') : 'muted'}`}>{agentEnabled ? l('РАБОТАЕТ', 'RUNNING') : l('ПАУЗА', 'PAUSED')}</span></div>
                <div className={`broker-risk-notice ${mt5Account?.accountType === 'real' ? 'live-warning' : ''}`}><ShieldCheck size={15} /><span>{!mt5Account ? l('Подключите свой MT5-счёт, чтобы увидеть данные брокера.', 'Connect an MT5 account to view broker data.') : mt5Account.accountType === 'real' ? l('LIVE: реальные ордера. Максимум 0,01 лота, SL/TP, дневной стоп и лимит equity остаются включены. Запуск Live требует отдельного подтверждения.', 'LIVE: real orders. The 0.01-lot cap, SL/TP, daily stop and equity cap remain enabled. Live start requires separate confirmation.') : l('MT5 DEMO: ордера отправляются только на подключённый учебный счёт брокера. Лимиты: ≤0,01 лота, SL/TP, дневной стоп 1% и предел счёта 80 млн.', 'MT5 DEMO: orders go only to the connected broker demo account. Limits: ≤0.01 lot, SL/TP, 1% daily stop and 80M account cap.')}</span></div>
                {!mt5Account && <button className="connect-button" onClick={() => setModal('connect')}><Plus size={15} /> {l('Подключить MT5 Demo / Bybit', 'Connect MT5 Demo / Bybit')}</button>}
                <div className="schedule-inline"><label>{l('С', 'From')}<input type="time" value={agentSchedule.start} onChange={(event) => setAgentSchedule((current) => ({ ...current, start: event.target.value }))} /></label><label>{l('До', 'To')}<input type="time" value={agentSchedule.end} onChange={(event) => setAgentSchedule((current) => ({ ...current, end: event.target.value }))} /></label><div className="weekday-picker compact-weekdays"><span>{l('Дни ·', 'Days ·')} {Intl.DateTimeFormat().resolvedOptions().timeZone}</span><div>{(language === 'ru' ? ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']).map((label, day) => <button key={day} type="button" className={agentSchedule.days.includes(day) ? 'selected' : ''} aria-pressed={agentSchedule.days.includes(day)} onClick={() => setAgentSchedule((current) => ({ ...current, days: current.days.includes(day) ? current.days.filter((item) => item !== day) : [...current.days, day].sort() }))}>{label}</button>)}</div></div></div>
                {agentSchedule.start === agentSchedule.end && <small className="schedule-note">{l('Одинаковое время означает весь выбранный день.', 'Matching start/end times mean all day on selected weekdays.')}</small>}
                <div className="agent-performance-grid compact-performance"><div><small>{l('P&L агента сегодня', 'Agent P&L today')}</small><strong className={Number(brokerAgentStatus?.dailyPnl || 0) >= 0 ? 'positive-text' : 'negative-text'}>{brokerAgentStatus?.dailyPnl !== undefined ? `${Number(brokerAgentStatus.dailyPnl).toFixed(2)} ${mt5Account?.currency || ''}` : '—'}</strong></div><div><small>{l('Сигнал', 'Signal')}</small><strong>{analysis?.signal || l('Нет данных', 'No data')}</strong></div><div><small>{l('Состояние', 'Status')}</small><strong>{brokerGoalReached ? l('Лимит 80 млн достигнут', '80M cap reached') : (brokerAgentStatus?.state || l('Ожидание', 'Waiting'))}</strong></div></div>
                <div className="analyst-consensus" aria-live="polite">
                  <div className="analyst-consensus-heading"><strong>{l('АНАЛИЗ СИГНАЛА', 'ANALYST CHECKS')}</strong><span className={analystConsensus.entryAllowed ? 'consensus-ready' : 'consensus-wait'}>{analystConsensus.entryAllowed ? `${l('ВХОД', 'ENTRY')} · ${analystConsensus.decision}` : `${l('ОЖИДАНИЕ', 'WAIT')} · ${analystConsensus.reason.replaceAll('_', ' ')}`}</span></div>
                  <div className="analyst-status-grid">
                    <span><b>{l('Техника', 'Technical')}</b><small>{analystConsensus.analysts.technical.ready ? analystConsensus.analysts.technical.signal : l('Нет сигнала', 'No signal')}</small></span>
                    <span><b>{l('Дневной ориентир', 'Daily reference')}</b><small>{analystConsensus.analysts.internet.ready ? `${Number(analystConsensus.analysts.internet.rate).toFixed(5)} · ${analystConsensus.analysts.internet.sourceDate}` : l('Ожидает свежую проверку', 'Awaiting validated reference')}</small></span>
                    <span><b>{l('История MT5', 'MT5 history')}</b><small>{analystConsensus.analysts.learning.state === 'learning_cooldown' ? l('Пауза после убытков', 'Loss cooldown') : `${analystConsensus.analysts.learning.closedTrades} ${l('закрытых сделок', 'closed trades')}`}</small></span>
                  </div>
                  {!analystConsensus.analysts.market.ready && <small className="quote-freshness-warning">{analystConsensus.analysts.market.reason === 'quote_stale' ? l(`Последний MT5 тик ${analystConsensus.analysts.market.ageSeconds} с назад; новые входы заблокированы.`, `Last MT5 tick was ${analystConsensus.analysts.market.ageSeconds}s ago; new entries are blocked.`) : l('Нет свежей котировки MT5; новые входы заблокированы.', 'No fresh MT5 quote; new entries are blocked.')}</small>}
                </div>
                {brokerAgentStatus?.message && <div className={`broker-agent-message ${['error', 'daily_loss_stop', 'terminal_trading_disabled'].includes(brokerAgentStatus.state) ? 'error-state' : ''}`}>{brokerAgentStatus.message}</div>}
                <div className="agent-actions compact-agent-actions"><button className={agentEnabled ? 'modal-danger' : 'modal-primary'} onClick={startOrPauseAgent}>{agentEnabled ? <Pause size={14} /> : <Play size={14} />}{agentEnabled ? l('ВЫКЛ · ПАУЗА', 'OFF · PAUSE') : mt5Account?.accountType === 'real' ? l('ВКЛ · LIVE', 'ON · LIVE') : l('ВКЛ · MT5 DEMO', 'ON · MT5 DEMO')}</button><span className="agent-feed-status"><Activity size={14} /> {agentEnabled ? l('Анализ на новых тиках · входы с защитным интервалом', 'Analysis on new ticks · entries remain risk-throttled') : l('Запуск доступен после подключения MT5', 'Connect MT5 to enable the runner')}</span></div>
                <p className="muted-copy compact-agent-note">{l('Отключение агента прекращает новые входы, но не закрывает брокерские позиции; SL/TP остаются на сервере. Пауза, проскальзывание и закрытие с убытком возможны.', 'Pausing the agent stops new entries but does not close broker positions; SL/TP remain at the server. Slippage and loss-making exits remain possible.')}</p>
              </article>
            </div>
          </section>}

          {activeNav === 'Positions' && <section className="page-section">
            <div className="section-page-heading"><div><span className="section-kicker">{mt5Account ? `${mt5Account.accountType.toUpperCase()} MT5` : 'MT5'}</span><h1>{l('Открытые позиции', 'Open positions')}</h1><p>{l('Позиции считываются из подключённого MT5; здесь нет демонстрационных строк.', 'Positions are read from connected MT5; no sample rows are shown here.')}</p></div><button className="secondary-action" onClick={refreshPositionsNow} disabled={!mt5Account || accountDataLoading}><RefreshCw size={14} /> {l('Обновить', 'Refresh')}</button></div>
            {!mt5Account ? <div className="empty-state"><Wallet size={28} /><h2>{l('Нет подключённого торгового счёта', 'No trading account connected')}</h2><button className="connect-button" onClick={() => setModal('connect')}><Plus size={15} /> {l('Подключить MT5', 'Connect MT5')}</button></div> : positions.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{l('Инструмент', 'Instrument')}</th><th>{l('Направление', 'Side')}</th><th>{l('Объём', 'Volume')}</th><th>{l('Вход', 'Entry')}</th><th>{l('Цена', 'Current')}</th><th>{l('Плавающий P&L', 'Floating P&L')}</th><th>SL / TP</th></tr></thead><tbody>{positions.map((position) => <tr key={position.ticket}><td><strong>{position.symbol}</strong><small>#{position.ticket}</small></td><td><span className={`position-type ${position.type === 'BUY' ? 'buy-type' : 'sell-type'}`}>{position.type}</span></td><td>{position.volume}</td><td>{position.openPrice}</td><td>{position.currentPrice}</td><td className={position.profit >= 0 ? 'positive-text' : 'negative-text'}>{(position.profit + position.swap).toFixed(2)} {mt5Account.currency}</td><td>{position.stopLoss || '—'} / {position.takeProfit || '—'}</td></tr>)}</tbody></table></div> : <div className="empty-state"><Wallet size={28} /><h2>{l('Открытых позиций нет', 'No open positions')}</h2><p>{l('Если сделки есть в терминале, проверьте что Money Work подключён к тому же логину и серверу.', 'If positions appear in your terminal, verify Money Work uses the same login and server.')}</p></div>}
          </section>}

          {activeNav === 'History' && <section className="page-section">
            <div className="section-page-heading"><div><span className="section-kicker">{l('ПОСЛЕДНИЕ 30 ДНЕЙ', 'LAST 30 DAYS')}</span><h1>{l('История сделок', 'Trade history')}</h1><p>{l('Закрытые и учтённые сделки, прочитанные из истории MT5.', 'Closed and recorded deals read from MT5 account history.')}</p></div><button className="secondary-action" onClick={refreshDealsNow} disabled={!mt5Account || accountDataLoading}><RefreshCw size={14} /> {l('Обновить', 'Refresh')}</button></div>
            {!mt5Account ? <div className="empty-state"><Clock3 size={28} /><h2>{l('Подключите MT5 для загрузки истории', 'Connect MT5 to load history')}</h2><button className="connect-button" onClick={() => setModal('connect')}><Plus size={15} /> {l('Подключить счёт', 'Connect account')}</button></div> : deals.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{l('Время', 'Time')}</th><th>{l('Инструмент', 'Instrument')}</th><th>{l('Тип', 'Type')}</th><th>{l('Объём', 'Volume')}</th><th>{l('Цена', 'Price')}</th><th>{l('Результат', 'Net result')}</th><th>{l('Комментарий', 'Comment')}</th></tr></thead><tbody>{[...deals].reverse().map((deal) => { const net = deal.profit + deal.commission + deal.swap; return <tr key={deal.ticket}><td>{new Date(deal.time * 1000).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-GB')}</td><td><strong>{deal.symbol || '—'}</strong></td><td>{deal.type}</td><td>{deal.volume}</td><td>{deal.price}</td><td className={net >= 0 ? 'positive-text' : 'negative-text'}>{net.toFixed(2)} {mt5Account.currency}</td><td>{deal.comment || '—'}</td></tr>; })}</tbody></table></div> : <div className="empty-state"><Clock3 size={28} /><h2>{l('В выбранном периоде сделок нет', 'No deals in selected period')}</h2></div>}
          </section>}

          {activeNav === 'Strategies' && <section className="page-section strategy-library-page">
            <div className="section-page-heading"><div><span className="section-kicker">RESEARCH LIBRARY · AUDCAD</span><h1>{l('Библиотека стратегий', 'Strategy library')}</h1><p>{l('Каталог популярных FX-подходов с правилами; исследовательские шаблоны не подключены к live-исполнению.', 'A catalog of common FX methods and rules; research templates are not connected to live execution.')}</p></div></div>
            <div className="strategy-category-row">{[['all', l('Все', 'All')], ['trend', l('Тренд', 'Trend')], ['range', l('Диапазон', 'Range')], ['breakout', l('Пробой', 'Breakout')], ['session', l('Сессия', 'Session')], ['price', l('Свечи', 'Price action')], ['macro', l('Макро', 'Macro')]].map(([id, label]) => <button key={id} className={strategyFilter === id ? 'selected' : ''} onClick={() => setStrategyFilter(id)}>{label}</button>)}</div>
            <div className="strategy-library-layout"><div className="strategy-picker-grid">{strategyCatalog.filter((strategy) => strategyFilter === 'all' || strategy.group === strategyFilter).map((strategy) => <button key={strategy.id} className={`strategy-choice ${selectedStrategy === strategy.id ? 'selected' : ''}`} onClick={() => setSelectedStrategy(strategy.id)}><Sparkles size={13} /><span>{strategy.name}</span>{strategy.id === 'ema-cross' && <small>{l('В АГЕНТЕ', 'RUNNER')}</small>}</button>)}</div>
              {(() => { const detail = strategyCatalog.find((strategy) => strategy.id === selectedStrategy) || strategyCatalog[0]; return <article className="panel strategy-detail-card"><div className="strategy-detail-title"><span className="strategy-mark"><Sparkles size={16} /></span><div><span className="section-kicker">{detail.method} · AUDCAD</span><h2>{detail.name}</h2></div><span className={`status-badge ${detail.id === 'ema-cross' ? '' : 'muted'}`}>{detail.id === 'ema-cross' ? l('РАБОТАЕТ В АГЕНТЕ', 'ACTIVE RUNNER') : l('ШАБЛОН ИССЛЕДОВАНИЯ', 'RESEARCH TEMPLATE')}</span></div><p>{language === 'ru' ? detail.ru : detail.en}</p><div className="strategy-rule-box"><strong>{l('Как использовать', 'How to use')}</strong><span>{detail.id === 'ema-cross' ? l('Эта версия работает в агенте; остальные методы здесь пока справочный каталог и не выставляют ордера.', 'This method is active in the runner; other entries are reference templates and do not place orders.') : l('Сравните на истории AUD/CAD с учётом спреда, комиссий и проскальзывания; сначала используйте MT5 Demo.', 'Evaluate on AUD/CAD history including spread, fees and slippage; begin with MT5 Demo.')}</span></div><small className="strategy-disclaimer">{l('Список охватывает распространённые подходы, а не «все существующие» стратегии. Ни один паттерн не гарантирует прибыль.', 'This covers common methods, not every strategy ever devised. No pattern guarantees profit.')}</small></article>; })()}
            </div>
          </section>}

          {['Risk controls', 'Reports'].includes(activeNav) && <section className="page-section"><div className="section-page-heading"><div><span className="section-kicker">MONEY WORK</span><h1>{t(activeNav)}</h1><p>{l('Раздел будет заполнен после добавления проверяемых данных счёта.', 'This section will be populated from verified account data.')}</p></div></div><div className="empty-state"><ShieldCheck size={28} /><h2>{l('Пока нет данных для отображения', 'No data to display yet')}</h2></div></section>}

          <footer className="footer-note"><span><ShieldCheck size={13} />{mt5Account ? l('Данные счёта читаются из MT5.', 'Account data is read from MT5.') : l('Реальные рынки появятся после подключения MT5.', 'Live broker markets appear after MT5 is connected.')}</span><span>Money Work <b>v{packageJson.version}</b></span></footer>
        </div>
      </main>

      {modal && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModal('')}>
        <div className={`modal-card ${modal === 'connect' ? 'account-modal' : ''}`}>
          <button className="modal-close" onClick={() => setModal('')}><X size={17} /></button>
          <div className="modal-icon"><LockKeyhole size={20} /></div>
          {modal === 'manual-order-confirmation' ? <>
            <span className="section-kicker">MANUAL MT5 ORDER · AUDCAD</span>
            <h2>{manualOrderSide === 'BUY' ? l('Подтвердить покупку', 'Confirm Buy') : l('Подтвердить продажу', 'Confirm Sell')}</h2>
            <p>{l('Будет отправлен один рыночный ордер на 0,01 лота по актуальной котировке MT5. К ордеру прикрепляются SL 20 и TP 30 пипсов; действует лимит спреда 5 пипсов и запрет при дневном стопе/лимите счёта. Проскальзывание и убыток возможны.', 'This sends one 0.01-lot market order using the latest MT5 quote. It includes a 20-pip SL and 30-pip TP and is blocked by the 5-pip spread, daily-loss and account-cap checks. Slippage and losses remain possible.')}</p>
            <div className="manual-order-preview"><span>{l('Сторона', 'Side')}<b className={manualOrderSide === 'BUY' ? 'positive-text' : 'negative-text'}>{manualOrderSide}</b></span><span>{l('Символ', 'Symbol')}<b>{selectedSymbol}</b></span><span>{l('Объём', 'Volume')}<b>0.01 lot</b></span><span>{l('Котировка', 'Quote')}<b>{manualOrderSide === 'BUY' ? Number(liveQuote?.ask || 0).toFixed(5) : Number(liveQuote?.bid || 0).toFixed(5)}</b></span></div>
            <p className="manual-order-disclaimer">{l('Это ручная сделка. Автопилот должен быть выключен и не будет управлять этой позицией; серверные SL/TP остаются у брокера. Для каждой сделки на MT5 Live введите LIVE.', 'This is a manual trade. The autopilot must be off and will not manage this position; broker-side SL/TP remain attached. Type LIVE for every MT5 Live order.')}</p>
            {mt5Account?.accountType === 'real' && <label className="live-confirm-field">{l('Введите LIVE для подтверждения этой реальной сделки', 'Type LIVE to confirm this real-money order')}<input autoComplete="off" value={manualConfirmText} onChange={(event) => setManualConfirmText(event.target.value)} /></label>}
            {manualOrderError && <div className="connection-error" role="alert">{manualOrderError}</div>}
            <div className="modal-actions"><button className="modal-secondary" type="button" disabled={manualOrderBusy} onClick={() => { setManualOrderSide(''); setManualOrderError(''); setModal(''); }}>{l('Отмена', 'Cancel')}</button><button className="modal-primary" type="button" disabled={manualOrderBusy || (mt5Account?.accountType === 'real' && manualConfirmText.trim() !== 'LIVE')} onClick={confirmManualOrder}>{manualOrderBusy ? l('Отправка…', 'Sending…') : l(`Подтвердить ${manualOrderSide}`, `Confirm ${manualOrderSide}`)}</button></div>
          </> : modal === 'connect' ? <>
            <span className="section-kicker">MT5 CONNECTION · GUARDED AUTO TRADING</span>
            <h2>{mt5Account ? 'Account connected' : t('Add MT5 account')}</h2>
            {mt5Account ? <>
              <p>Connected to <strong>{mt5Account.server}</strong> as account <strong>{mt5Account.login}</strong>. The agent is off unless you start it. If started, it can place AUDCAD orders on this {mt5Account.accountType === 'demo' ? 'demo' : 'live'} account inside the displayed hard limits.</p>
              <div className="account-summary"><span>Equity</span><strong>{mt5Account.currency} {Number(mt5Account.equity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><span>Leverage</span><strong>1:{mt5Account.leverage}</strong></div>
              <div className="modal-actions"><button className="modal-secondary" onClick={() => setModal('')}>Close</button><button className="modal-danger" onClick={disconnectAccount}>Disconnect</button></div>
            </> : <>
              <p>Enter the login and exact server shown in MT5. An investor password permits reading only; the optional auto-trader requires a trading-enabled password. Orders are disabled until you manually arm the agent and obey its hard risk limits.</p>
              <form className="account-form" onSubmit={connectAccount}>
                <label>MT5 account number<input autoComplete="username" inputMode="numeric" value={accountForm.login} onChange={(event) => setAccountForm({ ...accountForm, login: event.target.value })} placeholder="Account login" required /></label>
                <label>MT5 server <span className="field-optional">choose or type</span><input list="mt5-server-suggestions" value={accountForm.server} onChange={(event) => setAccountForm({ ...accountForm, server: event.target.value })} placeholder="Bybit-Live or exact server name" required /><datalist id="mt5-server-suggestions"><option value="MetaQuotes-Demo" />{['Bybit-Live', ...Array.from({ length: 6 }, (_, index) => `Bybit-Live${index + 2}`), 'Bybit-Demo'].map((server) => <option value={server} key={server} />)}{recentServers.map((server) => <option value={server} key={server} />)}{savedAccount?.server && <option value={savedAccount.server} />}</datalist><div className="server-preset-row"><button className="secondary-action" type="button" onClick={() => setAccountForm((form) => ({ ...form, server: 'Bybit-Demo' }))}>{l('Bybit MT5 Demo', 'Bybit MT5 Demo')}</button><button className="secondary-action" type="button" onClick={() => setAccountForm((form) => ({ ...form, server: 'Bybit-Live' }))}>{l('Bybit MT5 Live', 'Bybit MT5 Live')}</button><button className="text-action" type="button" onClick={() => window.moneyWork?.openBybitMt5Guide?.()}>{l('Инструкция Bybit', 'Bybit MT5 guide')}</button></div><small className="server-help">{l('Сначала откройте отдельный MT5 CFD-счёт в Bybit. Введите именно его MT5 ID, MT5 trading password и сервер, указанные в Bybit; это не UID/пароль сайта Bybit. Список серверов может отличаться — выберите точное имя из данных счёта.', 'First create the separate MT5 CFD account in Bybit. Enter its MT5 ID, MT5 trading password and exact server from Bybit—not your Bybit UID or website password. Server names can vary; use the exact one shown in your account.')}</small></label>
                <div className="demo-register-prompt"><span>{l('Нет демо-счёта?', 'No demo account?')}</span><button type="button" onClick={() => setModal('demo-register')}>{l('Как зарегистрировать', 'Register a demo account')} <ArrowUpRight size={13} /></button></div>
                <label>MT5 account password<input type="password" autoComplete="current-password" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} placeholder="Trader password is required for order execution" required /><small className="server-help">The investor password allows read-only access. The automated agent needs a trading-enabled password. Never send it in chat.</small></label>
                <label>MT5 terminal path <span className="field-optional">optional</span><input value={accountForm.terminalPath} onChange={(event) => setAccountForm({ ...accountForm, terminalPath: event.target.value })} placeholder="Auto-detect, or C:\\Program Files\\...\\terminal64.exe" /></label>
                <label className="remember-row"><input type="checkbox" checked={rememberAccount} onChange={(event) => setRememberAccount(event.target.checked)} /><span>Remember on this PC <small>Encrypt credentials with Windows secure storage.</small></span></label>
                {savedAccount && <button className="saved-account-button" type="button" onClick={connectSavedAccount} disabled={connecting}>Reconnect saved account {savedAccount.login} · {savedAccount.server}</button>}
                {mt5Error && <div className="connection-error">{mt5Error}</div>}
                <div className="modal-actions"><button className="modal-secondary" type="button" onClick={() => setModal('')}>Cancel</button><button className="modal-primary" type="submit" disabled={connecting}>{connecting ? 'Connecting…' : 'Connect MT5'}</button></div>
              </form>
              <div className="secure-note"><ShieldCheck size={13} /> Never share account passwords or API keys in chat.</div>
            </>}
          </> : modal === 'live-trading-confirmation' ? <>
            <span className="section-kicker">LIVE ORDER CONFIRMATION</span>
            <h2>{l('Подтвердить автоторговлю на реальном счёте?', 'Enable automated orders on your real account?')}</h2>
            <div className="risk-warning live-warning"><ShieldCheck size={15} /><span>{l('Будут отправляться реальные AUDCAD-ордера. Лимиты: не более 0,01 лота, одна позиция, фиксация от 0,30 валюты счёта на 0,01 лота, SL 20 пипсов, TP 30 пипсов, остановка при балансе или эквити 80 млн валюты счёта и при дневном убытке 1%. Сигнал/стоп могут закрыть сделку с убытком; гэпы и проскальзывание остаются возможны.', 'This can send real AUDCAD orders. Caps: up to 0.01 lot, one position, cash close from 0.30 account-currency units per 0.01 lot, 20-pip SL, 30-pip TP, stop when balance or equity reaches 80 million account-currency units; 1% daily loss stop. Signal/stops can still close at a loss; gaps and slippage remain possible.')}</span></div>
            <label className="live-confirm-field">{l('Для подтверждения введи LIVE', 'Type LIVE to confirm')}<input autoComplete="off" value={liveConfirmText} onChange={(event) => setLiveConfirmText(event.target.value)} placeholder="LIVE" /></label>
            <div className="modal-actions"><button className="modal-secondary" onClick={() => setModal('')}>{l('Отмена', 'Cancel')}</button><button className="modal-danger" onClick={confirmLiveAgent} disabled={liveConfirmText.trim() !== 'LIVE'}>{l('ПОДТВЕРДИТЬ И ЗАПУСТИТЬ', 'CONFIRM AND START')}</button></div>
          </> : modal === 'demo-register' ? <>
            <span className="section-kicker">METAQUOTES-DEMO</span>
            <h2>{l('Регистрация демо-счёта MT5', 'Register an MT5 demo account')}</h2>
            <p>{l('Создание счёта выполняется в настольном MT5, а не в Money Work. Установи MT5 на этот же Windows-компьютер и выполни шаги:', 'The demo account is created in the MT5 desktop terminal, not in Money Work. Install MT5 on this Windows PC and follow these steps:')}</p>
            <ol className="demo-steps">
              <li>{l('Открой MT5 → Файл → Открыть счёт.', 'Open MT5 → File → Open an Account.')}</li>
              <li>{l('Найди MetaQuotes Ltd или введи MetaQuotes-Demo и нажми поиск брокера.', 'Find MetaQuotes Ltd or type MetaQuotes-Demo, then search for the broker.')}</li>
              <li>{l('Выбери сервер и «Открыть демо-счёт», заполни форму и сохрани выданные логин/пароль.', 'Select the server and “Open a demo account”, complete the form and save the issued login/password.')}</li>
              <li>{l('Сначала проверь вход в самом MT5. Затем введи в Money Work сервер ровно так, как он указан там.', 'First verify the login in MT5 itself. Then enter the server in Money Work exactly as shown there.')}</li>
            </ol>
            <div className="demo-safety-note"><ShieldCheck size={14} /> {l('Для подключения только на чтение используй пароль инвестора, если он доступен. Не отправляй пароли скриншотами или в чат.', 'For read-only access, use the investor password if available. Do not send passwords in screenshots or chat.')}</div>
            <div className="modal-actions"><button className="modal-secondary" onClick={() => setModal('connect')}>{l('Назад к подключению', 'Back to connection')}</button><button className="modal-primary" onClick={() => window.moneyWork?.openMt5Download?.()}>{l('Скачать MT5 для Windows', 'Download MT5 for Windows')}</button></div>
          </> : modal === 'instruments' ? <>
            <span className="section-kicker">MT5 MARKET WATCH</span>
            <h2>Find an instrument</h2>
            <p>Search exact symbols available from your connected MT5 broker. Broker suffixes such as <strong>AUDCAD+</strong> are supported.</p>
            <form className="symbol-search-form" onSubmit={searchInstruments}><input value={symbolQuery} onChange={(event) => setSymbolQuery(event.target.value)} placeholder="AUDCAD" /><button className="modal-primary" type="submit">Search</button></form>
            <div className="symbol-results">{symbolResults.map((symbol) => <button key={symbol} onClick={async () => { await subscribeInstrument(symbol); setModal(''); }}><span>{symbol}</span><ArrowUpRight size={14} /></button>)}</div>
            {mt5Error && <div className="connection-error">{mt5Error}</div>}
            <div className="modal-actions"><button className="modal-secondary" onClick={() => setModal('')}>Close</button></div>
          </> : <>
            <span className="section-kicker">MONEY WORK ACCOUNT</span>
            <h2>{l('Рабочая область счёта', 'Account workspace')}</h2>
            <p>{l('Здесь отображаются только данные подключённого MT5-счёта. Подключите MT5 Demo или Live, чтобы загрузить рыночные данные.', 'Only data from a connected MT5 account is shown here. Connect MT5 Demo or Live to load broker data.')}</p>
            <div className="modal-actions"><button className="modal-secondary" onClick={() => setModal('')}>{l('Закрыть', 'Close')}</button><button className="modal-primary" onClick={() => setModal('connect')}>{l('Подключить MT5', 'Connect MT5')}</button></div>
          </>}
        </div>
      </div>}
    </div>
  );
}

export default App;
