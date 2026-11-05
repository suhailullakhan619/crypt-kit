import fc from 'fast-check';
import { CATEGORY_KEYWORDS } from '../../src/domain/categoryKeywords.js';
import { numberToWords, ordinalWords } from '../../src/domain/numberWords.js';

/**
 * Sentence-template generator for Property P5 (intake round trip).
 * Each sample is `{ text, expected: { quantity, unit, category, expiresOn(now) | null, donorId } }`.
 * The expected date is computed here, independently of src/domain/dateWords.js.
 */

const DAY = 86400000;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Donor names far apart from each other (edit distance ≥ 5), letters and spaces only. */
export const DONORS = Object.freeze([
  { _id: 'd01', name: 'Fresh Mart' },
  { _id: 'd02', name: 'Green Valley Farm' },
  { _id: 'd03', name: 'Hilltop Bakery' },
  { _id: 'd04', name: 'Riverside Church' },
  { _id: 'd05', name: 'Sunrise Grocers' },
  { _id: 'd06', name: 'Oakwood Rotary Club' },
  { _id: 'd07', name: 'Northgate School Food Drive' },
  { _id: 'd08', name: 'Patel Family' },
]);

/** Spoken forms per stored unit: [singular forms, plural forms]. */
const UNIT_FORMS = {
  can: [['can', 'tin'], ['cans', 'tins']],
  box: [['box', 'carton'], ['boxes', 'cartons']],
  kg: [['kg', 'kilo', 'kilogram'], ['kg', 'kilos', 'kilograms']],
  lb: [['lb', 'pound'], ['lbs', 'pounds']],
  L: [['litre', 'liter', 'l'], ['litres', 'liters', 'l']],
  item: [['item', 'piece', 'bag'], ['items', 'pieces', 'bags']],
};

// Items whose words never collide with units, numbers, months, weekdays or markers.
const ITEMS = Object.keys(CATEGORY_KEYWORDS).filter((k) => !['canned', 'dairy', 'produce', 'bakery', 'frozen', 'hygiene', 'dry goods', 'fruit', 'vegetables'].includes(k));

const startOfDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** `now` anywhere in 2026–2029 at any time of day. */
export const nowArb = fc.date({ min: new Date('2026-01-01T00:00:00Z'), max: new Date('2029-12-31T23:59:59Z') });

/** ≤ 2 letter-level typos (substitute, delete, insert) that keep word boundaries intact. */
export const typoArb = (name) =>
  fc.array(fc.tuple(fc.constantFrom('sub', 'del', 'ins'), fc.nat(), fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz')), { maxLength: 2 }).map((edits) => {
    let s = name.toLowerCase();
    for (const [op, pos, ch] of edits) {
      const letters = [...s].map((c, i) => (c === ' ' ? -1 : i)).filter((i) => i >= 0);
      const at = letters[pos % letters.length];
      // never delete a one-letter word, never shrink a word below 3 letters
      const word = s.slice(0, at).split(' ').length - 1;
      const wlen = s.split(' ')[word].length;
      if (op === 'sub') s = s.slice(0, at) + ch + s.slice(at + 1);
      else if (op === 'del' && wlen > 3) s = s.slice(0, at) + s.slice(at + 1);
      else if (op === 'ins') s = s.slice(0, at) + ch + s.slice(at);
    }
    return s;
  });

