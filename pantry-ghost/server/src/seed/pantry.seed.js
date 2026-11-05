import mongoose from 'mongoose';
import { classifyExpiry } from '../domain/classifyExpiry.js';
import { planFefo } from '../domain/planFefo.js';
import { CATEGORIES, DIETARY, EXPIRY_WINDOWS, defaultLocation } from '../domain/expiryWindows.js';
import { DAY, startOfDay } from '../domain/dates.js';

/**
 * Deterministic Pantry Ghost demo data (Req 7.4): 12 donors, 120 lots received over the past
 * 60 days (fresh, expiring soon, expired, depleted and a few discarded), 45 households and
 * 150 FEFO distributions.
 *
 * The skeleton seeds with insertMany, which skips hooks, so everything computed is set here:
 * lot status (classifyExpiry), receivedQuantity, household codes, distribution lines, and lot
 * quantities already decremented by the simulated distributions — stock math stays exact
 * (final = received − distributed, never negative).
 *
 * Lots and distributions are not seeded in a guaranteed order (lines are not a declared ref), so
 * ids are generated here and shared by the seed/data files.
 */

const DONORS = [
  { name: 'Fresh Mart', type: 'Grocery', contact: 'store-manager@freshmart.example' },
  { name: 'Green Valley Farm', type: 'Farm', contact: 'Weekly pickup, Tuesdays' },
  { name: 'Hilltop Bakery', type: 'Business', contact: 'orders@hilltopbakery.example' },
  { name: 'Riverside Church Food Drive', type: 'FoodDrive', contact: 'Pastor on duty' },
  { name: 'Sunrise Grocers', type: 'Grocery', contact: 'donations@sunrise.example' },
  { name: 'Oakwood Rotary Club', type: 'FoodDrive', contact: 'rotary@oakwood.example' },
  { name: 'Northgate School', type: 'FoodDrive', contact: 'PTA food drive' },
  { name: 'Patel Family', type: 'Individual', contact: '' },
  { name: 'Corner Deli', type: 'Business', contact: 'Ask for the owner' },
  { name: 'Maple Dairy Co-op', type: 'Farm', contact: 'coop@mapledairy.example' },
  { name: 'City Harvest Market', type: 'Grocery', contact: 'harvest@city.example' },
  { name: 'Anonymous Neighbour', type: 'Individual', contact: '' },
];

// [itemName, unit, min qty, max qty, min shelf days, max shelf days | null]
const CATALOGUE = {
  Produce: [['Apples', 'kg', 10, 30, 12, 24], ['Bananas', 'kg', 8, 20, 5, 9], ['Carrots', 'kg', 10, 25, 14, 28], ['Potatoes', 'kg', 20, 50, 21, 40], ['Lettuce', 'item', 10, 20, 5, 8]],
  Dairy: [['Milk', 'L', 12, 36, 7, 14], ['Yogurt', 'item', 12, 24, 10, 21], ['Cheddar cheese', 'item', 6, 15, 30, 60], ['Eggs', 'box', 6, 20, 21, 28]],
  Bakery: [['Sliced bread', 'item', 10, 30, 4, 7], ['Bagels', 'item', 12, 24, 4, 6], ['Tortillas', 'item', 10, 20, 14, 21]],
  Frozen: [['Frozen peas', 'item', 10, 24, 120, 240], ['Fish sticks', 'box', 6, 12, 60, 180], ['Frozen vegetables', 'item', 10, 20, 90, 240]],
  Canned: [['Black beans', 'can', 24, 72, 200, 700], ['Tomato soup', 'can', 24, 60, 200, 600], ['Tuna', 'can', 24, 48, 300, 900], ['Canned corn', 'can', 24, 48, 200, 700], ['Chickpeas', 'can', 24, 48, 200, 700]],
  Dry: [['Rice', 'kg', 10, 40, 180, 365], ['Pasta', 'box', 12, 36, 180, 540], ['Cereal', 'box', 6, 20, 90, 240], ['Peanut butter', 'item', 6, 18, 120, 270], ['Oats', 'kg', 5, 20, 120, 300]],
  Hygiene: [['Soap', 'item', 12, 40, null, null], ['Toothpaste', 'item', 12, 30, null, null], ['Diapers', 'box', 4, 10, null, null], ['Shampoo', 'item', 8, 20, null, null]],
};
const CATEGORY_WEIGHTS = { Produce: 22, Dairy: 16, Bakery: 14, Frozen: 10, Canned: 26, Dry: 22, Hygiene: 10 };

/** mulberry32: small deterministic PRNG so the demo looks the same on every boot. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cache = null;

/**
 * Builds (once per `now`) the full demo data set.
 * @param {Date} now
 */
