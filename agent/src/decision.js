// Regla de decisión del agente. Es determinista a propósito: el modelo de
// lenguaje nunca decide cuándo pagar, solo explica lo que esta función resolvió.

/**
 * Umbral de ahorro (en puntos básicos) que exige el agente en este instante.
 * Empieza en `targetBps` y baja linealmente hasta `minSavingsBps` al llegar al
 * fin de la ventana. Nunca baja de `minSavingsBps`, que es lo que el contrato
 * exige como mínimo para dejar ejecutar al agente antes de tiempo.
 */
export function thresholdBps({ targetBps, minSavingsBps, nowSecs, windowStartSecs, windowEndSecs }) {
  const total = windowEndSecs - windowStartSecs;
  if (total <= 0) return minSavingsBps;
  const remaining = Math.min(Math.max((windowEndSecs - nowSecs) / total, 0), 1);
  return Math.max(minSavingsBps, Math.round(targetBps * remaining));
}

/**
 * Decide qué hacer con una factura abierta.
 * @returns {{action: 'execute'|'wait', code: string, thresholdBps: number}}
 */
export function decide({ quote, invoice, nowSecs, windowStartSecs, targetBps }) {
  const windowEndSecs = Number(invoice.window_end);
  const minSavingsBps = Number(invoice.min_savings_bps);
  const threshold = thresholdBps({ targetBps, minSavingsBps, nowSecs, windowStartSecs, windowEndSecs });

  if (nowSecs >= windowEndSecs) {
    return { action: 'execute', code: 'DEADLINE', thresholdBps: threshold };
  }
  if (quote.stop_loss_hit) {
    return { action: 'execute', code: 'STOP_LOSS', thresholdBps: threshold };
  }
  if (quote.can_agent_execute && Number(quote.savings_bps) >= threshold) {
    return { action: 'execute', code: 'TARGET', thresholdBps: threshold };
  }
  return { action: 'wait', code: 'WAIT', thresholdBps: threshold };
}
