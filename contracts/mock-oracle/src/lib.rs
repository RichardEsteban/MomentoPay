//! Oráculo simulado USDC/PEN para testnet.
//!
//! Cumple la interfaz que espera `InvoiceVault` (`price() -> (rate_e7, timestamp)`).
//! `set_price` no exige autorización a propósito: es una herramienta de demo y
//! de pruebas para Stellar testnet. No debe usarse con fondos reales.
#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Env};

/// ~1 día = 17.280 ledgers de 5 s. Sin extender el TTL, el precio caducaría en horas.
const TTL_THRESHOLD: u32 = 30 * 17_280;
const TTL_EXTEND_TO: u32 = 60 * 17_280;

#[contracttype]
enum Key {
    Price,
}

#[contract]
pub struct MockOracle;

#[contractimpl]
impl MockOracle {
    /// Fija el precio de 1 USDC en PEN (7 decimales) y el momento al que corresponde.
    pub fn set_price(env: Env, rate_e7: i128, ts: u64) {
        env.storage().instance().set(&Key::Price, &(rate_e7, ts));
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Devuelve `(rate_e7, timestamp)`. Falla si nunca se fijó un precio.
    pub fn price(env: Env) -> (i128, u64) {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().instance().get(&Key::Price).unwrap()
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn stores_and_returns_the_latest_price() {
        let env = Env::default();
        let id = env.register(MockOracle, ());
        let client = MockOracleClient::new(&env, &id);

        client.set_price(&38_000_000, &1_000);
        assert_eq!(client.price(), (38_000_000, 1_000));

        client.set_price(&39_000_000, &2_000);
        assert_eq!(client.price(), (39_000_000, 2_000));
    }
}
