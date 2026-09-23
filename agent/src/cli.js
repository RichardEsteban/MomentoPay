import { watchInvoice } from './agent.js';
import { createInvoice, deployment, getInvoice, mint, quote, setPrice, tokenBalance, toPlain } from './chain.js';
import { readInvoice } from './gemini.js';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};
const show = (v) => console.log(JSON.stringify(toPlain(v), null, 2));

const HELP = `Uso: npm run cli -- <comando>

  status <id>                     Estado de la factura y cotización actual
  set-price <PEN por USDC>        Publica un precio en el oráculo simulado (ej. 3.9)
  create-demo [--window-secs 600] Crea una factura de prueba de 950 PEN con 300 USDC bloqueados
  watch <id> [--poll 10] [--target-bps 300]   Vigila la factura y paga en el mejor momento
  read-invoice <foto.jpg>         Lee una factura con Gemini (requiere GEMINI_API_KEY)
  balances                        Saldos de MPUSDC de las cuentas de prueba
  fund <G...>                     Envía 300 MPUSDC de prueba a una cuenta (debe haber activado el token)`;

async function main() {
  switch (cmd) {
    case 'status': {
      const id = rest[0];
      show({ invoice: await getInvoice(id), quote: await quote(id) });
      break;
    }
    case 'set-price': {
      const rate = Number(rest[0]);
      if (!(rate > 0)) throw new Error('Indica un precio, por ejemplo: set-price 3.9');
      const r = await setPrice(Math.round(rate * 1e7));
      console.log(`Precio fijado en ${rate} PEN/USDC. Tx: https://stellar.expert/explorer/testnet/tx/${r.hash}`);
      break;
    }
    case 'create-demo': {
      const now = Math.floor(Date.now() / 1000);
      const windowSecs = Number(opt('window-secs', 600));
      const r = await createInvoice({
        amountPenE7: 9_500_000_000n, // 950 PEN, ~250 USDC a 3.8
        deposit: 3_000_000_000n,     // 300 USDC: factura + colchón
        dueTs: now + 2 * 24 * 3600,
        windowEnd: now + windowSecs,
        minSavingsBps: 50,
        stopLossBps: 1500,
        agentFeeBps: 2000,
      });
      console.log(`Factura creada con id ${r.value}. Tx: https://stellar.expert/explorer/testnet/tx/${r.hash}`);
      break;
    }
    case 'watch':
      await watchInvoice({
        id: rest[0],
        pollSecs: Number(opt('poll', 10)),
        targetBps: Number(opt('target-bps', 300)),
      });
      break;
    case 'read-invoice':
      show(await readInvoice(rest[0]));
      break;
    case 'fund': {
      const to = rest[0];
      if (!to?.startsWith('G')) throw new Error('Indica la dirección Stellar: fund G...');
      const r = await mint(to, 3_000_000_000n); // 300 MPUSDC de prueba
      console.log(`300 MPUSDC de prueba enviados. Tx: https://stellar.expert/explorer/testnet/tx/${r.hash}`);
      break;
    }
    case 'balances': {
      const out = {};
      for (const [name, a] of Object.entries(deployment.accounts)) out[name] = (await tokenBalance(a)) ;
      show(out);
      break;
    }
    default:
      console.log(HELP);
  }
}

main().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
