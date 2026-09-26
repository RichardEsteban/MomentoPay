# agent/ — Fase 2

El agente vigilante de Momento Pay. Consulta el contrato en Stellar testnet, decide cuándo pagar con una regla determinista y explica cada decisión en español con Gemini.

**La decisión de pagar nunca la toma el modelo de lenguaje.** Gemini solo lee la foto de la factura y explica lo que ya resolvió la regla (`src/decision.js`). Si Gemini no está disponible, el agente sigue funcionando con explicaciones de plantilla.

## Cómo funciona la regla

- El agente empieza exigiendo un ahorro objetivo (`--target-bps`, por defecto 3%).
- Ese umbral **baja linealmente** hasta el mínimo que fijó el contrato (`min_savings_bps`) al acercarse el fin de la ventana.
- Paga si el ahorro alcanza el umbral, si se acabó la ventana o si se activó el stop-loss.
- El contrato vuelve a verificar todo: aunque el agente se equivocara, no puede pagar en un momento peor que el precio de creación.

## Configuración

```bash
cd agent
npm install
cp .env.example .env    # en Windows: copy .env.example .env
```

Completa `agent/.env` (está en `.gitignore`, nunca se sube):

| Variable | Qué es |
|---|---|
| `GEMINI_API_KEY` | Tu clave de [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | Opcional. Por defecto `gemini-2.5-flash`; cámbialo si ese modelo ya no está disponible |
| `AGENT_SECRET`, `PAYER_SECRET`, `ADMIN_SECRET` | Claves de las cuentas de testnet (solo dinero de prueba) |

Las direcciones de los contratos y cuentas están en [`../deployments/testnet.json`](../deployments/testnet.json).

## Uso

```bash
npm test                                   # pruebas de la regla de decisión
npm run cli -- balances                    # saldos de las cuentas de prueba
npm run cli -- demo                        # TODO el flujo de una vez: precio base, factura, mejora del precio y agente
npm run cli -- sync-price                  # publica el tipo de cambio REAL USD/PEN en el oráculo simulado
npm run cli -- create-demo --window-secs 150   # solo crea una factura de 950 PEN con 300 USDC bloqueados
npm run cli -- set-price 3.9               # publica un precio en el oráculo simulado
npm run cli -- status 0                    # estado y cotización de la factura 0
npm run cli -- watch 0 --poll 10           # el agente vigila y paga en el mejor momento
npm run cli -- read-invoice factura.jpg    # lee una factura con Gemini
```

Cada decisión queda en `audit.log.jsonl` (no se sube al repo) con su explicación.

## Estructura

```
src/decision.js   Regla determinista (umbral que baja hasta el mínimo del contrato)
src/chain.js      Llamadas al contrato en testnet (cotizar, ejecutar, crear factura, oráculo)
src/gemini.js     Lectura de facturas y explicaciones en español
src/agent.js      Bucle de vigilancia + registro de auditoría
src/cli.js        Comandos
src/fx.js         Tipo de cambio real USD/PEN (fuente pública, sin clave)
test/             Pruebas de la regla de decisión y del tipo de cambio
```
