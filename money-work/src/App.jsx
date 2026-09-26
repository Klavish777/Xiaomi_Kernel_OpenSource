import { useMemo, useState } from 'react';
import packageJson from '../package.json';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, ChevronDown, CircleHelp,
  Clock3, Command, CreditCard, Gauge, LayoutDashboard, LockKeyhole,
  MoreHorizontal, Pause, Play, Plus, Search, Settings2, ShieldCheck,
  Sparkles, TrendingUp, Wallet, X, Zap,
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

function MetricCard({ label, value, change, icon: Icon, tone, positive = true, note }) {
  return (
    <article className="metric-card panel">
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <IconTile tone={tone}><Icon size={17} strokeWidth={1.8} /></IconTile>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottom">
        <span className={`metric-change ${positive ? 'up' : 'down'}`}>
          {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{change}
        </span>
        <span className="metric-note">{note}</span>
      </div>
    </article>
  );
}

function App() {
  const [timeframe, setTimeframe] = useState('15M');
  const [activeNav, setActiveNav] = useState('Overview');
  const [selectedSymbol, setSelectedSymbol] = useState('AUDCAD');
  const [demoRunning, setDemoRunning] = useState(false);
  const [riskEnabled, setRiskEnabled] = useState(true);
  const [modal, setModal] = useState('');
  const series = useMemo(() => buildSeries(timeframe, selectedSymbol), [timeframe, selectedSymbol]);
  const lastPrice = selectedSymbol === 'AUDCAD' ? '0.65482' : selectedSymbol === 'EURUSD' ? '1.08426' : '1.27194';
  const todayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase();

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
          <div className="workspace-copy"><strong>My workspace</strong><span>Personal account</span></div>
          <ChevronDown size={15} className="muted-icon" />
        </div>

        <div className="nav-caption">WORKSPACE</div>
        <nav className="main-nav">
          {navItems.map(({ label, icon: Icon, count }) => (
            <button key={label} onClick={() => setActiveNav(label)} className={`nav-item ${activeNav === label ? 'active' : ''}`}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{count && <b>{count}</b>}
            </button>
          ))}
        </nav>

        <div className="nav-caption tools-caption">TOOLS</div>
        <nav className="main-nav">
          <button onClick={() => setActiveNav('Risk controls')} className={`nav-item ${activeNav === 'Risk controls' ? 'active' : ''}`}><ShieldCheck size={17} /><span>Risk controls</span><span className="nav-dot" /></button>
          <button onClick={() => setActiveNav('Reports')} className={`nav-item ${activeNav === 'Reports' ? 'active' : ''}`}><Activity size={17} /><span>Reports</span></button>
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
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{activeNav}</strong></div>
          <div className="topbar-actions">
            <div className="environment-pill"><span className="pulse-dot" /> PAPER MODE</div>
            <button className="connect-button" onClick={() => setModal('connect')}><Plus size={15} /> Connect account</button>
            <button className="top-icon" aria-label="Search"><Search size={17} /></button>
            <button className="top-icon notification-button" aria-label="Notifications"><Bell size={17} /><i /></button>
            <div className="top-divider" />
            <div className="top-user-avatar">AM</div>
          </div>
        </header>

        <div className="page-content">
          {activeNav !== 'Overview' && (
            <div className="section-notice"><Sparkles size={16} /> {activeNav} is part of the Money Work workspace. This first build is a demo dashboard; no broker connection or live order execution is enabled.</div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> {todayLabel}</div>
              <h1>Good morning, Alex <span className="wave">✦</span></h1>
              <p>Here’s your trading overview for today.</p>
            </div>
            <div className="heading-actions">
              <button className="date-button"><Clock3 size={15} /> Last 24 hours <ChevronDown size={14} /></button>
              <button className="export-button" onClick={() => setModal('demo')}><span className="export-spark">✦</span> Demo workspace</button>
            </div>
          </div>

          <section className="metrics-grid">
            <MetricCard label="Demo balance" value="$12,845.20" change="4.8%" note="vs. last week" icon={Wallet} tone="blue" />
            <MetricCard label="Today's P&L" value="+$284.50" change="2.26%" note="paper results" icon={TrendingUp} tone="green" />
            <MetricCard label="Win rate" value="64.7%" change="3.2%" note="last 30 trades" icon={Gauge} tone="purple" />
            <MetricCard label="Max drawdown" value="1.82%" change="0.4%" note="within your limit" icon={ShieldCheck} tone="amber" positive={false} />
          </section>

          <section className="primary-grid">
            <article className="panel chart-panel">
              <div className="panel-heading chart-heading">
                <div className="instrument-title">
                  <div className="pair-icon">{selectedSymbol.slice(0, 2)}</div>
                  <div><div className="pair-name">{selectedSymbol} <ChevronDown size={14} /></div><span>Forex · Bybit MT5 CFD <i className="market-open-dot" /> Market open</span></div>
                </div>
                <div className="chart-heading-right">
                  <div className="timeframe-switcher">
                    {['1M', '5M', '15M', '1H'].map((t) => <button key={t} onClick={() => setTimeframe(t)} className={timeframe === t ? 'selected' : ''}>{t}</button>)}
                  </div>
                  <button className="chart-more" aria-label="Chart settings"><Settings2 size={16} /></button>
                </div>
              </div>
              <div className="price-row"><strong>{lastPrice}</strong><span className="price-change">+0.00273 <b>(+0.42%)</b></span><span className="price-meta">Bid 0.65479 <i /> Ask 0.65486</span></div>
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
              <div className="chart-foot"><span><i className="legend-dot blue-dot" /> Sample price series · illustrative only</span><span>Updated just now <span className="refresh-mark">↻</span></span></div>
            </article>

            <article className="panel insight-panel">
              <div className="panel-heading insight-heading"><div><div className="section-kicker"><Sparkles size={14} /> MARKET PULSE</div><h2>AI market read</h2></div><button className="more-button"><MoreHorizontal size={18} /></button></div>
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
              <div className="panel-heading"><div><div className="section-kicker">MARKET WATCH</div><h2>Favorite instruments</h2></div><button className="add-small" onClick={() => setModal('instruments')}><Plus size={14} /> Add</button></div>
              <div className="table-head"><span>INSTRUMENT</span><span>LAST PRICE</span><span>24H CHANGE</span><span /></div>
              <div className="instrument-list">
                {symbolRows.map((item) => (
                  <button key={item.symbol} className={`instrument-row ${selectedSymbol === item.symbol ? 'chosen' : ''}`} onClick={() => setSelectedSymbol(item.symbol)}>
                    <span className="instrument-cell"><span className={`currency-icon ${item.symbol}`}>{item.icon}</span><span><strong>{item.symbol}</strong><small>{item.name}</small></span></span>
                    <strong className="row-price">{item.price}</strong>
                    <span className={`row-change ${item.positive ? 'up' : 'down'}`}>{item.change}</span>
                    <span className="mini-sparkline"><svg viewBox="0 0 80 25" preserveAspectRatio="none"><polyline points={item.positive ? '1,19 12,16 23,18 34,11 45,13 56,7 68,10 79,3' : '1,5 12,8 23,6 34,14 45,11 56,18 68,13 79,22'} /></svg></span>
                  </button>
                ))}
              </div>
              <button className="view-all-button" onClick={() => setActiveNav('Markets')}>View all markets <ArrowUpRight size={14} /></button>
            </article>

            <article className="panel activity-panel">
              <div className="panel-heading"><div><div className="section-kicker">RECENT ACTIVITY</div><h2>Paper trades</h2></div><button className="filter-button">Last 7 days <ChevronDown size={13} /></button></div>
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
              <div className="panel-heading"><div><div className="section-kicker">OPEN POSITIONS</div><h2>Demo positions <span className="count-badge">2</span></h2></div><button className="filter-button">All accounts <ChevronDown size={13} /></button></div>
              <div className="position-table-head"><span>INSTRUMENT</span><span>TYPE</span><span>SIZE</span><span>ENTRY</span><span>MARK</span><span>UNREALIZED P&L</span><span /></div>
              <div className="position-row"><div className="position-symbol"><div className="pair-icon mini">AU</div><div><strong>AUDCAD</strong><small>Buy · 15M</small></div></div><span className="position-type buy-type">BUY</span><span>0.08 lot</span><span>0.65296</span><span>0.65482</span><strong className="positive-text">+$14.88</strong><button className="row-more"><MoreHorizontal size={17} /></button></div>
              <div className="position-row"><div className="position-symbol"><div className="pair-icon mini euro">EU</div><div><strong>EURUSD</strong><small>Sell · 1H</small></div></div><span className="position-type sell-type">SELL</span><span>0.05 lot</span><span>1.08502</span><span>1.08426</span><strong className="positive-text">+$3.80</strong><button className="row-more"><MoreHorizontal size={17} /></button></div>
            </article>

            <article className="panel bot-panel">
              <div className="bot-head"><div className="bot-icon"><Zap size={17} fill="currentColor" /></div><div><div className="section-kicker">AUTOMATION</div><h2>Strategy runner</h2></div><span className="demo-chip">PAPER</span></div>
              <p className="bot-description">Test your rules on simulated data before connecting a broker.</p>
              <div className="bot-status"><span className={`bot-status-dot ${demoRunning ? 'running' : ''}`} /><span>{demoRunning ? 'Paper simulation running' : 'Simulation is paused'}</span><span className="bot-time">No live orders</span></div>
              <div className="risk-setting"><div><span>Daily loss guard</span><small>Demo limit · $250</small></div><button className={`toggle ${riskEnabled ? 'on' : ''}`} onClick={() => setRiskEnabled(!riskEnabled)} aria-label="Toggle daily risk guard"><i /></button></div>
              <button className={`run-button ${demoRunning ? 'pause' : ''}`} onClick={() => setDemoRunning(!demoRunning)}>{demoRunning ? <><Pause size={15} fill="currentColor" /> Pause demo</> : <><Play size={15} fill="currentColor" /> Start paper simulation</>}</button>
              <div className="live-lock"><LockKeyhole size={12} /> Live trading is not enabled in this build</div>
            </article>
          </section>

          <footer className="footer-note"><span><ShieldCheck size={13} /> Demo only · Numbers and charts are illustrative, not live market data.</span><span>Money Work <b>v{packageJson.version}</b><i /> Built for focused trading</span></footer>
        </div>
      </main>

      {modal && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModal('')}>
        <div className="modal-card">
          <button className="modal-close" onClick={() => setModal('')}><X size={17} /></button>
          <div className="modal-icon"><LockKeyhole size={20} /></div>
          <span className="section-kicker">SAFE DEMO MODE</span>
          <h2>{modal === 'connect' ? 'Broker connection comes later' : modal === 'instruments' ? 'Instrument watchlist' : 'Demo workspace'}</h2>
          <p>{modal === 'connect'
            ? 'This first dashboard is intentionally disconnected. We will add a secure Bybit MT5 CFD connector after the paper-trading flow and risk controls are validated. Do not enter account credentials here.'
            : modal === 'instruments'
              ? 'The current watchlist is illustrative. Broker symbols and market data will be loaded from the account connector in a later version.'
              : 'All balances, signals and positions shown here are sample data. The simulation does not send orders or connect to a trading account.'}</p>
          <div className="modal-actions"><button className="modal-secondary" onClick={() => setModal('')}>Close</button><button className="modal-primary" onClick={() => { setModal(''); setActiveNav('Risk controls'); }}>Review safety panel</button></div>
        </div>
      </div>}
    </div>
  );
}

export default App;
