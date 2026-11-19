import request from 'supertest';
import jwt from 'jsonwebtoken';
import { defineResource } from '../core/defineResource.js';
import { createApp } from '../app.js';
import { sortCollation } from './resourceService.js';
import { startDb, makeActor } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import config from '../../crypt.config.js';

const [, midRole] = config.roles;
const bearer = (a) => ({ Authorization: `Bearer ${jwt.sign({ userId: a.userId, role: a.role, name: a.name }, TEST_SECRET)}` });

const things = defineResource({
  key: 'things',
  label: 'Things',
  titleField: 'name',
  fields: {
    name: { type: 'string', label: 'Name', required: true, list: true },
    size: { type: 'number', label: 'Size', list: true },
  },
  permissions: { read: [midRole], create: [midRole], update: [midRole], delete: [] },
});

let db;
let app;
beforeAll(async () => {
  db = await startDb([things]);
  app = await createApp();
});
afterAll(() => db.stop());

describe('sorting a list by a text column', () => {
  test('is alphabetical and ignores upper/lower case; numbers inside names sort numerically', async () => {
    await things.model.create(['banana', 'Apple', 'cherry', 'Bench 10', 'bench 9', 'apricot'].map((name, i) => ({ name, size: i })));
    const auth = bearer(await makeActor(midRole, 'Sorter'));
    const asc = await request(app).get('/api/r/things?sort=name').set(auth);
    expect(asc.body.items.map((t) => t.name)).toEqual(['Apple', 'apricot', 'banana', 'bench 9', 'Bench 10', 'cherry']);
    const desc = await request(app).get('/api/r/things?sort=-name').set(auth);
    expect(desc.body.items.map((t) => t.name)).toEqual(['cherry', 'Bench 10', 'bench 9', 'banana', 'apricot', 'Apple']);
  });

  test('only text-like fields get a collation', () => {
    expect(sortCollation(things.def, 'name')).toMatchObject({ locale: 'en', strength: 2 });
    expect(sortCollation(things.def, '-size')).toBeNull();
    expect(sortCollation(things.def, undefined)).toBeNull(); // default -createdAt
  });
});
