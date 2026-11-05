// Property 6: Create–Read Round Trip Preserves Declared Fields      — Validates: Requirements 4.6, 5.4, 5.5
// Property 7: Filters Return Exactly the Matching Records            — Validates: Requirements 5.3, 5.6
// Property 8: Pagination Partitions the Result Set                   — Validates: Requirements 5.3
// Property 9: Status Transitions Follow the Flow Exactly             — Validates: Requirements 5.8
// Property 10: Every Mutation Produces Exactly One Activity Entry    — Validates: Requirements 6.1
import fc from 'fast-check';
import * as svc from './resourceService.js';
import ActivityLog from '../models/ActivityLog.js';
import { startDb, makeActor } from '../../test/db.js';
import { recordArb } from '../../test/generators/records.js';
import { normalise } from '../utils/diff.js';
import specimens, { STATUS, TRANSITIONS } from '../../test/fixtures/specimens.js';

const def = specimens.def;
const VISIBLE = Object.entries(def.fields).filter(([, s]) => !s.secret).map(([n]) => n);
let db;
let actor;
let keeperIds;

beforeAll(async () => {
  db = await startDb([specimens]);
  actor = await makeActor('Member', 'Igor');
  keeperIds = [actor.userId, (await makeActor('Viewer', 'Casper')).userId];
});
afterAll(() => db.stop());

const recArb = () => recordArb(def, { refIds: keeperIds, exclude: ['status', 'secretCode'] });

describe('Property 6: round trip', () => {
  test('create then get returns equal values for every declared non-secret field', async () => {
    await fc.assert(
      fc.asyncProperty(recArb(), fc.string({ maxLength: 10 }), async (rec, secret) => {
        const created = await svc.create(specimens, { ...rec, secretCode: secret }, actor);
        const read = await svc.get(specimens, String(created._id));
        for (const f of VISIBLE) {
          if (rec[f] === undefined) continue;
          expect(normalise(read[f])).toEqual(normalise(rec[f]));
        }
        expect(read.secretCode).toBeUndefined();
        expect(String(read.createdBy._id)).toBe(actor.userId);
      }),
      { numRuns: 30 }
    );
  });

  test('system fields in the body are ignored', async () => {
    const fakeId = '0123456789abcdef01234567';
    const created = await svc.create(specimens, { name: 'Bat', _id: fakeId, createdBy: fakeId, createdAt: '1999-01-01' }, actor);
    expect(String(created._id)).not.toBe(fakeId);
    expect(String(created.createdBy._id)).toBe(actor.userId);
    expect(new Date(created.createdAt).getFullYear()).toBeGreaterThan(2000);
  });
});

/** In-memory reference implementation of the filter semantics. */
function matches(rec, filters) {
  return Object.entries(filters).every(([k, v]) => {
    const val = rec[k];
    if (Array.isArray(val)) return val.includes(v);
    if (k === 'keeper') return String(val) === v;
    if (k === 'weight') return val === Number(v);
    if (k === 'alive') return val === (v === 'true');
    return val === v;
  });
}

describe('Property 7: filters', () => {
  test('list returns exactly the records matching all filters (soft-deleted excluded)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(recArb(), fc.constantFrom(...STATUS)), { minLength: 1, maxLength: 25 }),
        fc.record(
          {
            kind: fc.constantFrom('Bat', 'Toad', 'Newt'),
            status: fc.constantFrom(...STATUS),
            alive: fc.constantFrom('true', 'false'),
            tags: fc.constantFrom('A', 'B', 'C'),
            keeper: fc.constantFrom(...keeperIds),
          },
          { requiredKeys: [] }
        ),
        async (rows, filters) => {
          await db.clear();
          const docs = await specimens.model.insertMany(rows.map(([r, status]) => ({ ...r, status })));
          const res = await svc.list(specimens, { ...filters, limit: '100' }, actor);
          const expected = docs
            .map((d) => d.toObject())
            .filter((d) => (filters.status ? true : d.status !== 'Gone'))
            .filter((d) => matches(d, filters))
            .map((d) => String(d._id))
            .sort();
          expect(res.items.map((i) => String(i._id)).sort()).toEqual(expected);
          expect(res.total).toBe(expected.length);
        }
      ),
      { numRuns: 30 }
    );
  });
});

