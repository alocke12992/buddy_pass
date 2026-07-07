export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function cmToIn(cm: number): number {
  return cm / CM_PER_INCH;
}

export function inToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

/** 178cm → { feet: 5, inches: 10 } for imperial height inputs. */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cmToIn(cm));
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return Math.round(inToCm(feet * 12 + inches));
}

/** Round a display weight to the nearest sensible increment (e.g. 2.5 for plates). */
export function roundToIncrement(value: number, increment = 0.5): number {
  return Math.round(value / increment) * increment;
}
