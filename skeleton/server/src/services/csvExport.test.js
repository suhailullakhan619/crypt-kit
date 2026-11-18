import request from 'supertest';
import jwt from 'jsonwebtoken';
import { defineResource } from '../core/defineResource.js';
import { createApp } from '../app.js';
import { csvCell } from './csvService.js';
import { startDb, makeActor } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import config from '../../crypt.config.js';

const spells = defineResource({
  key: 'spells',
  label: 'Spells',
  fields: {
    name: { type: 'string', label: 'Name', required: true, list: true, search: true },
    level: { type: 'number', label: 'Level', list: true },
    kind: { type: 'enum', label: 'Kind', values: ['Hex', 'Charm'], default: 'Hex', filter: true },
    pin: { type: 'string', label: 'Pin', secret: true },
  },
  permissions: { read: config.roles.slice(1), create: [], update: [], delete: [] },
});

let db;
let app;
let auth;
beforeAll(async () => {
  db = await startDb([spells]);
  app = await createApp();
  const role = config.roles[1];
  const a = await makeActor(role, role);
  auth = { Authorization: `Bearer ${jwt.sign({ userId: a.userId, role, name: role }, TEST_SECRET)}` };
});
afterAll(() => db.stop());

describe('csvCell', () => {
  test('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"');
  });
  test('neutralises spreadsheet formulas', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('@cmd')).toBe("'@cmd");
  });
  test('handles null, arrays and dates', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(['a', 'b'])).toBe('a; b');
    expect(csvCell(new Date('2030-01-02T03:04:05Z'))).toBe('2030-01-02T03:04:05.000Z');
  });
});

describe('GET /api/r/:key/export', () => {
  beforeEach(() => db.clear());

  test('returns a CSV attachment with headers, escaped cells and no secret columns', async () => {
    await spells.model.insertMany([
      { name: 'Fog, thick', level: 2, kind: 'Hex', pin: '1234' },
      { name: '=EVIL()', level: 1, kind: 'Charm', pin: '9999' },
    ]);
    const res = await request(app).get('/api/r/spells/export').set(auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/spells\.csv/);
    expect(res.text).toMatch(/Name,Level,Kind,Created/);
    expect(res.text).toContain('"Fog, thick"');
    expect(res.text).toContain("'=EVIL()");
    expect(res.text).not.toMatch(/1234|9999|Pin/);
  });

  test('honours the same filters as the list', async () => {
    await spells.model.insertMany([{ name: 'A', kind: 'Hex' }, { name: 'B', kind: 'Charm' }]);
    const res = await request(app).get('/api/r/spells/export?kind=Charm').set(auth);
    const rows = res.text.trim().split('\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatch(/^B,/);
  });

  test('requires authentication and read permission', async () => {
    expect((await request(app).get('/api/r/spells/export')).status).toBe(401);
  });
});
