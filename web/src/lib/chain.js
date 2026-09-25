import {
  Address, Asset, BASE_FEE, Contract, Operation, TransactionBuilder,
  nativeToScVal, rpc, scValToNative, xdr,
} from '@stellar/stellar-sdk';
import { getAddress, isAllowed, isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';
import deployment from '../../../deployments/testnet.json';

export { deployment };
export const E7 = 1e7;

const server = new rpc.Server(deployment.rpcUrl);
const { invoiceVault, mockOracle, usdcToken } = deployment.contracts;
// Las lecturas se simulan, no se firman: basta con cualquier cuenta que exista.
const READER = deployment.accounts.payer;

const addr = (a) => new Address(a).toScVal();
const i128 = (n) => nativeToScVal(BigInt(Math.round(n)), { type: 'i128' });
const u64 = (n) => nativeToScVal(BigInt(Math.round(n)), { type: 'u64' });
const u32 = (n) => nativeToScVal(Math.round(n), { type: 'u32' });

/** Un struct de Soroban es un mapa con claves símbolo ordenadas alfabéticamente. */
function structScVal(fields) {
  return xdr.ScVal.scvMap(
    Object.keys(fields).sort().map((k) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: fields[k] })),
  );
}

function buildTx(account, operation) {
  return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: deployment.networkPassphrase })
    .addOperation(operation)
    .setTimeout(120)
    .build();
}

async function read(contractId, method, args = []) {
  const account = await server.getAccount(READER);
  const sim = await server.simulateTransaction(buildTx(account, new Contract(contractId).call(method, ...args)));
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return scValToNative(sim.result.retval);
}

async function waitFor(hash) {
  let res = await server.getTransaction(hash);
  for (let i = 0; i < 40 && res.status === 'NOT_FOUND'; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await server.getTransaction(hash);
  }
  if (res.status !== 'SUCCESS') throw new Error(`La transacción terminó con estado ${res.status}`);
  return res;
}

async function signAndSend(address, operation, { soroban }) {
  const account = await server.getAccount(address);
  let tx = buildTx(account, operation);
  if (soroban) tx = await server.prepareTransaction(tx);
  const signed = await signTransaction(tx.toXDR(), { networkPassphrase: deployment.networkPassphrase, address });
  if (signed.error) throw new Error(signed.error.message || 'Firma cancelada en Freighter');
  const sent = await server.sendTransaction(
    TransactionBuilder.fromXDR(signed.signedTxXdr, deployment.networkPassphrase),
  );
  if (sent.status === 'ERROR') throw new Error('La red rechazó la transacción');
  const res = await waitFor(sent.hash);
  return { hash: sent.hash, value: res.returnValue ? scValToNative(res.returnValue) : undefined };
}

export const txUrl = (hash) => `https://stellar.expert/explorer/testnet/tx/${hash}`;

// --- Billetera -----------------------------------------------------------

export async function connectWallet() {
  const status = await isConnected();
  if (!status.isConnected) throw new Error('No se detectó Freighter. Instálalo desde freighter.app y recarga la página.');
  const access = await requestAccess();
  if (access.error) throw new Error(access.error.message || 'Freighter no dio acceso');
  const { address } = await getAddress();
  return address;
}

/** Si Freighter ya dio permiso a esta página antes, devuelve la dirección sin volver a preguntar. */
export async function restoreWallet() {
  try {
    const allowed = await isAllowed();
    if (!allowed.isAllowed) return '';
    const { address } = await getAddress();
    return address || '';
  } catch {
    return '';
  }
}

export const getBalance = async (address) => Number(await read(usdcToken, 'balance', [addr(address)])) / E7;

/** Trustline del token de prueba, necesaria para poder recibir MPUSDC (repetirla no hace daño). */
export function enableToken(address) {
  const [code, issuer] = deployment.asset.split(':');
  return signAndSend(address, Operation.changeTrust({ asset: new Asset(code, issuer) }), { soroban: false });
}

// --- Lecturas del contrato -----------------------------------------------

export async function getOraclePrice() {
  const [rateE7, ts] = await read(mockOracle, 'price');
  return { rate: Number(rateE7) / E7, updatedAt: Number(ts) };
}

export const getInvoice = (id) => read(invoiceVault, 'get_invoice', [u64(id)]);
export const getQuote = (id) => read(invoiceVault, 'quote', [u64(id)]);
export const statusName = (s) => (Array.isArray(s) ? s[0] : s);

// --- Acciones ------------------------------------------------------------

/** Crea una factura como pagador. Los montos van en unidades de 7 decimales. */
export function createInvoice(address, p) {
  return signAndSend(
    address,
    new Contract(invoiceVault).call(
      'create_invoice',
      addr(address), addr(p.payee), addr(deployment.accounts.agent), addr(usdcToken),
      i128(p.amountPenE7), i128(p.depositE7),
      structScVal({
        due_ts: u64(p.dueTs), window_end: u64(p.windowEnd), min_savings_bps: u32(p.minSavingsBps),
        stop_loss_bps: u32(p.stopLossBps), agent_fee_bps: u32(p.agentFeeBps),
      }),
    ),
    { soroban: true },
  );
}

export const payNow = (address, id) =>
  signAndSend(address, new Contract(invoiceVault).call('pay_now', u64(id)), { soroban: true });
