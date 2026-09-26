import { useEffect, useMemo, useState } from 'react';
import packageJson from '../package.json';
import {
  Activity, ArrowUpRight, Bell, ChevronDown, CircleHelp,
  Clock3, Command, LayoutDashboard, LockKeyhole,
  MoreHorizontal, Plus, Search, ShieldCheck,
  Sparkles, TrendingUp, Wallet, X, Zap, Maximize2, Languages, RefreshCw,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const navItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Markets', icon: TrendingUp },
  { label: 'Strategies', icon: Sparkles },
  { label: 'Positions', icon: Wallet },
  { label: 'History', icon: Clock3 },
];

const copy = {
  en: {
    Overview: 'Overview', Markets: 'Markets', Strategies: 'Strategies', Positions: 'Positions', History: 'History',
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
    Overview: 'Обзор', Markets: 'Рынки', Strategies: 'Стратегии', Positions: 'Позиции', History: 'История',
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
  const liveQuote = quotes[selectedSymbol];
  const series = useMemo(() => {
    const bars = historyBySymbol[selectedSymbol]?.[timeframe] || [];
    const values = bars.map((bar) => ({ time: new Date(bar.time * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }), price: bar.close }));
    if (liveQuote && values.length) values[values.length - 1].price = (liveQuote.bid + liveQuote.ask) / 2;
    return values;
  }, [timeframe, selectedSymbol, historyBySymbol, liveQuote]);
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
    if (liveBars.length < 20) return null;
    const closes = liveBars.map((bar) => Number(bar.close));
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
  }, [liveBars]);

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
      setModal('');
    } catch (error) {
      setMt5Error(error.message);
    }
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

        <div className="page-content workspace-content">
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
                {analysis ? <><div className="analysis-signal"><strong>{analysis.signal}</strong><span>{selectedSymbol} · {analysis.trend}</span></div><div className="analysis-stats"><div><small>RSI (14)</small><strong>{analysis.rsi.toFixed(1)}</strong></div><div><small>EMA trend</small><strong>{analysis.trend}</strong></div><div><small>{l('Последняя цена', 'Last close')}</small><strong>{analysis.price.toFixed(5)}</strong></div></div><p className="muted-copy">{l('Сигнал рассчитан по доступным барам MT5; это индикатор, а не прогноз или гарантия результата.', 'Computed from available MT5 bars; this is an indicator, not a forecast or guarantee.')}</p></> : <div className="empty-inline">{l('Для расчёта нужны минимум 20 реальных баров MT5. Подключите счёт и выберите рынок.', 'At least 20 real MT5 bars are required. Connect an account and select a market.')}</div>}
              </article>
              <article className="panel work-card agent-card">
                <div className="work-card-heading"><div><span className="section-kicker"><Zap size={14} /> {l('AI АГЕНТ', 'AI AGENT')}</span><h2>{l('Автономный режим', 'Autonomous mode')}</h2></div><span className="status-badge muted">{l('НЕ АКТИВЕН', 'NOT ACTIVE')}</span></div>
                <p className="muted-copy">{l('Ордеры и онлайн-обучение не включены. Сначала нужны проверка стратегий, демо-тест и заданные лимиты риска.', 'Order execution and online learning are not enabled. Strategy validation, demo testing and explicit risk limits are required first.')}</p>
                <div className="agent-checklist"><span><ShieldCheck size={14} /> {l('Поток MT5', 'MT5 feed')}: {mt5Account ? l('подключён', 'connected') : l('нет', 'not connected')}</span><span><LockKeyhole size={14} /> {l('Исполнение ордеров', 'Order execution')}: {l('заблокировано', 'disabled')}</span><span><Activity size={14} /> {l('Режим', 'Mode')}: {l('только анализ', 'analysis only')}</span></div>
                <button className="secondary-action" onClick={() => setActiveNav('Strategies')}>{l('Открыть каталог стратегий', 'Open strategy library')} <ArrowUpRight size={14} /></button>
              </article>
            </section>
          </>}

          {activeNav === 'Markets' && <section className="page-section">
            <div className="section-page-heading"><div><span className="section-kicker">MT5 MARKET WATCH</span><h1>{l('Рынки', 'Markets')}</h1><p>{l('Каталог именно того брокера, к которому подключён MT5.', 'The instrument catalog from your connected MT5 broker.')}</p></div><button className="secondary-action" onClick={loadBrokerMarkets} disabled={!mt5Account || marketLoading}><RefreshCw size={14} /> {marketLoading ? l('Загрузка…', 'Loading…') : l('Загрузить все рынки', 'Load all markets')}</button></div>
            <form className="market-search" onSubmit={loadBrokerMarkets}><Search size={16} /><input value={marketQuery} onChange={(event) => setMarketQuery(event.target.value)} placeholder={l('Поиск символа, например AUDCAD', 'Search symbol, e.g. AUDCAD')} /><button className="modal-primary" disabled={!mt5Account || marketLoading}>{l('Найти', 'Search')}</button></form>
            {!mt5Account ? <div className="empty-state"><TrendingUp size={28} /><h2>{l('Подключите MT5, чтобы увидеть доступные рынки', 'Connect MT5 to see available markets')}</h2><p>{l('Сейчас реальные котировки и брокерский список не загружаются. Подключается demo или live счёт.', 'Broker instruments and live quotes are not loaded. Either a demo or live account can be connected.')}</p><button className="connect-button" onClick={() => setModal('connect')}><Plus size={15} /> {l('Подключить счёт', 'Connect account')}</button></div> : <div className="market-list">{symbolResults.length ? symbolResults.map((symbol) => { const q = quotes[symbol]; return <button className={`market-row ${symbol === selectedSymbol ? 'selected' : ''}`} key={symbol} onClick={async () => { await subscribeInstrument(symbol); setActiveNav('Overview'); }}><span className="market-symbol">{symbol}</span><span>{q ? `${Number(q.bid).toFixed(5)} / ${Number(q.ask).toFixed(5)}` : l('Нажмите для загрузки котировки', 'Select to load quote')}</span><span className={q ? 'live-tag' : 'market-dash'}>{q ? 'LIVE' : '—'}</span></button>; }) : <div className="empty-inline">{l('Нажмите «Загрузить все рынки» или выполните поиск.', 'Click “Load all markets” or search for a symbol.')}</div>}</div>}
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
            <span className="section-kicker">READ-ONLY MT5 CONNECTION</span>
            <h2>{mt5Account ? 'Account connected' : t('Add MT5 account')}</h2>
            {mt5Account ? <>
              <p>Connected to <strong>{mt5Account.server}</strong> as account <strong>{mt5Account.login}</strong>. Money Work reads equity and quotes only; no orders can be sent.</p>
              <div className="account-summary"><span>Equity</span><strong>{mt5Account.currency} {Number(mt5Account.equity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><span>Leverage</span><strong>1:{mt5Account.leverage}</strong></div>
              <div className="modal-actions"><button className="modal-secondary" onClick={() => setModal('')}>Close</button><button className="modal-danger" onClick={disconnectAccount}>Disconnect</button></div>
            </> : <>
              <p>Enter the MT5 account login, password, and exact server shown in MetaTrader 5. MetaQuotes-Demo accounts are supported. For a read-only connection, use the investor password if available. Credentials are passed only to the local MT5 connector.</p>
              <form className="account-form" onSubmit={connectAccount}>
                <label>MT5 account number<input autoComplete="username" inputMode="numeric" value={accountForm.login} onChange={(event) => setAccountForm({ ...accountForm, login: event.target.value })} placeholder="Account login" required /></label>
                <label>MT5 server <span className="field-optional">choose or type</span><input list="mt5-server-suggestions" value={accountForm.server} onChange={(event) => setAccountForm({ ...accountForm, server: event.target.value })} placeholder="MetaQuotes-Demo or exact server name" required /><datalist id="mt5-server-suggestions"><option value="MetaQuotes-Demo" />{recentServers.map((server) => <option value={server} key={server} />)}{savedAccount?.server && <option value={savedAccount.server} />}</datalist><small className="server-help">MetaQuotes-Demo is included. Other MT5 server names vary by broker; enter the exact name shown in MT5. Recently entered servers are saved in this list.</small></label>
                <label>MT5 investor / read-only password<input type="password" autoComplete="current-password" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} placeholder="Use investor password when available" required /></label>
                <label>MT5 terminal path <span className="field-optional">optional</span><input value={accountForm.terminalPath} onChange={(event) => setAccountForm({ ...accountForm, terminalPath: event.target.value })} placeholder="Auto-detect, or C:\\Program Files\\...\\terminal64.exe" /></label>
                <label className="remember-row"><input type="checkbox" checked={rememberAccount} onChange={(event) => setRememberAccount(event.target.checked)} /><span>Remember on this PC <small>Encrypt credentials with Windows secure storage.</small></span></label>
                {savedAccount && <button className="saved-account-button" type="button" onClick={connectSavedAccount} disabled={connecting}>Reconnect saved account {savedAccount.login} · {savedAccount.server}</button>}
                {mt5Error && <div className="connection-error">{mt5Error}</div>}
                <div className="modal-actions"><button className="modal-secondary" type="button" onClick={() => setModal('')}>Cancel</button><button className="modal-primary" type="submit" disabled={connecting}>{connecting ? 'Connecting…' : 'Connect read-only'}</button></div>
              </form>
              <div className="secure-note"><ShieldCheck size={13} /> Never share account passwords or API keys in chat.</div>
            </>}
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
            <p>Sample balances, signals and paper positions are illustrative. Only account equity and the selected MT5 quote become live after a read-only connection; live order execution is not available.</p>
            <div className="modal-actions"><button className="modal-secondary" onClick={() => setModal('')}>Close</button><button className="modal-primary" onClick={() => { setModal(''); setActiveNav('Risk controls'); }}>Review safety panel</button></div>
          </>}
        </div>
      </div>}
    </div>
  );
}

export default App;
