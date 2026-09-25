import { useCallback, useEffect, useState } from 'react';
import CreateInvoice from './components/CreateInvoice.jsx';
import InvoiceStatus from './components/InvoiceStatus.jsx';
import WhatsAppSim from './components/WhatsAppSim.jsx';
import Simulator from './components/Simulator.jsx';
import { connectWallet, deployment, enableToken, getBalance, txUrl } from './lib/chain.js';

const STORAGE_KEY = 'momento-pay:invoice-ids';
const loadIds = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []; } catch { return []; }
};

const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'pay', label: 'Pagar' },
  { id: 'invoice', label: 'Mi factura' },
  { id: 'sim', label: 'Simulador' },
];

export default function App() {
  const [tab, setTab] = useState('chat');
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
      setMsg({ kind: 'ok', text: <>Listo, MPUSDC activado. <a href={txUrl(r.hash)} target="_blank" rel="noreferrer">Ver transacción</a></> });
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(false); }
  }

  const copy = (text, what) =>
    navigator.clipboard.writeText(text).then(() => setMsg({ kind: 'ok', text: `${what} copiado.` }));

  const rememberId = (id) => {
    const next = [...new Set([...ids, id])];
    setIds(next); setSelected(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const onCreated = (id, hash) => {
    const next = [...new Set([...ids, id])];
    setIds(next); setSelected(id); setTab('invoice');
    setMsg({
      kind: 'ok',
      text: <>Factura {id} creada y fondos bloqueados. <a href={txUrl(hash)} target="_blank" rel="noreferrer">Ver transacción</a>. Para que el agente la vigile: <code>npm run cli -- watch {id}</code></>,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (address) refreshBalance(address);
  };

  useEffect(() => {
    if (!address) return undefined;
    const t = setInterval(() => refreshBalance(address), 15000);
    return () => clearInterval(t);
  }, [address, refreshBalance]);

  const needsFunds = address && balance === 0;

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <h1>Momento Pay</h1>
          <p>Tu factura siempre se paga.</p>
        </div>
        <div className="wallet">
          {address ? (
            <>
              <button className="chip" title={`${address}\nClic para copiar`} onClick={() => copy(address, 'Dirección')}>
                {address.slice(0, 4)}…{address.slice(-4)}
              </button>
              <span className="chip">{balance === null ? '…' : balance.toFixed(2)} MPUSDC</span>
            </>
          ) : (
            <button onClick={connect} style={{ height: 38 }}>Conectar Freighter</button>
          )}
        </div>
      </header>

      {needsFunds && (
        <div className="msg warn" style={{ marginTop: 0, marginBottom: 12 }}>
          <b>Primeros pasos:</b> 1) <button className="ghost" style={{ height: 30, padding: '0 10px' }} onClick={activate} disabled={busy}>Activar MPUSDC</button>{' '}
          2) pide fondos de prueba con{' '}
          <button className="ghost" style={{ height: 30, padding: '0 10px' }} onClick={() => copy(`npm run cli -- fund ${address}`, 'Comando')}>copiar comando</button>{' '}
          y pégalo en la carpeta <code>agent/</code>.
        </div>
      )}
      {msg && (
        <div className={`msg ${msg.kind}`} role="status" style={{ marginTop: 0, marginBottom: 12 }}>{msg.text}</div>
      )}

      <nav className="tabs four" role="tablist" aria-label="Secciones">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {tab === 'chat' && <WhatsAppSim address={address} onConnect={connect} onInvoice={rememberId} refreshBalance={refreshBalance} />}
      {tab === 'pay' && <CreateInvoice address={address} onCreated={onCreated} onConnect={connect} />}
      {tab === 'invoice' && <InvoiceStatus address={address} ids={ids} selected={selected} setSelected={setSelected} goPay={() => setTab('pay')} />}
      {tab === 'sim' && <Simulator />}

      <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', marginTop: 18 }}>
        Stellar testnet · dinero de prueba ·{' '}
        <a href={`https://lab.stellar.org/r/testnet/contract/${deployment.contracts.invoiceVault}`} target="_blank" rel="noreferrer">contrato</a>
      </p>
    </div>
  );
}
