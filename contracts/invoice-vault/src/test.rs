//! Pruebas de integración de los invariantes de seguridad de `InvoiceVault`.

use super::*;
use soroban_sdk::{
    contract, contractimpl, contracttype,
    testutils::{Address as _, Ledger},
    token,
};

// --- Oráculo simulado, solo para pruebas ---------------------------------

#[contracttype]
enum OracleKey {
    Price,
}

#[contract]
pub struct MockOracle;

#[contractimpl]
impl MockOracle {
    pub fn set_price(env: Env, rate_e7: i128, ts: u64) {
        env.storage().instance().set(&OracleKey::Price, &(rate_e7, ts));
    }
}

#[contractimpl]
impl OracleInterface for MockOracle {
    fn price(env: Env) -> (i128, u64) {
        env.storage().instance().get(&OracleKey::Price).unwrap()
    }
}

// --- Utilidades de la prueba ----------------------------------------------

const DAY: u64 = 24 * 60 * 60;
const RATE_3_8: i128 = 38_000_000; // 3.8 PEN por 1 USDC, 7 decimales
const INVOICE_PEN: i128 = 9_500_000_000; // factura de 950.0000000 PEN (~250 USDC a 3.8)

struct Setup {
    env: Env,
    vault: InvoiceVaultClient<'static>,
    oracle: Address,
    token: Address,
    payer: Address,
    payee: Address,
    agent: Address,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let payer = Address::generate(&env);
    let payee = Address::generate(&env);
    let agent = Address::generate(&env);

    let oracle = env.register(MockOracle, ());

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = sac.address();
    let token_admin = token::StellarAssetClient::new(&env, &token);
    token_admin.mint(&payer, &3_000_000_000); // 300.0000000 unidades

    // El vault se configura en el constructor: no hay una función init que
    // alguien pueda llamar antes o después del despliegue.
    let vault_id = env.register(
        InvoiceVault,
        (
            admin.clone(),
            oracle.clone(),
            2 * DAY,   // max_oracle_age_secs
            2_000u32,  // max_agent_fee_bps (20% del ahorro)
            500u32,    // min_buffer_bps (5% mínimo de colchón)
            DAY,       // safety_margin_secs
        ),
    );
    let vault = InvoiceVaultClient::new(&env, &vault_id);

    let oracle_client = MockOracleClient::new(&env, &oracle);
    oracle_client.set_price(&RATE_3_8, &env.ledger().timestamp());

    Setup {
        env,
        vault,
        oracle,
        token,
        payer,
        payee,
        agent,
    }
}

fn set_price(s: &Setup, rate_e7: i128) {
    let oracle_client = MockOracleClient::new(&s.env, &s.oracle);
    oracle_client.set_price(&rate_e7, &s.env.ledger().timestamp());
}

fn advance_time(env: &Env, secs: u64) {
    env.ledger().with_mut(|li| li.timestamp += secs);
}

/// Política por defecto para las pruebas: vencimiento en 14 días, ventana del
/// agente de 7 días, y los parámetros de ahorro/comisión que pida cada caso.
fn default_policy(
    now: u64,
    min_savings_bps: u32,
    stop_loss_bps: u32,
    agent_fee_bps: u32,
) -> InvoicePolicy {
    InvoicePolicy {
        due_ts: now + 14 * DAY,
        window_end: now + 7 * DAY,
        min_savings_bps,
        stop_loss_bps,
        agent_fee_bps,
    }
}

// --- Casos de prueba -------------------------------------------------------

#[test]
fn agent_executes_when_savings_meet_the_threshold() {
    let s = setup();
    let now = s.env.ledger().timestamp();

    let id = s.vault.create_invoice(
        &s.payer,
        &s.payee,
        &s.agent,
        &s.token,
        &INVOICE_PEN,
        &3_000_000_000, // depósito: factura (~250) + colchón (~50)
        &default_policy(now, 100, 1_500, 2_000),
    );

    // El precio mejora: ahora se necesitan menos USDC para pagar la misma factura.
    set_price(&s, 39_000_000); // 3.9 PEN por USDC

    let quote = s.vault.quote(&id);
    assert!(quote.savings_bps >= 100, "se esperaba ahorro >= 1%");
    assert!(quote.can_agent_execute);

    let token_client = token::Client::new(&s.env, &s.token);
    let settlement = s.vault.execute(&id, &s.agent);

    assert_eq!(settlement.reason, Reason::Target);
    assert!(settlement.agent_fee > 0, "el agente debería cobrar comisión sobre el ahorro");
    assert_eq!(token_client.balance(&s.payee), settlement.paid_to_payee);
    assert_eq!(token_client.balance(&s.agent), settlement.agent_fee);

    // La factura completa siempre llega al acreedor, sin importar el ahorro.
    let required_at_creation = 2_500_000_000; // 250.0000000 al precio base (3.8)
    assert!(settlement.paid_to_payee <= required_at_creation);

    let invoice = s.vault.get_invoice(&id);
    assert_eq!(invoice.status, Status::Settled);
}

