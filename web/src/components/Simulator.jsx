import { useMemo, useState } from 'react';
import { DEFAULTS, simulateMany } from '../lib/sim.js';

const money = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;

function PathChart({ run, baseRate, windowDays }) {
  const W = 720, H = 200, P = 28;
  const rates = run.path.map((p) => p.rate);
  const lo = Math.min(baseRate, ...rates), hi = Math.max(baseRate, ...rates);
  const span = hi - lo || 0.01;
  const x = (d) => P + (d / windowDays) * (W - 2 * P);
  const y = (r) => H - P - ((r - lo) / span) * (H - 2 * P);
  const points = run.path.filter((p) => p.day <= run.day).map((p) => `${x(p.day)},${y(p.rate)}`).join(' ');
  const last = run.path.filter((p) => p.day <= run.day).at(-1);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Recorrido del tipo de cambio durante el plazo">
      <line x1={P} x2={W - P} y1={y(baseRate)} y2={y(baseRate)} stroke="#9aa79f" strokeDasharray="5 5" />
      <text x={P} y={y(baseRate) - 6} fontSize="11" fill="#5c6b63">precio del día 1: {baseRate.toFixed(3)}</text>
      <polyline points={points} fill="none" stroke="#1f7a55" strokeWidth="2.5" />
      <circle cx={x(last.day)} cy={y(last.rate)} r="6" fill={run.code === 'TARGET' ? '#1f7a55' : '#b4531a'} />
      <text x={Math.min(x(last.day) + 10, W - 190)} y={y(last.rate) - 10} fontSize="12" fill="#16241d">
        {run.code === 'TARGET' ? 'el agente pagó aquí' : 'se acabó el plazo: pago a precio de mercado'}
      </text>
      <text x={P} y={H - 6} fontSize="11" fill="#5c6b63">día 0</text>
      <text x={W - P - 36} y={H - 6} fontSize="11" fill="#5c6b63">día {windowDays}</text>
    </svg>
  );
}

export default function Simulator() {
  const [vol, setVol] = useState(DEFAULTS.dailyVolPct);
  const [windowDays, setWindowDays] = useState(7);
  const [runs, setRuns] = useState(300);

  const s = useMemo(() => simulateMany(runs, { dailyVolPct: vol, windowDays }), [runs, vol, windowDays]);
  const sample = s.results.find((r) => r.code === 'TARGET') ?? s.results[0];
  const won = s.pctGained, even = s.pctEven, lost = s.pctLost;

  return (
    <section className="card">
      <h2>3. Simulador: ¿pagar el día 1 o dejar que el agente elija?</h2>
      <p className="sub">
        Prueba miles de recorridos posibles del tipo de cambio y compara el resultado con haber pagado el día 1.
        Usa la misma regla de decisión que el agente real.
      </p>
      <div className="grid">
        <div>
          <label>Cuánto se mueve el tipo de cambio por día (%)</label>
          <input type="number" min="0" step="0.1" value={vol} onChange={(e) => setVol(Math.max(0, Number(e.target.value)))} />
        </div>
        <div>
          <label>Plazo del agente</label>
          <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
            <option value={1}>1 día</option><option value={7}>1 semana</option><option value={14}>2 semanas</option>
          </select>
        </div>
        <div>
          <label>Escenarios a simular</label>
          <select value={runs} onChange={(e) => setRuns(Number(e.target.value))}>
            <option value={100}>100</option><option value={300}>300</option><option value={1000}>1000</option>
          </select>
        </div>
      </div>

      <div className="stats">
        <div className={`stat ${s.medianUsdc >= 0 ? 'good' : 'bad'}`}><b>{money(s.medianUsdc)}</b><span>USDC · resultado típico (mediana)</span></div>
        <div className="stat good"><b>{money(s.p90Usdc)}</b><span>USDC · buen escenario (1 de cada 10)</span></div>
        <div className="stat bad"><b>{money(s.p10Usdc)}</b><span>USDC · mal escenario (1 de cada 10)</span></div>
        <div className="stat bad"><b>{money(s.worstUsdc)}</b><span>USDC · el peor de {runs}</span></div>
      </div>

      <div className="bar" aria-label="Reparto de resultados">
        <div style={{ width: `${won}%`, background: '#1f7a55' }}>{won >= 8 ? `Mejor ${won.toFixed(0)}%` : ''}</div>
        <div style={{ width: `${even}%`, background: '#9aa79f' }}>{even >= 8 ? `Igual ${even.toFixed(0)}%` : ''}</div>
        <div style={{ width: `${lost}%`, background: '#b4531a' }}>{lost >= 8 ? `Peor ${lost.toFixed(0)}%` : ''}</div>
      </div>
      <div className="legend">
        <span>Verde: terminas mejor que pagando el día 1</span>
        <span>Gris: igual</span>
        <span>Naranja: terminas peor</span>
      </div>

      <div className="note">
        Con un tipo de cambio que se mueve al azar, esperar no crea ahorro por sí solo: el agente reparte el resultado
        entre mejores y peores casos. Lo que el contrato garantiza es que la factura siempre se paga completa y que el
        agente nunca cobra más que el ahorro. Por eso el ahorro real vendrá de descuentos por pronto pago y de mejor
        ejecución de rutas (próximos pasos), no de adivinar el mercado.
      </div>

      <h3 style={{ margin: '20px 0 0', fontSize: 16 }}>Un escenario de ejemplo</h3>
      <PathChart run={sample} baseRate={DEFAULTS.baseRate} windowDays={windowDays} />
      <p className="sub" style={{ margin: 0 }}>
        En este caso pagó el día {sample.day.toFixed(1)}: la factura costó {sample.paidUsdc.toFixed(2)} USDC frente a
        {' '}{sample.baselineUsdc.toFixed(2)} USDC del día 1 ({money(sample.userSavingsUsdc)} USDC para ti tras la comisión).
      </p>
    </section>
  );
}
