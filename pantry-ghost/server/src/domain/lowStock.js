/**
 * Minimum units to keep on hand per category. Below this the food bank is told to restock.
 * Pure data: change the numbers here to fit your shelves.
 */
export const LOW_STOCK_MIN = Object.freeze({
  Produce: 20,
  Dairy: 15,
  Bakery: 15,
  Frozen: 15,
  Canned: 40,
  Dry: 40,
  Hygiene: 10,
});

/** Statuses whose units count as usable stock. */
export const USABLE = Object.freeze(['Fresh', 'ExpiringSoon']);

/**
 * Compares usable units per category with the minimum.
 * @param {Record<string, number>} unitsByCategory
 * @param {Record<string, number>} [mins]
 * @returns {Array<{ category: string, units: number, min: number, short: number, low: boolean }>}
 */
export function assessStock(unitsByCategory, mins = LOW_STOCK_MIN) {
  return Object.entries(mins).map(([category, min]) => {
    const units = unitsByCategory[category] ?? 0;
    return { category, units, min, short: Math.max(0, min - units), low: units < min };
  });
}
