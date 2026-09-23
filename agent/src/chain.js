import { readFileSync } from 'node:fs';
import {
  Address, BASE_FEE, Contract, Keypair, TransactionBuilder,
  nativeToScVal, rpc, scValToNative, xdr,
} from '@stellar/stellar-sdk';

export const deployment = JSON.parse(
  readFileSync(new URL('../../deployments/testnet.json', import.meta.url), 'utf8'),
);

const server = new rpc.Server(deployment.rpcUrl);

const addr = (a) => new Address(a).toScVal();
const i128 = (n) => nativeToScVal(BigInt(n), { type: 'i128' });
const u64 = (n) => nativeToScVal(BigInt(n), { type: 'u64' });
const u32 = (n) => nativeToScVal(Number(n), { type: 'u32' });

/** Un struct de Soroban es un mapa con claves símbolo ordenadas alfabéticamente. */
function structScVal(fields) {
  const entries = Object.keys(fields).sort().map((k) =>
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: fields[k] }));
  return xdr.ScVal.scvMap(entries);
}

/** Convierte BigInt a string para poder serializar/imprimir resultados. */
export function toPlain(v) {
  return JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)));
}

async function call({ secret, contractId, method, args = [], send = false }) {
  const kp = Keypair.fromSecret(secret);
  const account = await server.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: deployment.networkPassphrase,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();

  if (!send) {
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new Error(`${method}: ${sim.error}`);
    return { value: scValToNative(sim.result.retval) };
  }

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(kp);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === 'ERROR') throw new Error(`${method}: envío rechazado`);
  let res = await server.getTransaction(sent.hash);
  for (let i = 0; i < 30 && res.status === 'NOT_FOUND'; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await server.getTransaction(sent.hash);
  }
  if (res.status !== 'SUCCESS') throw new Error(`${method}: transacción ${res.status} (${sent.hash})`);
  return { hash: sent.hash, value: res.returnValue ? scValToNative(res.returnValue) : undefined };
}

const vault = deployment.contracts.invoiceVault;
const secret = (name) => {
  const s = process.env[name];
  if (!s) throw new Error(`Falta ${name} en agent/.env`);
  return s;
};

export const getInvoice = (id) =>
  call({ secret: secret('AGENT_SECRET'), contractId: vault, method: 'get_invoice', args: [u64(id)] }).then((r) => r.value);

export const quote = (id) =>
  call({ secret: secret('AGENT_SECRET'), contractId: vault, method: 'quote', args: [u64(id)] }).then((r) => r.value);

export const execute = (id) =>
  call({
    secret: secret('AGENT_SECRET'), contractId: vault, method: 'execute', send: true,
    args: [u64(id), addr(deployment.accounts.agent)],
  });

/** Publica un precio en el oráculo simulado (PEN por 1 USDC, con 7 decimales). */
export const setPrice = (rateE7) =>
  call({
    secret: secret('ADMIN_SECRET'), contractId: deployment.contracts.mockOracle, method: 'set_price', send: true,
    args: [i128(rateE7), u64(Math.floor(Date.now() / 1000))],
  });

export const tokenBalance = (account) =>
  call({
    secret: secret('AGENT_SECRET'), contractId: deployment.contracts.usdcToken, method: 'balance',
    args: [addr(account)],
  }).then((r) => r.value);

/** Entrega MPUSDC de prueba a una cuenta (la cuenta debe haber activado el token antes). */
export const mint = (to, amountE7) =>
  call({
    secret: secret('ADMIN_SECRET'), contractId: deployment.contracts.usdcToken, method: 'mint', send: true,
    args: [addr(to), i128(amountE7)],
  });

/** Crea una factura como pagador. `policy` usa segundos unix y puntos básicos. */
export const createInvoice = ({ amountPenE7, deposit, dueTs, windowEnd, minSavingsBps, stopLossBps, agentFeeBps }) =>
  call({
    secret: secret('PAYER_SECRET'), contractId: vault, method: 'create_invoice', send: true,
    args: [
      addr(deployment.accounts.payer), addr(deployment.accounts.payee), addr(deployment.accounts.agent),
      addr(deployment.contracts.usdcToken), i128(amountPenE7), i128(deposit),
      structScVal({
        due_ts: u64(dueTs), window_end: u64(windowEnd), min_savings_bps: u32(minSavingsBps),
        stop_loss_bps: u32(stopLossBps), agent_fee_bps: u32(agentFeeBps),
      }),
    ],
  });
