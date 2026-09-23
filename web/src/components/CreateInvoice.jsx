import { useEffect, useMemo, useState } from 'react';
import { E7, createInvoice, deployment, getOraclePrice, txUrl } from '../lib/chain.js';

const WINDOWS = [
  { label: '10 minutos (demo en vivo)', secs: 600 },
  { label: '1 día', secs: 86400 },
  { label: '1 semana', secs: 7 * 86400 },
  { label: '2 semanas', secs: 14 * 86400 },
];
const MIN_BUFFER_PCT = 5;   // colchón mínimo que exige el contrato
const MAX_FEE_PCT = 20;     // tope de la comisión del agente

export default function CreateInvoice({ address, onCreated }) {
  const [amountPen, setAmountPen] = useState(950);
  const [payee, setPayee] = useState(deployment.accounts.payee);
  const [windowSecs, setWindowSecs] = useState(600);
  const [bufferPct, setBufferPct] = useState(20);
  const [minSavingsPct, setMinSavingsPct] = useState(0.5);
  const [feePct, setFeePct] = useState(20);
  const [price, setPrice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getOraclePrice().then(setPrice).catch((e) => setError(e.message));
  }, []);

  const calc = useMemo(() => {
    if (!price) return null;
    const required = amountPen / price.rate;
    return { required, deposit: required * (1 + bufferPct / 100) };
  }, [price, amountPen, bufferPct]);

  const problem =
    !address ? 'Conecta tu billetera para crear la factura.'
    : !(amountPen > 0) ? 'Indica el monto de la factura.'
    : bufferPct < MIN_BUFFER_PCT ? `El colchón mínimo es ${MIN_BUFFER_PCT}%.`
    : feePct > MAX_FEE_PCT ? `La comisión del agente no puede pasar de ${MAX_FEE_PCT}% del ahorro.`
    : '';

  async function submit() {
    setBusy(true); setError(''); setResult(null);
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
      setResult(r);
      onCreated(String(r.value));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>1. Crea tu factura</h2>
      <p className="sub">
        Bloqueas la factura más un colchón. El agente solo trabaja con el colchón; la factura se paga siempre.
      </p>
      <div className="grid">
        <div>
          <label>Monto de la factura (PEN)</label>
          <input type="number" min="1" value={amountPen} onChange={(e) => setAmountPen(Number(e.target.value))} />
        </div>
        <div>
          <label>Plazo para que el agente busque el mejor momento</label>
          <select value={windowSecs} onChange={(e) => setWindowSecs(Number(e.target.value))}>
            {WINDOWS.map((w) => <option key={w.secs} value={w.secs}>{w.label}</option>)}
          </select>
        </div>
        <div>
          <label>Colchón sobre la factura (%)</label>
          <input type="number" min={MIN_BUFFER_PCT} value={bufferPct} onChange={(e) => setBufferPct(Number(e.target.value))} />
        </div>
        <div>
          <label>Ahorro mínimo para que el agente pague antes (%)</label>
          <input type="number" min="0" step="0.1" value={minSavingsPct} onChange={(e) => setMinSavingsPct(Number(e.target.value))} />
        </div>
        <div>
          <label>Comisión del agente (% del ahorro)</label>
          <input type="number" min="0" max={MAX_FEE_PCT} value={feePct} onChange={(e) => setFeePct(Number(e.target.value))} />
        </div>
        <div>
          <label>Quién cobra (dirección Stellar)</label>
          <input value={payee} onChange={(e) => setPayee(e.target.value.trim())} />
        </div>
      </div>

      <div className="stats">
        <div className="stat"><b>{price ? `${price.rate.toFixed(3)}` : '…'}</b><span>PEN por 1 USDC hoy</span></div>
        <div className="stat"><b>{calc ? calc.required.toFixed(2) : '…'}</b><span>USDC que cuesta la factura hoy</span></div>
        <div className="stat good"><b>{calc ? calc.deposit.toFixed(2) : '…'}</b><span>USDC a bloquear (factura + colchón)</span></div>
      </div>

      <div className="row">
        <button onClick={submit} disabled={busy || !!problem}>{busy ? 'Firmando y enviando…' : 'Crear factura y bloquear fondos'}</button>
        {problem && <span style={{ color: 'var(--muted)', fontSize: 14 }}>{problem}</span>}
      </div>
      {error && <div className="err">{error}</div>}
      {result && (
        <div className="ok">
          Factura creada con id <b>{String(result.value)}</b>.{' '}
          <a href={txUrl(result.hash)} target="_blank" rel="noreferrer">Ver transacción</a>.
          Para que el agente la vigile: <code>npm run cli -- watch {String(result.value)}</code>
        </div>
      )}
    </section>
  );
}
