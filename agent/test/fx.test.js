import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchUsdPen, rateToE7 } from '../src/fx.js';

const respond = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body });

test('lee el tipo de cambio PEN de la respuesta', async () => {
  const r = await fetchUsdPen(respond({ rates: { PEN: 3.71 }, time_last_update_utc: 'hoy' }));
  assert.equal(r.rate, 3.71);
  assert.equal(r.updatedAt, 'hoy');
});

test('rechaza un valor fuera de un rango razonable', async () => {
  await assert.rejects(fetchUsdPen(respond({ rates: { PEN: 0.02 } })), /no es válido/);
  await assert.rejects(fetchUsdPen(respond({ rates: {} })), /no es válido/);
});

test('avisa con claridad si la fuente falla o no hay internet', async () => {
  await assert.rejects(fetchUsdPen(respond({}, false, 503)), /503/);
  await assert.rejects(fetchUsdPen(async () => { throw new Error('offline'); }), /conexión/);
});

test('convierte el precio a 7 decimales sin errores de coma flotante', () => {
  assert.equal(rateToE7(3.8), 38_000_000);
  assert.equal(rateToE7(3.7123456), 37_123_456);
});