#[test]
fn anyone_can_settle_after_the_window_even_if_the_agent_never_acts() {
    let s = setup();
    let now = s.env.ledger().timestamp();

    let id = s.vault.create_invoice(
        &s.payer,
        &s.payee,
        &s.agent,
        &s.token,
        &INVOICE_PEN,
        &3_000_000_000,
        &default_policy(now, 100, 1_500, 2_000),
    );

    // El precio no mejora nunca, y pasa el tiempo hasta el final de la ventana.
    advance_time(&s.env, 7 * DAY);
    // Un oráculo real seguiría reportando precios frescos; refrescamos el
    // simulado para no confundir "ventana vencida" con "precio viejo"
    // (el contrato rechaza precios más viejos que max_oracle_age_secs).
    set_price(&s, RATE_3_8);

    // Un tercero cualquiera (no el agente) puede forzar la liquidación.
    let bystander = Address::generate(&s.env);
    let settlement = s.vault.execute(&id, &bystander);

    assert_eq!(settlement.reason, Reason::Deadline);
    let invoice = s.vault.get_invoice(&id);
    assert_eq!(invoice.status, Status::Settled);
}

#[test]
fn a_settled_invoice_cannot_be_settled_twice() {
    let s = setup();
    let now = s.env.ledger().timestamp();

    let id = s.vault.create_invoice(
        &s.payer,
        &s.payee,
        &s.agent,
        &s.token,
        &INVOICE_PEN,
        &3_000_000_000,
        &default_policy(now, 100, 1_500, 2_000),
    );

    s.vault.pay_now(&id);

    let result = s.vault.try_pay_now(&id);
    assert!(result.is_err(), "una factura ya liquidada no debería poder pagarse otra vez");
}

#[test]
fn the_agent_cannot_jump_the_line_without_enough_savings() {
    let s = setup();
    let now = s.env.ledger().timestamp();

    let id = s.vault.create_invoice(
        &s.payer,
        &s.payee,
        &s.agent,
        &s.token,
        &INVOICE_PEN,
        &3_000_000_000,
        &default_policy(now, 500, 1_500, 2_000), // exige 5% de ahorro
    );

    // El precio casi no se mueve: muy por debajo del 5% exigido.
    set_price(&s, 38_050_000);

    let result = s.vault.try_execute(&id, &s.agent);
    assert!(
        result.is_err(),
        "el agente no debería poder ejecutar sin el ahorro mínimo pactado"
    );
}

#[test]
fn creating_an_invoice_needs_the_minimum_buffer() {
    let s = setup();
    let now = s.env.ledger().timestamp();

    // Depósito igual a la factura, sin colchón: debe rechazarse.
    let result = s.vault.try_create_invoice(
        &s.payer,
        &s.payee,
        &s.agent,
        &s.token,
        &INVOICE_PEN,
        &2_500_000_000,
        &default_policy(now, 100, 1_500, 2_000),
    );
    assert!(result.is_err(), "sin colchón mínimo la factura no debería crearse");
}

#[test]
fn the_window_must_leave_room_before_the_due_date() {
    let s = setup();
    let now = s.env.ledger().timestamp();

    // La ventana termina el mismo día del vencimiento: no deja margen de seguridad.
    let touching_due_date = InvoicePolicy {
        due_ts: now + 7 * DAY,
        window_end: now + 7 * DAY,
        min_savings_bps: 100,
        stop_loss_bps: 1_500,
        agent_fee_bps: 2_000,
    };
    let result = s.vault.try_create_invoice(
        &s.payer,
        &s.payee,
        &s.agent,
        &s.token,
        &INVOICE_PEN,
        &3_000_000_000,
        &touching_due_date,
    );
    assert!(result.is_err(), "la ventana no debería poder tocar el vencimiento");
}

#[test]
fn top_up_adds_to_the_deposit() {
    let s = setup();
    let now = s.env.ledger().timestamp();

    let id = s.vault.create_invoice(
        &s.payer,
        &s.payee,
        &s.agent,
        &s.token,
        &INVOICE_PEN,
        &2_800_000_000, // deja 20 unidades libres en la billetera del pagador
        &default_policy(now, 100, 1_500, 2_000),
    );
    s.vault.top_up(&id, &100_000_000);

    assert_eq!(s.vault.get_invoice(&id).deposit, 2_900_000_000);
}

#[test]
fn invoice_and_contract_storage_get_their_ttl_extended() {
    let s = setup();
    let now = s.env.ledger().timestamp();

    let id = s.vault.create_invoice(
        &s.payer,
        &s.payee,
        &s.agent,
        &s.token,
        &INVOICE_PEN,
        &3_000_000_000,
        &default_policy(now, 100, 1_500, 2_000),
    );

    let (invoice_ttl, instance_ttl) = s.env.as_contract(&s.vault.address, || {
        (
            s.env.storage().persistent().get_ttl(&DataKey::Invoice(id)),
            s.env.storage().instance().get_ttl(),
        )
    });
    assert!(invoice_ttl >= TTL_THRESHOLD, "la factura debe vivir al menos 30 días");
    assert!(instance_ttl >= TTL_THRESHOLD, "el contrato debe vivir al menos 30 días");
}

#[test]
fn an_extreme_price_move_saturates_instead_of_wrapping() {
    let s = setup();
    let now = s.env.ledger().timestamp();

    let id = s.vault.create_invoice(
        &s.payer,
        &s.payee,
        &s.agent,
        &s.token,
        &INVOICE_PEN,
        &3_000_000_000,
        &default_policy(now, 100, 1_500, 2_000),
    );

    // El dólar se desploma: el ahorro es tan negativo que no cabe en i32.
    // Debe quedar en el mínimo (y activar el stop-loss), no dar la vuelta a positivo.
    set_price(&s, 1);
    let quote = s.vault.quote(&id);
    assert_eq!(quote.savings_bps, i32::MIN);
    assert!(quote.stop_loss_hit);
    assert!(!quote.can_agent_execute);
}
