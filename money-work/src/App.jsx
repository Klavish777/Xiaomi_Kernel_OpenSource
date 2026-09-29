import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CandlestickChart, CircleX, LoaderCircle, RefreshCw, Settings, ShieldCheck, X } from 'lucide-react';
import { mergeHistoryBars, mergeMarketTick, mergeTickIntoBars } from './chartUtils.mjs';
import './manual.css';
import './positions.css';
import './action-controls.css';
import './account-summary.css';
import './market-analyst.css';

const SYMBOL_PREFIX = 'AUDCAD';
const TIMEFRAME = '15M';
const QUOTE_FRESH_MS = 30000;

function price(value, digits = 5) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
}

function cash(value, currency = '') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `${amount > 0 ? '+' : ''}${amount.toFixed(2)} ${currency}`.trim();
}

function accountMoney(value, currency = '') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${currency}`.trim();
}

function PriceChart({ bars, symbol }) {
  const visible = useMemo(() => bars.slice(-120), [bars]);
  const width = 1200;
  const height = 700;
  const pad = { top: 26, right: 82, bottom: 36, left: 12 };
  if (!visible.length) return <div className="chart-empty"><CandlestickChart size={34} /><span>{symbol ? 'Загрузка графика MT5…' : 'Подключите MT5 в настройках, чтобы открыть график'}</span></div>;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const all = visible.flatMap((bar) => [Number(bar.high), Number(bar.low)]);
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (max === min) { max += 0.0001; min -= 0.0001; }
  const y = (value) => pad.top + (max - Number(value)) / (max - min) * plotH;
  const step = plotW / visible.length;
  const x = (index) => pad.left + (index + 0.5) * step;
  const digits = /JPY/i.test(symbol) ? 3 : 5;
  return <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`График ${symbol}, ${TIMEFRAME}`}>
    {[0, 1, 2, 3, 4].map((index) => {
      const value = max - (max - min) * index / 4;
      const yPos = pad.top + plotH * index / 4;
      return <g key={index}><line x1={pad.left} x2={width - pad.right + 8} y1={yPos} y2={yPos} className="chart-grid" /><text x={width - pad.right + 14} y={yPos + 4} className="chart-axis">{price(value, digits)}</text></g>;
    })}
    {visible.map((bar, index) => {
      const rising = Number(bar.close) >= Number(bar.open);
      const candleWidth = Math.max(2, Math.min(12, step * 0.62));
      const top = y(Math.max(Number(bar.open), Number(bar.close)));
      const bottom = y(Math.min(Number(bar.open), Number(bar.close)));
      return <g key={`${bar.time}-${index}`} className={rising ? 'candle-rise' : 'candle-fall'}><title>{new Date(Number(bar.time) * 1000).toLocaleString()} · O {price(bar.open, digits)} H {price(bar.high, digits)} L {price(bar.low, digits)} C {price(bar.close, digits)}</title><line x1={x(index)} x2={x(index)} y1={y(bar.high)} y2={y(bar.low)} stroke="currentColor" /><rect x={x(index) - candleWidth / 2} y={top} width={candleWidth} height={Math.max(1, bottom - top)} fill="currentColor" /></g>;
    })}
    <text x={pad.left + 4} y={height - 7} className="chart-axis">{new Date(Number(visible[0].time) * 1000).toLocaleString()}</text>
    <text x={width - pad.right} y={height - 7} className="chart-axis" textAnchor="end">{new Date(Number(visible.at(-1).time) * 1000).toLocaleString()}</text>
  </svg>;
}

export default function App() {
  const [account, setAccount] = useState(null);
  const [savedAccount, setSavedAccount] = useState(null);
  const [symbol, setSymbol] = useState('');
  const [quote, setQuote] = useState(null);
  const [bars, setBars] = useState([]);
  const [positions, setPositions] = useState([]);
  const [positionsBusy, setPositionsBusy] = useState(false);
  const [positionsError, setPositionsError] = useState('');
  const [modal, setModal] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [form, setForm] = useState({ login: '', password: '', server: '', remember: true });
  const [liveText, setLiveText] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [marketAnalystStatus, setMarketAnalystStatus] = useState({ checking: true, configured: false, model: 'gpt-5-mini' });
  const [marketAnalystKeyInput, setMarketAnalystKeyInput] = useState('');
  const [marketAnalystKeyBusy, setMarketAnalystKeyBusy] = useState(false);
  const [marketAnalysisBusy, setMarketAnalysisBusy] = useState(false);
  const [marketAnalysisError, setMarketAnalysisError] = useState('');
  const [marketAnalysisReport, setMarketAnalysisReport] = useState(null);
  const marketAnalysisLock = useRef(false);
  const observedMarketBarRef = useRef('');
  const pendingAutomaticBarRef = useRef('');
  const lastAnalyzedMarketBarRef = useRef('');
  const actionBusyRef = useRef(false);
  const [now, setNow] = useState(Date.now());
  const symbolRef = useRef(symbol);
  const quoteRef = useRef(null);
  const accountRef = useRef(null);
  const syncLock = useRef(false);
  const positionsLock = useRef(false);
  const historyLock = useRef(false);
  const pendingHistoryRef = useRef(null);
  const startupPromiseRef = useRef(null);

  useEffect(() => { symbolRef.current = symbol; }, [symbol]);
  useEffect(() => { accountRef.current = account; }, [account]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const statusPromise = window.moneyWork?.getMarketAnalystStatus?.();
    if (!statusPromise) {
      setMarketAnalystStatus({ checking: false, configured: false, model: 'gpt-5-mini' });
      return () => { active = false; };
    }
    statusPromise.then((status) => {
      if (active) setMarketAnalystStatus({ checking: false, ...status });
    }).catch(() => {
      if (active) setMarketAnalystStatus({ checking: false, configured: false, model: 'gpt-5-mini' });
    });
    return () => { active = false; };
  }, []);

  const syncAccount = useCallback(async () => {
    if (!window.moneyWork || syncLock.current) return;
    syncLock.current = true;
    try {
      const fresh = await window.moneyWork.getMt5Account();
      accountRef.current = fresh;
      setAccount((current) => {
        if (!current) return fresh;
        const visibleAccountFields = ['accountType', 'login', 'server', 'currency', 'balance', 'equity', 'margin', 'tradeAllowed', 'terminalTradeAllowed', 'algorithmicTradingAllowed'];
        return visibleAccountFields.some((key) => current[key] !== fresh[key]) ? fresh : current;
      });
    } catch (reason) {
      setError(reason?.message || String(reason));
    } finally { syncLock.current = false; }
  }, []);

  const syncPositions = useCallback(async () => {
    if (!window.moneyWork || positionsLock.current || !accountRef.current) return;
    positionsLock.current = true;
    setPositionsBusy(true);
    try {
      const rows = await window.moneyWork.getMt5Positions();
      setPositions(Array.isArray(rows) ? rows : []);
      setPositionsError('');
    } catch (reason) {
      setPositionsError(reason?.message || String(reason));
    } finally {
      positionsLock.current = false;
      setPositionsBusy(false);
    }
  }, []);

  const loadHistory = useCallback(async (selectedSymbol = symbolRef.current, initial = false) => {
    if (!window.moneyWork) return;
    if (historyLock.current) {
      if (initial) pendingHistoryRef.current = { symbol: selectedSymbol, initial: true };
      return;
    }
    historyLock.current = true;
    try {
      const nextBars = await window.moneyWork.getMt5History(selectedSymbol, initial ? 2000 : 3);
      if (String(selectedSymbol).toUpperCase() === String(symbolRef.current).toUpperCase()) {
        setBars((current) => initial ? mergeHistoryBars([], nextBars, 2000) : mergeHistoryBars(current, nextBars, 2000));
        setError('');
      }
    } catch (reason) {
      if (String(selectedSymbol).toUpperCase() === String(symbolRef.current).toUpperCase()) setError(reason?.message || String(reason));
    } finally {
      historyLock.current = false;
      const pending = pendingHistoryRef.current;
      if (pending) {
        pendingHistoryRef.current = null;
        loadHistory(pending.symbol, pending.initial);
      }
    }
  }, []);

  const acceptConnectedAccount = useCallback(async (nextAccount) => {
    setError('');
    const matches = await window.moneyWork.searchMt5Symbols(SYMBOL_PREFIX);
    const symbols = (matches || []).filter((name) => /^AUDCAD/i.test(name));
    if (!symbols.length) throw new Error('На счёте MT5 не найден символ AUDCAD.');
    const chosen = symbols.find((name) => name.toUpperCase() === SYMBOL_PREFIX) || symbols[0];
    const nextQuote = await window.moneyWork.subscribeMt5Symbol(chosen);
    accountRef.current = nextAccount;
    setAccount(nextAccount);
    symbolRef.current = chosen;
    setSymbol(chosen);
    quoteRef.current = { ...nextQuote, receivedAt: Date.now() };
    setQuote(quoteRef.current);
    setBars([]);
    await syncAccount();
    await Promise.all([loadHistory(chosen, true), syncPositions()]);
  }, [loadHistory, syncAccount, syncPositions]);

  const acceptConnectedAccountRef = useRef(acceptConnectedAccount);
  useEffect(() => { acceptConnectedAccountRef.current = acceptConnectedAccount; }, [acceptConnectedAccount]);

  useEffect(() => {
    if (!window.moneyWork) return undefined;
    let active = true;
    const unsubscribe = window.moneyWork.onMt5Event((event) => {
      if (!active || event?.type !== 'tick' || String(event.symbol).toUpperCase() !== String(symbolRef.current).toUpperCase()) return;
      const next = mergeMarketTick(quoteRef.current, event, Date.now());
      quoteRef.current = next;
      setQuote(next);
      setBars((current) => mergeTickIntoBars(current, next, TIMEFRAME));
    });
    if (!startupPromiseRef.current) {
      startupPromiseRef.current = window.moneyWork.getSavedMt5Account().then(async (saved) => {
        if (!saved) return { saved: null, account: null };
        return { saved, account: await window.moneyWork.connectSavedMt5() };
      });
    }
    startupPromiseRef.current.then(async ({ saved, account: nextAccount }) => {
      if (!active) return;
      setSavedAccount(saved);
      if (nextAccount) await acceptConnectedAccountRef.current(nextAccount);
    }).catch((reason) => active && setError(reason?.message || String(reason)));
    return () => { active = false; unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (!account) return undefined;
    const accountTimer = setInterval(syncAccount, 100);
    const historyTimer = setInterval(() => loadHistory(symbol, false), 1000);
    const positionsTimer = setInterval(syncPositions, 1000);
    return () => { clearInterval(accountTimer); clearInterval(historyTimer); clearInterval(positionsTimer); };
  }, [account !== null, loadHistory, symbol, syncAccount, syncPositions]);

  const quoteFresh = Boolean(quote && Number(quote.bid) > 0 && Number(quote.ask) > 0 && now - Number(quote.receivedAt) <= QUOTE_FRESH_MS);
  const income = useMemo(() => positions.reduce((total, position) => total + Number(position.netProfit || 0), 0), [positions]);
  const digits = /JPY/i.test(symbol) ? 3 : 5;

  useEffect(() => {
    const latestBar = bars.at(-1);
    if (!account || !symbol || !latestBar) return;
    const currentBarKey = `${symbol}:${latestBar.time}`;
    if (!observedMarketBarRef.current) {
      observedMarketBarRef.current = currentBarKey;
      return;
    }
    if (observedMarketBarRef.current !== currentBarKey) {
      observedMarketBarRef.current = currentBarKey;
      pendingAutomaticBarRef.current = currentBarKey;
    }
    if (pendingAutomaticBarRef.current !== currentBarKey) return;
    if (lastAnalyzedMarketBarRef.current === currentBarKey) {
      pendingAutomaticBarRef.current = '';
      return;
    }
    if (!marketAnalystStatus.configured || !quoteFresh || marketAnalysisBusy) return;
    pendingAutomaticBarRef.current = '';
    lastAnalyzedMarketBarRef.current = currentBarKey;
    void runMarketAnalysis({ automatic: true });
  }, [account?.login, bars.at(-1)?.time, marketAnalystStatus.configured, marketAnalysisBusy, quoteFresh, symbol]);

  function openSettings() {
    setError('');
    setModal('settings');
  }

  async function refreshMarketAnalystStatus() {
    setMarketAnalystStatus((current) => ({ ...current, checking: true }));
    try {
      const status = await window.moneyWork?.getMarketAnalystStatus?.();
      setMarketAnalystStatus({ checking: false, ...(status || { configured: false, model: 'gpt-5-mini' }) });
    } catch (_) {
      setMarketAnalystStatus({ checking: false, configured: false, model: 'gpt-5-mini' });
    }
  }

  async function openMarketAnalystKeyPage() {
    try { await window.moneyWork?.openMarketAnalystKeyPage?.(); }
    catch (_) { setMarketAnalysisError('Создайте ключ вручную: platform.openai.com/api-keys'); }
  }

  async function saveMarketAnalystKey() {
    if (marketAnalystKeyBusy || !marketAnalystKeyInput.trim()) return;
    setMarketAnalystKeyBusy(true);
    setMarketAnalysisError('');
    try {
      const result = await window.moneyWork?.saveMarketAnalystKey?.(marketAnalystKeyInput);
      if (!result?.ok) { setMarketAnalysisError(result?.error || 'Не удалось сохранить ключ.'); return; }
      setMarketAnalystKeyInput('');
      await refreshMarketAnalystStatus();
    } catch (reason) { setMarketAnalysisError(reason?.message || 'Не удалось сохранить API key.'); }
    finally { setMarketAnalystKeyBusy(false); }
  }

  async function deleteMarketAnalystKey() {
    if (marketAnalystKeyBusy) return;
    setMarketAnalystKeyBusy(true);
    try {
      const result = await window.moneyWork?.deleteMarketAnalystKey?.();
      if (!result?.ok) { setMarketAnalysisError(result?.error || 'Не удалось удалить ключ.'); return; }
      setMarketAnalystStatus((current) => ({ ...current, configured: false }));
      setMarketAnalysisReport(null);
      setMarketAnalysisError('OpenAI API key удалён.');
    } catch (reason) { setMarketAnalysisError(reason?.message || 'Не удалось удалить API key.'); }
    finally { setMarketAnalystKeyBusy(false); }
  }

  async function runMarketAnalysis({ automatic = false } = {}) {
    if (marketAnalysisLock.current || !symbol) return;
    marketAnalysisLock.current = true;
    setMarketAnalysisBusy(true);
    setMarketAnalysisError('');
    setMarketAnalysisReport(null);
    try {
      if (!quoteFresh) { setMarketAnalysisError('Котировка MT5 устарела. Дождитесь свежего тика.'); return; }
      const result = await window.moneyWork?.analyzeMarket?.({ symbol, quoteReceivedAt: quote?.receivedAt });
      if (!result?.ok) { setMarketAnalysisError(result?.error || 'Не удалось получить аналитический сигнал.'); return; }
      setMarketAnalysisReport({ ...result.report, automatic });
    } catch (reason) { setMarketAnalysisError(reason?.message || 'Не удалось получить аналитический сигнал.'); }
    finally {
      marketAnalysisLock.current = false;
      setMarketAnalysisBusy(false);
    }
  }

  async function connectMt5(event) {
    event.preventDefault();
    if (!window.moneyWork) { setError('Подключение к MT5 доступно в установленном приложении Money Work.'); return; }
    setSettingsBusy(true);
    setError('');
    try {
      const nextAccount = await window.moneyWork.connectMt5(form);
      setSavedAccount(form.remember ? { login: form.login, server: form.server } : null);
      await acceptConnectedAccount(nextAccount);
      setForm((current) => ({ ...current, password: '' }));
      setModal('');
    } catch (reason) { setError(reason?.message || String(reason)); }
    finally { setSettingsBusy(false); }
  }

  async function reconnectSavedAccount() {
    setSettingsBusy(true);
    setError('');
    try {
      const nextAccount = await window.moneyWork.connectSavedMt5();
      await acceptConnectedAccount(nextAccount);
      setModal('');
    } catch (reason) { setError(reason?.message || String(reason)); }
    finally { setSettingsBusy(false); }
  }

  async function disconnectMt5() {
    try { await window.moneyWork?.disconnectMt5(); } catch (reason) { setError(reason?.message || String(reason)); }
    accountRef.current = null;
    quoteRef.current = null;
    symbolRef.current = '';
    setAccount(null); setQuote(null); setSymbol(''); setBars([]); setPositions([]);
  }

  async function sendManualOrder(side, liveConfirmed = false) {
    if (!account || !symbol || actionBusyRef.current) return false;
    if (!quoteFresh) {
      setActionError('Свежая котировка MT5 недоступна. Ордер не отправлен.');
      return false;
    }
    if (account.accountType === 'real' && !liveConfirmed) return false;
    actionBusyRef.current = true;
    setActionBusy(true);
    setActionError('');
    try {
      const result = await window.moneyWork.placeMt5ManualOrder({
        symbol, side, confirmed: true, liveConfirmed,
      });
      setNotice(`Ордер отправлен: ${result.side} ${result.volume} ${result.symbol} · ${price(result.entry, digits)}`);
      window.setTimeout(() => setNotice(''), 4000);
      await Promise.all([syncAccount(), syncPositions()]);
      return true;
    } catch (reason) {
      setActionError(reason?.message || String(reason));
      return false;
    } finally {
      actionBusyRef.current = false;
      setActionBusy(false);
    }
  }

  function beginOrder(side) {
    setActionError('');
    setNotice('');
    if (!window.moneyWork) { openSettings(); setActionError('Подключение к MT5 доступно в установленном приложении Money Work.'); return; }
    if (!account || !symbol) { openSettings(); return; }
    if (account.accountType === 'real') {
      setLiveText('');
      setPendingAction({ type: 'open', side });
      return;
    }
    setPendingAction(null);
    void sendManualOrder(side);
  }

  async function sendPositionClose(position, liveConfirmed = false) {
    if (!account || !position || actionBusyRef.current) return false;
    if (account.accountType === 'real' && !liveConfirmed) return false;
    actionBusyRef.current = true;
    setActionBusy(true);
    setActionError('');
    try {
      const result = await window.moneyWork.closeMt5Position({
        ticket: position.ticket,
        symbol: position.symbol,
        side: position.side,
        volume: position.volume,
        confirmed: true,
        liveConfirmed,
      });
      setNotice(`Позиция закрыта: ${result.side} ${result.volume} ${result.symbol}`);
      window.setTimeout(() => setNotice(''), 5000);
      await Promise.all([syncAccount(), syncPositions()]);
      return true;
    } catch (reason) {
      setActionError(reason?.message || String(reason));
      return false;
    } finally {
      actionBusyRef.current = false;
      setActionBusy(false);
    }
  }

  function beginClosePosition(position) {
    setActionError('');
    setNotice('');
    if (!account) { openSettings(); return; }
    if (account.accountType === 'real') {
      setLiveText('');
      setPendingAction({ type: 'close', position });
      return;
    }
    setPendingAction(null);
    void sendPositionClose(position);
  }

  async function submitLiveAction(event) {
    event.preventDefault();
    if (!pendingAction || actionBusyRef.current || liveText.trim() !== 'LIVE') return;
    const succeeded = pendingAction.type === 'open'
      ? await sendManualOrder(pendingAction.side, true)
      : await sendPositionClose(pendingAction.position, true);
    if (succeeded) {
      setPendingAction(null);
      setLiveText('');
    }
  }

  function cancelLiveAction() {
    if (actionBusy) return;
    setPendingAction(null);
    setLiveText('');
  }

  return <main className="mw-app">
    <button className="settings-button" type="button" onClick={openSettings} aria-label="Настройки MT5" title="Настройки MT5"><Settings size={20} /></button>
    <section className="dashboard-top">
      <section className="chart-area" aria-label="График MT5">
        <span className="chart-symbol">{symbol || 'AUDCAD'} · {TIMEFRAME}</span>
        <PriceChart bars={bars} symbol={symbol} />
      </section>
      <aside className="account-summary" aria-label="Баланс аккаунта">
        <div className="summary-heading"><strong>АККАУНТ</strong><span className={account?.accountType === 'real' ? 'live-badge' : 'demo-badge'}>{account ? account.accountType.toUpperCase() : 'MT5'}</span></div>
        <div className="summary-metric"><span>Всего на балансе</span><strong>{account ? accountMoney(account.balance, account.currency) : '—'}</strong></div>
        <div className="summary-metric"><span>Заложено в работу</span><strong>{account ? accountMoney(account.margin, account.currency) : '—'}</strong><small>Маржа MT5</small></div>
        <div className="summary-metric"><span>Доход</span><strong className={income < 0 ? 'income-negative' : 'income-positive'}>{account ? cash(income, account.currency) : '—'}</strong><small>Плавающий P/L открытых сделок</small></div>
        {!account && <div className="summary-connect">Подключите MT5, чтобы увидеть показатели счёта.</div>}
      </aside>
    </section>
    <section className="positions-panel" aria-label="Открытые сделки MT5">
      <div className="positions-heading">
        <div><strong>Открытые сделки</strong><span>{account ? `${positions.length} · ${account.currency || 'валюта счёта'}` : 'Подключите MT5'}</span></div>
        {account && <button className="positions-refresh" type="button" aria-label="Обновить открытые сделки" title="Обновить" disabled={positionsBusy} onClick={syncPositions}><RefreshCw size={15} className={positionsBusy ? 'spin' : ''} /></button>}
      </div>
      {positionsError && <div className="positions-status error-text" role="alert">{positionsError}</div>}
      {!account && <div className="positions-status">Открытые позиции появятся после подключения счёта MT5.</div>}
      {account && positions.length === 0 && !positionsError && <div className="positions-status">{positionsBusy ? 'Загрузка…' : 'Открытых сделок нет.'}</div>}
      {positions.length > 0 && <div className="positions-scroll">
        <div className="positions-row positions-columns" aria-hidden="true"><span>Инструмент</span><span>Направление</span><span>Объём</span><span>Плавающий P/L</span><span /></div>
        {positions.map((position) => <div className="positions-row" key={position.ticket}>
          <span className="position-symbol"><strong>{position.symbol}</strong><small>#{position.ticket}</small></span>
          <span className={`position-side ${position.side === 'BUY' ? 'buy-text' : 'sell-text'}`}>{position.side}</span>
          <span>{Number(position.volume).toFixed(2)}</span>
          <span className={Number(position.netProfit) < 0 ? 'sell-text' : 'buy-text'}>{cash(position.netProfit, account?.currency)}</span>
          <button className="close-position-button" type="button" disabled={actionBusy || Boolean(pendingAction)} onClick={() => beginClosePosition(position)} aria-label={`Закрыть ${position.side} ${position.symbol}, позиция ${position.ticket}`}><CircleX size={15} /> Закрыть</button>
        </div>)}
      </div>}
    </section>
    <section className="market-analyst-panel" aria-label="Интернет-аналитик рынка">
      <div className="market-analyst-heading">
        <div><strong>Интернет-аналитик рынка</strong><span>LangGraph · авто на новой M15-свече · не чаще 1 раза в минуту · RSS-кэш 60 с</span></div>
        <span className="market-analyst-badge">AUDCAD · M15</span>
      </div>
      <div className="market-analyst-key-row">
        <span className={marketAnalystStatus.configured ? 'analyst-key-ready' : 'analyst-key-missing'}>{marketAnalystStatus.checking ? 'Проверка API key…' : marketAnalystStatus.configured ? `OpenAI API настроен · ${marketAnalystStatus.model}` : 'Добавьте OpenAI API key для анализа'}</span>
        <input type="password" autoComplete="new-password" spellCheck="false" aria-label="OpenAI API key для аналитика" value={marketAnalystKeyInput} onChange={(event) => setMarketAnalystKeyInput(event.target.value)} placeholder="sk-…" />
        <button type="button" disabled={marketAnalystKeyBusy || !marketAnalystKeyInput.trim()} onClick={saveMarketAnalystKey}>{marketAnalystKeyBusy ? 'Сохранение…' : 'Сохранить ключ'}</button>
        <button type="button" disabled={marketAnalystKeyBusy} onClick={openMarketAnalystKeyPage}>Получить ключ</button>
        {marketAnalystStatus.configured && <button type="button" disabled={marketAnalystKeyBusy} onClick={deleteMarketAnalystKey}>Удалить</button>}
      </div>
      <button className="market-analysis-button" type="button" disabled={!marketAnalystStatus.configured || !symbol || !quoteFresh || marketAnalysisBusy} onClick={runMarketAnalysis}>
        {marketAnalysisBusy ? <><LoaderCircle size={14} className="spin" /> Анализирую источники…</> : 'Получить торговый сигнал'}
      </button>
      {marketAnalysisError && <div className="market-analysis-error" role="alert">{marketAnalysisError}</div>}
      {marketAnalysisReport && <div className="market-analysis-result">
        <div className={`market-signal market-signal-${marketAnalysisReport.signal.toLowerCase()}`}>
          <strong>{marketAnalysisReport.signal === 'BUY' ? 'BUY · бычий сценарий' : marketAnalysisReport.signal === 'SELL' ? 'SELL · медвежий сценарий' : 'WAIT · сигнала нет'}</strong>
          <span>Уверенность: {marketAnalysisReport.confidence}% · {new Date(marketAnalysisReport.generatedAt).toLocaleString()} · {marketAnalysisReport.automatic ? 'авто M15' : 'по запросу'}</span>
        </div>
        <p>{marketAnalysisReport.rationale}</p>
        <div className="market-debate-cases"><span><b>За рост:</b> {marketAnalysisReport.bullCase}</span><span><b>За снижение:</b> {marketAnalysisReport.bearCase}</span></div>
        <div className="market-source-summary">Источники: {marketAnalysisReport.sourceStatus.map((source) => `${source.name} — ${source.ok ? `${source.itemCount} публикаций` : 'нет доступа'}`).join(' · ')}{marketAnalysisReport.sourceCache?.reused ? ` · RSS-кэш ${marketAnalysisReport.sourceCache.ageSeconds} с` : ' · RSS обновлён'}</div>
        {marketAnalysisReport.reflection?.evaluated > 0 && <div className="market-reflection-summary">Итоги прошлых сигналов через 4 свечи: верно {marketAnalysisReport.reflection.correct}, неверно {marketAnalysisReport.reflection.wrong}, без движения {marketAnalysisReport.reflection.flat}{marketAnalysisReport.reflection.directionalAccuracyPercent === null ? '' : ` · точность направления ${marketAnalysisReport.reflection.directionalAccuracyPercent}%`}{marketAnalysisReport.reflection.sampleSizeIsSmall ? ' · мало наблюдений, оценка ненадёжна' : ''}.</div>}
        {marketAnalysisReport.sources.length > 0 && <details className="market-source-details"><summary>Заголовки и источники ({marketAnalysisReport.sources.length})</summary>
          {marketAnalysisReport.sources.slice(0, 8).map((source) => <div className="market-source-item" key={source.id}><span>{source.official ? 'OFFICIAL' : 'NEWS'} · {source.source}</span><strong>{source.title}</strong><small>{source.publishedAt ? new Date(source.publishedAt).toLocaleString() : 'Время публикации не указано'}</small></div>)}
        </details>}
        {marketAnalysisReport.riskFlags.length > 0 && <ul className="market-risk-flags">{marketAnalysisReport.riskFlags.map((flag) => <li key={flag}>{flag}</li>)}</ul>}
      </div>}
      <p className="market-analyst-disclosure">Сигнал информационный: ордер не отправляется. В OpenAI передаются M15-цены/индикаторы и публичные заголовки — не пароль MT5 и не баланс счёта. API может тарифицироваться отдельно от ChatGPT. Сетевые данные могут быть устаревшими/ошибочными; сигнал не гарантирует точность или прибыль.</p>
    </section>
    {pendingAction && <form className="live-action-panel" onSubmit={submitLiveAction}>
      <div className="live-action-copy">
        <strong>{pendingAction.type === 'open' ? `${pendingAction.side} ${symbol}` : `Закрыть ${pendingAction.position.side} ${pendingAction.position.symbol}`}</strong>
        <span>{pendingAction.type === 'open' ? '0,01 лота · требуется подтверждение для Live' : `Позиция #${pendingAction.position.ticket} · ${Number(pendingAction.position.volume).toFixed(2)} лота · результат ${cash(pendingAction.position.netProfit, account?.currency)}`}</span>
      </div>
      <label className="live-action-input">Введите LIVE<input autoComplete="off" value={liveText} onChange={(event) => setLiveText(event.target.value)} placeholder="LIVE" /></label>
      <button className="live-action-submit" type="submit" disabled={actionBusy || liveText.trim() !== 'LIVE'}>{actionBusy ? 'Отправка…' : 'Выполнить'}</button>
      <button className="live-action-cancel" type="button" disabled={actionBusy} onClick={cancelLiveAction}>Отмена</button>
    </form>}
    {actionError && <div className="toast-error" role="alert">{actionError}</div>}
    {error && modal !== 'settings' && <div className="toast-error" role="alert">{error}</div>}
    <section className="trade-buttons" aria-label="Ручная торговля">
      <button className="buy-button" type="button" disabled={actionBusy || Boolean(pendingAction)} onClick={() => beginOrder('BUY')}><ArrowUp size={21} /> BUY</button>
      <button className="sell-button" type="button" disabled={actionBusy || Boolean(pendingAction)} onClick={() => beginOrder('SELL')}><ArrowDown size={21} /> SELL</button>
    </section>
    {notice && <div className="toast-success" role="status">{notice}</div>}

    {modal === 'settings' && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setModal('')}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button className="modal-close" type="button" onClick={() => setModal('')} aria-label="Закрыть"><X size={19} /></button>
        <span className="modal-kicker">MT5</span><h1 id="settings-title">Подключение MT5</h1>
        {account ? <div className="connected-account"><span className="connected-dot" /><div><strong>{account.accountType === 'real' ? 'Реальный счёт' : 'Демо-счёт'}</strong><small>{account.login} · {account.server}</small></div><button className="disconnect-button" type="button" onClick={disconnectMt5}>Отключить</button></div> : <>
          {savedAccount && <button className="reconnect-button" type="button" disabled={settingsBusy} onClick={reconnectSavedAccount}>Подключить сохранённый счёт · {savedAccount.login} · {savedAccount.server}</button>}
          <form className="connect-form" onSubmit={connectMt5}>
            <label>Номер счёта<input required inputMode="numeric" value={form.login} onChange={(event) => setForm({ ...form, login: event.target.value })} /></label>
            <label>Пароль MT5<input required type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
            <label>Сервер MT5<input required value={form.server} onChange={(event) => setForm({ ...form, server: event.target.value })} placeholder="точное имя сервера из MT5" /></label>
            <label className="remember-row"><input type="checkbox" checked={form.remember} onChange={(event) => setForm({ ...form, remember: event.target.checked })} /><span>Безопасно запомнить на этом устройстве</span></label>
            <p className="settings-note">Пароль инвестора даёт доступ только для чтения. Ограничения самого MT5 и брокера не обходятся.</p>
            <button className="connect-button" type="submit" disabled={settingsBusy}>{settingsBusy ? <><LoaderCircle size={16} className="spin" /> Подключение…</> : 'Подключить MT5'}</button>
          </form>
        </>}
        {error && <p className="modal-error" role="alert">{error}</p>}
      </section>
    </div>}

  </main>;
}
