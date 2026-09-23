# agent/ — Fase 2

Aquí va el agente vigilante y la integración con IA. Todavía no tiene código.

Lo que construirá esta fase, según [`../PHASES.md`](../PHASES.md):

- Fuente de precios USDC/PEN (`MockOracle` simulado, o real si algún mentor confirma uno disponible en testnet).
- Agente vigilante: consulta `quote(id)` en el contrato cada cierto tiempo y llama a `execute(id, agent)` cuando el ahorro alcanza el umbral pactado. La regla de decisión es determinista (un umbral que baja hasta 0 al acercarse al fin de la ventana), no depende de que un modelo de lenguaje "decida".
- Lectura de la foto de la factura con Qwen VL (monto, acreedor, vencimiento).
- Explicación en español de cada decisión del agente, con Qwen, guardada en un registro de auditoría.
