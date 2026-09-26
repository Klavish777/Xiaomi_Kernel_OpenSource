import { useEffect, useMemo, useRef, useState } from 'react';
import packageJson from '../package.json';
import {
  Activity, ArrowUpRight, Bell, ChevronDown, CircleHelp,
  Clock3, Command, LayoutDashboard, LockKeyhole,
  MoreHorizontal, Plus, Search, ShieldCheck,
  Sparkles, TrendingUp, Wallet, X, Zap, Maximize2, Languages, RefreshCw,
  Globe, Bot, Play, Pause, CircleCheck,
} from 'lucide-react';
import { adjustVirtualBalance, advancePaperAgent, buildAnalystConsensus, summarizePaperHistory, validateReferencePayload } from './agentCore.mjs';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

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
    'Personal account': 'Personal account', 'Good morning, Alex': 'Good morning, Alex',
    'Here’s your trading overview for today.': 'Here’s your trading overview for today.',
    'Add MT5 account': 'Add MT5 account', 'MT5 READ-ONLY': 'MT5 READ-ONLY', 'PAPER MODE': 'PAPER MODE',
    'MT5 account equity': 'MT5 account equity', 'Demo balance': 'Demo balance', 'Paper P&L': 'Paper P&L',
    'Demo win rate': 'Demo win rate', 'Demo max drawdown': 'Demo max drawdown',
    'AI market read': 'AI market read', 'Favorite instruments': 'Favorite instruments', 'Paper trades': 'Paper trades',
    'Demo positions': 'Demo positions', 'Strategy runner': 'Strategy runner', 'Start paper simulation': 'Start paper simulation',
    'Pause demo': 'Pause demo', 'Connect read-only': 'Connect read-only',
    'MT5 demo account': 'MT5 demo account', 'MT5 live account': 'MT5 live account', 'Language': 'Language',
    'Fullscreen': 'Fullscreen', 'Windowed': 'Windowed', 'DEMO ACCOUNT': 'DEMO ACCOUNT', 'LIVE ACCOUNT': 'LIVE ACCOUNT',
  },
  ru: {
    Overview: 'Обзор', Markets: 'Рынки', Strategies: 'Стратегии', Agents: 'Агенты', Positions: 'Позиции', History: 'История',
    'Risk controls': 'Контроль риска', Reports: 'Отчёты', Workspace: 'Рабочая область', 'My workspace': 'Моя рабочая область',
    'Personal account': 'Личный аккаунт', 'Good morning, Alex': 'Доброе утро, Alex',
    'Here’s your trading overview for today.': 'Сводка вашей торговли за сегодня.',
    'Add MT5 account': 'Добавить счёт MT5', 'MT5 READ-ONLY': 'MT5 · ТОЛЬКО ЧТЕНИЕ', 'PAPER MODE': 'ДЕМО-РЕЖИМ',
    'MT5 account equity': 'Средства на счёте MT5', 'Demo balance': 'Демо-баланс', 'Paper P&L': 'P&L симуляции',
    'Demo win rate': 'Доля прибыльных демо-сделок', 'Demo max drawdown': 'Максимальная демо-просадка',
    'AI market read': 'Анализ рынка ИИ', 'Favorite instruments': 'Избранные инструменты', 'Paper trades': 'Симулированные сделки',
    'Demo positions': 'Демо-позиции', 'Strategy runner': 'Запуск стратегии', 'Start paper simulation': 'Запустить симуляцию',
    'Pause demo': 'Приостановить демо', 'Connect read-only': 'Подключить для чтения',
    'MT5 demo account': 'Демо-счёт MT5', 'MT5 live account': 'Реальный счёт MT5', 'Language': 'Язык',
    'Fullscreen': 'Полный экран', 'Windowed': 'Оконный режим', 'DEMO ACCOUNT': 'ДЕМО-СЧЁТ', 'LIVE ACCOUNT': 'РЕАЛЬНЫЙ СЧЁТ',
  },
};

const PAPER_STORAGE_KEY = 'money-work-paper-agent-v2';
const LEGACY_PAPER_STORAGE_KEY = 'money-work-paper-agent-v1';
const REFERENCE_STORAGE_KEY = 'money-work-audcad-reference-v1';

function readPaperAgent() {
  const defaults = { enabled: false, capital: 1000, maxAllocation: 100, start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5], position: null, trades: [], realizedPnl: 0, cashFlows: [], lastEvaluatedAt: 0, lastAction: '' };
  try {
    const current = localStorage.getItem(PAPER_STORAGE_KEY);
    const saved = JSON.parse(current || localStorage.getItem(LEGACY_PAPER_STORAGE_KEY) || '{}');
    const migrating = !current;
    const oldCapital = Number(saved.capital || defaults.capital);
    const compactCapital = migrating ? Math.min(1000, oldCapital) : Number(saved.capital || defaults.capital);
    const migrationFlow = migrating && oldCapital !== compactCapital ? [{ id: `migration-${Date.now()}`, type: 'withdrawal', amount: compactCapital - oldCapital, time: new Date().toISOString(), note: 'Compact starting balance' }] : [];
    return { ...defaults, ...saved, capital: compactCapital, maxAllocation: migrating ? Math.min(100, Number(saved.maxAllocation || defaults.maxAllocation)) : Number(saved.maxAllocation || defaults.maxAllocation), enabled: false, days: Array.isArray(saved.days) ? saved.days.map(Number).filter((day) => day >= 0 && day <= 6) : defaults.days, position: null, trades: Array.isArray(saved.trades) ? saved.trades.slice(0, 50).map((trade) => trade.status === 'open' ? { ...trade, status: 'session stopped' } : trade) : [], cashFlows: [...migrationFlow, ...(Array.isArray(saved.cashFlows) ? saved.cashFlows : [])].slice(0, 50), lastEvaluatedAt: 0 };
  } catch { return defaults; }
}

