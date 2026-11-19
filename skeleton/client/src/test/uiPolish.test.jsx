import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { Button } from '../components/ui/button';
import { Card, Progress, Kbd, Separator, Table, THead, TBody, TR, TH, TD } from '../components/ui/display';
import { Sidebar } from '../components/layout/Sidebar';

vi.mock('../context/MetaContext', () => ({
  useMeta: () => ({ appName: 'Test', loading: false, resources: [{ key: 'notes', label: 'Notes', icon: 'scroll-text' }] }),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Tess Tester', role: 'Admin' } }) }));
vi.mock('../hooks/usePermission', () => ({ usePermission: () => ({ isSuperuser: true, can: () => true }) }));

describe('Button loading', () => {
  it('keeps its name, sets aria-busy, shows a spinner and blocks clicks', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b).toHaveAttribute('aria-busy', 'true');
    expect(b).toBeDisabled();
    expect(b.querySelector('svg.animate-spin')).not.toBeNull();
    b.click();
    expect(onClick).not.toHaveBeenCalled();
  });
  it('is not busy by default and supports the icon-sm size', () => {
    render(<Button size="icon-sm" aria-label="Go">x</Button>);
    const b = screen.getByRole('button', { name: 'Go' });
    expect(b).not.toHaveAttribute('aria-busy');
    expect(b.className).toContain('h-8');
  });
});

describe('Progress', () => {
  it('exposes progressbar values and clamps', () => {
    const { rerender } = render(<Progress value={2} max={5} label="Checklist" />);
    const bar = screen.getByRole('progressbar', { name: 'Checklist' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '5');
    expect(bar.firstChild).toHaveStyle({ width: '40%' });
    rerender(<Progress value={99} max={5} label="Checklist" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
    rerender(<Progress value={-3} label="Checklist" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('table primitives', () => {
  it('has a sticky header, row hover/focus styles and numeric alignment', () => {
    render(
      <Table scrollClassName="max-h-40">
        <THead><TR><TH numeric>Qty</TH></TR></THead>
        <TBody><TR interactive data-testid="row"><TD numeric>3</TD></TR></TBody>
      </Table>
    );
    const th = screen.getByRole('columnheader', { name: 'Qty' });
    expect(th.className).toContain('sticky');
    expect(th.className).toContain('text-right');
    expect(screen.getByRole('cell', { name: '3' }).className).toContain('tabular-nums');
    const row = screen.getByTestId('row');
    expect(row.className).toContain('hover:bg-muted/50');
    expect(row.className).toContain('focus-within:bg-muted/60');
    expect(row.className).toContain('cursor-pointer');
    expect(row).not.toHaveAttribute('interactive');
    expect(th.closest('div').className).toContain('max-h-40');
  });
  it('Card interactive adds lift classes, plain Card does not', () => {
    render(<><Card interactive data-testid="a" /><Card data-testid="b" /></>);
    expect(screen.getByTestId('a').className).toContain('hover:-translate-y-0.5');
    expect(screen.getByTestId('b').className).not.toContain('hover:-translate-y-0.5');
  });
  it('Kbd and Separator render', () => {
    render(<><Kbd>K</Kbd><Separator decorative={false} /></>);
    expect(screen.getByText('K').tagName).toBe('KBD');
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });
});

describe('Sidebar', () => {
  it('marks only the current page link with aria-current', () => {
    render(<MemoryRouter initialEntries={['/r/notes']}><Sidebar /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Notes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Tess Tester')).toBeInTheDocument();
  });
});