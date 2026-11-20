// Small controls sit inside a larger label, so a finger can hit them (WCAG 2.5.8: at least 24 px).
// jsdom has no layout, so this checks the structure that gives them room.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChecklistChecks, ChecklistEditor } from '../components/resource/ChecklistField';
import { ResourceTable } from '../components/resource/ResourceTable';

const resource = { key: 'notes', label: 'Notes', titleField: 'title', fields: [{ name: 'title', type: 'string', label: 'Title', list: true }], statusFlow: null, due: null, softDelete: null };

describe('touch targets', () => {
  it('a checklist checkbox is inside a label that holds its text, so the whole row toggles it', () => {
    render(<ChecklistChecks value={[{ text: 'Buy labels', done: false }]} onChange={() => {}} />);
    const box = screen.getByRole('checkbox', { name: 'Buy labels' });
    expect(box.closest('label')).not.toBeNull();
    expect(box.closest('label').textContent).toContain('Buy labels');
    expect(box.closest('label').className).toMatch(/min-h-8/);
  });

  it('the checklist editor\'s "done" box has a 32 px label around it', () => {
    render(<ChecklistEditor field={{ name: 'subtasks', label: 'Subtasks' }} value={[{ text: 'Step', done: false }]} onChange={() => {}} />);
    const label = screen.getByRole('checkbox', { name: 'Done: Step' }).closest('label');
    expect(label.className).toMatch(/h-8 w-8/);
  });

  it('table selection checkboxes are wrapped in a padded label, and clicking it does not open the row', () => {
    render(
      <MemoryRouter>
        <ResourceTable resource={resource} items={[{ _id: 'a1', title: 'One' }]} selected={new Set()} onSelectedChange={() => {}} />
      </MemoryRouter>
    );
    for (const box of screen.getAllByRole('checkbox')) expect(box.closest('label').className).toMatch(/p-1\.5/);
  });

  it('sort headers have vertical padding for a taller hit area', () => {
    render(
      <MemoryRouter>
        <ResourceTable resource={resource} items={[{ _id: 'a1', title: 'One' }]} sort="" onSort={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('button', { name: /title/i })[0].className).toMatch(/py-2/);
  });
});
