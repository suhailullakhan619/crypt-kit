// Property 17: Voice Answers Respect Read Permissions
// Validates: Requirements 11.9, 16.4
import fc from 'fast-check';
import { jest } from '@jest/globals';
import { answer, examples } from './voiceService.js';
import { buildIntents } from '../core/intentRegistry.js';
import { setContext } from '../context.js';

const ROLES = ['Boss', 'Helper', 'Visitor'];
const config = { roles: ROLES };

function trapModel() {
  const boom = jest.fn(() => { throw new Error('model must not be queried'); });
  return { countDocuments: boom, find: boom, aggregate: boom, boom };
}

function makeResource(key, readers) {
  return {
    key,
    def: {
      key,
      label: key[0].toUpperCase() + key.slice(1),
      fields: { status: { type: 'enum', values: ['Open', 'Closed', 'Late'], filter: true }, when: { type: 'date' } },
      permissions: { read: readers },
      due: { field: 'when', status: 'status', from: ['Open'], to: 'Late' },
      voice: { synonyms: [key] },
    },
    model: trapModel(),
  };
}

const registryOf = (rs) => ({ all: () => rs, get: (k) => rs.find((r) => r.key === k) ?? null });

describe('Property 17: voice respects read permissions', () => {
  test('a role that cannot read the resource gets an access-denied answer and no query runs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.subarray(ROLES.slice(1)),
        fc.constantFrom('Helper', 'Visitor'),
        fc.constantFrom('how many coffins', 'how many coffins are open', 'which coffins are overdue', 'how many late coffins'),
        async (readers, role, question) => {
          fc.pre(!readers.includes(role));
          const r = makeResource('coffins', readers);
          const registry = registryOf([r]);
          setContext({ config, registry, intents: await buildIntents(registry, { appIntents: [] }) });

          const res = await answer(question, { userId: 'u', role });
          expect(res.answer).toMatch(/don't have access to Coffins/);
          expect(res.data).toBeNull();
          expect(r.model.boom).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('aggregateOnly intents with `requires` bypass the read check, but only for listed roles', async () => {
    const r = makeResource('coffins', []);
    const registry = registryOf([r]);
    const agg = { name: 'COFFIN_TOTAL', resource: 'coffins', aggregateOnly: true, requires: ['Visitor'], examples: ['coffin total'], match: (t) => (t === 'coffin total' ? {} : null), handle: () => 7, respond: (n) => `${n} coffins` };
    setContext({ config, registry, intents: await buildIntents(registry, { appIntents: [agg] }) });

    expect((await answer('Coffin total?', { userId: 'u', role: 'Visitor' })).answer).toBe('7 coffins');
    expect((await answer('Coffin total?', { userId: 'u', role: 'Helper' })).answer).toMatch(/don't have access/);
    expect(examples({ role: 'Visitor' })).toContain('coffin total');
    expect(examples({ role: 'Helper' })).not.toContain('coffin total');
  });

  test('readable resources are answered from the model', async () => {
    const r = makeResource('coffins', ['Helper']);
    r.model.countDocuments = jest.fn(async () => 3);
    const registry = registryOf([r]);
    setContext({ config, registry, intents: await buildIntents(registry, { appIntents: [] }) });
    const res = await answer('How many coffins are open?', { userId: 'u', role: 'Helper' });
    expect(res).toMatchObject({ intent: 'COUNT_BY_VALUE', data: 3 });
    expect(res.answer).toBe('There are 3 coffins with status open.');
  });

  test('empty / too long questions are 400; gibberish is UNKNOWN', async () => {
    setContext({ config, registry: registryOf([]), intents: [] });
    await expect(answer('   ', { role: 'Boss' })).rejects.toMatchObject({ status: 400 });
    await expect(answer('x'.repeat(501), { role: 'Boss' })).rejects.toMatchObject({ status: 400 });
    expect((await answer('zzz qqq', { role: 'Boss' })).intent).toBe('UNKNOWN');
  });
});
