import { useCallback, useEffect, useState } from 'react';
import { E7, getInvoice, getQuote, payNow, statusName, txUrl } from '../lib/chain.js';

const fmt = (n, d = 2) => Number(n).toFixed(d);

function timeLeft(secs) {
  if (secs <= 0) return 'terminó';
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min ${secs % 60} s`;
}

export default function InvoiceStatus({ address, ids, selected, setSelected }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(null);

  const load = useCallback(async () => {
    if (selected === '') return;
    try {
      const [invoice, quote] = await Promise.all([getInvoice(selected), getQuote(selected)]);
      setData({ invoice, quote }); setError('');
    } catch (e) {
      setData(null); setError(`No se pudo leer la factura ${selected}: ${e.message}`);
    }
  }, [selected]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function pay() {
    setBusy(true); setError('');
    try { setPaid(await payNow(address, selected)); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const inv = data?.invoice, q = data?.quote;
  const settled = inv && statusName(inv.status) === 'Settled';
  const baseRequired = inv ? Math.ceil((Number(inv.amount_pen_e7) * E7) / Number(inv.base_rate_e7)) / E7 : 0;
  const left = inv ? Number(inv.window_end) - Math.floor(Date.now() / 1000) : 0;
  const isPayer = inv && address && inv.payer === address;

  return (
    <section className="card">
      <h2>2. Sigue tu factura</h2>
      <p className="sub">Se actualiza sola cada 10 segundos.</p>
      <div className="grid">
        <div>
          <label>Número de factura</label>
          <input list="ids" value={selected} onChange={(e) => setSelected(e.target.value.trim())} placeholder="Ej. 0" />
          <datalist id="ids">{ids.map((i) => <option key={i} value={i} />)}</datalist>
        </div>
      </div>

      {error && <div className="err">{error}</div>}
      {inv && q && (
        <>
          <div className="stats">
            <div className="stat"><b>{settled ? 'Pagada' : 'Abierta'}</b><span>Estado</span></div>
            <div className="stat"><b>{fmt(Number(inv.deposit) / E7)}</b><span>USDC bloqueados</span></div>
            <div className="stat"><b>{fmt(baseRequired)}</b><span>USDC que costaba el día que la creaste</span></div>
            {!settled && (
              <>
                <div className="stat"><b>{fmt(Number(q.required_usdc) / E7)}</b><span>USDC que cuesta hoy</span></div>
                <div className={`stat ${q.savings_bps >= 0 ? 'good' : 'bad'}`}>
                  <b>{q.savings_bps >= 0 ? '+' : ''}{fmt(q.savings_bps / 100)}%</b><span>vs. el día que la creaste</span>
                </div>
                <div className="stat"><b>{timeLeft(left)}</b><span>de plazo para el agente</span></div>
              </>
            )}
          </div>

          {!settled && q.can_agent_execute && (
            <div className="ok">El ahorro actual ya supera el mínimo que elegiste: el agente puede pagar cuando su umbral lo decida.</div>
          )}
          {!settled && q.stop_loss_hit && (
            <div className="note">El precio empeoró más de lo tolerado: el sistema pagará de inmediato para proteger la factura.</div>
          )}
          {!settled && left <= 0 && (
            <div className="note">Terminó el plazo: cualquiera puede liquidar la factura y se paga al precio de hoy.</div>
          )}

          {!settled && (
            <div className="row">
              <button className="ghost" onClick={pay} disabled={busy || !isPayer}>
                {busy ? 'Firmando…' : 'Pagar ahora, sin esperar'}
              </button>
              {!isPayer && <span style={{ color: 'var(--muted)', fontSize: 14 }}>Solo quien creó la factura puede pagarla ahora.</span>}
            </div>
          )}
          {paid && <div className="ok">Pagada. <a href={txUrl(paid.hash)} target="_blank" rel="noreferrer">Ver transacción</a></div>}
        </>
      )}
    </section>
  );
}
