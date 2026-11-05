/**
 * Pantry vocabulary shared by resources, domain functions, seed and tests. Pure data.
 */

/** Food categories (stock-lots.category). */
export const CATEGORIES = Object.freeze(['Produce', 'Dairy', 'Bakery', 'Frozen', 'Canned', 'Dry', 'Hygiene']);

/** Counting units (stock-lots.unit). */
export const UNITS = Object.freeze(['item', 'can', 'box', 'kg', 'lb', 'L']);

/** Storage locations, in pick-list order: cold first so it spends the least time out (design § Client). */
export const LOCATIONS = Object.freeze(['Fridge', 'Freezer', 'Shelf']);

/** Lot statuses (stock-lots.status). */
export const LOT_STATUSES = Object.freeze(['Fresh', 'ExpiringSoon', 'Expired', 'Depleted', 'Discarded']);

/** Statuses a lot can never be picked from (Req 5.1). */
export const UNPICKABLE = Object.freeze(['Expired', 'Discarded', 'Depleted']);

/** Household dietary flags (households.dietary). */
export const DIETARY = Object.freeze(['Vegetarian', 'Halal', 'Kosher', 'GlutenFree', 'NutAllergy', 'Diabetic']);

/**
 * Expiring Soon Window per category, in days (Glossary). A lot becomes `ExpiringSoon` when it
 * expires within this many days of today (inclusive).
 */
export const EXPIRY_WINDOWS = Object.freeze({
  Produce: 2,
  Dairy: 3,
  Bakery: 2,
  Frozen: 14,
  Canned: 30,
  Dry: 30,
  Hygiene: 0,
});

/** Where a new lot of `category` is stored unless someone says otherwise. */
export function defaultLocation(category) {
  if (category === 'Dairy') return 'Fridge';
  if (category === 'Frozen') return 'Freezer';
  return 'Shelf';
}
