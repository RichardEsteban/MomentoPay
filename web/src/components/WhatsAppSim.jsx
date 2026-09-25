import { useCallback, useEffect, useRef, useState } from 'react';
import {
  E7, createInvoice, deployment, getBalance, getInvoice, getOraclePrice, getQuote, payNow, statusName, txUrl,
} from '../lib/chain.js';

// Factura de ejemplo dibujada en código, para no depender de ninguna imagen externa.
const SAMPLE_INVOICE = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="260" height="330" viewBox="0 0 260 330">
  <rect width="260" height="330" fill="#fff"/>
  <rect width="260" height="44" fill="#1a7a52"/>
  <text x="14" y="28" font-family="Arial" font-size="16" font-weight="700" fill="#fff">FACTURA ELECTRÓNICA</text>
  <g font-family="Arial" fill="#222" font-size="12">
    <text x="14" y="70" font-weight="700">F001 - 000234</text>
    <text x="14" y="94" font-weight="700">Distribuidora Andina S.A.C.</text>
    <text x="14" y="110" fill="#666">RUC 20512345678</text>
    <text x="14" y="140" fill="#666">Descripción</text><text x="190" y="140" fill="#666">Importe</text>
    <line x1="14" x2="246" y1="148" y2="148" stroke="#ccc"/>
    <text x="14" y="168">Insumos de panadería</text><text x="190" y="168">805.08</text>
    <text x="14" y="188">IGV 18%</text><text x="190" y="188">144.92</text>
    <line x1="14" x2="246" y1="204" y2="204" stroke="#ccc"/>
    <text x="14" y="232" font-size="15" font-weight="700">TOTAL A PAGAR</text>
    <text x="150" y="232" font-size="15" font-weight="700">S/ 950.00</text>
    <text x="14" y="272" fill="#666">Fecha de vencimiento: en 2 días</text>
  </g>
</svg>`)}`;

