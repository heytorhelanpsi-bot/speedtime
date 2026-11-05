import { describe, expect, it } from 'vitest';
import { decideAlert, nextCheckDelayMin, type AlertState } from '../src/alerts/antispam.js';

/** Simula uma sequência de preços e devolve os alertas disparados. */
function run(prices: number[], target = 100) {
  let s: AlertState = { targetPrice: target, alertArmed: true, lastAlertPrice: null };
  const alerts: (string | null)[] = [];
  for (const p of prices) {
    const d = decideAlert(s, p);
    alerts.push(d.alert);
    s = { targetPrice: target, alertArmed: d.alertArmed, lastAlertPrice: d.lastAlertPrice };
  }
  return alerts;
}

describe('anti-spam de alertas', () => {
  it('alerta uma única vez ao atingir o alvo e continuar no mesmo preço', () => {
    expect(run([120, 99, 99, 99, 100])).toEqual([null, 'target_reached', null, null, null]);
  });

  it('alerta de novo quando bate um novo mínimo abaixo do alvo', () => {
    expect(run([99, 95, 97, 95, 90])).toEqual(['target_reached', 'new_low', null, null, 'new_low']);
  });

  it('rearma quando o preço sobe acima do alvo e cai de novo', () => {
    expect(run([99, 130, 99])).toEqual(['target_reached', null, 'target_reached']);
  });

  it('não rearma com oscilação de centavos dentro da histerese', () => {
    // alvo 100, histerese 0,5% → precisa passar de 100,50 para rearmar
    expect(run([100, 100.3, 100])).toEqual(['target_reached', null, null]);
    expect(run([100, 100.6, 100])).toEqual(['target_reached', null, 'target_reached']);
  });

  it('status acompanha o preço', () => {
    const s = { targetPrice: 100, alertArmed: true, lastAlertPrice: null };
    expect(decideAlert(s, 150).status).toBe('monitoring');
    expect(decideAlert(s, 80).status).toBe('reached');
  });

  it('backoff de falhas dobra até 8x', () => {
    expect([0, 1, 2, 3, 4, 10].map((f) => nextCheckDelayMin(15, f))).toEqual([15, 30, 60, 120, 120, 120]);
  });
});
