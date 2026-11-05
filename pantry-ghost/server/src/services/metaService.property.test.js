// Property 13: Meta Never Exposes Secret, Hidden or Unreadable Data
// Validates: Requirements 7.2, 7.3
import fc from 'fast-check';
import { buildMeta, buildPublicMeta } from './metaService.js';
import { can } from '../core/permissions.js';
import { validDefinition, ROLES } from '../../test/generators/definition.js';

const config = { appName: 'Test', theme: 'crypt', roles: ROLES };

const defsArb = fc
  .uniqueArray(validDefinition, { minLength: 1, maxLength: 5, selector: (d) => d.key })
  .chain((defs) =>
    fc.tuple(
      fc.constant(defs),
      // sprinkle hidden flags on random fields
      fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 6 })
    ).map(([ds, hides]) => {
      const out = structuredClone(ds);
      for (const [i, j] of hides) {
        const d = out[i % out.length];
        const names = Object.keys(d.fields);
        d.fields[names[j % names.length]].hidden = true;
      }
      return out;
    })
  );

const registryOf = (defs) => ({ all: () => defs.map((def) => ({ key: def.key, def })) });

describe('Property 13: meta exposure', () => {
  test('no secret/hidden field and no unreadable resource ever appears', () => {
    fc.assert(
      fc.property(defsArb, fc.constantFrom(...ROLES), (defs, role) => {
        const meta = buildMeta(registryOf(defs), config, { role, userId: 'u' });
        const json = meta.resources;
        const expectedKeys = defs.filter((d) => can(role, d, 'read', ROLES)).map((d) => d.key).sort();
        expect(json.map((r) => r.key).sort()).toEqual(expectedKeys);

        for (const r of json) {
          const def = defs.find((d) => d.key === r.key);
          for (const f of r.fields) {
            expect(def.fields[f.name].secret).not.toBe(true);
            expect(def.fields[f.name].hidden).not.toBe(true);
          }
          expect(r.permissions.read).toBe(true);
        }
      }),
      { numRuns: 200 }
    );
  });

  test('public meta lists demo users without passwords, and only in demo mode', () => {
    const cfg = { ...config, demoUsers: [{ name: 'A', email: 'a@t', password: 'pw', role: ROLES[0] }] };
    const demo = buildPublicMeta(cfg, { DEMO_MODE: true, VOICE_PROVIDER: 'browser' });
    expect(demo.demoUsers).toEqual([{ name: 'A', email: 'a@t', role: ROLES[0] }]);
    expect(JSON.stringify(demo)).not.toContain('pw');
    expect(buildPublicMeta(cfg, { DEMO_MODE: false }).demoUsers).toEqual([]);
  });
});
