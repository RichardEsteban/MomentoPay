use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VaultError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    /// La ventana no deja el margen de seguridad exigido antes del vencimiento.
    InvalidWindow = 3,
    /// El depósito no cubre la factura más el colchón mínimo.
    InsufficientBuffer = 4,
    /// La comisión del agente supera el tope configurado.
    InvalidFee = 5,
    InvoiceNotFound = 6,
    AlreadySettled = 7,
    /// Solo el agente designado puede ejecutar antes de tiempo, y solo con ahorro suficiente.
    NoSavingsYet = 8,
    /// Nadie más que el agente puede ejecutar antes de que termine la ventana.
    WindowNotOverYet = 9,
    /// El precio del oráculo es más viejo de lo permitido.
    OraclePriceStale = 10,
    Overflow = 11,
}
