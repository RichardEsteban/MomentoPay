// Simulador: compara pagar el día 1 contra dejar que el agente elija el momento.
// Usa la misma regla de decisión que el agente real (agent/src/decision.js).
import { decide } from '../../../agent/src/decision.js';

const E7 = 1e7;
const BPS = 10_000;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** USDC necesarios (en unidades de 7 decimales), redondeando hacia arriba como el contrato. */
const requiredE7 = (amountPenE7, rateE7) => Math.ceil((amountPenE7 * E7) / rateE7);

export const DEFAULTS = {
  baseRate: 3.8,        // PEN por 1 USDC al crear la factura
  dailyVolPct: 0.4,     // volatilidad diaria del tipo de cambio, en %
  windowDays: 7,
  stepHours: 6,         // cada cuánto mira el precio el agente
  amountPen: 950,
  minSavingsBps: 50,
  stopLossBps: 1500,
  targetBps: 300,
  agentFeeBps: 2000,
};

/** Simula una factura de principio a fin. Devuelve el camino de precios y el resultado. */
export function simulateRun(seed, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const rng = mulberry32(seed);
  const stepSecs = o.stepHours * 3600;
  const windowEndSecs = o.windowDays * 86400;
  const amountPenE7 = Math.round(o.amountPen * E7);
  const baseRateE7 = Math.round(o.baseRate * E7);
  const baseRequired = requiredE7(amountPenE7, baseRateE7);
  const invoice = { window_end: windowEndSecs, min_savings_bps: o.minSavingsBps };
  const stepVol = (o.dailyVolPct / 100) * Math.sqrt(o.stepHours / 24);

  const path = [{ day: 0, rate: o.baseRate }];
  let rate = o.baseRate;
  for (let now = 0; ; now += stepSecs) {
    if (now > 0) {
      rate *= Math.exp(stepVol * gaussian(rng));
      path.push({ day: now / 86400, rate });
    }
    const rateE7 = Math.round(rate * E7);
    const required = requiredE7(amountPenE7, rateE7);
    // Misma aritmética entera que el contrato (división truncada hacia cero).
    const savingsBps = Math.trunc(((baseRequired - required) * BPS) / baseRequired);
    const quote = {
      savings_bps: savingsBps,
      stop_loss_hit: savingsBps <= -o.stopLossBps,
      can_agent_execute: now < windowEndSecs && savingsBps >= o.minSavingsBps,
    };
    const d = decide({ quote, invoice, nowSecs: now, windowStartSecs: 0, targetBps: o.targetBps });
    if (d.action === 'execute') {
      const positive = Math.max(baseRequired - required, 0);
      const fee = Math.floor((positive * o.agentFeeBps) / BPS);
      return {
        code: d.code,
        day: now / 86400,
        path,
        baselineUsdc: baseRequired / E7,
        paidUsdc: required / E7,
        feeUsdc: fee / E7,
        // Lo que gana el usuario frente a pagar el día 1 (negativo si el precio empeoró).
        userSavingsUsdc: (baseRequired - required - fee) / E7,
      };
    }
  }
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** Corre muchas simulaciones y resume la distribución de resultados. */
export function simulateMany(runs = 300, options = {}, firstSeed = 1) {
  const results = Array.from({ length: runs }, (_, i) => simulateRun(firstSeed + i, options));
  const savings = results.map((r) => r.userSavingsUsdc).sort((a, b) => a - b);
  const count = (fn) => results.filter(fn).length;
  const byCode = { TARGET: 0, DEADLINE: 0, STOP_LOSS: 0 };
  for (const r of results) byCode[r.code] += 1;
  return {
    runs,
    results,
    medianUsdc: percentile(savings, 0.5),
    p10Usdc: percentile(savings, 0.1),
    p90Usdc: percentile(savings, 0.9),
    meanUsdc: savings.reduce((a, b) => a + b, 0) / runs,
    pctGained: (count((r) => r.userSavingsUsdc > 0) / runs) * 100,
    pctEven: (count((r) => r.userSavingsUsdc === 0) / runs) * 100,
    pctLost: (count((r) => r.userSavingsUsdc < 0) / runs) * 100,
    worstUsdc: savings[0],
    byCode,
  };
}
