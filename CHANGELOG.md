# Avance

Registro simple de qué se construyó y cuándo, para el checkpoint y el README.

## Fase 1 — Contrato y esqueleto del proyecto

- **2026-09-23**: estructura del repositorio, `README.md`, `PHASES.md`, `LICENSE` (MIT) y diagramas en `docs/`. Contrato `InvoiceVault` (Rust/Soroban) con sus tipos, sus siete funciones (`init`, `create_invoice`, `top_up`, `quote`, `execute`, `pay_now`, `get_invoice`) y pruebas de los invariantes de seguridad en `contracts/invoice-vault/src/test.rs`.
- **2026-09-23**: entorno de compilación instalado (Rust + `wasm32v1-none` en WSL, tras resolver un bloqueo de Smart App Control en Windows). Se corrigieron tres problemas reales al compilar por primera vez: un conflicto de versiones de `ed25519-dalek` en las dependencias de pruebas (fijado a 2.2.0 en `Cargo.lock`), `create_invoice` superaba el límite de 10 parámetros de Soroban (se agruparon en el struct `InvoicePolicy`), y una prueba no refrescaba el precio simulado del oráculo al avanzar el tiempo. Resultado: **6/6 pruebas pasan** y `cargo build --release --target wasm32v1-none` genera `invoice_vault.wasm` (31.7 KB).
- **2026-09-23**: contrato desplegado en Stellar testnet: `CBKBFHC3D76MTOE5DMBJVS64HY2LBVTOSG2EKTJH7E2XWO2PJKQS4E5K` (tx `391b715850097588664522f61b7e9836e7bfbe1028f88138c1bc4986f04e8b06`). Compilar el Stellar CLI desde código agotaba la memoria de WSL (11.8 GB de RAM en el equipo), así que se usó el CLI de Windows (v28.0.0, vía winget) con el `.wasm` compilado en WSL. Pendiente: llamar a `init` con el oráculo simulado (Fase 2).

## Fase 2 — Agente y lectura de facturas con IA

- **2026-09-23**: oráculo simulado (`contracts/mock-oracle`) desplegado y vault inicializado en testnet; cuentas de prueba (pagador, acreedor, agente) y token MPUSDC. Agente en Node (`agent/`): regla de decisión determinista con 7 pruebas, cliente del contrato, lectura de facturas y explicaciones con Gemini (con plantilla de respaldo), registro de auditoría y CLI. Prueba de extremo a extremo: factura creada, precio mejorado de 3.8 a 3.9, el agente esperó dos lecturas y pagó solo al bajar su umbral (ahorro 2.56%). Se fijó `Cargo.lock` con `ed25519-dalek` 2.2.0 para que `cargo test` funcione al clonar. Pendiente: probar la lectura de una factura real con Gemini (requiere `GEMINI_API_KEY`).

- **2026-09-25**: endurecimiento del contrato según la lista de seguridad de la guía del hackathon: `__constructor` en lugar de `init` (evita que otro lo inicialice antes), aritmética con operaciones checked y ahorro saturado al rango de `i32`, y extensión de TTL en el vault y en el oráculo (verificado con una prueba que avanza 20 días y que falla si se quita la extensión). 9 pruebas del vault + 1 del oráculo. Se redesplegó (vault `CASRFEBO…R7ZEV`, oráculo `CCE4FO6H…N5IOC`) y se repitió la prueba de extremo a extremo con el mismo resultado. No se ejecutó `cargo scout-audit`.

- **2026-09-25**: pivote de viabilidad hacia el **pronto pago con descuento**. El simulador modela una curva de descuento del proveedor (0-3%) con un agente que no exige más ahorro que el descuento inicial: con descuento todos los escenarios terminan mejor que pagar el día 1; sin descuento, la mitad termina peor (2 pruebas nuevas, 7 en total). El contrato desplegado NO aplica descuentos todavía: queda declarado en el README junto con el diseño de la siguiente versión (curva en `InvoicePolicy`, tope de descuento y firma del proveedor) y un plan de 90 días.

## Fase 3 — Interfaz, simulador y entregables finales

- **2026-09-23**: interfaz web (React + Vite) con creación de factura, seguimiento, "pagar ahora" y simulador. El simulador mostró que con un tipo de cambio aleatorio el usuario termina mejor en ~50% de los casos y peor en ~50% (mediana cercana a cero), por lo que se corrigió el README que prometía "nunca peor que pagar el día 1" y se replantearon las fuentes de ahorro (descuentos por pronto pago, mejor ejecución). Pendiente: probar la firma con Freighter, video demo, video pitch y formulario.
