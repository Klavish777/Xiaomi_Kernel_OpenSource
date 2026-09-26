import { useEffect, useMemo, useState } from 'react';
import packageJson from '../package.json';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, ChevronDown, CircleHelp,
  Clock3, Command, CreditCard, Gauge, LayoutDashboard, LockKeyhole,
  MoreHorizontal, Pause, Play, Plus, Search, Settings2, ShieldCheck,
  Sparkles, TrendingUp, Wallet, X, Zap, Maximize2, Languages,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const navItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Markets', icon: TrendingUp },
  { label: 'Strategies', icon: Sparkles },
  { label: 'Positions', icon: Wallet, count: '2' },
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
    'Pause demo': 'Pause demo', 'Connect read-only': 'Connect read-only', 'Add Bybit MT5 account': 'Add Bybit MT5 account',
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
    'Pause demo': 'Приостановить демо', 'Connect read-only': 'Подключить для чтения', 'Add Bybit MT5 account': 'Добавить счёт Bybit MT5',
    'MT5 demo account': 'Демо-счёт MT5', 'MT5 live account': 'Реальный счёт MT5', 'Language': 'Язык',
    'Fullscreen': 'Полный экран', 'Windowed': 'Оконный режим', 'DEMO ACCOUNT': 'ДЕМО-СЧЁТ', 'LIVE ACCOUNT': 'РЕАЛЬНЫЙ СЧЁТ',
  },
};

const rawSeries = [
  0.65332, 0.65337, 0.65328, 0.65341, 0.65346, 0.65339, 0.65352, 0.65348,
  0.65361, 0.65355, 0.65364, 0.65358, 0.65372, 0.65368, 0.65380, 0.65374,
  0.65369, 0.65383, 0.65378, 0.65392, 0.65387, 0.65396, 0.65391, 0.65403,
  0.65400, 0.65412, 0.65404, 0.65417, 0.65410, 0.65424, 0.65420, 0.65429,
  0.65421, 0.65436, 0.65430, 0.65443, 0.65437, 0.65448, 0.65442, 0.65456,
  0.65450, 0.65462, 0.65457, 0.65469, 0.65463, 0.65476, 0.65471, 0.65482,
];

const symbolRows = [
  { symbol: 'AUDCAD', name: 'Australian Dollar / Canadian Dollar', price: '0.65482', change: '+0.42%', positive: true, icon: 'A' },
  { symbol: 'EURUSD', name: 'Euro / US Dollar', price: '1.08426', change: '+0.18%', positive: true, icon: '€' },
  { symbol: 'GBPUSD', name: 'British Pound / US Dollar', price: '1.27194', change: '−0.12%', positive: false, icon: '£' },
];

const activities = [
  { pair: 'AUDCAD', side: 'Buy', amount: '0.08 lot', time: '10:42:18', status: 'Paper open', positive: true },
  { pair: 'EURUSD', side: 'Sell', amount: '0.05 lot', time: '09:18:06', status: 'Paper closed', positive: false },
  { pair: 'AUDCAD', side: 'Buy', amount: '0.06 lot', time: 'Yesterday', status: 'Paper closed', positive: true },
];

function buildSeries(timeframe, symbol) {
  const factor = timeframe === '1H' ? 1.9 : timeframe === '5M' ? 0.72 : timeframe === '1M' ? 0.45 : 1;
  const base = symbol === 'EURUSD' ? 1.0828 : symbol === 'GBPUSD' ? 1.2705 : 0.6533;
  return rawSeries.map((price, i) => ({
    time: `${String(7 + Math.floor(i / 4)).padStart(2, '0')}:${String((i * 15) % 60).padStart(2, '0')}`,
    price: base + (price - 0.6533) * factor + Math.sin(i / 2.7) * 0.00005,
  }));
}

function IconTile({ children, tone = 'blue' }) {
  return <span className={`icon-tile ${tone}`}>{children}</span>;
}