describe('Property 8: pagination', () => {
  test('concatenating all pages yields every record exactly once; pages = ceil(N / L)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 45 }),
        fc.integer({ min: 1, max: 100 }),
        fc.constantFrom('name', '-name', 'weight', '-weight', 'createdAt', '-foundOn'),
        async (n, limit, sort) => {
          await db.clear();
          // Many duplicate names/weights on purpose: the _id tiebreaker must keep pages stable.
          const docs = await specimens.model.insertMany(
            Array.from({ length: n }, (_, i) => ({ name: `S${i % 3}`, weight: i % 4, foundOn: new Date(2026, 0, (i % 5) + 1) }))
          );
          const first = await svc.list(specimens, { limit: String(limit), sort }, actor);
          expect(first.pages).toBe(Math.ceil(n / limit));
          const seen = [...first.items];
          for (let p = 2; p <= first.pages; p++) {
            seen.push(...(await svc.list(specimens, { limit: String(limit), page: String(p), sort }, actor)).items);
          }
          const ids = seen.map((i) => String(i._id));
          expect(new Set(ids).size).toBe(ids.length);
          expect(ids.sort()).toEqual(docs.map((d) => String(d._id)).sort());
        }
      ),
      { numRuns: 25 }
    );
  });
});

describe('Property 9: status transitions', () => {
  test('PATCH succeeds iff to === from or to ∈ transitions[from] (and neither is workflow-only); else 409 and unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...STATUS), fc.constantFrom(...STATUS), async (from, to) => {
        const [doc] = await specimens.model.insertMany([{ name: 'Flowy', status: from }]);
        const allowed = from === to || (TRANSITIONS[from].includes(to) && from !== 'Gone' && to !== 'Gone');
        const result = await svc.update(specimens, String(doc._id), { status: to }, actor).then(() => 'ok', (e) => e);
        const after = await specimens.model.findById(doc._id).lean();
        if (allowed) {
          expect(result).toBe('ok');
          expect(after.status).toBe(to);
        } else {
          expect(result.status).toBe(409);
          expect(after.status).toBe(from);
        }
      }),
      { numRuns: 60 }
    );
  });
});

describe('Property 10: activity log', () => {
  const op = fc.oneof(
    fc.record({ kind: fc.constant('create'), rec: recArb() }),
    fc.record({ kind: fc.constant('update'), idx: fc.nat(), changes: fc.record({ name: fc.stringMatching(/^[A-Z][a-z]{1,8}$/), weight: fc.integer({ min: 0, max: 50 }), secretCode: fc.string({ maxLength: 5 }) }, { requiredKeys: [] }) }),
    fc.record({ kind: fc.constant('status'), idx: fc.nat(), to: fc.constantFrom(...STATUS) }),
    fc.record({ kind: fc.constant('delete'), idx: fc.nat() })
  );

  test('entries = successful mutations + status changes, and no diff contains a secret field', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 12 }), async (ops) => {
        await db.clear();
        const ids = [];
        let expected = 0;
        for (const o of ops) {
          if (o.kind === 'create') {
            const c = await svc.create(specimens, o.rec, actor);
            ids.push(String(c._id));
            expected += 1;
            continue;
          }
          if (!ids.length) continue;
          const id = ids[o.idx % ids.length];
          const before = await specimens.model.findById(id).lean();
          if (o.kind === 'update') {
            const ok = await svc.update(specimens, id, o.changes, actor).then(() => true, () => false);
            if (ok) expected += 1;
          } else if (o.kind === 'status') {
            const ok = await svc.update(specimens, id, { status: o.to }, actor).then(() => true, () => false);
            if (ok) expected += 1 + (before.status !== o.to ? 1 : 0);
          } else {
            const ok = await svc.remove(specimens, id, actor).then(() => true, () => false);
            if (ok) expected += 1;
          }
        }
        const entries = await ActivityLog.find({}).lean();
        expect(entries.length).toBe(expected);
        for (const e of entries) expect(Object.keys(e.diff ?? {})).not.toContain('secretCode');
      }),
      { numRuns: 25 }
    );
  });
});

describe('soft delete & hard delete (Req 5.6, 5.7)', () => {
  test('soft delete sets status + timestamp and hides from list; second delete is 404', async () => {
    await db.clear();
    const c = await svc.create(specimens, { name: 'Doomed' }, actor);
    const { soft, item } = await svc.remove(specimens, String(c._id), actor);
    expect(soft).toBe(true);
    expect(item.status).toBe('Gone');
    expect(item.goneAt).toBeTruthy();
    expect((await svc.list(specimens, {}, actor)).total).toBe(0);
    await expect(svc.remove(specimens, String(c._id), actor)).rejects.toMatchObject({ status: 404 });
  });

  test('malformed ids are 404, not 500', async () => {
    await expect(svc.get(specimens, 'not-an-id')).rejects.toMatchObject({ status: 404 });
    await expect(svc.update(specimens, '123', {}, actor)).rejects.toMatchObject({ status: 404 });
  });
});
