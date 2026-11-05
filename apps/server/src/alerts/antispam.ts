export type ItemStatus = 'monitoring' | 'reached' | 'paused';
export type AlertKind = 'target_reached' | 'new_low';

export interface AlertState {
  targetPrice: number;
  /** true = pronto para alertar na próxima vez que atingir o alvo. */
  alertArmed: boolean;
  /** Preço do último alerta enviado nesta "queda". */
  lastAlertPrice: number | null;
}

export interface AlertDecision {
  alert: AlertKind | null;
  status: Exclude<ItemStatus, 'paused'>;
  alertArmed: boolean;
  lastAlertPrice: number | null;
}

/**
 * Regras anti-spam:
 *  1. Ao atingir o alvo (preço <= alvo) com o alerta "armado" → alerta "target_reached" e desarma.
 *  2. Enquanto continuar abaixo do alvo, só alerta de novo se bater um NOVO MÍNIMO ("new_low").
 *  3. O alerta só é rearmado quando o preço volta a subir acima do alvo (com uma pequena
 *     histerese, para que oscilações de centavos em torno do alvo não gerem alertas repetidos).
 */
export function decideAlert(state: AlertState, price: number, hysteresis = 0.005): AlertDecision {
  const { targetPrice } = state;
  if (price <= targetPrice) {
    if (state.alertArmed) {
      return { alert: 'target_reached', status: 'reached', alertArmed: false, lastAlertPrice: price };
    }
    if (state.lastAlertPrice == null || price < state.lastAlertPrice) {
      return { alert: 'new_low', status: 'reached', alertArmed: false, lastAlertPrice: price };
    }
    return { alert: null, status: 'reached', alertArmed: false, lastAlertPrice: state.lastAlertPrice };
  }

  const rearmAbove = targetPrice * (1 + hysteresis);
  if (price > rearmAbove) {
    return { alert: null, status: 'monitoring', alertArmed: true, lastAlertPrice: null };
  }
  // Ligeiramente acima do alvo, dentro da histerese: não rearma ainda.
  return { alert: null, status: 'monitoring', alertArmed: state.alertArmed, lastAlertPrice: state.lastAlertPrice };
}

/** Backoff após falhas: 1x, 2x, 4x, 8x o intervalo (máx. 8x), para não insistir em lojas que bloqueiam. */
export function nextCheckDelayMin(intervalMin: number, consecutiveFailures: number) {
  if (consecutiveFailures <= 0) return intervalMin;
  return intervalMin * Math.min(2 ** consecutiveFailures, 8);
}
