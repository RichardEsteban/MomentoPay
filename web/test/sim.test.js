import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateMany, simulateRun } from '../src/lib/sim.js';

test('es reproducible: la misma semilla da el mismo resultado', () => {
  assert.deepEqual(simulateRun(7).userSavingsUsdc, simulateRun(7).userSavingsUsdc);
});

test('sin volatilidad no hay ahorro y se paga al vencer la ventana', () => {
  const r = simulateRun(1, { dailyVolPct: 0 });
  assert.equal(r.code, 'DEADLINE');
  assert.equal(r.userSavingsUsdc, 0);
  assert.equal(r.day, 7);
});

test('cuando paga por ahorro (TARGET) el usuario nunca sale peor que pagar el día 1', () => {
  const s = simulateMany(400, { dailyVolPct: 0.6 });
  const target = s.results.filter((r) => r.code === 'TARGET');
  assert.ok(target.length > 0, 'debería haber pagos por ahorro');
  for (const r of target) assert.ok(r.userSavingsUsdc >= 0);
});

test('la comisión del agente nunca supera el ahorro', () => {
  const s = simulateMany(400, { dailyVolPct: 0.6 });
  for (const r of s.results) {
    const gross = r.baselineUsdc - r.paidUsdc;
    assert.ok(r.feeUsdc <= Math.max(gross, 0) + 1e-9);
  }
});

test('el resumen reparte los 100 escenarios entre ganó, empató y perdió', () => {
  const s = simulateMany(200, { dailyVolPct: 0.5 });
  assert.ok(Math.abs(s.pctGained + s.pctEven + s.pctLost - 100) < 1e-9);
});