export function buildPantry(now) {
  if (cache && cache.at === now.getTime()) return cache.data;
  const rand = rng(20261031);
  const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const weighted = (weights) => {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = rand() * total;
    for (const [k, w] of Object.entries(weights)) if ((r -= w) < 0) return k;
    return Object.keys(weights)[0];
  };

  const today = startOfDay(now);
  const start = new Date(today.getTime() - 60 * DAY);

  // ── donors ──────────────────────────────────────────────────────────────────
  const donors = DONORS.map((d) => ({ _id: new mongoose.Types.ObjectId(), ...d }));

  // ── lots: 120 deliveries spread over the past 60 days ──────────────────────
  const lots = Array.from({ length: 120 }, (_, i) => {
    // The last 14 deliveries are short-life items, so the "Use first" board is never empty.
    const category = i >= 106 ? ['Produce', 'Dairy', 'Bakery'][i % 3] : weighted(CATEGORY_WEIGHTS);
    const [itemName, unit, qMin, qMax, sMin, sMax] = pick(CATALOGUE[category]);
    const receivedAt = new Date(start.getTime() + (i / 120) * 60 * DAY + int(8, 17) * 3600000);
    const quantity = int(qMin, qMax);
    const expiresOn = sMin === null ? null : new Date(startOfDay(receivedAt).getTime() + int(sMin, sMax) * DAY);
    return {
      _id: new mongoose.Types.ObjectId(),
      itemName, category, unit, quantity, receivedQuantity: quantity, expiresOn, receivedAt,
      donor: donors[int(0, donors.length - 1)]._id,
      location: defaultLocation(category),
    };
  });

  // ── households: codes H-0001…H-0045, no personal data ──────────────────────
  const households = Array.from({ length: 45 }, (_, i) => {
    const flags = rand() < 0.45 ? [] : [...new Set(Array.from({ length: int(1, 2) }, () => pick(DIETARY)))];
    return { _id: new mongoose.Types.ObjectId(), code: `H-${String(i + 1).padStart(4, '0')}`, size: pick([1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7]), dietary: flags };
  });

  // ── distributions: simulate 150 FEFO picks in time order ───────────────────
  const left = new Map(lots.map((l) => [String(l._id), l.quantity]));
  const times = Array.from({ length: 150 }, (_, i) => new Date(start.getTime() + DAY + ((i + 0.5) / 150) * 59 * DAY + int(0, 6) * 3600000))
    .map((t) => (t > now ? new Date(now.getTime() - int(1, 120) * 60000) : t))
    .sort((a, b) => a - b);

  const distributions = [];
  for (const at of times) {
    const household = households[int(0, households.length - 1)];
    const available = lots
      .filter((l) => l.receivedAt <= at && left.get(String(l._id)) > 0)
      .map((l) => ({ ...l, quantity: left.get(String(l._id)), status: classifyExpiry({ ...l, quantity: left.get(String(l._id)) }, at, EXPIRY_WINDOWS) }));
    // Only categories with pickable stock, so every simulated box gets at least one line.
    const cats = [...new Set(available.filter((l) => !['Expired', 'Depleted', 'Discarded'].includes(l.status)).map((l) => l.category))];
    if (!cats.length) throw new Error('seed: no pickable stock for a distribution — adjust the catalogue');
    const chosen = [...new Set(Array.from({ length: int(2, 4) }, () => pick(cats)))];
    const request = chosen.map((category) => ({ category, quantity: int(1, category === 'Canned' ? 6 : 3) }));
    const { lines } = planFefo(request, available);

    const byId = new Map(available.map((l) => [String(l._id), l]));
    const snapshot = lines.map((line) => {
      const lot = byId.get(line.lotId);
      left.set(line.lotId, left.get(line.lotId) - line.quantity);
      return { lot: lot._id, itemName: lot.itemName, category: lot.category, unit: lot.unit, location: lot.location, expiresOn: lot.expiresOn, quantity: line.quantity };
    });
    const totalUnits = snapshot.reduce((s, l) => s + l.quantity, 0);
    const byCat = {};
    for (const l of snapshot) byCat[l.category] = (byCat[l.category] ?? 0) + l.quantity;
    distributions.push({
      _id: new mongoose.Types.ObjectId(),
      household: household._id,
      lines: snapshot,
      totalUnits,
      at,
      summary: `${totalUnits} units for ${household.code} — ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ')}`,
    });
  }

  // ── final lot state: decremented quantities, a few expired lots discarded ──
  let discarded = 0;
  for (const lot of lots) {
    lot.quantity = left.get(String(lot._id));
    const expiredFor = lot.expiresOn ? (today - lot.expiresOn) / DAY : -1;
    if (lot.quantity > 0 && expiredFor >= 3 && discarded < 5 && lot.category !== 'Canned') {
      lot.status = 'Discarded';
      lot.discardedAt = new Date(lot.expiresOn.getTime() + 2 * DAY + 10 * 3600000);
      discarded += 1;
    } else {
      lot.status = classifyExpiry(lot, now, EXPIRY_WINDOWS);
    }
  }

  const data = { donors, lots, households, distributions, categories: CATEGORIES };
  cache = { at: now.getTime(), data };
  return data;
}