/** Date phrase + oracle `(now) => Date`. */
const dateArb = fc.oneof(
  // month-name forms without a year → next occurrence on/after today
  fc.tuple(fc.integer({ min: 0, max: 11 }), fc.integer({ min: 1, max: 28 }), fc.constantFrom('md', 'mdth', 'mdword', 'dm', 'dofm', 'thedofm')).map(([m, d, form]) => {
    const th = `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`;
    const phrase = {
      md: `${MONTHS[m]} ${d}`,
      mdth: `${MONTHS[m]} ${th}`,
      mdword: `${MONTHS[m]} ${ordinalWords(d, { hyphen: d % 2 === 0 })}`,
      dm: `${d} ${MONTHS[m]}`,
      dofm: `${th} of ${MONTHS[m]}`,
      thedofm: `the ${ordinalWords(d)} of ${MONTHS[m]}`,
    }[form];
    return {
      phrase,
      expected: (now) => {
        const today = startOfDay(now);
        let c = new Date(Date.UTC(today.getUTCFullYear(), m, d));
        if (c < today) c = new Date(Date.UTC(today.getUTCFullYear() + 1, m, d));
        return c;
      },
    };
  }),
  // explicit year
  fc.tuple(fc.integer({ min: 2026, max: 2031 }), fc.integer({ min: 0, max: 11 }), fc.integer({ min: 1, max: 28 }), fc.boolean()).map(([y, m, d, iso]) => ({
    phrase: iso ? `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : `${MONTHS[m]} ${d} ${y}`,
    expected: () => new Date(Date.UTC(y, m, d)),
  })),
  // relative
  fc.tuple(fc.integer({ min: 1, max: 60 }), fc.constantFrom('days', 'weeks'), fc.boolean()).map(([n, unit, words]) => ({
    phrase: `in ${words ? numberToWords(n) : n} ${n === 1 ? unit.slice(0, -1) : unit}`,
    expected: (now) => new Date(startOfDay(now).getTime() + n * (unit === 'days' ? 1 : 7) * DAY),
  })),
  fc.constantFrom('tomorrow', 'today').map((w) => ({ phrase: w, expected: (now) => new Date(startOfDay(now).getTime() + (w === 'tomorrow' ? DAY : 0)) })),
  fc.integer({ min: 0, max: 6 }).map((wd) => ({
    phrase: `next ${WEEKDAYS[wd]}`,
    expected: (now) => {
      const today = startOfDay(now);
      const diff = ((wd - today.getUTCDay() + 7) % 7) || 7;
      return new Date(today.getTime() + diff * DAY);
    },
  }))
);

const TEMPLATES = [
  ({ verb, qty, unit, item, date, donor }) => `${verb}${qty} ${unit}${unit ? ' ' : ''}of ${item} expiring ${date} from ${donor}`,
  ({ verb, qty, unit, item, date, donor }) => `${verb}${qty} ${unit}${unit ? ' ' : ''}${item} from ${donor} best before ${date}`,
  ({ verb, qty, unit, item, date, donor }) => `${verb}from ${donor}, ${qty} ${unit}${unit ? ' ' : ''}of ${item}, use by ${date}`,
  ({ verb, qty, unit, item, date, donor }) => `${verb}${qty} ${unit}${unit ? ' ' : ''}${item}, expires ${date}, donated by ${donor}`,
  ({ qty, unit, item, date, donor }) => `We got ${qty} ${unit}${unit ? ' ' : ''}of ${item} from ${donor}. Expiry date ${date}.`,
];

/** One generated intake sentence with its expected draft. */
export const intakeSentenceArb = fc
  .record({
    quantity: fc.integer({ min: 1, max: 100 }),
    asWords: fc.boolean(),
    unit: fc.constantFrom(...Object.keys(UNIT_FORMS)),
    unitForm: fc.nat(),
    omitItemUnit: fc.boolean(),
    item: fc.constantFrom(...ITEMS),
    date: dateArb,
    donorIndex: fc.nat({ max: DONORS.length - 1 }),
    typoSeed: fc.nat(),
    template: fc.nat({ max: TEMPLATES.length - 1 }),
    verb: fc.constantFrom('', 'add ', 'log ', 'Add ', 'please log '),
    shout: fc.boolean(),
  })
  .chain((r) => typoArb(DONORS[r.donorIndex].name).map((donorSpoken) => ({ ...r, donorSpoken })))
  .map((r) => {
    const forms = UNIT_FORMS[r.unit][r.quantity === 1 ? 0 : 1];
    // "12 apples" (no unit word) is a valid way to say 12 items
    const unitWord = r.unit === 'item' && r.omitItemUnit ? '' : forms[r.unitForm % forms.length];
    const qty = r.asWords ? numberToWords(r.quantity, { hyphen: r.quantity % 2 === 0 }) : String(r.quantity);
    let text = TEMPLATES[r.template]({ verb: r.verb, qty, unit: unitWord, item: r.item, date: r.date.phrase, donor: r.donorSpoken });
    if (r.shout) text = text.toUpperCase();
    return {
      text,
      expected: {
        quantity: r.quantity,
        unit: r.unit,
        category: CATEGORY_KEYWORDS[r.item],
        expiresOn: r.date.expected,
        donorId: DONORS[r.donorIndex]._id,
      },
    };
  });
