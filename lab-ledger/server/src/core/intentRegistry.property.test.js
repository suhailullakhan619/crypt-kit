// Property 14: Intent Parser Recognises Every Generated Example
// Validates: Requirements 11.1, 11.3
import fc from 'fast-check';
import { parseIntent, buildIntents } from './intentRegistry.js';
import { spokenValue } from './builtinIntents.js';

const SYN_POOL = ['ghouls', 'bats', 'potions', 'scrolls', 'candles', 'cauldrons', 'brooms', 'skulls', 'lanterns', 'to-dos'];
const VALUE_POOL = ['Fresh', 'Pickled', 'CheckedOut', 'UnderRepair', 'Lost', 'Haunted', 'Cursed', 'Under Repair Soon'];

const resourcesArb = fc
  .uniqueArray(fc.constantFrom(...SYN_POOL), { minLength: 1, maxLength: 4 })
  .chain((syns) =>
    fc.tuple(
      ...syns.map((syn, i) =>
        fc.record({
          values: fc.uniqueArray(fc.constantFrom(...VALUE_POOL), { minLength: 2, maxLength: 4, selector: (v) => spokenValue(v) }),
          hasDue: fc.boolean(),
          extraSyn: fc.boolean(),
        }).map(({ values, hasDue, extraSyn }) => {
          const fields = { title: { type: 'string' }, state: { type: 'enum', values, filter: true }, when: { type: 'date' } };
          const def = {
            key: `res-${i}`,
            label: `Resource ${i}`,
            fields,
            voice: { synonyms: extraSyn ? [syn, `${syn} records`] : [syn] },
            ...(hasDue ? { due: { field: 'when', status: 'state', from: [values[0]], to: values[1] } } : {}),
          };
          return { key: def.key, def, model: {} };
        })
      )
    )
  );

const registryOf = (rs) => ({ all: () => rs, get: (k) => rs.find((r) => r.key === k) ?? null });

/** Random casing, trailing punctuation and extra whitespace. */
const noisy = (phrase) =>
  fc.tuple(
    fc.array(fc.boolean(), { minLength: phrase.length, maxLength: phrase.length }),
    fc.constantFrom('', '?', '!', '.', ' ?', '...'),
    fc.constantFrom('', ' ', '  ')
  ).map(([upper, punct, pad]) => pad + [...phrase].map((c, i) => (upper[i] ? c.toUpperCase() : c)).join('').replace(/ /g, pad ? '  ' : ' ') + punct);

function casesFor(r) {
  const syn = r.def.voice.synonyms[0];
  const out = [
    { phrase: `how many ${syn}`, intent: 'COUNT_ALL' },
    { phrase: `how many ${syn} are there`, intent: 'COUNT_ALL' },
    { phrase: `count ${syn}`, intent: 'COUNT_ALL' },
    { phrase: `total number of ${syn}`, intent: 'COUNT_ALL' },
  ];
  for (const v of r.def.fields.state.values) {
    out.push({ phrase: `how many ${syn} are ${spokenValue(v)}`, intent: 'COUNT_BY_VALUE', value: v });
    out.push({ phrase: `how many ${spokenValue(v)} ${syn}`, intent: 'COUNT_BY_VALUE', value: v });
    out.push({ phrase: `how many ${spokenValue(v)} state ${syn}`, intent: 'COUNT_BY_VALUE', value: v });
    out.push({ phrase: `how many ${syn} with state ${spokenValue(v)}`, intent: 'COUNT_BY_VALUE', value: v });
  }
  if (r.def.due) {
    out.push({ phrase: `which ${syn} are overdue`, intent: 'LIST_OVERDUE' });
    out.push({ phrase: `overdue ${syn}`, intent: 'LIST_OVERDUE' });
  }
  return out;
}

const scenario = resourcesArb.chain((rs) =>
  fc.constantFrom(...rs).chain((r) => fc.constantFrom(...casesFor(r)).chain((c) => noisy(c.phrase).map((text) => ({ rs, r, c, text }))))
);

describe('Property 14: intent parsing', () => {
  test('every generated example (with noise) parses to its intent, resource and value', async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async ({ rs, r, c, text }) => {
        const intents = await buildIntents(registryOf(rs), { appIntents: [] });
        const parsed = parseIntent(text, intents);
        expect(parsed.intent).toBe(c.intent);
        expect(parsed.params.resource).toBe(r.key);
        if (c.value) expect(parsed.params.value).toBe(c.value);
      }),
      { numRuns: 400 }
    );
  });

  test('text containing no synonym or keyword is UNKNOWN', async () => {
    await fc.assert(
      fc.asyncProperty(resourcesArb, fc.array(fc.stringMatching(/^[qzxvj]{1,7}$/), { maxLength: 8 }), async (rs, words) => {
        const intents = await buildIntents(registryOf(rs), { appIntents: [] });
        expect(parseIntent(words.join(' '), intents).intent).toBe('UNKNOWN');
      }),
      { numRuns: 200 }
    );
  });

  test('app intents are matched before built-ins (Req 11.2)', async () => {
    const rs = [{ key: 'bats', def: { key: 'bats', label: 'Bats', fields: {}, voice: { synonyms: ['bats'] } }, model: {} }];
    const custom = { name: 'BAT_SPECIAL', match: (t) => (t.startsWith('how many bats') ? {} : null), handle: () => 1, respond: () => 'x' };
    const intents = await buildIntents(registryOf(rs), { appIntents: [custom] });
    expect(parseIntent('How many bats?', intents).intent).toBe('BAT_SPECIAL');
  });

  test('DUE_SOON phrasings', async () => {
    const rs = [{ key: 'n', def: { key: 'n', label: 'N', fields: { s: { type: 'enum', values: ['A', 'B'] }, d: { type: 'date' } }, due: { field: 'd', status: 's', from: ['A'], to: 'B' } }, model: {} }];
    const intents = await buildIntents(registryOf(rs), { appIntents: [] });
    for (const q of ["What's due this week?", 'what is due soon', 'Anything due in the next 7 days', 'due next week']) {
      expect(parseIntent(q, intents).intent).toBe('DUE_SOON');
    }
  });
});
