import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, thresholdBps } from '../src/decision.js';

const invoice = { window_end: 1000, min_savings_bps: 100 };
const base = { windowStartSecs: 0, targetBps: 300 };
const q = (over = {}) => ({ savings_bps: 0, stop_loss_hit: false, can_agent_execute: false, ...over });

test('el umbral baja linealmente pero nunca por debajo del mínimo del contrato', () => {
  const args = { targetBps: 300, minSavingsBps: 100, windowStartSecs: 0, windowEndSecs: 1000 };
  assert.equal(thresholdBps({ ...args, nowSecs: 0 }), 300);
  assert.equal(thresholdBps({ ...args, nowSecs: 500 }), 150);
  assert.equal(thresholdBps({ ...args, nowSecs: 900 }), 100);
  assert.equal(thresholdBps({ ...args, nowSecs: 2000 }), 100);
});

test('espera si el ahorro todavía no alcanza el umbral', () => {
  const d = decide({ ...base, invoice, nowSecs: 0, quote: q({ savings_bps: 200, can_agent_execute: true }) });
  assert.equal(d.action, 'wait');
});

test('ejecuta cuando el ahorro alcanza el umbral', () => {
  const d = decide({ ...base, invoice, nowSecs: 0, quote: q({ savings_bps: 320, can_agent_execute: true }) });
  assert.deepEqual([d.action, d.code], ['execute', 'TARGET']);
});

test('con el umbral ya bajado, un ahorro menor también dispara el pago', () => {
  const d = decide({ ...base, invoice, nowSecs: 500, quote: q({ savings_bps: 160, can_agent_execute: true }) });
  assert.equal(d.action, 'execute');
});

test('no ejecuta si el contrato no lo permite, aunque el ahorro parezca suficiente', () => {
  const d = decide({ ...base, invoice, nowSecs: 0, quote: q({ savings_bps: 500, can_agent_execute: false }) });
  assert.equal(d.action, 'wait');
});

test('ejecuta siempre al llegar el fin de la ventana', () => {
  const d = decide({ ...base, invoice, nowSecs: 1000, quote: q({ savings_bps: -50 }) });
  assert.deepEqual([d.action, d.code], ['execute', 'DEADLINE']);
});

test('ejecuta si se activa el stop-loss', () => {
  const d = decide({ ...base, invoice, nowSecs: 100, quote: q({ savings_bps: -1600, stop_loss_hit: true }) });
  assert.deepEqual([d.action, d.code], ['execute', 'STOP_LOSS']);
});