function readReference() {
  try {
    const saved = JSON.parse(localStorage.getItem(REFERENCE_STORAGE_KEY) || 'null');
    return saved && Number.isFinite(Number(saved.rate)) ? saved : null;
  } catch { return null; }
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
  const [activeNav, setActiveNav] = useState('Overview');
  const [selectedSymbol, setSelectedSymbol] = useState('AUDCAD');
  const [modal, setModal] = useState('');
  const [mt5Account, setMt5Account] = useState(null);
  const [savedAccount, setSavedAccount] = useState(null);
  const [quotes, setQuotes] = useState({});
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
  const [paperAgent, setPaperAgent] = useState(readPaperAgent);
  const [executionMode, setExecutionMode] = useState('paper');
  const [liveTradeConfirmed, setLiveTradeConfirmed] = useState(false);
  const [liveConfirmText, setLiveConfirmText] = useState('');
  const [brokerAgentStatus, setBrokerAgentStatus] = useState(null);
  const [cashAdjustment, setCashAdjustment] = useState(50);
  const [cashAdjustmentError, setCashAdjustmentError] = useState('');
  const [referenceData, setReferenceData] = useState(readReference);
  const [researchRunning, setResearchRunning] = useState(false);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchStatus, setResearchStatus] = useState('');
  const [researchRate, setResearchRate] = useState(0);
  const researchBusy = useRef(false);
  const paperLastQuoteTime = useRef(0);
  const brokerEvaluateBusy = useRef(false);
  const liveQuote = quotes[selectedSymbol];
  const series = useMemo(() => {
    const bars = historyBySymbol[selectedSymbol]?.[timeframe] || [];
    const values = bars.map((bar) => ({ time: new Date(bar.time * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }), price: bar.close }));
    if (liveQuote && values.length) values[values.length - 1].price = (liveQuote.bid + liveQuote.ask) / 2;
    return values;
  }, [timeframe, selectedSymbol, historyBySymbol, liveQuote]);
  const referenceGapBps = referenceData && liveQuote && /^AUDCAD/i.test(selectedSymbol)
    ? (((Number(liveQuote.bid) + Number(liveQuote.ask)) / 2 / Number(referenceData.rate)) - 1) * 10000
    : null;
  const todayLabel = new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase();

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
      if (event.type === 'tick') setQuotes((current) => ({ ...current, [event.symbol]: event }));
      if (event.type === 'error' || event.type === 'warning' || event.type === 'fatal') setMt5Error(event.message || 'MT5 connector error');
    });
  }, []);

  useEffect(() => {
    if (!window.moneyWork || !mt5Account) {
      setPositions([]);
      setDeals([]);
      return undefined;
    }
    let active = true;
    const refreshAccountData = async () => {
      setAccountDataLoading(true);
      try {
        const [nextPositions, nextDeals] = await Promise.all([
          window.moneyWork.getMt5Positions(),
          window.moneyWork.getMt5Deals(30),
        ]);
        if (active) {
          setPositions(nextPositions);
          setDeals(nextDeals);
        }
      } catch (error) {
        if (active) setMt5Error(error.message);
      } finally {
        if (active) setAccountDataLoading(false);
      }
    };
    refreshAccountData();
    const timer = setInterval(refreshAccountData, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [mt5Account]);

  useEffect(() => {
    if (!window.moneyWork || !mt5Account || !selectedSymbol) return undefined;
    let active = true;
    window.moneyWork.getMt5History(selectedSymbol, timeframe).then((bars) => {
      if (active) setHistoryBySymbol((current) => ({ ...current, [selectedSymbol]: { ...current[selectedSymbol], [timeframe]: bars } }));
    }).catch((error) => {
      if (active) setMt5Error(error.message);
    });
    return () => { active = false; };
  }, [mt5Account, selectedSymbol, timeframe]);

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
      const quote = await window.moneyWork.subscribeMt5Symbol(match);
      setQuotes((current) => ({ ...current, [match]: quote }));
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
  const analystConsensus = useMemo(() => {
    const paperHistory = summarizePaperHistory(paperAgent.trades);
    const learningStatus = executionMode === 'paper' ? paperHistory : brokerAgentStatus;
    return buildAnalystConsensus({ analysis, quote: liveQuote, referenceData, brokerStatus: learningStatus });
  }, [analysis, liveQuote, referenceData, brokerAgentStatus, paperAgent.trades, executionMode]);

  async function runInternetResearch() {
    if (researchBusy.current) return;
    researchBusy.current = true;
    setResearchLoading(true);
    setResearchStatus('');
    const startedAt = performance.now();
    try {
      const response = await fetch('https://api.frankfurter.dev/v1/latest?base=AUD&symbols=CAD', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error(`Reference source returned HTTP ${response.status}.`);
      const payload = await response.json();
      const validated = validateReferencePayload(payload);
      if (!validated.valid) throw new Error('Reference data failed schema, date, or positive-rate checks.');
      const result = { base: 'AUD', rate: validated.rate, sourceDate: validated.date, fetchedAt: new Date().toISOString(), source: 'Frankfurter / central-bank daily reference', checks: validated.checks };
      setReferenceData(result);
      localStorage.setItem(REFERENCE_STORAGE_KEY, JSON.stringify(result));
      const elapsed = Math.max(250, performance.now() - startedAt);
      setResearchRate(Math.max(1, Math.round(3 * 60000 / elapsed)));
      setResearchStatus('validated');
    } catch (error) {
      setResearchStatus(error.message || 'Internet reference check failed.');
    } finally {
      researchBusy.current = false;
      setResearchLoading(false);
    }
  }

  useEffect(() => {
    if (!researchRunning) return undefined;
    runInternetResearch();
    const timer = setInterval(runInternetResearch, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [researchRunning]);

  useEffect(() => {
    try {
      localStorage.setItem(PAPER_STORAGE_KEY, JSON.stringify({ ...paperAgent, enabled: false, position: null, lastEvaluatedAt: 0 }));
    } catch { /* local browser storage can be unavailable */ }
  }, [paperAgent]);

  useEffect(() => {
    if (!paperAgent.enabled || !liveQuote || !analysis) return;
    const price = (Number(liveQuote.bid) + Number(liveQuote.ask)) / 2;
    const quoteTime = Number(liveQuote.timeMsc || Number(liveQuote.time || 0) * 1000);
    if (!quoteTime || quoteTime - paperLastQuoteTime.current < 2000) return;
    paperLastQuoteTime.current = quoteTime;
    if (executionMode === 'mt5') {
      if (!window.moneyWork || !mt5Account || brokerEvaluateBusy.current) return;
      if (mt5Account.accountType === 'real' && !liveTradeConfirmed) return;
      brokerEvaluateBusy.current = true;
      window.moneyWork.evaluateMt5Agent({
        symbol: selectedSymbol,
        signal: analysis.signal,
        rsi: analysis.rsi,
        liveConfirmed: liveTradeConfirmed,
        schedule: { start: paperAgent.start, end: paperAgent.end, days: paperAgent.days },
        reference: referenceData,
      }).then((result) => {
        const consensus = buildAnalystConsensus({ analysis, quote: liveQuote, referenceData, brokerStatus: result });
        setBrokerAgentStatus({ ...result, consensus });
        if (['position_opened', 'position_closed', 'daily_loss_stop'].includes(result.state)) {
          refreshPositionsNow();
          refreshDealsNow();
        }
        if (result.state === 'daily_loss_stop') {
          setPaperAgent((current) => ({ ...current, enabled: false }));
          setLiveTradeConfirmed(false);
        }
      }).catch((error) => {
        setBrokerAgentStatus({ state: 'error', message: error.message });
        setPaperAgent((current) => ({ ...current, enabled: false }));
        setLiveTradeConfirmed(false);
      }).finally(() => { brokerEvaluateBusy.current = false; });
      return;
    }
    const next = advancePaperAgent(paperAgent, {
      signal: analysis.signal,
      price,
      quoteTime,
      symbol: selectedSymbol,
      settings: { ...paperAgent, capital: Number(paperAgent.capital) + Number(paperAgent.realizedPnl || 0) },
      allowEntry: analystConsensus.entryAllowed,
    });
    if (next !== paperAgent) setPaperAgent(next);
  }, [paperAgent, liveQuote, analysis, selectedSymbol, executionMode, liveTradeConfirmed, mt5Account, referenceData, analystConsensus]);

  async function refreshPositionsNow() {
    if (!window.moneyWork || !mt5Account) return;
    setAccountDataLoading(true);
    try { setPositions(await window.moneyWork.getMt5Positions()); }
    catch (error) { setMt5Error(error.message); }
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
      setExecutionMode('paper');
      setLiveTradeConfirmed(false);
      setBrokerAgentStatus(null);
      setPaperAgent((current) => ({ ...current, enabled: false }));
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
      setExecutionMode('paper');
      setLiveTradeConfirmed(false);
      setBrokerAgentStatus(null);
      setPaperAgent((current) => ({ ...current, enabled: false }));
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
      setSelectedSymbol('AUDCAD');
      setLiveTradeConfirmed(false);
      setExecutionMode('paper');
      setPaperAgent((current) => ({ ...current, enabled: false }));
      setModal('');
    } catch (error) {
      setMt5Error(error.message);
    }
  }

  function startOrPauseAgent() {
    if (paperAgent.enabled) {
      setPaperAgent((current) => ({ ...current, enabled: false }));
      if (executionMode === 'mt5' && mt5Account?.accountType === 'real') setLiveTradeConfirmed(false);
      return;
    }
    if (executionMode === 'mt5') {
      if (!mt5Account || !['demo', 'real'].includes(mt5Account.accountType)) {
        setMt5Error('Connect a verified MT5 demo or live account before enabling broker execution.');
        return;
      }
      if (mt5Account.accountType === 'real' && !liveTradeConfirmed) {
        setLiveConfirmText('');
        setModal('live-trading-confirmation');
        return;
      }
    }
    setMt5Error('');
    setResearchRunning(true);
    setPaperAgent((current) => ({ ...current, enabled: true }));
  }

  function confirmLiveAgent() {
    if (liveConfirmText.trim() !== 'LIVE') return;
    setLiveTradeConfirmed(true);
    setResearchRunning(true);
    setPaperAgent((current) => ({ ...current, enabled: true }));
    setModal('');
  }

  function adjustPaperBalance(direction) {
    setCashAdjustmentError('');
    const result = adjustVirtualBalance(paperAgent, direction, cashAdjustment);
    if (!result.ok) {
      const errors = {
        invalid_amount: l('Введите сумму от 0,01 до 1 000 000 CAD.', 'Enter an amount from 0.01 to 1,000,000 CAD.'),
        reserved_funds: l('Нельзя снять сумму, зарезервированную открытой симуляцией.', 'Cannot withdraw funds reserved by an open paper position.'),
        balance_limit: l('Виртуальный баланс должен быть в диапазоне 0–10 000 000 CAD.', 'Virtual balance must stay between 0 and 10,000,000 CAD.'),
      };
      setCashAdjustmentError(errors[result.code] || l('Операция отклонена.', 'Adjustment rejected.'));
      return;
    }
    setPaperAgent(result.state);
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
          <div className="workspace-copy"><strong>{t('My workspace')}</strong><span>{t('Personal account')}</span></div>
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
          <button className="profile-row" onClick={() => setModal('profile')}>
            <div className="profile-avatar">A</div>
            <div className="profile-copy"><strong>Alex Morgan</strong><span>Demo profile</span></div>
            <MoreHorizontal size={18} className="muted-icon" />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>{t('Workspace')}</span><span className="crumb-slash">/</span><strong>{t(activeNav)}</strong></div>
          <div className="topbar-actions">
            <div className={`environment-pill ${mt5Account ? 'connected' : ''}`}><span className="pulse-dot" /> {mt5Account ? (mt5Account.accountType === 'demo' ? t('DEMO ACCOUNT') : t('LIVE ACCOUNT')) : t('PAPER MODE')}</div>
            <button className="connect-button" onClick={() => { setMt5Error(''); setModal('connect'); }}>
              {mt5Account ? <><Activity size={15} /> {mt5Account.server}</> : <><Plus size={15} /> {t('Add MT5 account')}</>}
            </button>
            <button className="top-icon" aria-label="Search"><Search size={17} /></button>
            <button className="top-icon notification-button" aria-label="Notifications"><Bell size={17} /><i /></button>
            <label className="language-control" title={t('Language')}><Languages size={14} /><select aria-label={t('Language')} value={language} onChange={(event) => setLanguage(event.target.value)}><option value="ru">RU</option><option value="en">EN</option></select></label><button className="top-icon fullscreen-button" onClick={async () => { if (window.moneyWork) setFullScreen(await window.moneyWork.toggleFullscreen()); }} title={fullScreen ? t('Windowed') : t('Fullscreen')} aria-label={fullScreen ? t('Windowed') : t('Fullscreen')}><Maximize2 size={16} /></button><div className="top-divider" />
            <div className="top-user-avatar">AM</div>
          </div>
        </header>

        <div className={`page-content workspace-content ${activeNav === 'Overview' ? 'overview-fit' : activeNav === 'Agents' ? 'agents-fit' : ''}`}>
          {mt5Error && <div className="connector-banner"><ShieldCheck size={15} /> {mt5Error}<button onClick={() => setMt5Error('')}>Dismiss</button></div>}

          {activeNav === 'Overview' && <>
            <div className="page-heading compact-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> {todayLabel}</div><h1>{l('Торговый обзор', 'Trading overview')}</h1><p>{l('Только данные подключённого счёта MT5 и выбранного рынка.', 'Live data from the connected MT5 account and selected market only.')}</p></div>
              {!mt5Account && <button className="connect-button" onClick={() => setModal('connect')}><Plus size={15} /> {l('Подключить MT5', 'Connect MT5')}</button>}
            </div>
            <section className="summary-grid">
              <article className="summary-card panel"><span>{mt5Account ? l('Средства счёта', 'Account equity') : l('Счёт MT5', 'MT5 account')}</span><strong>{mt5Account ? `${mt5Account.currency} ${Number(mt5Account.equity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : l('Не подключён', 'Not connected')}</strong><small>{mt5Account ? `${mt5Account.login} · ${mt5Account.accountType === 'demo' ? 'DEMO' : 'LIVE'}` : l('Котировки и позиции недоступны', 'Quotes and positions unavailable')}</small></article>
              <article className="summary-card panel"><span>{l('Выбранный рынок', 'Selected market')}</span><strong>{selectedSymbol}</strong><small>{liveQuote ? `${Number(liveQuote.bid).toFixed(5)} / ${Number(liveQuote.ask).toFixed(5)}` : l('Нет живой котировки', 'No live quote')}</small></article>
              <article className="summary-card panel"><span>{l('Открытые позиции', 'Open positions')}</span><strong>{mt5Account ? positions.length : '—'}</strong><small>{accountDataLoading ? l('Обновление…', 'Refreshing…') : mt5Account ? l('Данные MT5', 'MT5 account data') : l('Подключите счёт MT5', 'Connect an MT5 account')}</small></article>
            </section>
            <article className="panel chart-panel dashboard-chart">
              <div className="panel-heading chart-heading"><div className="instrument-title"><div className="pair-icon">{selectedSymbol.slice(0, 2)}</div><div><div className="pair-name">{selectedSymbol}</div><span>{liveQuote ? l('Живой поток MT5', 'Live MT5 feed') : l('Ожидание котировок MT5', 'Waiting for MT5 quotes')}</span></div></div><div className="timeframe-switcher">{['1M', '5M', '15M', '1H'].map((frame) => <button key={frame} onClick={() => setTimeframe(frame)} className={timeframe === frame ? 'selected' : ''}>{frame}</button>)}</div></div>
              <div className="price-row"><strong>{liveQuote ? Number(liveQuote.bid).toFixed(5) : '—'}</strong><span className="price-change">{liveQuote ? 'LIVE' : l('НЕТ ДАННЫХ', 'NO DATA')}</span>{liveQuote && <span className="price-meta">Bid {Number(liveQuote.bid).toFixed(5)} · Ask {Number(liveQuote.ask).toFixed(5)}</span>}</div>
              {series.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={series} margin={{ top: 14, right: 10, left: 0, bottom: 0 }}><defs><linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#75a7ff" stopOpacity={0.2} /><stop offset="95%" stopColor="#75a7ff" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#252a36" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="time" tick={{ fill: '#8b96a8', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" /><YAxis orientation="right" domain={['auto', 'auto']} tick={{ fill: '#8b96a8', fontSize: 10 }} tickLine={false} axisLine={false} width={64} /><Tooltip contentStyle={{ background: '#171b25', border: '1px solid #2b3242', borderRadius: 10, color: '#ecf1fa', fontSize: 12 }} formatter={(value) => [Number(value).toFixed(5), selectedSymbol]} /><Area type="monotone" dataKey="price" stroke="#78a6ff" strokeWidth={2} fill="url(#priceFill)" /></AreaChart></ResponsiveContainer></div> : <div className="empty-chart"><Activity size={22} /><strong>{l('График пока пуст', 'No chart data yet')}</strong><span>{mt5Account ? l('Выберите доступный символ на вкладке «Рынки».', 'Choose a broker symbol on the Markets tab.') : l('Подключите демо- или live-счёт MT5, чтобы загрузить рынки.', 'Connect an MT5 demo or live account to load markets.')}</span></div>}
              <div className="chart-foot"><span><i className="legend-dot blue-dot" />{liveQuote ? l('Котировка обновляется через MT5', 'Quote received from MT5') : l('Демо-данные не подставляются', 'No sample prices are shown')}</span><span>{liveQuote ? new Date((liveQuote.time || Date.now() / 1000) * 1000).toLocaleTimeString() : '—'}</span></div>
            </article>
            <section className="analysis-agent-grid">
              <article className="panel work-card">
                <div className="work-card-heading"><div><span className="section-kicker"><Sparkles size={14} /> {l('АНАЛИЗ РЫНКА', 'MARKET ANALYSIS')}</span><h2>{l('Технический анализатор', 'Technical analyzer')}</h2></div><span className="status-badge">{analysis ? l('MT5 ДАННЫЕ', 'MT5 DATA') : l('ОЖИДАЕТ', 'WAITING')}</span></div>
                {analysis ? <><div className="analysis-signal"><strong>{analysis.signal}</strong><span>{selectedSymbol} · {analysis.trend}</span></div><div className="analysis-stats"><div><small>RSI (14)</small><strong>{analysis.rsi.toFixed(1)}</strong></div><div><small>EMA trend</small><strong>{analysis.trend}</strong></div><div><small>{l('Последняя цена', 'Last close')}</small><strong>{analysis.price.toFixed(5)}</strong></div></div><p className="muted-copy">{l('Сигнал рассчитан по доступным барам MT5; это индикатор, а не прогноз или гарантия результата.', 'Computed from available MT5 bars; this is an indicator, not a forecast or guarantee.')}</p></> : <div className="empty-inline">{l('Для расчёта нужны минимум 50 реальных баров MT5. Подключите счёт и выберите рынок.', 'At least 50 real MT5 bars are required. Connect an account and select a market.')}</div>}
              </article>
              <article className="panel work-card agent-card">
                <div className="work-card-heading"><div><span className="section-kicker"><Globe size={14} /> {l('ИНТЕРНЕТ-АГЕНТ', 'INTERNET AGENT')}</span><h2>{l('Проверка AUD/CAD', 'AUD/CAD reference checker')}</h2></div><span className={`status-badge ${researchRunning ? '' : 'muted'}`}>{researchLoading ? l('СКАНИРОВАНИЕ', 'SCANNING') : researchRunning ? l('АКТИВЕН', 'ACTIVE') : l('ПАУЗА', 'PAUSED')}</span></div>
                <div className="research-mini"><div className={`globe-orb ${researchRunning ? 'spinning' : ''}`} style={{ '--globe-speed': `${Math.max(2, Math.min(24, 900 / Math.max(1, researchRate)))}s` }}><span /><i /><b /></div><div><strong>{referenceData ? Number(referenceData.rate).toFixed(5) : '—'}</strong><small>{referenceData ? `${l('Источник на дату', 'Source date')} ${referenceData.sourceDate}` : l('Публичный дневной ориентир', 'Public daily reference')}</small><small>{researchRate ? `${researchRate} ${l('проверок/мин по последнему запросу', 'checks/min on last request')}` : l('Скорость появится после проверки', 'Speed appears after a scan')}</small></div></div>
                <p className="muted-copy">{l('Публичный дневной ориентир, не биржевая котировка и не поток в реальном времени. Проверяется формат, дата и положительное значение.', 'Public daily reference, not an exchange quote or live feed. Schema, date and positive rate are checked.')}</p>
                <div className="agent-actions"><button className="secondary-action" onClick={() => runInternetResearch()} disabled={researchLoading}><RefreshCw size={14} /> {researchLoading ? l('Проверка…', 'Checking…') : l('Проверить сейчас', 'Check now')}</button><button className="secondary-action" onClick={() => setResearchRunning((running) => !running)}>{researchRunning ? <Pause size={14} /> : <Play size={14} />}{researchRunning ? l('Пауза', 'Pause') : l('Запустить', 'Start')}</button><button className="text-action" onClick={() => setActiveNav('Agents')}>{l('Настроить агенты', 'Configure agents')} <ArrowUpRight size={13} /></button></div>
              </article>
            </section>
            <section className="panel paper-overview-row">
              <div className="paper-overview-icon"><Bot size={19} /></div>
              <div className="paper-overview-copy"><span className="section-kicker">{executionMode === 'paper' ? 'AUTOPILOT · PAPER' : mt5Account?.accountType === 'real' ? 'AUTOPILOT · LIVE' : 'AUTOPILOT · MT5 DEMO'}</span><strong>{l('Автоматический агент AUDCAD', 'AUDCAD auto agent')}</strong><small>{paperAgent.enabled ? l('Активен. Проверяет свежий тик каждые 2 секунды, действует в заданном расписании.', 'Active. Evaluates fresh ticks every 2 seconds within your schedule.') : l('Остановлен. Без ручного запуска ордера не отправляются.', 'Paused. No orders are sent until you start it.')}</small></div>
              <span className={`status-badge ${paperAgent.enabled ? '' : 'muted'}`}>{paperAgent.enabled ? l('АКТИВЕН', 'ACTIVE') : l('ПАУЗА', 'PAUSED')}</span>
              <button className="secondary-action" onClick={startOrPauseAgent}>{paperAgent.enabled ? <Pause size={14} /> : <Play size={14} />}{paperAgent.enabled ? l('Пауза', 'Pause') : l('Запустить', 'Start')}</button>
              <button className="text-action" onClick={() => setActiveNav('Agents')}>{l('Настроить', 'Configure')} <ArrowUpRight size={13} /></button>
            </section>
          </>}

          {activeNav === 'Markets' && <section className="page-section">
            <div className="section-page-heading"><div><span className="section-kicker">MT5 MARKET WATCH</span><h1>{l('Рынки', 'Markets')}</h1><p>{l('Каталог именно того брокера, к которому подключён MT5.', 'The instrument catalog from your connected MT5 broker.')}</p></div><button className="secondary-action" onClick={loadBrokerMarkets} disabled={!mt5Account || marketLoading}><RefreshCw size={14} /> {marketLoading ? l('Загрузка…', 'Loading…') : l('Загрузить все рынки', 'Load all markets')}</button></div>
            <form className="market-search" onSubmit={loadBrokerMarkets}><Search size={16} /><input value={marketQuery} onChange={(event) => setMarketQuery(event.target.value)} placeholder={l('Поиск символа, например AUDCAD', 'Search symbol, e.g. AUDCAD')} /><button className="modal-primary" disabled={!mt5Account || marketLoading}>{l('Найти', 'Search')}</button></form>
            {!mt5Account ? <div className="empty-state"><TrendingUp size={28} /><h2>{l('Подключите MT5, чтобы увидеть доступные рынки', 'Connect MT5 to see available markets')}</h2><p>{l('Сейчас реальные котировки и брокерский список не загружаются. Подключается demo или live счёт.', 'Broker instruments and live quotes are not loaded. Either a demo or live account can be connected.')}</p><button className="connect-button" onClick={() => setModal('connect')}><Plus size={15} /> {l('Подключить счёт', 'Connect account')}</button></div> : <div className="market-list">{symbolResults.length ? symbolResults.map((symbol) => { const q = quotes[symbol]; return <button className={`market-row ${symbol === selectedSymbol ? 'selected' : ''}`} key={symbol} onClick={async () => { await subscribeInstrument(symbol); setActiveNav('Overview'); }}><span className="market-symbol">{symbol}</span><span>{q ? `${Number(q.bid).toFixed(5)} / ${Number(q.ask).toFixed(5)}` : l('Нажмите для загрузки котировки', 'Select to load quote')}</span><span className={q ? 'live-tag' : 'market-dash'}>{q ? 'LIVE' : '—'}</span></button>; }) : <div className="empty-inline">{l('Нажмите «Загрузить все рынки» или выполните поиск.', 'Click “Load all markets” or search for a symbol.')}</div>}</div>}
          </section>}

          {activeNav === 'Agents' && <section className="page-section agents-page">
            <div className="section-page-heading"><div><span className="section-kicker">{l('РАБОЧАЯ ПАНЕЛЬ АГЕНТОВ', 'AGENT CONTROL DESK')}</span><h1>{l('Автоторговля AUD/CAD', 'AUD/CAD auto trader')}</h1><p>{l('Режим Paper, MT5 Demo и MT5 Live. Анализ обновляется не чаще раза в 2 секунды; результативность не гарантируется.', 'Paper, MT5 Demo and MT5 Live modes. Analysis runs at most every 2 seconds; profitability is not guaranteed.')}</p></div></div>
            <div className="agent-control-grid">
              <article className="panel agent-control-card internet-control-card">
                <div className="agent-control-heading"><div><span className="section-kicker"><Globe size={14} /> {l('АГЕНТ СБОРА ДАННЫХ', 'INTERNET DATA AGENT')}</span><h2>{l('Публичный ориентир AUD/CAD', 'Public AUD/CAD reference')}</h2></div><span className={`status-badge ${researchRunning ? '' : 'muted'}`}>{researchLoading ? l('СКАНИРОВАНИЕ', 'SCANNING') : researchRunning ? l('РАБОТАЕТ', 'RUNNING') : l('ПАУЗА', 'PAUSED')}</span></div>
                <div className="research-feature"><div className={`globe-orb large-globe ${researchRunning ? 'spinning' : ''}`} style={{ '--globe-speed': `${Math.max(2, Math.min(24, 900 / Math.max(1, researchRate)))}s` }} aria-label={l('Глобус вращается во время работы агента', 'Globe rotates while the agent is running')}><span /><i /><b /></div><div className="research-value"><strong>{referenceData ? Number(referenceData.rate).toFixed(5) : '—'}</strong><small>AUD / CAD · {referenceData ? referenceData.sourceDate : l('ожидает первую проверку', 'awaiting first scan')}</small><small>{researchRate ? `${researchRate} ${l('проверок в минуту по скорости последнего цикла', 'checks per minute based on the latest scan')}` : l('Скорость появится после успешного запроса', 'Speed appears after the first successful request')}</small></div></div>
                <div className="research-results-list">{['response schema', 'publication date', 'AUD/CAD reference rate'].map((check, index) => { const result = referenceData?.checks?.find((item) => item.name === check); return <span key={check}><CircleCheck size={14} className={result?.ok ? 'check-ok' : 'check-pending'} />{l(['Формат ответа API', 'Дата публикации', 'Курс больше нуля'][index], check)}<b>{result ? (result.ok ? l('ПРОЙДЕНО', 'PASS') : l('ОШИБКА', 'FAIL')) : l('ОЖИДАЕТ', 'PENDING')}</b></span>; })}</div>
                {referenceData && <p className="research-footnote">{l('Источник', 'Source')}: Frankfurter API · {l('время запроса', 'fetched')}: {new Date(referenceData.fetchedAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-GB')} · {l('публичный дневной справочный курс, не live-котировка.', 'public daily reference rate, not a live quote.')}</p>}
                {referenceGapBps !== null && <div className="reference-comparison"><span>{l('Разница с mid MT5', 'Difference vs MT5 mid')}</span><strong className="neutral-text">{referenceGapBps >= 0 ? '+' : ''}{referenceGapBps.toFixed(1)} bps</strong><small>{l('Только сопоставление разных временных источников, не торговый сигнал.', 'Comparison across differently timed sources only, not a trading signal.')}</small></div>}
                {researchStatus && researchStatus !== 'validated' && <div className="connection-error">{researchStatus}</div>}
                <div className="agent-actions"><button className="modal-primary" onClick={runInternetResearch} disabled={researchLoading}><RefreshCw size={14} /> {researchLoading ? l('Сканирование…', 'Scanning…') : l('Проверить сейчас', 'Check now')}</button><button className="secondary-action" onClick={() => setResearchRunning((running) => !running)}>{researchRunning ? <Pause size={14} /> : <Play size={14} />}{researchRunning ? l('Остановить цикл', 'Pause schedule') : l('Запуск · раз в 15 мин', 'Start · every 15 min')}</button></div>
                <p className="muted-copy">{l('Три проверки применяются к каждому ответу. Сервис публикует дневные справочные курсы; это не интернет-сканер всех сайтов, не live-поток и не генеративная ИИ-модель.', 'Three validation checks run on each response. The service publishes daily reference rates; this is not a crawler of all websites, a live feed, or a generative AI model.')}</p>
              </article>

              <article className="panel agent-control-card paper-control-card compact-agent-card">
                <div className="agent-control-heading"><div><span className="section-kicker"><Bot size={14} /> {l('АВТОМАТИЧЕСКИЙ АГЕНТ · AUDCAD', 'AUTOMATED AGENT · AUDCAD')}</span><h2>{executionMode === 'paper' ? l('Paper-симуляция', 'Paper simulation') : mt5Account?.accountType === 'real' ? l('Исполнение MT5 Live', 'MT5 Live execution') : l('Исполнение MT5 Demo', 'MT5 Demo execution')}</h2></div><span className={`status-badge ${paperAgent.enabled ? (executionMode === 'mt5' && mt5Account?.accountType === 'real' ? 'live-risk-badge' : '') : 'muted'}`}>{paperAgent.enabled ? l('РАБОТАЕТ', 'RUNNING') : l('ПАУЗА', 'PAUSED')}</span></div>
                <div className="execution-mode-picker"><button className={executionMode === 'paper' ? 'selected' : ''} onClick={() => { setExecutionMode('paper'); setLiveTradeConfirmed(false); }} disabled={paperAgent.enabled}>{l('Paper', 'Paper')}</button><button className={executionMode === 'mt5' ? 'selected' : ''} onClick={() => { setExecutionMode('mt5'); setLiveTradeConfirmed(false); }} disabled={paperAgent.enabled || !mt5Account || !['demo', 'real'].includes(mt5Account.accountType)}>{mt5Account?.accountType === 'real' ? 'MT5 LIVE' : mt5Account?.accountType === 'demo' ? 'MT5 DEMO' : 'MT5'}</button></div>
                <div className={`paper-warning ${executionMode === 'mt5' && mt5Account?.accountType === 'real' ? 'live-warning' : ''}`}><ShieldCheck size={15} /><span>{executionMode === 'paper' ? l('PAPER: виртуальные сделки. Депозит и снятие меняют только локальный CAD-баланс.', 'PAPER: virtual trades only. Deposit/withdraw adjusts the local CAD balance.') : mt5Account?.accountType === 'real' ? l('LIVE: реальные ордера возможны. Лимиты: ≤0,01 лота, 1 позиция, SL 20 / TP 30 пипсов, дневной стоп 1%.', 'LIVE: real orders can be placed. Caps: ≤0.01 lot, 1 position, SL 20 / TP 30 pips, 1% daily stop.') : l('DEMO: ордера будут отправлены на учебный MT5-счёт. Лимиты: ≤0,01 лота, SL 20 / TP 30 пипсов, дневной стоп 1%.', 'DEMO: orders will be sent to the MT5 demo account. Caps: ≤0.01 lot, SL 20 / TP 30 pips, 1% daily stop.')}</span></div>
                {executionMode === 'paper' ? <>
                  <div className="paper-config-grid compact-paper-fields">
                    <label>{l('Виртуальный баланс · CAD', 'Virtual balance · CAD')}<input type="number" min="1" max="10000000" step="50" value={paperAgent.capital} onChange={(event) => setPaperAgent((current) => ({ ...current, capital: Math.min(10000000, Math.max(1, Number(event.target.value) || 1)) }))} /></label>
                    <label>{l('Лимит на сделку · CAD', 'Per-trade cap · CAD')}<input type="number" min="1" max="10000000" step="25" value={paperAgent.maxAllocation} onChange={(event) => setPaperAgent((current) => ({ ...current, maxAllocation: Math.min(10000000, Math.max(1, Number(event.target.value) || 1)) }))} /></label>
                    <label>{l('Сумма изменения', 'Adjustment amount')}<input type="number" min="0.01" max="1000000" step="10" value={cashAdjustment} onChange={(event) => setCashAdjustment(Number(event.target.value))} /></label>
                  </div>
                  <div className="cash-actions"><button className="secondary-action" onClick={() => adjustPaperBalance(1)}>{l('＋ Пополнить paper', '＋ Add paper funds')}</button><button className="secondary-action" onClick={() => adjustPaperBalance(-1)}>{l('－ Снять paper', '－ Withdraw paper')}</button><span>{l('Остаток', 'Balance')}: <b>{(Number(paperAgent.capital) + Number(paperAgent.realizedPnl || 0)).toFixed(2)} CAD</b></span></div>
                  {cashAdjustmentError && <div className="connection-error compact-error">{cashAdjustmentError}</div>}
                </> : <div className="live-account-summary"><span>{l('Баланс MT5', 'MT5 balance')} <b>{mt5Account ? `${mt5Account.currency} ${Number(mt5Account.balance).toFixed(2)}` : '—'}</b></span><span>{l('Снятие/пополнение реального счёта выполняется только у брокера.', 'Real account deposits/withdrawals are handled by the broker.')}</span></div>}
                <div className="schedule-inline"><label>{l('С', 'From')}<input type="time" value={paperAgent.start} onChange={(event) => setPaperAgent((current) => ({ ...current, start: event.target.value }))} /></label><label>{l('До', 'To')}<input type="time" value={paperAgent.end} onChange={(event) => setPaperAgent((current) => ({ ...current, end: event.target.value }))} /></label><div className="weekday-picker compact-weekdays"><span>{l('Дни ·', 'Days ·')} {Intl.DateTimeFormat().resolvedOptions().timeZone}</span><div>{(language === 'ru' ? ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']).map((label, day) => <button key={day} type="button" className={paperAgent.days.includes(day) ? 'selected' : ''} aria-pressed={paperAgent.days.includes(day)} onClick={() => setPaperAgent((current) => ({ ...current, days: current.days.includes(day) ? current.days.filter((item) => item !== day) : [...current.days, day].sort() }))}>{label}</button>)}</div></div></div>
                <div className="paper-performance-grid compact-performance"><div><small>{executionMode === 'paper' ? l('P&L paper', 'Paper P&L') : l('P&L агента сегодня', 'Agent P&L today')}</small><strong className={Number(brokerAgentStatus?.dailyPnl ?? paperAgent.realizedPnl) >= 0 ? 'positive-text' : 'negative-text'}>{executionMode === 'paper' ? `${Number(paperAgent.realizedPnl || 0).toFixed(2)} CAD` : brokerAgentStatus?.dailyPnl !== undefined ? `${Number(brokerAgentStatus.dailyPnl).toFixed(2)} ${mt5Account?.currency || ''}` : '—'}</strong></div><div><small>{l('Сигнал', 'Signal')}</small><strong>{analysis?.signal || l('Нет данных', 'No data')}</strong></div><div><small>{executionMode === 'paper' ? l('Виртуальная позиция', 'Paper position') : l('Состояние агента', 'Agent status')}</small><strong>{executionMode === 'paper' ? (paperAgent.position ? `${paperAgent.position.side} AUDCAD` : l('Нет', 'None')) : (brokerAgentStatus?.state || l('Ожидание', 'Waiting'))}</strong></div></div>
                <div className="analyst-consensus" aria-live="polite">
                  <div className="analyst-consensus-heading"><strong>{l('СОГЛАСОВАННОЕ РЕШЕНИЕ', 'ANALYST CONSENSUS')}</strong><span className={analystConsensus.entryAllowed ? 'consensus-ready' : 'consensus-wait'}>{analystConsensus.entryAllowed ? `${l('ВХОД', 'ENTRY')} · ${analystConsensus.decision}` : `${l('ОЖИДАНИЕ', 'WAIT')} · ${analystConsensus.reason.replaceAll('_', ' ')}`}</span></div>
                  <div className="analyst-status-grid">
                    <span><b>{l('Техника', 'Technical')}</b><small>{analystConsensus.analysts.technical.ready ? analystConsensus.analysts.technical.signal : l('Нет сигнала', 'No directional signal')}</small></span>
                    <span><b>{l('Интернет · дневной ориентир', 'Internet · daily reference')}</b><small>{analystConsensus.analysts.internet.ready ? `${Number(analystConsensus.analysts.internet.rate).toFixed(5)} · ${analystConsensus.analysts.internet.sourceDate}` : l(`Проверка нужна: ${analystConsensus.analysts.internet.reason}`, `Check needed: ${analystConsensus.analysts.internet.reason.replaceAll('_', ' ')}`)}</small></span>
                    <span><b>{l('Адаптация', 'Adaptive/history')}</b><small>{analystConsensus.analysts.learning.state === 'warming_up' ? l('Сбор закрытых сделок', 'Collecting closed trades') : analystConsensus.analysts.learning.state === 'adaptive_filter' ? l('Фильтр входа ужесточён', 'Entry filter tightened') : analystConsensus.analysts.learning.state === 'learning_cooldown' ? l('Пауза после серии убытков', 'Loss-streak cooldown') : `${analystConsensus.analysts.learning.closedTrades} ${l('закрытых сделок', 'closed trades')}`}</small></span>
                  </div>
                  <small className="consensus-footnote">{l('Новая сделка требует всех трёх проверок. Дневной курс — только проверка источника, не live-котировка и не прогноз направления.', 'A new entry requires all three checks. The daily rate validates the source only; it is neither a live quote nor a directional forecast.')}</small>
                </div>
                {executionMode === 'mt5' && brokerAgentStatus && <div className={`broker-agent-message ${brokerAgentStatus.state === 'error' || brokerAgentStatus.state === 'daily_loss_stop' ? 'error-state' : ''}`}><span>{brokerAgentStatus.message || brokerAgentStatus.learning || l('Последний цикл', 'Last cycle') + ': ' + brokerAgentStatus.state}</span><small>{brokerAgentStatus.winRate === null || brokerAgentStatus.winRate === undefined ? l('Обучение: ожидаются закрытые сделки', 'Learning: waiting for closed trades') : `${l('Доля прибыльных закрытых сделок', 'Closed-trade win rate')}: ${(brokerAgentStatus.winRate * 100).toFixed(0)}% · ${brokerAgentStatus.closedTrades} ${l('сделок', 'trades')} · ${brokerAgentStatus.consecutiveLosses || 0} ${l('убытков подряд', 'losses in a row')}`}</small></div>}
                <div className="agent-actions compact-agent-actions"><button className={paperAgent.enabled ? 'modal-danger' : 'modal-primary'} onClick={startOrPauseAgent}>{paperAgent.enabled ? <Pause size={14} /> : <Play size={14} />}{paperAgent.enabled ? l('ВЫКЛ · ПАУЗА', 'OFF · PAUSE') : executionMode === 'paper' ? l('ВКЛ · PAPER', 'ON · PAPER') : executionMode === 'mt5' && mt5Account?.accountType === 'real' ? l('ВКЛ · LIVE', 'ON · LIVE') : l('ВКЛ · MT5 DEMO', 'ON · MT5 DEMO')}</button><span className="agent-feed-status"><Activity size={14} /> {paperAgent.enabled ? l('Новый тик проверяется каждые 2 сек.', 'Fresh ticks evaluated every 2 sec.') : l('Стратегия: EMA(20/50) + RSI(14)', 'Strategy: EMA(20/50) + RSI(14)')}</span></div>
                <p className="muted-copy compact-agent-note">{l('Адаптация использует только закрытые результаты: после 5 сделок с win rate <40% фильтр входа ужесточается; 2 убытка подряд дают паузу на 1 час. Это не обучение нейросети и не гарантия безубыточности. ОТКЛ останавливает новые входы, но не закрывает уже открытую брокером позицию: её SL/TP остаются у брокера. SL не гарантирует цену исполнения при гэпе/проскальзывании.', 'Adaptation uses closed outcomes only: after 5 trades below 40% win rate, entry filter tightens; 2 consecutive losses pause entries for 1 hour. This is not neural-network learning or a no-loss guarantee. OFF stops new entries but does not close an existing broker position; its SL/TP remain at the broker. A stop does not guarantee execution price through gaps or slippage.')}</p>
              </article>
            </div>
            <article className="panel paper-history-panel"><details className="compact-agent-log"><summary><span>{l('Журнал paper-сделок и виртуальных средств', 'Paper trades & virtual cash ledger')}</span><b>{paperAgent.trades.length + (paperAgent.cashFlows || []).length}</b></summary>{paperAgent.cashFlows?.length > 0 && <div className="cash-ledger-list">{paperAgent.cashFlows.slice(0, 8).map((entry) => <span key={entry.id}>{new Date(entry.time).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-GB')} · {entry.amount >= 0 ? l('Пополнение', 'Deposit') : l('Снятие', 'Withdrawal')} <b className={entry.amount >= 0 ? 'positive-text' : 'negative-text'}>{entry.amount >= 0 ? '+' : ''}{Number(entry.amount).toFixed(2)} CAD</b> · {Number(entry.balanceAfter).toFixed(2)} CAD</span>)}</div>}{paperAgent.trades.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{l('Рынок', 'Market')}</th><th>{l('Тип', 'Side')}</th><th>{l('Вход', 'Entry')}</th><th>{l('Выход', 'Exit')}</th><th>{l('Результат CAD', 'Result CAD')}</th><th>{l('Статус', 'Status')}</th></tr></thead><tbody>{paperAgent.trades.map((trade) => <tr key={trade.id}><td><strong>{trade.symbol}</strong><small>{new Date(trade.openTime).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-GB')}</small></td><td>{trade.side}</td><td>{Number(trade.openPrice).toFixed(5)}</td><td>{trade.closePrice ? Number(trade.closePrice).toFixed(5) : '—'}</td><td className={Number(trade.pnl || 0) >= 0 ? 'positive-text' : 'negative-text'}>{trade.pnl === undefined ? '—' : Number(trade.pnl).toFixed(2)}</td><td>{trade.status === 'closed' ? l('ЗАКРЫТА · PAPER', 'CLOSED · PAPER') : trade.status === 'session stopped' ? l('СЕССИЯ ОСТАНОВЛЕНА', 'SESSION STOPPED') : l('ОТКРЫТА · PAPER', 'OPEN · PAPER')}</td></tr>)}</tbody></table></div> : <div className="empty-inline">{l('Paper-сделок пока нет.', 'No paper trades yet.')}</div>}</details></article>
          </section>}

          {activeNav === 'Positions' && <section className="page-section">
            <div className="section-page-heading"><div><span className="section-kicker">{mt5Account ? `${mt5Account.accountType.toUpperCase()} MT5` : 'MT5'}</span><h1>{l('Открытые позиции', 'Open positions')}</h1><p>{l('Позиции считываются из подключённого MT5; здесь нет демонстрационных строк.', 'Positions are read from connected MT5; no sample rows are shown here.')}</p></div><button className="secondary-action" onClick={refreshPositionsNow} disabled={!mt5Account || accountDataLoading}><RefreshCw size={14} /> {l('Обновить', 'Refresh')}</button></div>
            {!mt5Account ? <div className="empty-state"><Wallet size={28} /><h2>{l('Нет подключённого торгового счёта', 'No trading account connected')}</h2><button className="connect-button" onClick={() => setModal('connect')}><Plus size={15} /> {l('Подключить MT5', 'Connect MT5')}</button></div> : positions.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{l('Инструмент', 'Instrument')}</th><th>{l('Направление', 'Side')}</th><th>{l('Объём', 'Volume')}</th><th>{l('Вход', 'Entry')}</th><th>{l('Цена', 'Current')}</th><th>{l('Плавающий P&L', 'Floating P&L')}</th><th>SL / TP</th></tr></thead><tbody>{positions.map((position) => <tr key={position.ticket}><td><strong>{position.symbol}</strong><small>#{position.ticket}</small></td><td><span className={`position-type ${position.type === 'BUY' ? 'buy-type' : 'sell-type'}`}>{position.type}</span></td><td>{position.volume}</td><td>{position.openPrice}</td><td>{position.currentPrice}</td><td className={position.profit >= 0 ? 'positive-text' : 'negative-text'}>{(position.profit + position.swap).toFixed(2)} {mt5Account.currency}</td><td>{position.stopLoss || '—'} / {position.takeProfit || '—'}</td></tr>)}</tbody></table></div> : <div className="empty-state"><Wallet size={28} /><h2>{l('Открытых позиций нет', 'No open positions')}</h2><p>{l('Если сделки есть в терминале, проверьте что Money Work подключён к тому же логину и серверу.', 'If positions appear in your terminal, verify Money Work uses the same login and server.')}</p></div>}
          </section>}

          {activeNav === 'History' && <section className="page-section">
            <div className="section-page-heading"><div><span className="section-kicker">{l('ПОСЛЕДНИЕ 30 ДНЕЙ', 'LAST 30 DAYS')}</span><h1>{l('История сделок', 'Trade history')}</h1><p>{l('Закрытые и учтённые сделки, прочитанные из истории MT5.', 'Closed and recorded deals read from MT5 account history.')}</p></div><button className="secondary-action" onClick={refreshDealsNow} disabled={!mt5Account || accountDataLoading}><RefreshCw size={14} /> {l('Обновить', 'Refresh')}</button></div>
            {!mt5Account ? <div className="empty-state"><Clock3 size={28} /><h2>{l('Подключите MT5 для загрузки истории', 'Connect MT5 to load history')}</h2><button className="connect-button" onClick={() => setModal('connect')}><Plus size={15} /> {l('Подключить счёт', 'Connect account')}</button></div> : deals.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{l('Время', 'Time')}</th><th>{l('Инструмент', 'Instrument')}</th><th>{l('Тип', 'Type')}</th><th>{l('Объём', 'Volume')}</th><th>{l('Цена', 'Price')}</th><th>{l('Результат', 'Net result')}</th><th>{l('Комментарий', 'Comment')}</th></tr></thead><tbody>{[...deals].reverse().map((deal) => { const net = deal.profit + deal.commission + deal.swap; return <tr key={deal.ticket}><td>{new Date(deal.time * 1000).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-GB')}</td><td><strong>{deal.symbol || '—'}</strong></td><td>{deal.type}</td><td>{deal.volume}</td><td>{deal.price}</td><td className={net >= 0 ? 'positive-text' : 'negative-text'}>{net.toFixed(2)} {mt5Account.currency}</td><td>{deal.comment || '—'}</td></tr>; })}</tbody></table></div> : <div className="empty-state"><Clock3 size={28} /><h2>{l('В выбранном периоде сделок нет', 'No deals in selected period')}</h2></div>}
          </section>}

          {activeNav === 'Strategies' && <section className="page-section">
            <div className="section-page-heading"><div><span className="section-kicker">RESEARCH LIBRARY</span><h1>{l('Библиотека стратегий', 'Strategy library')}</h1><p>{l('Набор базовых подходов для тестирования; это не все стратегии и не обещание доходности.', 'A starter set of common approaches to test; not every strategy and not a profit guarantee.')}</p></div></div>
            <div className="strategy-grid">{[
              ['EMA crossover', l('Следование за трендом: пересечение быстрой и медленной EMA.', 'Trend following: fast/slow EMA crossover.')],
              ['RSI mean reversion', l('Контртрендовый вход по зонам перекупленности/перепроданности.', 'Countertrend setup using overbought/oversold zones.')],
              ['Range breakout', l('Пробой диапазона с фильтром волатильности и подтверждением закрытия бара.', 'Range breakout with volatility filter and bar-close confirmation.')],
              ['Session momentum', l('Сравнение волатильности и импульса в выбранной торговой сессии.', 'Compare volatility and momentum during a selected trading session.')],
            ].map(([name, description]) => <article className="panel strategy-card" key={name}><span className="strategy-mark"><Sparkles size={15} /></span><h2>{name}</h2><p>{description}</p><span className="strategy-status">{l('ДЕМО-ТЕСТ НУЖЕН', 'DEMO TEST REQUIRED')}</span></article>)}</div>
            <div className="research-note"><CircleHelp size={16} /><span>{l('Невозможно надёжно загрузить «все стратегии из интернета». Каждую стратегию нужно проверять на конкретном инструменте, таймфрейме, спреде и комиссии с защитой от подгонки под историю.', 'There is no reliable way to load “every strategy on the internet”. Each strategy must be tested for the instrument, timeframe, spread and fees while controlling for overfitting.')}</span></div>
          </section>}

          {['Risk controls', 'Reports'].includes(activeNav) && <section className="page-section"><div className="section-page-heading"><div><span className="section-kicker">MONEY WORK</span><h1>{t(activeNav)}</h1><p>{l('Раздел будет заполнен после добавления проверяемых данных счёта.', 'This section will be populated from verified account data.')}</p></div></div><div className="empty-state"><ShieldCheck size={28} /><h2>{l('Пока нет данных для отображения', 'No data to display yet')}</h2></div></section>}

          <footer className="footer-note"><span><ShieldCheck size={13} />{mt5Account ? l('Данные счёта читаются из MT5.', 'Account data is read from MT5.') : l('Реальные рынки появятся после подключения MT5.', 'Live broker markets appear after MT5 is connected.')}</span><span>Money Work <b>v{packageJson.version}</b></span></footer>
        </div>
      </main>

      {modal && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModal('')}>
        <div className={`modal-card ${modal === 'connect' ? 'account-modal' : ''}`}>
          <button className="modal-close" onClick={() => setModal('')}><X size={17} /></button>
          <div className="modal-icon"><LockKeyhole size={20} /></div>
          {modal === 'connect' ? <>
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
                <label>MT5 server <span className="field-optional">choose or type</span><input list="mt5-server-suggestions" value={accountForm.server} onChange={(event) => setAccountForm({ ...accountForm, server: event.target.value })} placeholder="MetaQuotes-Demo or exact server name" required /><datalist id="mt5-server-suggestions"><option value="MetaQuotes-Demo" />{recentServers.map((server) => <option value={server} key={server} />)}{savedAccount?.server && <option value={savedAccount.server} />}</datalist><small className="server-help">MetaQuotes-Demo and recent entries appear here. To find any broker server, use MT5 desktop: File → Open an Account → search broker/company name → Find your broker. The available global list changes and cannot be bundled as a complete static list.</small></label>
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
            <div className="paper-warning live-warning"><ShieldCheck size={15} /><span>{l('Будут отправляться реальные AUDCAD-ордера. Лимиты: не более 0,01 лота, одна позиция, SL 20 пипсов, TP 30 пипсов, стоп входов при дневном убытке 1%. Эти ограничения не исключают гэпы и потерю средств.', 'This can send real AUDCAD orders. Caps: up to 0.01 lot, one position, 20-pip SL, 30-pip TP, stop new entries at 1% daily loss. These limits do not eliminate gaps or financial loss.')}</span></div>
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
            <span className="section-kicker">SAFE DEMO MODE</span>
            <h2>{modal === 'profile' ? 'Local demo profile' : 'Demo workspace'}</h2>
            <p>Sample balances and signals are illustrative. Connected MT5 quotes and account information are real. Broker orders are sent only when you explicitly arm the auto agent, pass the live confirmation gate where applicable, and the bridge-side risk checks all pass.</p>
            <div className="modal-actions"><button className="modal-secondary" onClick={() => setModal('')}>Close</button><button className="modal-primary" onClick={() => { setModal(''); setActiveNav('Risk controls'); }}>Review safety panel</button></div>
          </>}
        </div>
      </div>}
    </div>
  );
}

export default App;
