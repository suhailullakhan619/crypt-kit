/**
 * Pantry Ghost client helpers: draft rows, dietary warnings, units and months.
 */

/** Gentle reminders shown while packing (Req 5.6). Keyed by dietary flag → category. */
const DIETARY_RULES = {
  NutAllergy: { Dry: 'Dry goods can contain nuts (peanut butter, granola) — check labels.', Bakery: 'Baked goods can contain nuts — check labels.' },
  GlutenFree: { Bakery: 'Most bread and bakery items contain gluten.', Dry: 'Pasta, cereal and flour usually contain gluten.' },
  Diabetic: { Bakery: 'Bakery items are often high in sugar.' },
  Vegetarian: { Frozen: 'Frozen items may contain meat or fish.', Canned: 'Canned items may contain meat or fish (tuna, chilli).' },
  Halal: { Frozen: 'Check frozen meat is halal.', Canned: 'Check canned meat is halal.' },
  Kosher: { Frozen: 'Check frozen items are kosher.', Canned: 'Check canned items are kosher.' },
};

/**
 * @param {string[]} dietary - household flags
 * @param {string[]} categories - chosen categories
 * @returns {Array<{ flag: string, category: string, message: string }>}
 */
export function dietaryWarnings(dietary = [], categories = []) {
  const out = [];
  for (const flag of dietary) for (const category of categories) {
    const message = DIETARY_RULES[flag]?.[category];
    if (message) out.push({ flag, category, message });
  }
  return out;
}

const UNIT_LABEL = { item: ['item', 'items'], can: ['can', 'cans'], box: ['box', 'boxes'], kg: ['kg', 'kg'], lb: ['lb', 'lb'], L: ['L', 'L'] };
/** 12, 'can' → "12 cans" */
export const amount = (q, unit) => `${q} ${(UNIT_LABEL[unit] ?? [unit, unit])[q === 1 ? 0 : 1]}`;

/** 'YYYY-MM' for the current UTC month (reports use UTC). */
export function currentMonth(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "in 3 days" / "today" / "tomorrow" / "2 days ago" for an expiry date. */
export function expiresIn(date, now = new Date()) {
  if (!date) return 'no expiry';
  const d = new Date(date);
  const days = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86400000);
  if (days === 0) return 'expires today';
  if (days === 1) return 'expires tomorrow';
  if (days < 0) return `expired ${-days} day${days === -1 ? '' : 's'} ago`;
  return `expires in ${days} days`;
}

// ── Intake draft rows ─────────────────────────────────────────────────────────

let seq = 0;
/** Server draft → editable row (all strings for inputs). */
export function toRow(draft = {}) {
  seq += 1;
  return {
    key: `row-${Date.now()}-${seq}`,
    heard: draft.heard ?? '',
    quantity: draft.quantity ?? '',
    unit: draft.unit ?? 'item',
    itemName: draft.itemName ?? '',
    category: draft.category ?? '',
    expiresOn: draft.expiresOn ? String(draft.expiresOn).slice(0, 10) : '',
    donor: draft.donorId ?? '',
    donorGuess: draft.donorGuess ?? null,
    location: draft.location ?? 'Shelf',
  };
}

/** Editable row → POST /intake lot. */
export function fromRow(row) {
  return {
    quantity: row.quantity === '' ? null : Number(row.quantity),
    unit: row.unit,
    itemName: row.itemName.trim(),
    category: row.category || null,
    expiresOn: row.expiresOn || null,
    donorId: row.donor || null,
    location: row.location,
  };
}

/** Required fields still empty on a row (expiry is optional for Hygiene). */
export function missingFields(row) {
  const missing = [];
  if (!(Number(row.quantity) > 0)) missing.push('quantity');
  if (!row.itemName.trim()) missing.push('itemName');
  if (!row.category) missing.push('category');
  if (!row.expiresOn && row.category !== 'Hygiene') missing.push('expiresOn');
  return missing;
}

export const MISSING_HINT = {
  quantity: "The ghost didn't catch how many",
  itemName: "The ghost didn't catch what it is",
  category: "The ghost didn't catch the category",
  expiresOn: "The ghost didn't catch the expiry date",
};
