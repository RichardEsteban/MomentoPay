//! InvoiceVault: bloquea el dinero de una factura y deja que un agente busque
//! el mejor momento para pagarla, sin poder arriesgar nunca el monto adeudado.
//!
//! Regla central: la factura siempre se paga. Solo el colchón (lo que se
//! deposita por encima de lo necesario) se optimiza.
#![no_std]

mod error;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractclient, contractimpl, token, Address, Env};

use error::VaultError;
use types::{Config, DataKey, Invoice, InvoicePolicy, Quote, Reason, Settlement, Status};

/// 100% en puntos básicos.
const BPS_DENOM: i128 = 10_000;
/// Escala de precios: 7 decimales, igual que los tokens de Stellar.
const RATE_SCALE: i128 = 10_000_000;

/// Un ledger de Stellar dura ~5 segundos: 17.280 ledgers ≈ 1 día.
const DAY_LEDGERS: u32 = 17_280;
/// Si a una entrada le quedan menos de 30 días de vida, se extiende a 60.
const TTL_THRESHOLD: u32 = 30 * DAY_LEDGERS;
const TTL_EXTEND_TO: u32 = 60 * DAY_LEDGERS;

/// Interfaz mínima que debe cumplir el contrato de precios (real o simulado
/// en la Fase 2). Devuelve el precio de 1 USDC en PEN, con 7 decimales, y el
/// timestamp (unix) al que corresponde ese precio.
#[contractclient(name = "OracleClient")]
pub trait OracleInterface {
    fn price(env: Env) -> (i128, u64);
}

#[contract]
pub struct InvoiceVault;