const WINDOWS = [
  { label: '10 min (demo)', secs: 600 },
  { label: '1 día', secs: 86400 },
  { label: '1 semana', secs: 7 * 86400 },
  { label: '2 semanas', secs: 14 * 86400 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clock = () => new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
const usd = (n) => Number(n).toFixed(2);

function timeLeft(secs) {
  if (secs <= 0) return 'terminó';
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min ${secs % 60} s`;
}

export default function WhatsAppSim({ address, onConnect, onInvoice, refreshBalance }) {
  const [msgs, setMsgs] = useState([]);
  const [typing, setTyping] = useState(false);
  const [awaitingAmount, setAwaitingAmount] = useState(false);
  const [text, setText] = useState('');
  const [live, setLive] = useState(null);       // estado en vivo de la factura
  const [invoiceId, setInvoiceId] = useState(null);

  const draft = useRef({ amount: 950, windowSecs: 600 });
  const idRef = useRef(0);
  const started = useRef(false);
  const lockedBalance = useRef(0);
  const finalized = useRef(false);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const addressRef = useRef(address);
  addressRef.current = address;

  const push = useCallback((m) => {
    const id = ++idRef.current;
    setMsgs((all) => [...all, { id, time: clock(), ...m }]);
    return id;
  }, []);

  const bot = useCallback(async (content, extra = {}, delay = 650) => {
    setTyping(true);
    await sleep(delay);
    setTyping(false);
    return push({ from: 'bot', ...(typeof content === 'string' ? { text: content } : content), ...extra });
  }, [push]);

  const greet = useCallback(async () => {
    await bot('¡Hola! Soy *Momento Pay*. Mándame la foto de tu factura y me encargo de pagarla en el mejor momento.', {}, 400);
    await bot('Tu factura siempre se paga: yo solo busco el mejor precio con el margen que sobra.', {
      buttons: [{ label: '📎 Enviar una factura de ejemplo', action: 'sample' }],
    }, 700);
  }, [bot]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    greet();
  }, [greet]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, typing, live]);

  // --- Flujo -------------------------------------------------------------

  async function receiveInvoice(src) {
    push({ from: 'me', image: src });
    await bot('Leyendo tu factura…', {}, 500);
    await sleep(900);
    draft.current.amount = draft.current.amount || 950;
    await askConfirmRead();
  }

  async function askConfirmRead() {
    await bot(
      `Esto es lo que leí:\n• Cobra: Distribuidora Andina S.A.C.\n• Monto: S/ ${draft.current.amount.toFixed(2)}\n• Vence: en 2 días\n\n¿Es correcto?`,
      { buttons: [{ label: 'Sí, es correcto', action: 'readOk' }, { label: 'Cambiar monto', action: 'changeAmount' }] },
      400,
    );
  }

  async function askWindow() {
    await bot('¿Cuánto tiempo puede esperar mi agente para buscar el mejor precio?', {
      buttons: WINDOWS.map((w) => ({ label: w.label, action: `win:${w.secs}` })),
    });
  }

  async function proposeLock() {
    let price;
    try { price = await getOraclePrice(); } catch { await bot('No pude leer el precio ahora. Intenta de nuevo en un momento.'); return; }
    const required = draft.current.amount / price.rate;
    const deposit = required * 1.2;
    draft.current.required = required;
    draft.current.deposit = deposit;
    await bot(
      `Hoy tu factura cuesta *${usd(required)} USDC* (1 USDC = S/ ${price.rate.toFixed(3)}).\n\nBloquearé *${usd(deposit)} USDC*: la factura más un margen del 20% que se te devuelve al pagar.`,
      { buttons: [{ label: 'Confirmar con Freighter', action: 'confirm' }, { label: 'Cancelar', action: 'cancel' }] },
    );
  }

  async function confirmLock() {
    const addr = addressRef.current;
    if (!addr) {
      await bot('Primero conecta tu billetera. Cuando esté lista, vuelve a pulsar *Confirmar*.', {
        buttons: [{ label: 'Conectar Freighter', action: 'connect' }, { label: 'Confirmar con Freighter', action: 'confirm' }],
      }, 400);
      return;
    }
    const { amount, windowSecs, deposit } = draft.current;
    let balance = 0;
    try { balance = await getBalance(addr); } catch { /* se valida al firmar */ }
    if (balance < deposit) {
      await bot(`Tu billetera tiene ${usd(balance)} MPUSDC y necesito ${usd(deposit)}. Pide fondos de prueba con: npm run cli -- fund ${addr}`, {}, 400);
      return;
    }
    await bot('Abre Freighter y firma para bloquear los fondos…', {}, 400);
    try {
      const now = Math.floor(Date.now() / 1000);
      const windowEnd = now + windowSecs;
      const r = await createInvoice(addr, {
        payee: deployment.accounts.payee,
        amountPenE7: Math.round(amount * E7),
        depositE7: Math.ceil(deposit * E7) + 10,
        dueTs: windowEnd + 2 * 86400,
        windowEnd,
        minSavingsBps: 50,
        stopLossBps: 1500,
        agentFeeBps: 2000,
      });
      const id = String(r.value);
      lockedBalance.current = await getBalance(addr);
      finalized.current = false;
      setInvoiceId(id);
      onInvoice?.(id);
      refreshBalance?.(addr);
      await bot({ text: `🔒 Fondos bloqueados. Factura n.º ${id}.`, link: { href: txUrl(r.hash), label: 'Ver transacción en Stellar' } }, {}, 500);
      await bot('Mi agente ya está vigilando el precio. Te aviso apenas pague.', { status: true }, 600);
      await bot({ system: `Demo: en la terminal, dentro de agent/, ejecuta  npm run cli -- watch ${id}` }, {}, 300);
    } catch (e) {
      await bot(`No se pudo bloquear: ${e.message}`, {}, 300);
    }
  }

  async function finalize(invoice) {
    if (finalized.current) return;
    finalized.current = true;
    const addr = addressRef.current;
    let after = lockedBalance.current;
    try { after = await getBalance(addr); } catch { /* usa el saldo anterior */ }
    refreshBalance?.(addr);
    const deposit = Number(invoice.deposit) / E7;
    const refund = Math.max(after - lockedBalance.current, 0);
    const totalCost = deposit - refund;
    const day1 = Math.ceil((Number(invoice.amount_pen_e7) * E7) / Number(invoice.base_rate_e7)) / E7;
    const delta = day1 - totalCost;
    await bot('✅ ¡Listo! Tu factura quedó pagada por completo.', {}, 500);
    await bot(
      `Costó *${usd(totalCost)} USDC* en total (comisión incluida).\nPagando el día 1 habría costado ${usd(day1)} USDC.\nTe devolví *${usd(refund)} USDC* del margen.`,
      {}, 700,
    );
    await bot(
      delta > 0.005
        ? `Ahorraste ${usd(delta)} USDC frente a pagar el día 1.`
        : delta < -0.005
          ? `Esta vez el precio fue peor que el día 1 (${usd(delta)} USDC). La factura se pagó completa igualmente.`
          : 'Quedó igual que pagando el día 1.',
      { buttons: [{ label: 'Pagar otra factura', action: 'restart' }] }, 700,
    );
  }

  // Vigila la factura en vivo mientras el chat está abierto.
  useEffect(() => {
    if (invoiceId === null) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const [invoice, quote] = await Promise.all([getInvoice(invoiceId), getQuote(invoiceId)]);
        if (stop) return;
        const settled = statusName(invoice.status) === 'Settled';
        setLive({ settled, savings: quote.savings_bps / 100, left: Number(invoice.window_end) - Math.floor(Date.now() / 1000) });
        if (settled) { stop = true; finalize(invoice); }
      } catch { /* reintenta en el siguiente ciclo */ }
    };
    tick();
    const t = setInterval(tick, 8000);
    return () => { stop = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  async function doPayNow() {
    const addr = addressRef.current;
    if (!addr) { await bot('Conecta tu billetera para pagar ahora.', { buttons: [{ label: 'Conectar Freighter', action: 'connect' }] }, 300); return; }
    try { await payNow(addr, invoiceId); } catch (e) { await bot(`No se pudo pagar: ${e.message}`, {}, 300); }
  }

  async function onAction(msgId, button) {
    const { action, label } = button;
    if (action !== 'connect') setMsgs((all) => all.map((m) => (m.id === msgId ? { ...m, used: true } : m)));
    if (action !== 'connect' && action !== 'sample') push({ from: 'me', text: label });
    if (action === 'sample') await receiveInvoice(SAMPLE_INVOICE);
    else if (action === 'readOk') await askWindow();
    else if (action === 'changeAmount') {
      setAwaitingAmount(true);
      await bot('¿Cuál es el monto correcto en soles? Escríbelo abajo.', {}, 400);
    } else if (action.startsWith('win:')) { draft.current.windowSecs = Number(action.slice(4)); await proposeLock(); }
    else if (action === 'confirm') await confirmLock();
    else if (action === 'cancel') await bot('Sin problema, no bloqueé nada.', { buttons: [{ label: 'Empezar de nuevo', action: 'restart' }] }, 400);
    else if (action === 'connect') await onConnect();
    else if (action === 'restart') { draft.current = { amount: 950, windowSecs: 600 }; setInvoiceId(null); setLive(null); await greet(); }
  }

  function sendText(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value || !awaitingAmount) return;
    const amount = Number(value.replace(/[^\d.,]/g, '').replace(',', '.'));
    setText('');
    push({ from: 'me', text: value });
    if (!(amount > 0)) { bot('No entendí el monto. Escribe solo el número, por ejemplo 1200.', {}, 400); return; }
    draft.current.amount = amount;
    setAwaitingAmount(false);
    askConfirmRead();
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    receiveInvoice(URL.createObjectURL(file));
  }

  // --- Vista ---------------------------------------------------------------

  const renderText = (t) =>
    t.split('\n').map((line, i) => (
      <span key={i}>
        {line.split(/\*(.+?)\*/g).map((part, j) => (j % 2 ? <b key={j}>{part}</b> : part))}
        <br />
      </span>
    ));

  return (
    <section className="wa" aria-label="Simulación de una conversación de WhatsApp">
      <div className="wa-head">
        <div className="wa-avatar" aria-hidden="true">M</div>
        <div>
          <b>Momento Pay</b>
          <small>{typing ? 'escribiendo…' : 'en línea'}</small>
        </div>
      </div>
      <div className="wa-sim">Simulación de la interfaz de WhatsApp. La blockchain es real; la lectura de la foto es simulada.</div>

      <div className="wa-body">
        {msgs.map((m) => (
          <div key={m.id} className={`wa-row ${m.system ? 'sys' : m.from}`}>
            {m.system ? (
              <div className="wa-system">{m.system}</div>
            ) : (
              <div className="wa-bubble">
                {m.image && <img src={m.image} alt="Factura enviada" />}
                {m.text && <div>{renderText(m.text)}</div>}
                {m.link && <a href={m.link.href} target="_blank" rel="noreferrer">{m.link.label}</a>}
                {m.status && (
                  <div className="wa-status">
                    {live?.settled ? 'Pagada' : live ? <>Vigilando · ahorro actual <b>{live.savings >= 0 ? '+' : ''}{live.savings.toFixed(2)}%</b> · plazo {timeLeft(live.left)}</> : 'Conectando con la factura…'}
                  </div>
                )}
                <span className="wa-time">{m.time}{m.from === 'me' && <i className="wa-ticks"> ✓✓</i>}</span>
              </div>
            )}
            {m.buttons && (
              <div className="wa-buttons">
                {m.buttons.map((b) => (
                  <button key={b.action} disabled={m.used} onClick={() => onAction(m.id, b)}>{b.label}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        {invoiceId !== null && live && !live.settled && (
          <div className="wa-row bot">
            <div className="wa-buttons"><button onClick={doPayNow}>Pagar ahora, sin esperar</button></div>
          </div>
        )}
        {typing && <div className="wa-row bot"><div className="wa-bubble wa-typing"><i /><i /><i /></div></div>}
        <div ref={endRef} />
      </div>

      <form className="wa-input" onSubmit={sendText}>
        <button type="button" className="wa-attach" aria-label="Adjuntar foto de la factura" onClick={() => fileRef.current?.click()}>📎</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        <input
          value={text} onChange={(e) => setText(e.target.value)} disabled={!awaitingAmount}
          placeholder={awaitingAmount ? 'Escribe el monto en soles' : 'Usa los botones del chat'} aria-label="Mensaje"
        />
        <button type="submit" className="wa-send" disabled={!awaitingAmount || !text.trim()} aria-label="Enviar">➤</button>
      </form>
    </section>
  );
}
