# Avance

Registro simple de qué se construyó y cuándo, para el checkpoint y el README.

## Fase 1 — Contrato y esqueleto del proyecto

- **2026-09-23**: estructura del repositorio, `README.md`, `PHASES.md`, `LICENSE` (MIT) y diagramas en `docs/`. Contrato `InvoiceVault` (Rust/Soroban) con sus tipos, sus siete funciones (`init`, `create_invoice`, `top_up`, `quote`, `execute`, `pay_now`, `get_invoice`) y pruebas de los invariantes de seguridad en `contracts/invoice-vault/src/test.rs`.
- **2026-09-23**: entorno de compilación instalado (Rust + `wasm32v1-none` en WSL, tras resolver un bloqueo de Smart App Control en Windows). Se corrigieron tres problemas reales al compilar por primera vez: un conflicto de versiones de `ed25519-dalek` en las dependencias de pruebas (fijado a 2.2.0 en `Cargo.lock`), `create_invoice` superaba el límite de 10 parámetros de Soroban (se agruparon en el struct `InvoicePolicy`), y una prueba no refrescaba el precio simulado del oráculo al avanzar el tiempo. Resultado: **6/6 pruebas pasan** y `cargo build --release --target wasm32v1-none` genera `invoice_vault.wasm` (31.7 KB).
- **2026-09-23**: contrato desplegado en Stellar testnet: `CBKBFHC3D76MTOE5DMBJVS64HY2LBVTOSG2EKTJH7E2XWO2PJKQS4E5K` (tx `391b715850097588664522f61b7e9836e7bfbe1028f88138c1bc4986f04e8b06`). Compilar el Stellar CLI desde código agotaba la memoria de WSL (11.8 GB de RAM en el equipo), así que se usó el CLI de Windows (v28.0.0, vía winget) con el `.wasm` compilado en WSL. Pendiente: llamar a `init` con el oráculo simulado (Fase 2).

## Fase 2 — Agente y lectura de facturas con IA

_Sin empezar._

## Fase 3 — Interfaz, simulador y entregables finales

_Sin empezar._