#[contractimpl]
impl InvoiceVault {
    /// Configura el contrato al desplegarlo. Al ser un constructor, Soroban lo
    /// ejecuta una sola vez y en el mismo paso del despliegue: nadie puede
    /// inicializarlo antes que el desplegador ni volver a inicializarlo.
    pub fn __constructor(
        env: Env,
        admin: Address,
        oracle: Address,
        max_oracle_age_secs: u64,
        max_agent_fee_bps: u32,
        min_buffer_bps: u32,
        safety_margin_secs: u64,
    ) {
        let config = Config {
            admin,
            oracle,
            max_oracle_age_secs,
            max_agent_fee_bps,
            min_buffer_bps,
            safety_margin_secs,
        };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::NextId, &0u64);
        bump_instance(&env);
    }

    /// Crea una factura: bloquea el depósito del pagador y fija la línea base
    /// de precio contra la que se mide todo ahorro futuro.
    ///
    /// Invariantes que se verifican aquí:
    /// - `window_end` deja al menos `safety_margin_secs` antes de `due_ts`.
    /// - El depósito cubre la factura más el colchón mínimo configurado.
    /// - La comisión del agente no supera el tope configurado.
    pub fn create_invoice(
        env: Env,
        payer: Address,
        payee: Address,
        agent: Address,
        token: Address,
        amount_pen_e7: i128,
        deposit: i128,
        policy: InvoicePolicy,
    ) -> u64 {
        payer.require_auth();
        let config = get_config(&env);

        if policy.agent_fee_bps > config.max_agent_fee_bps {
            panic_with(&env, VaultError::InvalidFee);
        }
        let now = env.ledger().timestamp();
        let window_plus_margin = add_u64(&env, policy.window_end, config.safety_margin_secs);
        if policy.window_end <= now || window_plus_margin > policy.due_ts {
            panic_with(&env, VaultError::InvalidWindow);
        }
        if amount_pen_e7 <= 0 || deposit <= 0 {
            panic_with(&env, VaultError::InsufficientBuffer);
        }

        let (rate_e7, _) = read_oracle(&env, &config);
        let base_required = required_usdc(&env, amount_pen_e7, rate_e7);
        let buffer_factor = add(&env, BPS_DENOM, config.min_buffer_bps as i128);
        let min_deposit = mul(&env, base_required, buffer_factor) / BPS_DENOM;
        if deposit < min_deposit {
            panic_with(&env, VaultError::InsufficientBuffer);
        }

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        let next_id = match id.checked_add(1) {
            Some(n) => n,
            None => panic_with(&env, VaultError::Overflow),
        };
        env.storage().instance().set(&DataKey::NextId, &next_id);

        // El depósito se bloquea de inmediato: la garantía existe desde el
        // primer bloque, no solo cuando el agente decide actuar.
        token::Client::new(&env, &token).transfer(
            &payer,
            &env.current_contract_address(),
            &deposit,
        );

        let invoice = Invoice {
            id,
            status: Status::Open,
            payer,
            payee,
            agent,
            token,
            amount_pen_e7,
            base_rate_e7: rate_e7,
            deposit,
            due_ts: policy.due_ts,
            window_end: policy.window_end,
            min_savings_bps: policy.min_savings_bps,
            stop_loss_bps: policy.stop_loss_bps,
            agent_fee_bps: policy.agent_fee_bps,
        };
        env.storage().persistent().set(&DataKey::Invoice(id), &invoice);
        bump_invoice(&env, id);
        id
    }

    /// Permite al pagador aumentar el colchón de una factura abierta.
    pub fn top_up(env: Env, id: u64, amount: i128) {
        let mut invoice = load_invoice(&env, id);
        invoice.payer.require_auth();
        if invoice.status != Status::Open {
            panic_with(&env, VaultError::AlreadySettled);
        }
        if amount <= 0 {
            panic_with(&env, VaultError::InsufficientBuffer);
        }
        token::Client::new(&env, &invoice.token).transfer(
            &invoice.payer,
            &env.current_contract_address(),
            &amount,
        );
        invoice.deposit = add(&env, invoice.deposit, amount);
        env.storage().persistent().set(&DataKey::Invoice(id), &invoice);
        bump_invoice(&env, id);
    }

    /// Lectura de solo consulta: cuánto costaría pagar hoy y si el agente ya
    /// podría ejecutar. No cambia estado ni requiere autorización.
    pub fn quote(env: Env, id: u64) -> Quote {
        let invoice = load_invoice(&env, id);
        let config = get_config(&env);
        let (rate_e7, _) = read_oracle(&env, &config);

        let base_required = required_usdc(&env, invoice.amount_pen_e7, invoice.base_rate_e7);
        let required_now = required_usdc(&env, invoice.amount_pen_e7, rate_e7);
        let savings_bps = savings_in_bps(&env, base_required, required_now);
        let stop_loss_hit = savings_bps <= -(invoice.stop_loss_bps as i32);

        let now = env.ledger().timestamp();
        let can_agent_execute = invoice.status == Status::Open
            && now < invoice.window_end
            && savings_bps >= invoice.min_savings_bps as i32;

        Quote {
            required_usdc: required_now,
            savings_bps,
            stop_loss_hit,
            can_agent_execute,
        }
    }

    /// Intenta liquidar la factura. Quién puede llamarlo y cuándo depende del motivo:
    /// - El **agente** designado, en cualquier momento dentro de la ventana, si el
    ///   ahorro alcanza el mínimo pactado (`Reason::Target`).
    /// - **Cualquiera**, una vez terminada la ventana (`Reason::Deadline`) o si el
    ///   precio empeoró más allá del límite de pérdida (`Reason::StopLoss`) — así la
    ///   factura se paga aunque el agente esté caído o deje de responder.
    pub fn execute(env: Env, id: u64, caller: Address) -> Settlement {
        caller.require_auth();
        let invoice = load_invoice(&env, id);
        if invoice.status != Status::Open {
            panic_with(&env, VaultError::AlreadySettled);
        }
        let config = get_config(&env);
        let (rate_e7, _) = read_oracle(&env, &config);
        let now = env.ledger().timestamp();

        let base_required = required_usdc(&env, invoice.amount_pen_e7, invoice.base_rate_e7);
        let required_now = required_usdc(&env, invoice.amount_pen_e7, rate_e7);
        let savings_bps = savings_in_bps(&env, base_required, required_now);
        let stop_loss_hit = savings_bps <= -(invoice.stop_loss_bps as i32);
        let window_over = now >= invoice.window_end;

        let reason = if caller == invoice.agent && !window_over {
            if savings_bps < invoice.min_savings_bps as i32 {
                panic_with(&env, VaultError::NoSavingsYet);
            }
            Reason::Target
        } else if window_over {
            Reason::Deadline
        } else if stop_loss_hit {
            Reason::StopLoss
        } else {
            panic_with(&env, VaultError::WindowNotOverYet)
        };

        settle(&env, invoice, base_required, required_now, rate_e7, reason)
    }

    /// El pagador decide no esperar y liquida de inmediato, al precio actual.
    pub fn pay_now(env: Env, id: u64) -> Settlement {
        let invoice = load_invoice(&env, id);
        invoice.payer.require_auth();
        if invoice.status != Status::Open {
            panic_with(&env, VaultError::AlreadySettled);
        }
        let config = get_config(&env);
        let (rate_e7, _) = read_oracle(&env, &config);
        let base_required = required_usdc(&env, invoice.amount_pen_e7, invoice.base_rate_e7);
        let required_now = required_usdc(&env, invoice.amount_pen_e7, rate_e7);
        settle(&env, invoice, base_required, required_now, rate_e7, Reason::PayNow)
    }

    pub fn get_invoice(env: Env, id: u64) -> Invoice {
        load_invoice(&env, id)
    }
}

