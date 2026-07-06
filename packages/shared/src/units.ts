export const KG_PER_LB = 0.45359237;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/** Round a display weight to the nearest sensible increment (e.g. 2.5 for plates). */
export function roundToIncrement(value: number, increment = 0.5): number {
  return Math.round(value / increment) * increment;
}
