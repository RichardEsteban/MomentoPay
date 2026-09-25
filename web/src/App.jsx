import { useCallback, useEffect, useState } from 'react';
import CreateInvoice from './components/CreateInvoice.jsx';
import InvoiceStatus from './components/InvoiceStatus.jsx';
import Simulator from './components/Simulator.jsx';
import { connectWallet, deployment, enableToken, getBalance, txUrl } from './lib/chain.js';

const STORAGE_KEY = 'momento-pay:invoice-ids';
const loadIds = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []; } catch { return []; }
};

export default function App() {
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState(null);
  const [ids, setIds] = useState(loadIds);
  const [selected, setSelected] = useState(() => loadIds().at(-1) ?? '');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const refreshBalance = useCallback(async (a) => {
    try { setBalance(await getBalance(a)); } catch { setBalance(null); }
  }, []);

  async function connect() {
    setMsg(null);
    try { const a = await connectWallet(); setAddress(a); refreshBalance(a); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  }

  async function activate() {
    setBusy(true); setMsg(null);
    try {
      const r = await enableToken(address);
      setMsg({ kind: 'ok', text: <>MPUSDC activado en tu cuenta. <a href={txUrl(r.hash)} target="_blank" rel="noreferrer">Ver transacción</a></> });
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(false); }
  }

  const onCreated = (id) => {
    const next = [...new Set([...ids, id])];
    setIds(next); setSelected(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (address) refreshBalance(address);
  };

  useEffect(() => {
    if (!address) return undefined;
    const t = setInterval(() => refreshBalance(address), 15000);
    return () => clearInterval(t);
  }, [address, refreshBalance]);

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <h1>Momento Pay</h1>
          <p>Tu factura siempre se paga. Tú ganas el momento.</p>
        </div>
        <div className="wallet">
          {address ? (
            <>
              <button
                className="chip"
                style={{ border: 0, cursor: 'pointer' }}
                title={`Tu dirección: ${address}\nClic para copiarla`}
                onClick={() => navigator.clipboard.writeText(address).then(() => setMsg({ kind: 'ok', text: `Dirección copiada: ${address}` }))}
              >
                {address.slice(0, 5)}…{address.slice(-4)} · copiar
              </button>
              <span className="chip">{balance === null ? '…' : balance.toFixed(2)} MPUSDC</span>
              <button className="ghost" onClick={activate} disabled={busy}>Activar MPUSDC</button>
            </>
          ) : (
            <button onClick={connect}>Conectar Freighter</button>
          )}
        </div>
      </header>

      {msg && <div className={msg.kind === 'ok' ? 'ok' : 'err'} style={{ marginTop: 0, marginBottom: 20 }}>{msg.text}</div>}

      {address && balance === 0 && (
        <div className="note" style={{ marginTop: 0, marginBottom: 20 }}>
          Tu cuenta no tiene MPUSDC de prueba. Pulsa <b>Activar MPUSDC</b> y luego pide fondos de prueba con:{' '}
          <code>npm run cli -- fund {address}</code> (desde la carpeta <code>agent/</code>).
        </div>
      )}

      <CreateInvoice address={address} onCreated={onCreated} />
      <InvoiceStatus address={address} ids={ids} selected={selected} setSelected={setSelected} />
      <Simulator />

      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        Todo corre en Stellar testnet con dinero de prueba. Contrato:{' '}
        <a href={`https://lab.stellar.org/r/testnet/contract/${deployment.contracts.invoiceVault}`} target="_blank" rel="noreferrer">
          {deployment.contracts.invoiceVault.slice(0, 8)}…
        </a>
      </p>
    </div>
  );
}