/// Reparte el depósito: la factura completa al acreedor (o lo máximo posible,
/// si el depósito no alcanzara), la comisión del agente solo sobre el ahorro
/// real, y el resto de vuelta al pagador. Nunca puede quedar un monto negativo.
fn settle(
    env: &Env,
    mut invoice: Invoice,
    base_required: i128,
    required_now: i128,
    rate_e7: i128,
    reason: Reason,
) -> Settlement {
    // Si el precio empeoró más allá del colchón disponible, el acreedor recibe
    // como máximo lo que hay depositado. Este es el riesgo residual declarado
    // en el README: se acota con el colchón mínimo y el stop-loss, pero existe.
    let paid_to_payee = if required_now > invoice.deposit {
        invoice.deposit
    } else {
        required_now
    };

    let positive_savings = if base_required > required_now {
        sub(env, base_required, required_now)
    } else {
        0
    };

    let available_after_payment = sub(env, invoice.deposit, paid_to_payee);
    let mut agent_fee = mul(env, positive_savings, invoice.agent_fee_bps as i128) / BPS_DENOM;
    if agent_fee > available_after_payment {
        agent_fee = available_after_payment;
    }
    let refund_to_payer = sub(env, available_after_payment, agent_fee);

    let token_client = token::Client::new(env, &invoice.token);
    let contract_address = env.current_contract_address();
    if paid_to_payee > 0 {
        token_client.transfer(&contract_address, &invoice.payee, &paid_to_payee);
    }
    if agent_fee > 0 {
        token_client.transfer(&contract_address, &invoice.agent, &agent_fee);
    }
    if refund_to_payer > 0 {
        token_client.transfer(&contract_address, &invoice.payer, &refund_to_payer);
    }

    invoice.status = Status::Settled;
    env.storage()
        .persistent()
        .set(&DataKey::Invoice(invoice.id), &invoice);
    bump_invoice(env, invoice.id);

    Settlement {
        invoice_id: invoice.id,
        reason,
        paid_to_payee,
        agent_fee,
        refund_to_payer,
        rate_e7,
    }
}

fn get_config(env: &Env) -> Config {
    bump_instance(env);
    match env.storage().instance().get(&DataKey::Config) {
        Some(c) => c,
        None => panic_with(env, VaultError::NotInitialized),
    }
}

fn load_invoice(env: &Env, id: u64) -> Invoice {
    match env.storage().persistent().get(&DataKey::Invoice(id)) {
        Some(i) => {
            bump_invoice(env, id);
            i
        }
        None => panic_with(env, VaultError::InvoiceNotFound),
    }
}

/// Mantiene vivos los datos del contrato: sin esto, una entrada de storage
/// caduca y se archiva, y una factura de varias semanas podría perderse.
fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn bump_invoice(env: &Env, id: u64) {
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::Invoice(id), TTL_THRESHOLD, TTL_EXTEND_TO);
}

/// Pide el precio al oráculo y rechaza datos más viejos que lo permitido.
fn read_oracle(env: &Env, config: &Config) -> (i128, u64) {
    let (rate_e7, ts) = OracleClient::new(env, &config.oracle).price();
    let now = env.ledger().timestamp();
    if now.saturating_sub(ts) > config.max_oracle_age_secs {
        panic_with(env, VaultError::OraclePriceStale);
    }
    (rate_e7, ts)
}

/// USDC necesarios (7 decimales) para cubrir `amount_pen_e7` al precio `rate_e7`
/// (PEN por 1 USDC, 7 decimales), redondeando siempre hacia arriba, a favor
/// del acreedor.
fn required_usdc(env: &Env, amount_pen_e7: i128, rate_e7: i128) -> i128 {
    let numerator = mul(env, amount_pen_e7, RATE_SCALE);
    ceil_div(env, numerator, rate_e7)
}

/// Ahorro frente a la línea base, en puntos básicos. Negativo si el precio
/// empeoró. Se limita al rango de `i32` para que un precio extremo nunca
/// desborde ni cambie de signo al convertir.
fn savings_in_bps(env: &Env, base_required: i128, required_now: i128) -> i32 {
    if base_required == 0 {
        return 0;
    }
    let diff = match base_required.checked_sub(required_now) {
        Some(d) => d,
        None => panic_with(env, VaultError::Overflow),
    };
    let bps = mul(env, diff, BPS_DENOM) / base_required;
    if bps > i32::MAX as i128 {
        i32::MAX
    } else if bps < i32::MIN as i128 {
        i32::MIN
    } else {
        bps as i32
    }
}

fn add(env: &Env, a: i128, b: i128) -> i128 {
    match a.checked_add(b) {
        Some(v) => v,
        None => panic_with(env, VaultError::Overflow),
    }
}

fn sub(env: &Env, a: i128, b: i128) -> i128 {
    match a.checked_sub(b) {
        Some(v) => v,
        None => panic_with(env, VaultError::Overflow),
    }
}

fn mul(env: &Env, a: i128, b: i128) -> i128 {
    match a.checked_mul(b) {
        Some(v) => v,
        None => panic_with(env, VaultError::Overflow),
    }
}

fn add_u64(env: &Env, a: u64, b: u64) -> u64 {
    match a.checked_add(b) {
        Some(v) => v,
        None => panic_with(env, VaultError::Overflow),
    }
}

fn ceil_div(env: &Env, a: i128, b: i128) -> i128 {
    if b <= 0 {
        panic_with(env, VaultError::Overflow);
    }
    let rounded = add(env, a, sub(env, b, 1));
    rounded / b
}

fn panic_with(env: &Env, code: VaultError) -> ! {
    env.panic_with_error(code);
}
