// Duplicate: detail page button → create form prefilled from the record.
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { renderAt, signIn } from './render';
import ResourceDetail from '../pages/ResourceDetail';
import ResourceCreate from '../pages/ResourceCreate';
import { duplicateValues } from '../components/resource/ResourceForm';
import { createRecord } from '../api/resources';

const resource = {
  key: 'tasks', label: 'Tasks', icon: 'box', titleField: 'title', comments: false,
  fields: [
    { name: 'code', type: 'string', label: 'Code', unique: true, formHidden: true },
    { name: 'title', type: 'string', label: 'Title', required: true, list: true },
    { name: 'sku', type: 'string', label: 'SKU', unique: true },
    { name: 'notes', type: 'text', label: 'Notes' },
    { name: 'status', type: 'enum', values: ['Open', 'Done'], label: 'Status', default: 'Open' },
    { name: 'steps', type: 'checklist', label: 'Steps' },
  ],
  rolePermissions: { read: ['Member', 'Viewer'], create: ['Member'] }, genericDisabled: [],
  statusFlow: { field: 'status', transitions: { Open: ['Done'] }, workflowOnly: [] }, due: null, softDelete: null,
};
const item = {
  _id: 't1', code: 'T-0001', title: 'Ship it', sku: 'SKU-9', notes: 'Remember', status: 'Done', createdAt: '2026-01-01T00:00:00Z', createdBy: { name: 'Tess' },
  steps: [{ text: 'a', done: true }, { text: 'b', done: false }],
};

vi.mock('../appRoutes', () => ({ default: [], reportPresets: [], bulkActions: {} }));
vi.mock('../api/meta', () => ({
  meta: vi.fn(async () => ({ appName: 'T', roles: ['Admin', 'Member', 'Viewer'], superuserRole: 'Admin', resources: [resource] })),
  publicMeta: vi.fn(async () => ({})),
}));
vi.mock('../api/resources', () => ({
  getRecord: vi.fn(async () => item),
  recordActivity: vi.fn(async () => []),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  createRecord: vi.fn(async (_a, _k, body) => ({ _id: 'new1', ...body })),
}));
vi.mock('../api/comments', () => ({ listComments: vi.fn(async () => []), addComment: vi.fn(), deleteComment: vi.fn() }));

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe('duplicateValues', () => {
  it('drops hidden, unique and status fields, unticks checklists and marks the title as a copy', () => {
    expect(duplicateValues(resource, item)).toEqual({
      title: 'Ship it (copy)',
      notes: 'Remember',
      steps: [{ text: 'a', done: false }, { text: 'b', done: false }],
    });
  });
});

describe('duplicate flow', () => {
  it('is hidden for users who cannot create', async () => {
    signIn({ role: 'Viewer' });
    renderAt(<ResourceDetail />, { path: '/r/:key/:id', route: '/r/tasks/t1' });
    await screen.findByRole('heading', { level: 1, name: /Ship it/ });
    expect(screen.queryByRole('button', { name: /Duplicate/ })).not.toBeInTheDocument();
  });

  it('opens the create form prefilled, and creating sends the copy', async () => {
    signIn({ role: 'Member' });
    renderAt(
      <Routes>
        <Route path="/r/:key/new" element={<ResourceCreate />} />
        <Route path="/r/:key/:id" element={<ResourceDetail />} />
      </Routes>,
      { path: '/*', route: '/r/tasks/t1' }
    );
    fireEvent.click(await screen.findByRole('button', { name: /Duplicate/ }));
    const title = await screen.findByLabelText(/Title/);
    expect(title).toHaveValue('Ship it (copy)');
    expect(screen.getByLabelText('Notes')).toHaveValue('Remember');
    expect(screen.getByLabelText('SKU')).toHaveValue('');
    expect(screen.getByLabelText('Status')).toHaveValue('Open');
    expect(screen.getByLabelText('Done: a')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(createRecord).toHaveBeenCalled());
    const body = createRecord.mock.calls[0][2];
    expect(body.title).toBe('Ship it (copy)');
    expect(body.steps).toEqual([{ text: 'a', done: false }, { text: 'b', done: false }]);
    expect(body.sku).toBeNull();
  });
});
