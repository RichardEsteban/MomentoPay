use soroban_sdk::{contracttype, Address};

/// Estado de una factura dentro de la bóveda.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Status {
    Open,
    Settled,
}

/// Motivo por el que una factura terminó de liquidarse.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Reason {
    /// El agente encontró un ahorro igual o mayor al mínimo pactado.
    Target,
    /// Se acabó la ventana de tiempo; se paga a precio de mercado.
    Deadline,
    /// El precio empeoró más allá del límite de pérdida tolerado.
    StopLoss,
    /// El propio pagador decidió pagar de inmediato.
    PayNow,
}

/// Parámetros globales del contrato, fijados en `init`.
#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    /// Contrato que expone el precio USDC/PEN (ver `OracleInterface`).
    pub oracle: Address,
    /// Un precio del oráculo más viejo que esto (en segundos) se rechaza.
    pub max_oracle_age_secs: u64,
    /// Tope a la comisión del agente, en puntos básicos del ahorro (10_000 = 100%).
    pub max_agent_fee_bps: u32,
    /// Colchón mínimo exigido sobre el monto de la factura, en puntos básicos.
    pub min_buffer_bps: u32,
    /// Margen mínimo entre el fin de la ventana y el vencimiento real, en segundos.
    pub safety_margin_secs: u64,
}

/// Una factura bloqueada en la bóveda.
#[contracttype]
#[derive(Clone)]
pub struct Invoice {
    pub id: u64,
    pub status: Status,
    pub payer: Address,
    pub payee: Address,
    pub agent: Address,
    /// Token (USDC de testnet u otro) en el que está denominado el depósito.
    pub token: Address,
    /// Monto de la factura en PEN, con 7 decimales (1 PEN = 10_000_000).
    pub amount_pen_e7: i128,
    /// Precio PEN por 1 USDC al momento de crear la factura, con 7 decimales.
    pub base_rate_e7: i128,
    /// Depósito total bloqueado, en unidades mínimas del token (7 decimales).
    pub deposit: i128,
    /// Vencimiento real de la factura (unix timestamp).
    pub due_ts: u64,
    /// Fin de la ventana en la que el agente puede optimizar (unix timestamp).
    pub window_end: u64,
    /// Ahorro mínimo, en puntos básicos, para que el agente pueda ejecutar antes de tiempo.
    pub min_savings_bps: u32,
    /// Deterioro máximo tolerado, en puntos básicos, antes de forzar la liquidación.
    pub stop_loss_bps: u32,
    /// Comisión del agente sobre el ahorro positivo, en puntos básicos.
    pub agent_fee_bps: u32,
}

/// Vista de solo lectura del estado actual de una factura frente al precio de hoy.
#[contracttype]
#[derive(Clone)]
pub struct Quote {
    /// Cuánto costaría pagar la factura ahora mismo, en el token del depósito.
    pub required_usdc: i128,
    /// Ahorro frente al precio de creación, en puntos básicos. Negativo si empeoró.
    pub savings_bps: i32,
    pub stop_loss_hit: bool,
    pub can_agent_execute: bool,
}

/// Resultado de liquidar una factura.
#[contracttype]
#[derive(Clone)]
pub struct Settlement {
    pub invoice_id: u64,
    pub reason: Reason,
    pub paid_to_payee: i128,
    pub agent_fee: i128,
    pub refund_to_payer: i128,
    pub rate_e7: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    NextId,
    Invoice(u64),
}
