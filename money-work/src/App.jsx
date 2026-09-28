import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CandlestickChart, LoaderCircle, Settings, ShieldCheck, X } from 'lucide-react';
import { mergeHistoryBars, mergeMarketTick, mergeTickIntoBars } from './chartUtils.mjs';
import './manual.css';

const SYMBOL_PREFIX = 'AUDCAD';
const TIMEFRAME = '15M';
const QUOTE_FRESH_MS = 30000;

function price(value, digits = 5) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
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
  const [modal, setModal] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [form, setForm] = useState({ login: '', password: '', server: '', remember: true });
  const [orderSide, setOrderSide] = useState('');
  const [liveText, setLiveText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const symbolRef = useRef(symbol);
  const quoteRef = useRef(null);
  const accountRef = useRef(null);
  const syncLock = useRef(false);
  const historyLock = useRef(false);
  const pendingHistoryRef = useRef(null);
  const startupPromiseRef = useRef(null);

  useEffect(() => { symbolRef.current = symbol; }, [symbol]);
  useEffect(() => { accountRef.current = account; }, [account]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const syncAccount = useCallback(async () => {
    if (!window.moneyWork || syncLock.current) return;
    syncLock.current = true;
    try {
      const fresh = await window.moneyWork.getMt5Account();
      accountRef.current = fresh;
      setAccount((current) => !current || current.accountType !== fresh.accountType || current.login !== fresh.login || current.server !== fresh.server ? fresh : current);
    } catch (reason) {
      setError(reason?.message || String(reason));
    } finally { syncLock.current = false; }
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
    await loadHistory(chosen, true);
  }, [loadHistory, syncAccount]);

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
    return () => { clearInterval(accountTimer); clearInterval(historyTimer); };
  }, [account !== null, loadHistory, symbol, syncAccount]);

  const quoteFresh = Boolean(quote && Number(quote.bid) > 0 && Number(quote.ask) > 0 && now - Number(quote.receivedAt) <= QUOTE_FRESH_MS);
  const digits = /JPY/i.test(symbol) ? 3 : 5;

  function openSettings() {
    setError('');
    setModal('settings');
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
    setAccount(null); setQuote(null); setSymbol(''); setBars([]);
  }

  function beginOrder(side) {
    setError(''); setNotice('');
    if (!window.moneyWork) { openSettings(); setError('Подключение к MT5 доступно в установленном приложении Money Work.'); return; }
    if (!account || !symbol) { openSettings(); return; }
    if (!quoteFresh) { setError('Свежая котировка MT5 недоступна. Ордер не отправлен.'); setModal('message'); return; }
    setOrderSide(side);
    setLiveText('');
    setModal('order');
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!account || !orderSide || orderBusy) return;
    if (!quoteFresh) { setError('Свежая котировка MT5 недоступна. Ордер не отправлен.'); setModal('message'); return; }
    if (account.accountType === 'real' && liveText.trim() !== 'LIVE') return;
    setOrderBusy(true);
    setError('');
    try {
      const result = await window.moneyWork.placeMt5ManualOrder({
        symbol, side: orderSide, confirmed: true,
        liveConfirmed: account.accountType === 'real' && liveText.trim() === 'LIVE',
      });
      setNotice(`Ордер отправлен: ${result.side} ${result.volume} ${result.symbol} · ${price(result.entry, digits)}`);
      setModal('');
      window.setTimeout(() => setNotice(''), 4000);
      await syncAccount();
    } catch (reason) { setError(reason?.message || String(reason)); }
    finally { setOrderBusy(false); }
  }

  return <main className="mw-app">
    <button className="settings-button" type="button" onClick={openSettings} aria-label="Настройки MT5" title="Настройки MT5"><Settings size={20} /></button>
    <section className="chart-area" aria-label="График MT5">
      <span className="chart-symbol">{symbol || 'AUDCAD'} · {TIMEFRAME}</span>
      <PriceChart bars={bars} symbol={symbol} />
    </section>
    <section className="trade-buttons" aria-label="Ручная торговля">
      <button className="buy-button" type="button" onClick={() => beginOrder('BUY')}><ArrowUp size={21} /> BUY</button>
      <button className="sell-button" type="button" onClick={() => beginOrder('SELL')}><ArrowDown size={21} /> SELL</button>
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

    {modal === 'order' && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !orderBusy && setModal('')}>
      <form className="modal order-modal" onSubmit={submitOrder}>
        <button className="modal-close" type="button" onClick={() => !orderBusy && setModal('')} aria-label="Закрыть"><X size={19} /></button>
        <span className="modal-kicker">Подтверждение ордера</span>
        <h1 className={orderSide === 'BUY' ? 'buy-text' : 'sell-text'}>{orderSide} {symbol}</h1>
        <div className="order-details">
          <div><span>Объём</span><strong>0,01 лота</strong></div>
          <div><span>Рыночная котировка</span><strong>{price(orderSide === 'BUY' ? quote?.ask : quote?.bid, digits)}</strong></div>
          <div><span>Стоп-лосс / тейк-профит</span><strong>20 / 30 пипсов</strong></div>
          <div><span>Цель</span><strong>0,30 валюты счёта на 0,01 лота</strong></div>
          <div><span>Счёт</span><strong>{account?.accountType === 'real' ? 'REAL' : 'DEMO'}</strong></div>
        </div>
        {account?.accountType === 'real' && <label className="live-confirm">Реальный счёт: введите LIVE<input autoComplete="off" value={liveText} onChange={(event) => setLiveText(event.target.value)} placeholder="LIVE" /></label>}
        <p className="order-warning"><ShieldCheck size={15} /> Ордер отправляется в MT5. Исполнение, проскальзывание и возможный убыток зависят от брокера.</p>
        {error && <p className="modal-error" role="alert">{error}</p>}
        <div className="modal-actions"><button className="cancel-button" type="button" disabled={orderBusy} onClick={() => setModal('')}>Отмена</button><button className={orderSide === 'BUY' ? 'confirm-buy' : 'confirm-sell'} type="submit" disabled={orderBusy || (account?.accountType === 'real' && liveText.trim() !== 'LIVE')}>{orderBusy ? 'Отправка…' : `Подтвердить ${orderSide}`}</button></div>
      </form>
    </div>}

    {modal === 'message' && <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal('')}><section className="modal message-modal"><button className="modal-close" type="button" onClick={() => setModal('')} aria-label="Закрыть"><X size={19} /></button><p className="modal-error">{error}</p><button className="connect-button" type="button" onClick={() => setModal('')}>Закрыть</button></section></div>}
  </main>;
}