function MetricCard({ label, value, change, icon: Icon, tone, positive = true, neutral = false, note }) {
  return (
    <article className="metric-card panel">
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <IconTile tone={tone}><Icon size={17} strokeWidth={1.8} /></IconTile>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottom">
        <span className={`metric-change ${neutral ? 'neutral' : positive ? 'up' : 'down'}`}>
          {!neutral && (positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />)}{change}
        </span>
        <span className="metric-note">{note}</span>
      </div>
    </article>
  );
}

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem('money-work-language') || 'ru');
  const [fullScreen, setFullScreen] = useState(true);
  const t = (key) => copy[language]?.[key] || copy.en[key] || key;
  const [timeframe, setTimeframe] = useState('15M');
  const [activeNav, setActiveNav] = useState('Overview');
  const [selectedSymbol, setSelectedSymbol] = useState('AUDCAD');
  const [demoRunning, setDemoRunning] = useState(false);
  const [riskEnabled, setRiskEnabled] = useState(true);
  const [modal, setModal] = useState('');
  const [mt5Account, setMt5Account] = useState(null);
  const [savedAccount, setSavedAccount] = useState(null);
  const [quotes, setQuotes] = useState({});
  const [historyBySymbol, setHistoryBySymbol] = useState({});
  const [mt5Error, setMt5Error] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [rememberAccount, setRememberAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({ login: '', password: '', server: '', terminalPath: '' });
  const [symbolQuery, setSymbolQuery] = useState('AUDCAD');
  const [symbolResults, setSymbolResults] = useState([]);
  const liveQuote = quotes[selectedSymbol];
  const baseSymbol = selectedSymbol.replace(/[^A-Z].*$/i, '');
  const series = useMemo(() => {
    const bars = historyBySymbol[selectedSymbol]?.[timeframe] || [];
    const values = bars.length
      ? bars.map((bar) => ({ time: new Date(bar.time * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }), price: bar.close }))
      : buildSeries(timeframe, baseSymbol);
    if (liveQuote) values[values.length - 1].price = (liveQuote.bid + liveQuote.ask) / 2;
    return values;
  }, [timeframe, baseSymbol, selectedSymbol, historyBySymbol, liveQuote]);
  const lastPrice = liveQuote ? Number(liveQuote.bid).toFixed(5) : baseSymbol === 'AUDCAD' ? '0.65482' : baseSymbol === 'EURUSD' ? '1.08426' : '1.27194';
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
      setMt5Error('Connect an MT5 account before searching its available instruments.');
      return;
    }
    setMt5Error('');
    try {
      const names = await window.moneyWork.searchMt5Symbols(symbolQuery);
      setSymbolResults(names);
      if (!names.length) setMt5Error(`No MT5 symbols matched “${symbolQuery}”.`);
    } catch (error) {
      setMt5Error(error.message);
    }
  }

  async function connectAccount(event) {
    event?.preventDefault();
    if (!window.moneyWork) {
      setMt5Error('Account connection is available in the installed Windows app, not in the browser preview.');
      return;
    }
    setConnecting(true);
    setMt5Error('');
    try {
      const account = await window.moneyWork.connectMt5({ ...accountForm, remember: rememberAccount });
      setMt5Account(account);
      if (rememberAccount) setSavedAccount({ login: account.login, server: account.server, terminalPath: accountForm.terminalPath });
      setModal('');
      await subscribeInstrument('AUDCAD', true);
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
      setModal('');
      await subscribeInstrument('AUDCAD', true);
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
              <Icon size={17} strokeWidth={1.8} /><span>{t(label)}</span>{count && <b>{count}</b>}
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

        <div className="page-content">
          {mt5Error && mt5Account && <div className="connector-banner"><ShieldCheck size={15} /> {mt5Error}<button onClick={() => setMt5Error('')}>Dismiss</button></div>}
          {activeNav !== 'Overview' && (
            <div className="section-notice"><Sparkles size={16} /> {activeNav} is part of the Money Work workspace. MT5 quotes/account equity are read-only when connected; order execution is disabled in this build.</div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> {todayLabel}</div>
              <h1>{t('Good morning, Alex')} <span className="wave">✦</span></h1>
              <p>{t('Here’s your trading overview for today.')}</p>
            </div>
            <div className="heading-actions">
              <button className="date-button"><Clock3 size={15} /> Last 24 hours <ChevronDown size={14} /></button>
              <button className="export-button" onClick={() => setModal('demo')}><span className="export-spark">✦</span> Demo workspace</button>
            </div>
          </div>

          <section className="metrics-grid">
            <MetricCard label={mt5Account ? t('MT5 account equity') : t('Demo balance')} value={mt5Account ? `${mt5Account.currency} ${Number(mt5Account.equity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$12,845.20'} change={mt5Account ? 'Read-only' : '4.8%'} note={mt5Account ? `Account ${mt5Account.login}` : 'sample · vs. last week'} icon={Wallet} tone="blue" neutral={Boolean(mt5Account)} />
            <MetricCard label={t('Paper P&L')} value="+$284.50" change="2.26%" note="sample simulation" icon={TrendingUp} tone="green" />
            <MetricCard label={t('Demo win rate')} value="64.7%" change="3.2%" note="sample · last 30 trades" icon={Gauge} tone="purple" />
            <MetricCard label={t('Demo max drawdown')} value="1.82%" change="0.4%" note="sample value" icon={ShieldCheck} tone="amber" positive={false} />
          </section>

          <section className="primary-grid">
            <article className="panel chart-panel">
              <div className="panel-heading chart-heading">
                <div className="instrument-title">
                  <div className="pair-icon">{selectedSymbol.slice(0, 2)}</div>
                  <div><div className="pair-name">{selectedSymbol} <ChevronDown size={14} /></div><span>Forex · {mt5Account ? 'Live MT5 feed' : 'Bybit MT5 CFD'} <i className="market-open-dot" /> {mt5Account ? 'Connected' : 'Sample market'}</span></div>
                </div>
                <div className="chart-heading-right">
                  <div className="timeframe-switcher">
                    {['1M', '5M', '15M', '1H'].map((t) => <button key={t} onClick={() => setTimeframe(t)} className={timeframe === t ? 'selected' : ''}>{t}</button>)}
                  </div>
                  <button className="chart-more" aria-label="Chart settings"><Settings2 size={16} /></button>
                </div>
              </div>
              <div className="price-row"><strong>{lastPrice}</strong><span className="price-change">{liveQuote ? 'REAL-TIME TICK' : '+0.00273 (sample)'}</span><span className="price-meta">Bid {liveQuote ? Number(liveQuote.bid).toFixed(5) : '0.65479'} <i /> Ask {liveQuote ? Number(liveQuote.ask).toFixed(5) : '0.65486'}</span></div>
              <div className="chart-legend"><span><i className="legend-line" /> {selectedSymbol}</span><span><i className="legend-ema" /> EMA 20</span><span className="chart-period">Broker time · UTC +0</span></div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 14, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#75a7ff" stopOpacity={0.2} /><stop offset="95%" stopColor="#75a7ff" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid stroke="#252a36" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: '#666e7d', fontSize: 10 }} tickLine={false} axisLine={false} interval={7} />
                    <YAxis orientation="right" domain={['dataMin - 0.00035', 'dataMax + 0.00035']} tick={{ fill: '#666e7d', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => value.toFixed(4)} width={56} />
                    <Tooltip contentStyle={{ background: '#171b25', border: '1px solid #2b3242', borderRadius: 10, color: '#ecf1fa', fontSize: 12 }} formatter={(value) => [Number(value).toFixed(5), selectedSymbol]} labelStyle={{ color: '#8b96a8' }} />
                    <Area type="monotone" dataKey="price" stroke="#78a6ff" strokeWidth={2} fill="url(#priceFill)" activeDot={{ r: 4, fill: '#a6c4ff', stroke: '#10151f', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="chart-live-label"><span /> {lastPrice}</div>
              </div>
              <div className="chart-foot"><span><i className="legend-dot blue-dot" /> {liveQuote ? 'Live MT5 tick · polling every second' : 'Sample price series · illustrative only'}</span><span>{liveQuote ? new Date((liveQuote.time || Date.now() / 1000) * 1000).toLocaleTimeString() : 'Demo data'} <span className="refresh-mark">↻</span></span></div>
            </article>

            <article className="panel insight-panel">
              <div className="panel-heading insight-heading"><div><div className="section-kicker"><Sparkles size={14} /> MARKET PULSE</div><h2>{t('AI market read')}</h2></div><button className="more-button"><MoreHorizontal size={18} /></button></div>
              <div className="signal-block">
                <div className="signal-topline"><span className="signal-neutral"><span /> WAIT</span><span className="signal-sample">SAMPLE</span></div>
                <div className="signal-title">No clear edge yet</div>
                <p className="signal-copy">Price is holding above the short-term average, but momentum is mixed. Waiting for confirmation helps avoid chasing.</p>
                <div className="confidence-row"><span>Signal confidence</span><strong>72%</strong></div>
                <div className="confidence-track"><span style={{ width: '72%' }} /></div>
                <div className="confidence-scale"><span>Low confidence</span><span>High confidence</span></div>
              </div>
              <div className="indicator-list">
                <div><span className="indicator-name"><i className="indicator-bullet violet" /> RSI (14)</span><strong>54.8 <small>Neutral</small></strong></div>
                <div><span className="indicator-name"><i className="indicator-bullet blue" /> EMA trend</span><strong>Upward <small className="positive-text">+0.08%</small></strong></div>
                <div><span className="indicator-name"><i className="indicator-bullet orange" /> Volatility</span><strong>Low <small>Stable</small></strong></div>
              </div>
              <div className="insight-disclaimer"><LockKeyhole size={13} /> Illustrative demo analysis — not a live signal.</div>
            </article>
          </section>

          <section className="secondary-grid">
            <article className="panel watchlist-panel">
              <div className="panel-heading"><div><div className="section-kicker">MARKET WATCH</div><h2>{t('Favorite instruments')}</h2></div><button className="add-small" onClick={() => setModal('instruments')}><Plus size={14} /> Add</button></div>
              <div className="table-head"><span>INSTRUMENT</span><span>LAST PRICE</span><span>24H CHANGE</span><span /></div>
              <div className="instrument-list">
                {symbolRows.map((item) => {
                  const liveEntry = Object.entries(quotes).find(([symbol]) => symbol.toUpperCase().startsWith(item.symbol));
                  const livePrice = liveEntry ? Number(liveEntry[1].bid).toFixed(5) : item.price;
                  return (
                    <button key={item.symbol} className={`instrument-row ${baseSymbol === item.symbol ? 'chosen' : ''}`} onClick={() => mt5Account ? subscribeInstrument(item.symbol) : setSelectedSymbol(item.symbol)}>
                      <span className="instrument-cell"><span className={`currency-icon ${item.symbol}`}>{item.icon}</span><span><strong>{item.symbol}</strong><small>{item.name}</small></span></span>
                      <strong className="row-price">{livePrice}</strong>
                      <span className={`row-change ${item.positive ? 'up' : 'down'}`}>{liveEntry ? 'LIVE' : item.change}</span>
                      <span className="mini-sparkline"><svg viewBox="0 0 80 25" preserveAspectRatio="none"><polyline points={item.positive ? '1,19 12,16 23,18 34,11 45,13 56,7 68,10 79,3' : '1,5 12,8 23,6 34,14 45,11 56,18 68,13 79,22'} /></svg></span>
                    </button>
                  );
                })}
              </div>
              <button className="view-all-button" onClick={() => setActiveNav('Markets')}>View all markets <ArrowUpRight size={14} /></button>
            </article>

            <article className="panel activity-panel">
              <div className="panel-heading"><div><div className="section-kicker">RECENT ACTIVITY</div><h2>{t('Paper trades')}</h2></div><button className="filter-button">Last 7 days <ChevronDown size={13} /></button></div>
              <div className="activity-list">
                {activities.map((item, index) => (
                  <div className="activity-row" key={`${item.pair}-${index}`}>
                    <div className={`activity-direction ${item.side.toLowerCase()}`}>{item.side === 'Buy' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}</div>
                    <div className="activity-main"><strong>{item.pair} <span className={item.positive ? 'buy-text' : 'sell-text'}>{item.side}</span></strong><small>{item.amount} · {item.time}</small></div>
                    <div className="activity-result"><span className={`status-chip ${item.status.includes('open') ? 'open' : ''}`}>{item.status}</span><small className={item.positive ? 'positive-text' : 'negative-text'}>{item.positive ? '+$18.40' : '−$7.25'}</small></div>
                  </div>
                ))}
              </div>
              <button className="view-all-button" onClick={() => setActiveNav('History')}>View activity <ArrowUpRight size={14} /></button>
            </article>
          </section>

          <section className="bottom-grid">
            <article className="panel positions-panel">
              <div className="panel-heading"><div><div className="section-kicker">OPEN POSITIONS</div><h2>{t('Demo positions')} <span className="count-badge">2</span></h2></div><button className="filter-button">All accounts <ChevronDown size={13} /></button></div>
              <div className="position-table-head"><span>INSTRUMENT</span><span>TYPE</span><span>SIZE</span><span>ENTRY</span><span>MARK</span><span>UNREALIZED P&L</span><span /></div>
              <div className="position-row"><div className="position-symbol"><div className="pair-icon mini">AU</div><div><strong>AUDCAD</strong><small>Buy · 15M</small></div></div><span className="position-type buy-type">BUY</span><span>0.08 lot</span><span>0.65296</span><span>0.65482</span><strong className="positive-text">+$14.88</strong><button className="row-more"><MoreHorizontal size={17} /></button></div>
              <div className="position-row"><div className="position-symbol"><div className="pair-icon mini euro">EU</div><div><strong>EURUSD</strong><small>Sell · 1H</small></div></div><span className="position-type sell-type">SELL</span><span>0.05 lot</span><span>1.08502</span><span>1.08426</span><strong className="positive-text">+$3.80</strong><button className="row-more"><MoreHorizontal size={17} /></button></div>
            </article>

            <article className="panel bot-panel">
              <div className="bot-head"><div className="bot-icon"><Zap size={17} fill="currentColor" /></div><div><div className="section-kicker">AUTOMATION</div><h2>{t('Strategy runner')}</h2></div><span className="demo-chip">PAPER</span></div>
              <p className="bot-description">Test your rules on simulated data before connecting a broker.</p>
              <div className="bot-status"><span className={`bot-status-dot ${demoRunning ? 'running' : ''}`} /><span>{demoRunning ? 'Paper simulation running' : 'Simulation is paused'}</span><span className="bot-time">No live orders</span></div>
              <div className="risk-setting"><div><span>Daily loss guard</span><small>Demo limit · $250</small></div><button className={`toggle ${riskEnabled ? 'on' : ''}`} onClick={() => setRiskEnabled(!riskEnabled)} aria-label="Toggle daily risk guard"><i /></button></div>
              <button className={`run-button ${demoRunning ? 'pause' : ''}`} onClick={() => setDemoRunning(!demoRunning)}>{demoRunning ? <><Pause size={15} fill="currentColor" /> {t('Pause demo')}</> : <><Play size={15} fill="currentColor" /> {t('Start paper simulation')}</>}</button>
              <div className="live-lock"><LockKeyhole size={12} /> Live trading is not enabled in this build</div>
            </article>
          </section>

          <footer className="footer-note"><span><ShieldCheck size={13} /> {mt5Account ? 'MT5 quotes live · AI readout and positions remain sample data.' : 'Demo only · Numbers and charts are illustrative, not live market data.'}</span><span>Money Work <b>v{packageJson.version}</b><i /> Built for focused trading</span></footer>
        </div>
      </main>

      {modal && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModal('')}>
        <div className={`modal-card ${modal === 'connect' ? 'account-modal' : ''}`}>
          <button className="modal-close" onClick={() => setModal('')}><X size={17} /></button>
          <div className="modal-icon"><LockKeyhole size={20} /></div>
          {modal === 'connect' ? <>
            <span className="section-kicker">READ-ONLY MT5 CONNECTION</span>
            <h2>{mt5Account ? 'Account connected' : t('Add Bybit MT5 account')}</h2>
            {mt5Account ? <>
              <p>Connected to <strong>{mt5Account.server}</strong> as account <strong>{mt5Account.login}</strong>. Money Work reads equity and quotes only; no orders can be sent.</p>
              <div className="account-summary"><span>Equity</span><strong>{mt5Account.currency} {Number(mt5Account.equity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><span>Leverage</span><strong>1:{mt5Account.leverage}</strong></div>
              <div className="modal-actions"><button className="modal-secondary" onClick={() => setModal('')}>Close</button><button className="modal-danger" onClick={disconnectAccount}>Disconnect</button></div>
            </> : <>
              <p>Use the MT5 account login, password, and exact server shown in MetaTrader 5. Demo accounts are supported: use your demo login and demo server. For Bybit CFD this is the MT5 account, not your Bybit website password. Credentials stay in the local read-only connector.</p>
              <form className="account-form" onSubmit={connectAccount}>
                <label>MT5 account number<input autoComplete="username" inputMode="numeric" value={accountForm.login} onChange={(event) => setAccountForm({ ...accountForm, login: event.target.value })} placeholder="Account login" required /></label>
                <label>MT5 server<input value={accountForm.server} onChange={(event) => setAccountForm({ ...accountForm, server: event.target.value })} placeholder="Exact demo or live server shown in MT5" required /></label>
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
