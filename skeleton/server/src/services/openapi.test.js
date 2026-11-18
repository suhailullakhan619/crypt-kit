import request from 'supertest';
import jwt from 'jsonwebtoken';
import { defineResource } from '../core/defineResource.js';
import { createApp } from '../app.js';
import { buildOpenApi } from './openapiService.js';
import { startDb, makeActor } from '../../test/db.js';
import { TEST_SECRET } from '../../test/helpers.js';
import config from '../../crypt.config.js';

const potions = defineResource({
  key: 'potion-vials',
  label: 'Potion vials',
  fields: {
    name: { type: 'string', label: 'Name', required: true, max: 40, filter: true },
    strength: { type: 'number', min: 1, max: 9 },
    kind: { type: 'enum', values: ['Red', 'Blue'], filter: true },
    recipe: { type: 'string', secret: true },
  },
  permissions: { read: config.roles.slice(1), create: [config.roles[1]], update: [], delete: [] },
  genericDisabled: ['delete'],
});

let db;
let app;
beforeAll(async () => {
  db = await startDb([potions]);
  app = await createApp();
});
afterAll(() => db.stop());

describe('buildOpenApi', () => {
  const doc = () => buildOpenApi(db.registry, config);

  test('is a valid-looking OpenAPI 3 document with the app name and roles', () => {
    const d = doc();
    expect(d.openapi).toMatch(/^3\.0/);
    expect(d.info.title).toBe(`${config.appName} API`);
    expect(d.info.description).toContain(config.roles[0]);
    expect(d.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });

  test('describes every generic route of a resource, with filters and permissions', () => {
    const d = doc();
    expect(Object.keys(d.paths)).toEqual(expect.arrayContaining([
      '/r/potion-vials', '/r/potion-vials/{id}', '/r/potion-vials/{id}/activity', '/r/potion-vials/export', '/r/potion-vials/import', '/auth/login', '/notifications',
    ]));
    const list = d.paths['/r/potion-vials'].get;
    expect(list.parameters.map((p) => p.name)).toEqual(expect.arrayContaining(['q', 'page', 'limit', 'sort', 'name', 'kind']));
    expect(list.description).toContain(config.roles[1]);
  });

  test('omits disabled actions and never exposes secret fields', () => {
    const d = doc();
    expect(d.paths['/r/potion-vials/{id}'].delete).toBeUndefined();
    expect(d.paths['/r/potion-vials/{id}'].patch).toBeDefined();
    const schema = d.components.schemas.PotionVials;
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(['name', 'strength', 'kind']));
    expect(JSON.stringify(d)).not.toContain('recipe');
    expect(d.components.schemas.PotionVialsInput.required).toEqual(['name']);
    expect(schema.properties.strength).toMatchObject({ type: 'number', minimum: 1, maximum: 9 });
    expect(schema.properties.kind.enum).toEqual(['Red', 'Blue']);
  });
});

describe('GET /api/docs', () => {
  test('needs a sign-in, then returns the document', async () => {
    expect((await request(app).get('/api/docs')).status).toBe(401);
    const a = await makeActor(config.roles[1], 'Doc');
    const token = jwt.sign({ userId: a.userId, role: a.role, name: a.name }, TEST_SECRET);
    const res = await request(app).get('/api/docs').set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body.paths['/r/potion-vials']).toBeDefined();
  });
});
