/**
 * Item keyword → category table (Req 4.4). Longest matching keyword wins, so
 * "peanut butter" is Dry (not Dairy) and "canned tomatoes" is Canned (not Produce).
 * Keywords are singular or plural as people say them; matching tolerates a trailing "s"/"es".
 */
export const CATEGORY_KEYWORDS = Object.freeze({
  // Canned
  beans: 'Canned', 'black beans': 'Canned', 'kidney beans': 'Canned', 'baked beans': 'Canned', soup: 'Canned',
  tuna: 'Canned', 'canned corn': 'Canned', 'canned tomatoes': 'Canned', 'tomato sauce': 'Canned', chickpeas: 'Canned',
  'canned peaches': 'Canned', sardines: 'Canned', 'coconut milk': 'Canned', canned: 'Canned', 'canned food': 'Canned',
  // Dairy
  milk: 'Dairy', yogurt: 'Dairy', yoghurt: 'Dairy', cheese: 'Dairy', butter: 'Dairy', eggs: 'Dairy', cream: 'Dairy',
  'cottage cheese': 'Dairy', dairy: 'Dairy',
  // Produce
  apples: 'Produce', bananas: 'Produce', oranges: 'Produce', carrots: 'Produce', potatoes: 'Produce', onions: 'Produce',
  lettuce: 'Produce', tomatoes: 'Produce', grapes: 'Produce', pears: 'Produce', cabbage: 'Produce', spinach: 'Produce',
  broccoli: 'Produce', peppers: 'Produce', cucumbers: 'Produce', 'sweet potatoes': 'Produce', produce: 'Produce',
  vegetables: 'Produce', fruit: 'Produce',
  // Bakery
  bread: 'Bakery', bagels: 'Bakery', rolls: 'Bakery', muffins: 'Bakery', tortillas: 'Bakery', buns: 'Bakery',
  croissants: 'Bakery', 'sliced bread': 'Bakery', pastries: 'Bakery', bakery: 'Bakery',
  // Frozen
  frozen: 'Frozen', 'frozen peas': 'Frozen', 'frozen pizza': 'Frozen', 'fish sticks': 'Frozen', 'ice cream': 'Frozen',
  'frozen vegetables': 'Frozen', 'chicken breasts': 'Frozen', 'frozen food': 'Frozen',
  // Dry goods
  rice: 'Dry', pasta: 'Dry', spaghetti: 'Dry', cereal: 'Dry', oats: 'Dry', oatmeal: 'Dry', flour: 'Dry', sugar: 'Dry',
  lentils: 'Dry', crackers: 'Dry', 'peanut butter': 'Dry', noodles: 'Dry', 'dry goods': 'Dry', granola: 'Dry',
  // Hygiene
  soap: 'Hygiene', shampoo: 'Hygiene', toothpaste: 'Hygiene', diapers: 'Hygiene', 'toilet paper': 'Hygiene',
  toothbrushes: 'Hygiene', deodorant: 'Hygiene', 'sanitary pads': 'Hygiene', hygiene: 'Hygiene', 'hygiene kits': 'Hygiene',
});

const SORTED = Object.keys(CATEGORY_KEYWORDS).sort((a, b) => b.length - a.length || a.localeCompare(b));

/** Singular/plural-tolerant word equality: "bean" ≈ "beans", "potato" ≈ "potatoes", "berry" ≈ "berries". */
function stem(w) {
  return w.replace(/ies$/, 'y').replace(/(oes|ches|shes|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, '');
}

/**
 * Finds the category for an item name by its longest keyword.
 * @param {string} itemName
 * @returns {{ category: string, keyword: string } | null}
 */
export function categoryFor(itemName) {
  const words = String(itemName ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem);
  if (!words.length) return null;
  for (const kw of SORTED) {
    const k = kw.split(' ').map(stem);
    for (let i = 0; i + k.length <= words.length; i++) {
      if (k.every((w, j) => words[i + j] === w)) return { category: CATEGORY_KEYWORDS[kw], keyword: kw };
    }
  }
  return null;
}

/**
 * Category named directly ("canned food", "dairy", "produce") — used by the STOCK_OF intent.
 * @returns {string|null}
 */
export function categoryNamed(phrase) {
  const p = String(phrase ?? '').toLowerCase().replace(/\b(food|foods|goods|items|stuff|products)\b/g, '').trim();
  const direct = { produce: 'Produce', dairy: 'Dairy', bakery: 'Bakery', baked: 'Bakery', frozen: 'Frozen', canned: 'Canned', tinned: 'Canned', dry: 'Dry', hygiene: 'Hygiene', toiletries: 'Hygiene' };
  return direct[p] ?? null;
}
