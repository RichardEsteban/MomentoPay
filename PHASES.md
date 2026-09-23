# Plan de trabajo — 3 fases

Ventana de desarrollo: 19-25 de setiembre de 2026. Checkpoint intermedio obligatorio: 23 de setiembre. Cierre de entregables: 25 de setiembre.

## Fase 1 — Contrato y esqueleto del proyecto (objetivo: checkpoint del 23/09)

**Meta:** el contrato `InvoiceVault` compila, tiene sus tipos y funciones definidos, y cuenta con pruebas de los invariantes principales. El repositorio queda organizado para las fases 2 y 3.

- [x] Estructura de carpetas del repositorio
- [x] `README.md`, `LICENSE` (MIT), diagramas en `docs/`
- [x] Proyecto Rust del contrato (`contracts/invoice-vault`)
- [x] Tipos de datos: `Config`, `Invoice`, `Status`, `Reason`, `Quote`, `Settlement`
- [x] Funciones: `init`, `create_invoice`, `top_up`, `quote`, `execute`, `pay_now`, `get_invoice`
- [x] Pruebas unitarias de los invariantes de seguridad
- [x] Compilar a `wasm32v1-none` y correr las pruebas — 6/6 pruebas pasan, `invoice_vault.wasm` generado
- [x] Desplegar en Stellar testnet y guardar el Contract ID (`CBKBFHC3D76MTOE5DMBJVS64HY2LBVTOSG2EKTJH7E2XWO2PJKQS4E5K`)

## Fase 2 — Agente y lectura de facturas con IA

**Meta:** el agente vigilante consulta el contrato y decide cuándo pedir el pago, y una IA (Gemini) lee la foto de la factura y explica cada decisión en español.

- [ ] Fuente de precios USDC/PEN: `MockOracle` simulado (o real, si algún mentor confirma uno disponible en testnet)
- [ ] Agente vigilante en `agent/`: regla de decisión determinista (umbral que baja linealmente hasta el fin de la ventana)
- [ ] Integración con Gemini (visión) para leer monto, acreedor y vencimiento desde una foto
- [ ] Integración con Gemini para explicar cada decisión ("esperé porque...", "pagué porque...")
- [ ] Registro de auditoría de las decisiones del agente
- [ ] Pruebas de extremo a extremo contra el contrato desplegado en testnet

## Fase 3 — Interfaz, simulador y entregables finales

**Meta:** una persona puede crear una factura, ver la cotización y el estado, y entender el ahorro frente a pagar el día 1. Entregables listos para subir a la plataforma del hackathon.

- [ ] Interfaz web en `web/`: crear factura, conectar Freighter, ver línea de tiempo y estado
- [ ] Simulador: compara pagar el día 1 contra el resultado del agente en una ventana de hasta 2 semanas
- [ ] Completar los `[ ]` del `README.md` (evidencia on-chain, equipo, commit base)
- [ ] Grabar el video demo (sin límite de duración, evalúa el jurado)
- [ ] Grabar el video pitch (máximo 3 minutos, para el Demo Day)
- [ ] Subir el proyecto al formulario oficial del hackathon

## Reglas que enmarcan todo el plan

- Todo el desarrollo ocurre en **Stellar testnet**. Nada de fondos reales ni promesas de rendimiento.
- El **checkpoint del 23/09** exige arquitectura, esquema del contrato y repositorio inicial: eso es exactamente el alcance de la Fase 1.
- Si el agente falla o no actúa, el contrato debe permitir que **cualquiera** liquide la factura al llegar el límite de la ventana — esa garantía se prueba en la Fase 1 y se usa en la Fase 2.
