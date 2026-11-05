// Property 16: Report Rows Match the Filtered Listing
// Validates: Requirements 10.1
import fc from 'fast-check';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, unlink } from 'node:fs/promises';
import * as reports from './reportService.js';
import * as svc from './resourceService.js';
import { startDb, makeActor } from '../../test/db.js';
import { recordArb } from '../../test/generators/records.js';
import { renderReport } from '../utils/pdfGenerator.js';
import specimens, { STATUS } from '../../test/fixtures/specimens.js';

let db;
let member;
let dir;

beforeAll(async () => {
  db = await startDb([specimens]);
  member = await makeActor('Member', 'Igor');
  dir = await mkdtemp(path.join(os.tmpdir(), 'crypt-reports-'));
  reports.setReportDir(dir);
});
afterAll(async () => {
  await db.stop();
  await rm(dir, { recursive: true, force: true });
});

describe('Property 16: report count matches listing', () => {
  test('for any filters, report.count === unpaginated list total', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(recordArb(specimens.def, { exclude: ['status', 'keeper', 'secretCode'] }), fc.constantFrom(...STATUS)), { maxLength: 30 }),
        fc.record({ kind: fc.constantFrom('Bat', 'Toad', 'Newt'), status: fc.constantFrom(...STATUS), alive: fc.constantFrom('true', 'false') }, { requiredKeys: [] }),
        async (rows, filters) => {
          await db.clear();
          await specimens.model.insertMany(rows.map(([r, status]) => ({ ...r, status })));
          const report = await reports.generate({ resource: 'specimens', filters }, member);
          const listed = await svc.list(specimens, { ...filters, limit: '100' }, member);
          expect(report.count).toBe(listed.total);
          const pdf = await readFile(path.join(dir, report.fileName));
          expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
        }
      ),
      { numRuns: 25 }
    );
  });
});

describe('report endpoints behaviour', () => {
  test('viewer without read permission on a resource is refused (403); unknown resource is 400', async () => {
    const outsider = { userId: member.userId, role: 'Nobody', name: 'X' };
    await expect(reports.generate({ resource: 'specimens' }, outsider)).rejects.toMatchObject({ status: 403 });
    await expect(reports.generate({ resource: 'ghosts' }, member)).rejects.toMatchObject({ status: 400 });
  });

  test('missing file → 410; list is newest first', async () => {
    await db.clear();
    const a = await reports.generate({ resource: 'specimens', title: 'First' }, member);
    const b = await reports.generate({ resource: 'specimens', title: 'Second' }, member);
    const listed = await reports.list({}, member);
    expect(listed.items.map((r) => r.title)).toEqual(['Second', 'First']);
    await unlink(path.join(dir, a.fileName));
    await expect(reports.download(String(a._id), member)).rejects.toMatchObject({ status: 410 });
    await expect(reports.download(String(b._id), member)).resolves.toHaveProperty('filePath');
  });

  test('large tables paginate onto several pages', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ name: `Specimen ${i}`, foundOn: new Date(2026, 0, 1 + (i % 28)), alive: i % 2 === 0, tags: ['A', 'B'] }));
    const buf = await renderReport({
      appName: 'Crypt Kit', title: 'Big', userName: 'Igor', filters: {}, generatedAt: new Date(),
      columns: [{ key: 'name', label: 'Name' }, { key: 'foundOn', label: 'Found', type: 'date' }, { key: 'alive', label: 'Alive', type: 'boolean' }, { key: 'tags', label: 'Tags' }],
      rows,
    });
    const pages = (buf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThan(2);
  });
});
