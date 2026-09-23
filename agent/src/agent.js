import { appendFileSync } from 'node:fs';
import { execute, getInvoice, quote, toPlain } from './chain.js';
import { decide } from './decision.js';
import { explainDecision } from './gemini.js';

const AUDIT_FILE = new URL('../audit.log.jsonl', import.meta.url);

/** Registro de auditoría: una línea JSON por decisión, con su explicación. */
export function audit(entry) {
  appendFileSync(AUDIT_FILE, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

const statusName = (s) => (Array.isArray(s) ? s[0] : s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Vigila una factura hasta que se liquide. Devuelve el resultado final. */
export async function watchInvoice({ id, pollSecs = 10, targetBps = 300, log = console.log }) {
  const windowStartSecs = Math.floor(Date.now() / 1000);
  let first = true;

  for (;;) {
    const invoice = await getInvoice(id);
    if (statusName(invoice.status) === 'Settled') {
      log(`Factura ${id} ya liquidada.`);
      return { settled: true };
    }

    const q = await quote(id);
    const nowSecs = Math.floor(Date.now() / 1000);
    const d = decide({ quote: q, invoice, nowSecs, windowStartSecs, targetBps });
    const ctx = { code: d.code, savingsBps: q.savings_bps, thresholdBps: d.thresholdBps };

    if (d.action === 'execute' || first) {
      const explanation = await explainDecision(ctx);
      log(`[${d.code}] ${explanation}`);
      audit({ invoiceId: id, ...ctx, action: d.action, explanation });
    } else {
      log(`[WAIT] ahorro ${q.savings_bps} bps, umbral ${d.thresholdBps} bps`);
    }
    first = false;

    if (d.action === 'execute') {
      const result = await execute(id);
      const settlement = toPlain(result.value);
      audit({ invoiceId: id, event: 'settled', hash: result.hash, settlement });
      log(`Liquidada. Tx: https://stellar.expert/explorer/testnet/tx/${result.hash}`);
      return { settled: true, hash: result.hash, settlement };
    }
    await sleep(pollSecs * 1000);
  }
}
