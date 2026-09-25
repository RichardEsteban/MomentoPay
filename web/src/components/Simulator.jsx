import { useMemo, useState } from 'react';
import { DEFAULTS, simulateMany } from '../lib/sim.js';

const money = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`;
const MOVES = [
  { label: 'Tranquilo', pct: 0.2 },
  { label: 'Normal', pct: 0.4 },
  { label: 'Movido', pct: 0.8 },
];

function PathChart({ run, baseRate, windowDays }) {
  const W = 560, H = 150, P = 22;
  const shown = run.path.filter((p) => p.day <= run.day);
  const rates = run.path.map((p) => p.rate);
  const lo = Math.min(baseRate, ...rates), hi = Math.max(baseRate, ...rates);
  const span = hi - lo || 0.01;
  const x = (d) => P + (d / windowDays) * (W - 2 * P);
  const y = (r) => H - P - ((r - lo) / span) * (H - 2 * P);
  const last = shown.at(-1);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ejemplo de cómo se mueve el tipo de cambio durante el plazo">
      <line x1={P} x2={W - P} y1={y(baseRate)} y2={y(baseRate)} stroke="#9aa79f" strokeDasharray="5 5" />
      <text x={W - P} y={y(baseRate) + 14} fontSize="11" fill="#5d6b63" textAnchor="end">precio del día 1</text>
      <polyline points={shown.map((p) => `${x(p.day)},${y(p.rate)}`).join(' ')} fill="none" stroke="#1a7a52" strokeWidth="2.5" />
      <circle cx={x(last.day)} cy={y(last.rate)} r="5.5" fill={run.code === 'TARGET' ? '#1a7a52' : '#a4490f'} />
    </svg>
  );
}

export default function Simulator() {
  const [move, setMove] = useState(0.4);
  const [windowDays, setWindowDays] = useState(7);

  const s = useMemo(() => simulateMany(300, { dailyVolPct: move, windowDays }), [move, windowDays]);
  const sample = s.results.find((r) => r.code === 'TARGET') ?? s.results[0];

  return (
    <section className="card">
      <p className="line" style={{ marginTop: 0 }}>
        ¿Conviene esperar? Probamos <b>300 recorridos posibles</b> del tipo de cambio y comparamos con haber pagado el día 1.
      </p>

      <div className="two">
        <div>
          <label htmlFor="mv">Movimiento del tipo de cambio</label>
          <select id="mv" value={move} onChange={(e) => setMove(Number(e.target.value))}>
            {MOVES.map((m) => <option key={m.pct} value={m.pct}>{m.label} ({m.pct}% al día)</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="wd">Plazo del agente</label>
          <select id="wd" value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
            <option value={1}>1 día</option><option value={7}>1 semana</option><option value={14}>2 semanas</option>
          </select>
        </div>
      </div>

      <div className="lbl">Cómo te va frente a pagar el día 1</div>
      <div className="bar" aria-label={`Mejor ${s.pctGained.toFixed(0)}%, igual ${s.pctEven.toFixed(0)}%, peor ${s.pctLost.toFixed(0)}%`}>
        <div style={{ width: `${s.pctGained}%`, background: '#1a7a52' }}>{s.pctGained >= 12 ? `Mejor ${s.pctGained.toFixed(0)}%` : ''}</div>
        <div style={{ width: `${s.pctEven}%`, background: '#9aa79f' }}>{s.pctEven >= 12 ? `Igual ${s.pctEven.toFixed(0)}%` : ''}</div>
        <div style={{ width: `${s.pctLost}%`, background: '#a4490f' }}>{s.pctLost >= 12 ? `Peor ${s.pctLost.toFixed(0)}%` : ''}</div>
      </div>
      <p className="line">
        Resultado típico <b>{money(s.medianUsdc)}</b> · mal día <b>{money(s.p10Usdc)}</b> · peor caso <b>{money(s.worstUsdc)}</b> USDC
      </p>

      <div className="msg warn" style={{ marginTop: 0 }}>
        Con un tipo de cambio que se mueve al azar, esperar no crea ahorro por sí solo. Lo que sí está garantizado:
        la factura se paga completa y el agente nunca cobra más que el ahorro.
      </div>

      <details style={{ marginTop: 12, marginBottom: 0 }}>
        <summary>Ver un ejemplo</summary>
        <PathChart run={sample} baseRate={DEFAULTS.baseRate} windowDays={windowDays} />
        <p className="hint" style={{ marginTop: 0 }}>
          Pagó el día {sample.day.toFixed(1)}: costó {sample.paidUsdc.toFixed(2)} USDC frente a {sample.baselineUsdc.toFixed(2)} el día 1
          ({money(sample.userSavingsUsdc)} para ti tras la comisión).
        </p>
      </details>
    </section>
  );
}
