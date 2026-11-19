import { render, screen } from '@testing-library/react';
import { statusVariant } from '../components/resource/StatusBadge';
import { ActivityTimeline } from '../components/resource/ActivityTimeline';

describe('statusVariant (shared by badges and the dashboard chart)', () => {
  test('overdue is red, open is green, archived is muted, unknown values use the accent', () => {
    expect(statusVariant('Overdue')).toBe('destructive');
    expect(statusVariant('Open')).toBe('success');
    expect(statusVariant('Requested')).toBe('warning');
    expect(statusVariant('Archived')).toBe('muted');
    expect(statusVariant('Whatever')).toBe('accent');
  });

  test('the resource due and soft-delete rules win over keywords', () => {
    expect(statusVariant('Gone', { softDelete: { value: 'Gone' } })).toBe('muted');
    expect(statusVariant('Spoiled', { due: { to: 'Spoiled' } })).toBe('destructive');
  });
});

describe('activity timeline', () => {
  test('shows a comment entry as "commented" without copying the comment text', () => {
    const entry = { _id: '1', action: 'comment', recordId: 'r1', actor: { name: 'Ann' }, createdAt: new Date().toISOString(), diff: { comment: [null, 'Check the cauldron'] } };
    render(<ActivityTimeline items={[entry]} />);
    expect(screen.getByText(/commented/)).toBeInTheDocument();
    expect(screen.queryByText(/Check the cauldron/)).not.toBeInTheDocument();
  });
});
