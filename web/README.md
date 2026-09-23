# web/ — Fase 3

Interfaz de Momento Pay (React + Vite). Lee y escribe en el contrato de Stellar testnet y firma con la billetera Freighter.

## Qué tiene

1. **Crea tu factura:** monto en PEN, plazo del agente (10 min para demo en vivo, 1 día, 1 semana o 2 semanas), colchón y comisión. Muestra el precio real del oráculo, cuánto cuesta la factura hoy y cuánto se bloquea.
2. **Sigue tu factura:** estado, USDC bloqueados, costo hoy frente al día de creación, plazo restante y botón "Pagar ahora". Se actualiza cada 10 segundos.
3. **Simulador:** miles de recorridos posibles del tipo de cambio, comparando pagar el día 1 contra dejar que el agente elija. Usa la misma regla de decisión que el agente real (`../agent/src/decision.js`) y muestra el reparto entre casos mejores y peores sin ocultar los malos.

## Cómo correrla

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # pruebas del simulador
npm run build
```

Necesitas la extensión [Freighter](https://www.freighter.app/) configurada en **testnet**.

## Primer uso con tu billetera

1. Pulsa **Conectar Freighter**.
2. Pulsa **Activar MPUSDC** (crea la línea de confianza del token de prueba).
3. Pide fondos de prueba desde la carpeta `agent/`:
   ```bash
   npm run cli -- fund G...tu-direccion
   ```
4. Crea una factura con plazo de 10 minutos y, en otra terminal, deja que el agente la vigile:
   ```bash
   npm run cli -- watch 0
   ```
5. Para provocar un ahorro en la demo, cambia el precio del oráculo simulado: `npm run cli -- set-price 3.9`.

## Estructura

```
src/lib/chain.js   Lecturas del contrato y firmas con Freighter
src/lib/sim.js     Simulador (reproducible con semilla)
src/components/    CreateInvoice, InvoiceStatus, Simulator
test/              Pruebas del simulador
```

## Límites conocidos

- La lectura de facturas con Gemini se usa desde la CLI del agente (`read-invoice`), no desde el navegador, para no exponer la clave de la API en el cliente.
- El precio viene del oráculo simulado; no hay un feed USDC/PEN real en testnet.
