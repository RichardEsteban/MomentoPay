import { useEffect, useMemo, useState } from 'react';
import { E7, createInvoice, deployment, getOraclePrice, txUrl } from '../lib/chain.js';

const WINDOWS = [
  { label: '10 min', sub: 'demo', secs: 600 },
  { label: '1 día', secs: 86400 },
  { label: '1 semana', secs: 7 * 86400 },
  { label: '2 semanas', secs: 14 * 86400 },
];
const MIN_BUFFER_PCT = 5;   // colchón mínimo que exige el contrato
const MAX_FEE_PCT = 20;     // tope de la comisión del agente

export default function CreateInvoice({ address, onCreated, onConnect }) {
  const [amountPen, setAmountPen] = useState(950);
  const [windowSecs, setWindowSecs] = useState(600);
  const [payee, setPayee] = useState(deployment.accounts.payee);
  const [bufferPct, setBufferPct] = useState(20);
  const [minSavingsPct, setMinSavingsPct] = useState(0.5);
  const [feePct, setFeePct] = useState(20);
  const [price, setPrice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getOraclePrice().then(setPrice).catch((e) => setError(e.message));
  }, []);

  const calc = useMemo(() => {
    if (!price) return null;
    const required = amountPen / price.rate;
    const deposit = required * (1 + bufferPct / 100);
    return { required, deposit, margin: deposit - required };
  }, [price, amountPen, bufferPct]);

  const problem =
    !(amountPen > 0) ? 'Escribe el monto de la factura.'
    : bufferPct < MIN_BUFFER_PCT ? `El colchón mínimo es ${MIN_BUFFER_PCT}%.`
    : feePct > MAX_FEE_PCT || feePct < 0 ? `La comisión debe estar entre 0 y ${MAX_FEE_PCT}%.`
    : '';

  async function submit() {
    setBusy(true); setError('');
    try {
      const now = Math.floor(Date.now() / 1000);
      const windowEnd = now + windowSecs;
      const r = await createInvoice(address, {
        payee,
        amountPenE7: Math.round(amountPen * E7),
        depositE7: Math.ceil(calc.deposit * E7) + 10,
        dueTs: windowEnd + 2 * 86400,
        windowEnd,
        minSavingsBps: Math.round(minSavingsPct * 100),
        stopLossBps: 1500,
        agentFeeBps: Math.round(feePct * 100),
      });
      onCreated(String(r.value), r.hash);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <ol className="how">
        <li><b>1. Bloqueas</b>la factura y un margen</li>
        <li><b>2. El agente espera</b>el mejor momento</li>
        <li><b>3. Se paga</b>y te devuelven lo que sobra</li>
      </ol>

      <div className="field">
        <label htmlFor="amount">¿Cuánto es la factura?</label>
        <div className="amount">
          <input id="amount" type="number" inputMode="decimal" min="1" value={amountPen} onChange={(e) => setAmountPen(Number(e.target.value))} />
          <span>PEN</span>
        </div>
      </div>

      <div className="field">
        <span className="lbl">¿Cuánto puede esperar el agente?</span>
        <div className="seg" role="group" aria-label="Plazo del agente">
          {WINDOWS.map((w) => (
            <button key={w.secs} type="button" aria-pressed={windowSecs === w.secs} onClick={() => setWindowSecs(w.secs)}>
              {w.label}{w.sub && <small>{w.sub}</small>}
            </button>
          ))}
        </div>
      </div>

      <div className="sum" aria-live="polite">
        <div><small>Hoy cuesta</small><b>{calc ? calc.required.toFixed(2) : '…'}</b><small>USDC</small></div>
        <div className="lock"><small>Bloqueas</small><b>{calc ? calc.deposit.toFixed(2) : '…'}</b><small>USDC</small></div>
        <div><small>Margen (se devuelve)</small><b>{calc ? calc.margin.toFixed(2) : '…'}</b><small>USDC</small></div>
      </div>

      <details>
        <summary>Opciones avanzadas</summary>
        <div className="adv">
          <div>
            <label htmlFor="buf">Margen sobre la factura (%)</label>
            <input id="buf" type="number" min={MIN_BUFFER_PCT} value={bufferPct} onChange={(e) => setBufferPct(Number(e.target.value))} />
            <div className="hint">Mínimo {MIN_BUFFER_PCT}%.</div>
          </div>
          <div>
            <label htmlFor="min">Ahorro mínimo para pagar antes (%)</label>
            <input id="min" type="number" min="0" step="0.1" value={minSavingsPct} onChange={(e) => setMinSavingsPct(Number(e.target.value))} />
          </div>
          <div>
            <label htmlFor="fee">Comisión del agente (% del ahorro)</label>
            <input id="fee" type="number" min="0" max={MAX_FEE_PCT} value={feePct} onChange={(e) => setFeePct(Number(e.target.value))} />
            <div className="hint">Solo si hay ahorro. Máximo {MAX_FEE_PCT}%.</div>
          </div>
          <div className="wide">
            <label htmlFor="payee">Quién cobra (dirección Stellar)</label>
            <input id="payee" value={payee} onChange={(e) => setPayee(e.target.value.trim())} />
          </div>
        </div>
      </details>

      {address ? (
        <button className="big" onClick={submit} disabled={busy || !!problem}>
          {busy ? 'Confirma en Freighter…' : 'Bloquear y pagar en el mejor momento'}
        </button>
      ) : (
        <>
          <button className="big" onClick={onConnect}>Conectar Freighter para continuar</button>
          <div className="hint" style={{ textAlign: 'center', marginTop: 8 }}>
            Se abrirá Freighter para que le des permiso. Necesitas la extensión en modo testnet.
          </div>
        </>
      )}
      {address && problem && <div className="hint" style={{ textAlign: 'center', marginTop: 8 }}>{problem}</div>}
      {error && <div className="msg err" role="alert">{error}</div>}
    </section>
  );
}
