// Tipo de cambio real USD/PEN. El USDC vale ~1 USD, así que sirve como precio de
// referencia para el oráculo de testnet. Fuente pública y sin clave.
const FX_URL = 'https://open.er-api.com/v6/latest/USD';

/** Devuelve el tipo de cambio actual (PEN por 1 USD) o falla con un mensaje claro. */
export async function fetchUsdPen(fetchFn = fetch) {
  let res;
  try {
    res = await fetchFn(FX_URL);
  } catch {
    throw new Error('No se pudo consultar el tipo de cambio: revisa tu conexión a internet.');
  }
  if (!res.ok) throw new Error(`La fuente de tipo de cambio respondió ${res.status}.`);
  const data = await res.json();
  const rate = Number(data?.rates?.PEN);
  // Un sol por dólar fuera de este rango indica un dato corrupto, no un mercado real.
  if (!(rate > 1 && rate < 10)) throw new Error('El tipo de cambio recibido no es válido.');
  return { rate, updatedAt: data.time_last_update_utc, source: 'open.er-api.com' };
}

export const rateToE7 = (rate) => Math.round(rate * 1e7);
