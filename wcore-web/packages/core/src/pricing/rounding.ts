const UNIT_PRICE_SCALE = 1_000_000_000_000;

export function roundUnitPrice(value: number): number {
  const scaled = value * UNIT_PRICE_SCALE;
  return Number.isFinite(scaled) ? Math.round(scaled) / UNIT_PRICE_SCALE : value;
}
