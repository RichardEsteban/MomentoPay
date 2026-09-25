import { useCallback, useEffect, useState } from 'react';
import { E7, getInvoice, getQuote, payNow, statusName, txUrl } from '../lib/chain.js';

const fmt = (n) => Number(n).toFixed(2);

function timeLeft(secs) {
  if (secs <= 0) return 'terminó';
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min ${secs % 60} s`;
}

export default function InvoiceStatus({ address, ids, selected, setSelected, goPay }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(null);
  const [other, setOther] = useState('');

  const load = useCallback(async () => {
    if (selected === '') return;
    try {
      const [invoice, quote] = await Promise.all([getInvoice(selected), getQuote(selected)]);
      setData({ invoice, quote }); setError('');
    } catch (e) {
      setData(null); setError(`No encontramos la factura ${selected}.`);
    }
  }, [selected]);

  useEffect(() => {
    setData(null); setPaid(null);
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
  const left = inv ? Number(inv.window_end) - Math.floor(Date.now() / 1000) : 0;
  const isPayer = inv && address && inv.payer === address;
  const pct = q ? q.savings_bps / 100 : 0;

  const chips = [...new Set([...ids, selected].filter((x) => x !== ''))];

  return (
    <section className="card">
      <div className="ids" role="group" aria-label="Tus facturas">
        {chips.map((i) => (
          <button key={i} aria-pressed={selected === i} onClick={() => setSelected(i)}>Factura {i}</button>
        ))}
        <input
          value={other} inputMode="numeric" placeholder="Otra n.º" aria-label="Buscar otra factura por número"
          onChange={(e) => setOther(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter' && other) { setSelected(other); setOther(''); } }}
        />
      </div>

      {selected === '' && (
        <div className="empty">
          Todavía no tienes facturas.<br />
          <button style={{ marginTop: 10 }} onClick={goPay}>Crear mi primera factura</button>
        </div>
      )}
      {error && <div className="msg err" role="alert">{error}</div>}

      {inv && q && (
        <>
          <div className="state">
            <span className={`badge ${settled ? 'paid' : 'open'}`}>{settled ? 'Pagada' : 'Esperando el mejor momento'}</span>
            {!settled && <span className="hint">Plazo: {timeLeft(left)}</span>}
          </div>

          {settled ? (
            <p className="line">
              <b>{fmt(Number(inv.deposit) / E7)} USDC</b> estaban bloqueados. La factura se pagó completa y el resto volvió a la billetera de quien la creó.
            </p>
          ) : (
            <div className="sum">
              <div><small>Bloqueado</small><b>{fmt(Number(inv.deposit) / E7)}</b><small>USDC</small></div>
              <div><small>Hoy cuesta</small><b>{fmt(Number(q.required_usdc) / E7)}</b><small>USDC</small></div>
              <div>
                <small>Frente al día que la creaste</small>
                <b className={`delta ${pct >= 0 ? 'good' : 'bad'}`}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</b>
                <small>{pct >= 0 ? 'más barata' : 'más cara'}</small>
              </div>
            </div>
          )}

          {!settled && q.stop_loss_hit && (
            <div className="msg warn">El precio empeoró más de lo tolerado: se pagará de inmediato para proteger la factura.</div>
          )}
          {!settled && !q.stop_loss_hit && left <= 0 && (
            <div className="msg warn">Terminó el plazo: cualquiera puede liquidar la factura al precio de hoy.</div>
          )}
          {!settled && q.can_agent_execute && left > 0 && (
            <div className="msg ok">El precio ya conviene: el agente puede pagar cuando su regla lo decida.</div>
          )}

          {!settled && (
            <button className="ghost big" style={{ marginTop: 14 }} onClick={pay} disabled={busy || !isPayer}>
              {busy ? 'Confirma en Freighter…' : 'Pagar ahora, sin esperar'}
            </button>
          )}
          {!settled && !isPayer && <div className="hint" style={{ textAlign: 'center', marginTop: 6 }}>Solo quien creó la factura puede pagarla ahora.</div>}
          {paid && <div className="msg ok">Pagada. <a href={txUrl(paid.hash)} target="_blank" rel="noreferrer">Ver transacción</a></div>}
        </>
      )}
    </section>
  );
}
