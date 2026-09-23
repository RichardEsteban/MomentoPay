import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';

// El modelo se puede cambiar sin tocar el código: GEMINI_MODEL en agent/.env.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

/** Lee una foto de factura y devuelve los datos que el contrato necesita. */
export async function readInvoice(imagePath) {
  const ai = client();
  if (!ai) throw new Error('Falta GEMINI_API_KEY en agent/.env');
  const mimeType = MIME[extname(imagePath).toLowerCase()];
  if (!mimeType) throw new Error('Formato no soportado: usa .jpg, .png o .webp');

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { inlineData: { mimeType, data: readFileSync(imagePath).toString('base64') } },
      {
        text:
          'Extrae los datos de esta factura peruana. Responde solo con el JSON pedido. ' +
          'Si un dato no aparece, usa null; no lo inventes.',
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          creditor: { type: Type.STRING, nullable: true, description: 'Nombre de quien cobra' },
          amount: { type: Type.NUMBER, nullable: true, description: 'Monto total a pagar' },
          currency: { type: Type.STRING, nullable: true, description: 'PEN o USD' },
          dueDate: { type: Type.STRING, nullable: true, description: 'Vencimiento en formato YYYY-MM-DD' },
        },
        required: ['creditor', 'amount', 'currency', 'dueDate'],
      },
    },
  });
  return JSON.parse(response.text);
}

const pct = (bps) => (Number(bps) / 100).toFixed(2);

function templateExplanation({ code, savingsBps, thresholdBps }) {
  switch (code) {
    case 'TARGET':
      return `Pagué ahora: el ahorro (${pct(savingsBps)}%) superó lo que exigía en este momento (${pct(thresholdBps)}%).`;
    case 'DEADLINE':
      return 'Se acabó el plazo que elegiste, así que pagué al precio de mercado. La factura quedó cubierta.';
    case 'STOP_LOSS':
      return `El precio empeoró más de lo tolerado (${pct(savingsBps)}%), así que pagué de inmediato para proteger tu factura.`;
    default:
      return `Sigo esperando: el ahorro actual (${pct(savingsBps)}%) todavía no llega al umbral (${pct(thresholdBps)}%).`;
  }
}

/** Explica en español, en una o dos frases, lo que decidió la regla determinista. */
export async function explainDecision(ctx) {
  const ai = client();
  if (!ai) return templateExplanation(ctx);
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents:
        'Eres el asistente de pagos Momento Pay. Explica a una persona sin conocimientos técnicos, ' +
        'en español y en máximo dos frases, la decisión que ya tomó el sistema. No des consejos de ' +
        'inversión ni prometas ganancias. Datos de la decisión: ' + JSON.stringify(ctx),
    });
    return response.text.trim();
  } catch {
    return templateExplanation(ctx);
  }
}
