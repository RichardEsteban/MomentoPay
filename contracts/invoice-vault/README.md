# invoice-vault (contrato Soroban)

Bloquea el depósito de una factura y solo deja pagarla cuando no es peor que
el precio del día en que se creó, o cuando se acaba el plazo. Ver el
[README del proyecto](../../README.md) para el problema, el beneficio y el
flujo completo en lenguaje simple.

## Requisitos

- [Rust](https://rustup.rs/) 1.85 o superior, con el target `wasm32v1-none`:
  ```bash
  rustup target add wasm32v1-none
  ```
- [Stellar CLI](https://developers.stellar.org/docs/tools/cli/install-cli) para desplegar en testnet.

## Compilar y probar

```bash
cd contracts/invoice-vault
cargo test
cargo build --release --target wasm32v1-none
```

El `.wasm` queda en `../../target/wasm32v1-none/release/invoice_vault.wasm`.

> Estas pruebas y este build se escribieron sin poder ejecutar `cargo` en la
> máquina donde se generó el código (no había toolchain de Rust instalado).
> Si algo no compila, es casi seguro un desajuste de nombres entre versiones
> de `soroban-sdk` (por ejemplo `register_stellar_asset_contract_v2` o
> `env.register`) — el mensaje de error de `cargo` señala la línea exacta.

## Desplegar en testnet

```bash
stellar keys generate admin --network testnet --fund

stellar contract deploy \
  --wasm ../../target/wasm32v1-none/release/invoice_vault.wasm \
  --source admin \
  --network testnet

# Guarda el Contract ID que devuelve el comando anterior y complétalo
# en el README del proyecto y en CHANGELOG.md.
```

Luego se llama a `init(admin, oracle, max_oracle_age_secs, max_agent_fee_bps, min_buffer_bps, safety_margin_secs)`
con `stellar contract invoke`, usando el contrato de precios de la Fase 2
(`MockOracle` mientras no haya uno real confirmado en testnet).

## Interfaz del contrato

```rust
init(admin, oracle, max_oracle_age_secs, max_agent_fee_bps, min_buffer_bps, safety_margin_secs)

create_invoice(payer, payee, agent, token, amount_pen_e7, deposit, policy: InvoicePolicy) -> u64

top_up(id, amount)                 // solo el pagador: aumentar el colchón
quote(id) -> Quote                 // lectura: cuánto costaría pagar hoy
execute(id, caller) -> Settlement  // el agente (con ahorro) o cualquiera (tras la ventana)
pay_now(id) -> Settlement          // solo el pagador: pagar ya, sin esperar
get_invoice(id) -> Invoice
```

`InvoicePolicy` agrupa `due_ts`, `window_end`, `min_savings_bps`, `stop_loss_bps`
y `agent_fee_bps` en un solo struct — Soroban limita las funciones de contrato
a 10 parámetros como máximo, y `create_invoice` los superaba.

Los montos en PEN (`amount_pen_e7`) y el precio del oráculo (`rate_e7`) usan
7 decimales, igual que los tokens de Stellar: `1 PEN = 10_000_000`.

## Garantías (invariantes probados en `src/test.rs`)

1. La ventana del agente siempre deja un margen antes del vencimiento real.
2. El depósito debe cubrir la factura más un colchón mínimo.
3. El agente solo puede ejecutar antes de tiempo si el ahorro alcanza el mínimo pactado.
4. Terminada la ventana, **cualquiera** puede liquidar la factura — el pago no depende de que el agente siga funcionando.
5. Una factura liquidada no se puede volver a liquidar.
6. La comisión del agente sale solo del ahorro positivo, nunca del monto de la factura.

## Qué falta (ver `../../PHASES.md`)

- Contrato de precios real o `MockOracle` desplegado por separado (Fase 2).
- Agente vigilante que llama a `quote` y `execute` (Fase 2).
- Desplegar en testnet y registrar el Contract ID en el README del proyecto.
