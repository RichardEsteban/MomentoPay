# web/ — Fase 3

Interfaz de Momento Pay (React + Vite). Lee y escribe en el contrato de Stellar testnet y firma con la billetera Freighter.

## Qué tiene

Cuatro pestañas, pensadas para que cada tarea quepa en una pantalla:

0. **Chat (pestaña principal):** simula la interfaz de WhatsApp para mostrar la experiencia final del producto. Mandas la foto de una factura, el bot la "lee", te propone plazo y precio, firmas con Freighter y el chat muestra el estado en vivo hasta que el agente paga, con el resumen (costo total, margen devuelto y comparación con pagar el día 1). **No está conectado a WhatsApp real:** la blockchain sí es real (crear, consultar y pagar en testnet), pero la lectura de la foto es simulada en el navegador; la lectura real con Gemini está en la CLI (`read-invoice`). Detalles de cómo conectar WhatsApp de verdad: ver "Próximos pasos" del README raíz.
1. **Pagar:** solo pide dos datos (monto en PEN y cuánto puede esperar el agente: 10 min para demo en vivo, 1 día, 1 semana o 2 semanas). Muestra cuánto cuesta hoy, cuánto se bloquea y cuánto es el margen que se devuelve. Margen, ahorro mínimo, comisión y quién cobra están en *Opciones avanzadas*.
2. **Mi factura:** tus facturas como botones, estado en una línea (esperando o pagada), costo hoy frente al día de creación y **Pagar ahora**. Se actualiza cada 10 segundos.
3. **Simulador:** 300 recorridos posibles del tipo de cambio comparados con pagar el día 1, con un selector de **descuento por pronto pago del proveedor** (modelo de la siguiente versión: el contrato desplegado todavía no lo aplica). Usa la misma regla que el agente real (`../agent/src/decision.js`) y muestra el reparto entre casos mejores y peores sin ocultar los malos.

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
